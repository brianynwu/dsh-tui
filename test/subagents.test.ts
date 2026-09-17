import { describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { SessionId, type SessionEvent } from '@deepseek-ai/dsh-session'
import type { SessionObservation } from '@deepseek-ai/dsh-session-query'
import type { SubagentListEntry } from '@deepseek-ai/dsh-subagent'
import { createSubagentSwitcher, ChildTranscript, projectSubagents } from '../src/chat/subagents.ts'
import { SubagentStrip } from '../src/components/subagent-strip.ts'
import { createPalette } from '../src/components/theme.ts'
import { resolveTuiConfig } from '../src/config.ts'
import { TuiKeymap } from '../src/chat/keymap.ts'

const mainId = SessionId('main')
const childId = SessionId('child-1')
const main = { id: mainId, session: { id: mainId }, status: 'idle' } as Agent
const child = { id: childId, status: 'running' } as Agent
const row: SubagentListEntry = { kind: 'child', id: childId, mode: 'one-shot', activity: 'running', hasChildren: false, label: 'research' }
const event = (seq: number, text: string): SessionEvent => ({
  seq, type: 'user/message', data: { source: { kind: 'user' }, content: [{ type: 'text', text }] },
} as unknown as SessionEvent)

describe('subagent projection and strip', () => {
  it('keeps durable child and diagnostic rows distinct and does not call a resident child active unless owned', () => {
    const diagnostic: SubagentListEntry = { kind: 'diagnostic', id: SessionId('bad'), reason: 'corrupt' }
    const ctx = { agents: { get: () => child, isOwnedBy: () => true } } as unknown as Context
    expect(projectSubagents([row, diagnostic], ctx, main)).toEqual([{ ...row, execution: 'running' }, diagnostic])
    const unowned = { agents: { get: () => child, isOwnedBy: () => false } } as unknown as Context
    expect(projectSubagents([row], unowned, main)).toEqual([row])
  })

  it('owns Left/Right/Esc without changing the composer shortcuts', () => {
    const keys = new TuiKeymap()
    const calls: string[] = []
    const strip = new SubagentStrip(keys, createPalette(false),
      () => { calls.push('prev') }, () => { calls.push('next') }, () => { calls.push('back') })
    strip.setRows([{ ...row, execution: 'running' }], childId)
    strip.focused = true
    expect(strip.render(100).join('')).toContain('active')
    strip.handleInput('\x1b[D')
    strip.handleInput('\x1b[C')
    strip.handleInput('\x1b')
    expect(calls).toEqual(['prev', 'next', 'back'])
    expect(keys.resolve('\x1b', 'composer')).toBe('cancel')
    expect(keys.resolve('\x1b', 'subagentStrip')).toBe('subagentBack')
  })
})

describe('read-only child transcript', () => {
  it('dedupes a replay/live boundary and refuses a gap without touching main', async () => {
    const palette = createPalette(false)
    const deferred = Promise.withResolvers<SessionObservation>()
    const listeners = new Map<string, Function>()
    const on = (name: string, callback: Function): (() => void) => {
      listeners.set(name, callback)
      return () => { listeners.delete(name) }
    }
    const ctx = {
      agents: { get: () => child, isOwnedBy: () => true },
      subagents: { listChildren: async () => [row] },
      get: () => ({ observeSession: () => deferred.promise }),
      on,
    } as unknown as Context
    const views: Array<unknown> = []
    const selected: Array<string | undefined> = []
    const errors: string[] = []
    const switcher = createSubagentSwitcher({
      ctx, main, palette, resolved: resolveTuiConfig(undefined),
      onRows: (_rows, id) => { selected.push(id) },
      onView: view => { views.push(view) },
      onRender: () => {}, onError: message => { errors.push(message) },
    })
    try {
      await switcher.refresh()
      switcher.next()
      const emit = listeners.get('session/event')!
      emit({ id: childId }, event(1, 'during snapshot'))
      const release = vi.fn()
      deferred.resolve({ events: [event(0, 'snapshot')], cursor: 0, [Symbol.dispose]: release } as unknown as SessionObservation)
      await vi.waitFor(() => expect(views.at(-1)).toBeInstanceOf(ChildTranscript))
      const transcript = views.at(-1) as ChildTranscript
      expect(transcript.lastSequence).toBe(1)
      emit({ id: childId }, event(1, 'duplicate'))
      emit({ id: childId }, event(2, 'later'))
      expect(transcript.lastSequence).toBe(2)
      expect(errors).toEqual([])
      expect(release).toHaveBeenCalledOnce()
      switcher.back()
      expect(views.at(-1)).toBeUndefined()
      expect(listeners.has('session/event')).toBe(false)
      expect(selected.at(-1)).toBeUndefined()
    } finally {
      switcher.dispose()
    }
  })
})
