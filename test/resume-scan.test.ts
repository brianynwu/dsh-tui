/**
 * Resume-list row resolution under the V3 persistence API: each not-live row's
 * title and last-activity time come from ONE handle read (rc.2 has no metadata
 * mtime, and the projection cache's cold fold needs the full log), a live row
 * opens no handle, and a per-row read failure isolates to a disabled row.
 */
import { describe, it, expect, vi } from 'vitest'
import type { SessionEvent, SessionId } from '@deepseek-ai/dsh-session'
import type { SessionRecord } from '@deepseek-ai/dsh-session-query'
import {
  readCompleteLog,
  resolveRows,
  type CompleteLog,
  type ReadHandle,
  type ResumeScanDeps,
  type SessionLogSource,
  type TitleSnapshotResult,
} from '../src/chat/resume-scan.ts'

const sid = (s: string): SessionId => s as unknown as SessionId
const record = (id: string): SessionRecord => ({ header: { id: sid(id) } }) as unknown as SessionRecord
const evAt = (time: number): SessionEvent => ({ type: 'user/message', time, data: {} }) as unknown as SessionEvent
const inherited0 = 0 as CompleteLog['inheritedEventCount']

/** A read handle recording its open/close/read calls. */
function fakeSource(events: readonly SessionEvent[], opts: { failRead?: boolean } = {}): {
  source: SessionLogSource
  opens: number
  closes: number
} {
  const state = { opens: 0, closes: 0 }
  const handle: ReadHandle = {
    inheritedEventCount: inherited0,
    read: async () => {
      if (opts.failRead) throw new Error('read failed')
      return { events }
    },
    close: async () => { state.closes += 1 },
  }
  const source: SessionLogSource = {
    open: async () => { state.opens += 1; return handle },
  }
  return { get opens() { return state.opens }, get closes() { return state.closes }, source }
}

const okTitle = (id: string, title: string): TitleSnapshotResult =>
  ({ sessionId: sid(id), status: 'fulfilled', value: { title: { title } } }) as unknown as TitleSnapshotResult
const rejectedTitle = (id: string, reason: unknown): TitleSnapshotResult =>
  ({ sessionId: sid(id), status: 'rejected', reason }) as unknown as TitleSnapshotResult

/** Cache-mounted deps: title from a cold fold, log from the injected source. */
function cacheDeps(source: SessionLogSource | undefined, title: string, live?: { events: readonly SessionEvent[]; title?: string }): ResumeScanDeps {
  return {
    liveEvents: () => live?.events,
    liveTitle: () => live?.title,
    readLog: (id, signal) => readCompleteLog(source, id, signal),
    cacheTitle: () => title,
    batchTitles: async () => { throw new Error('batchTitles must not be called on the cache path') },
    concurrency: 4,
  }
}

describe('readCompleteLog', () => {
  it('opens once, returns the events + inherited count, and closes', async () => {
    const f = fakeSource([evAt(1), evAt(7)])
    const log = await readCompleteLog(f.source, sid('s1'), new AbortController().signal)
    expect(log?.events.at(-1)?.time).toBe(7)
    expect(f.opens).toBe(1)
    expect(f.closes).toBe(1)
  })

  it('returns undefined when no persistence is mounted', async () => {
    expect(await readCompleteLog(undefined, sid('s1'), new AbortController().signal)).toBeUndefined()
  })

  it('closes the handle even when the read fails (abort/error)', async () => {
    const f = fakeSource([], { failRead: true })
    await expect(readCompleteLog(f.source, sid('s1'), new AbortController().signal)).rejects.toThrow('read failed')
    expect(f.closes).toBe(1)
  })
})

describe('resolveRows', () => {
  const signal = new AbortController().signal

  it('cache path: one read feeds both the cold title and the last-activity time', async () => {
    const f = fakeSource([evAt(2), evAt(11)])
    const rows = await resolveRows(cacheDeps(f.source, 'Cold Title'), [record('s1')], signal)
    expect(rows[0]).toEqual({ title: 'Cold Title', lastActivityAt: 11 })
    expect(f.opens).toBe(1)
    expect(f.closes).toBe(1)
  })

  it('live row: reads memory, never opens a handle', async () => {
    const readLog = vi.fn(async () => undefined)
    const deps: ResumeScanDeps = {
      liveEvents: () => [evAt(3), evAt(9)],
      liveTitle: () => 'Live Title',
      readLog,
      cacheTitle: () => 'unused',
      batchTitles: async () => [],
      concurrency: 4,
    }
    const rows = await resolveRows(deps, [record('live')], signal)
    expect(rows[0]).toEqual({ title: 'Live Title', lastActivityAt: 9 })
    expect(readLog).not.toHaveBeenCalled()
  })

  it('cache path: a read failure disables the row', async () => {
    const f = fakeSource([], { failRead: true })
    const rows = await resolveRows(cacheDeps(f.source, 'never'), [record('s1')], signal)
    expect(rows[0]?.failure).toBeInstanceOf(Error)
    expect(rows[0]?.title).toBeUndefined()
  })

  it('cache-absent: title from the batch, activity from the tail read', async () => {
    const f = fakeSource([evAt(4)])
    const deps: ResumeScanDeps = {
      liveEvents: () => undefined,
      liveTitle: () => undefined,
      readLog: (id, s) => readCompleteLog(f.source, id, s),
      cacheTitle: undefined,
      batchTitles: async () => [okTitle('s1', 'Batch Title')],
      concurrency: 4,
    }
    const rows = await resolveRows(deps, [record('s1')], signal)
    expect(rows[0]).toEqual({ title: 'Batch Title', lastActivityAt: 4 })
  })

  it('cache-absent: a tail-read failure keeps the batch title, drops activity', async () => {
    const f = fakeSource([], { failRead: true })
    const deps: ResumeScanDeps = {
      liveEvents: () => undefined,
      liveTitle: () => undefined,
      readLog: (id, s) => readCompleteLog(f.source, id, s),
      cacheTitle: undefined,
      batchTitles: async () => [okTitle('s1', 'Batch Title')],
      concurrency: 4,
    }
    const rows = await resolveRows(deps, [record('s1')], signal)
    expect(rows[0]).toEqual({ title: 'Batch Title', lastActivityAt: undefined })
    expect(f.closes).toBe(1)
  })

  it('cache-absent: a rejected batch title disables the row', async () => {
    const deps: ResumeScanDeps = {
      liveEvents: () => undefined,
      liveTitle: () => undefined,
      readLog: async () => undefined,
      cacheTitle: undefined,
      batchTitles: async () => [rejectedTitle('s1', new Error('corrupt'))],
      concurrency: 4,
    }
    const rows = await resolveRows(deps, [record('s1')], signal)
    expect(rows[0]?.failure).toBeInstanceOf(Error)
  })
})
