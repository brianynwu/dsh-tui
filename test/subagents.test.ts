import { describe, expect, it, vi } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { SessionId, type SessionEvent, type SessionHeader } from '@deepseek-ai/dsh-session'
import type { SessionObservation } from '@deepseek-ai/dsh-session-query'
import type { SubagentListEntry } from '@deepseek-ai/dsh-subagent'
import { createSubagentSwitcher, ChildTranscript, projectSubagents, type SubagentRow } from '../src/chat/subagents.ts'
import { SubagentPicker } from '../src/components/subagent-picker.ts'
import { ChildViewKeys } from '../src/components/child-view-keys.ts'
import { createPalette } from '../src/components/theme.ts'
import { resolveTuiConfig } from '../src/config.ts'
import { TuiKeymap } from '../src/chat/keymap.ts'

const mainId = SessionId('main')
const childId = SessionId('child-1')
const main = { id: mainId, session: { id: mainId }, status: 'idle' } as Agent
const child = { id: childId, status: 'running' } as Agent
const row: SubagentListEntry = { kind: 'child', id: childId, mode: 'one-shot', activity: 'running', hasChildren: false, label: 'research' }
const palette = createPalette(false)
const observation = (id: SessionId, events: readonly SessionEvent[] = [], isSeeded = false,
  parentSession: SessionId = mainId, origin: 'subagent' | 'other' = 'subagent'): SessionObservation => ({
    header: { id, isSeeded, parentSession, origin } as SessionHeader,
    events, [Symbol.dispose]: vi.fn(),
  }) as unknown as SessionObservation
const event = (seq: number, text: string): SessionEvent => ({
  seq, type: 'user/message', data: { source: { kind: 'user' }, content: [{ type: 'text', text }] },
} as unknown as SessionEvent)

describe('direct-child projection and picker', () => {
  it('keeps durable child and diagnostic rows distinct and does not call an unowned child active', () => {
    const diagnostic: SubagentListEntry = { kind: 'diagnostic', id: SessionId('bad'), reason: 'corrupt' }
    const ctx = { agents: { get: () => child, isOwnedBy: () => true } } as unknown as Context
    expect(projectSubagents([row, diagnostic], ctx, main)).toEqual([{ ...row, execution: 'running' }, diagnostic])
    const unowned = { agents: { get: () => child, isOwnedBy: () => false } } as unknown as Context
    expect(projectSubagents([row], unowned, main)).toEqual([row])
  })

  it('shows IDs, types, titles and statuses in a vertically scrolling picker', () => {
    const rows: SubagentRow[] = Array.from({ length: 8 }, (_, i) => ({
      ...row, id: SessionId(`child-${i + 1}`), label: `Task ${i + 1}`,
      originType: i % 2 ? 'fork' : 'standard',
      ...i === 0 ? { execution: 'running' as const } : {},
    }))
    const selected = vi.fn()
    const close = vi.fn()
    const picker = new SubagentPicker(rows, undefined, () => 20, new TuiKeymap(), palette, vi.fn(), selected, close)
    let shown = picker.render(80).join('\n')
    expect(shown).toContain('ID child-1')
    expect(shown).toContain('Active · Standard · Task 1')
    expect(shown).toContain('Inactive · Fork · Task 2')
    expect(shown).not.toContain('ID child-6')
    for (let i = 0; i < 5; i += 1) picker.handleInput('\x1b[B')
    shown = picker.render(80).join('\n')
    expect(shown).toContain('ID child-6')
    expect(shown).not.toContain('ID child-1')
    expect(shown).toContain('Rows 2-6 of 8')
    picker.handleInput('\r')
    expect(selected).toHaveBeenCalledWith(SessionId('child-6'))
    picker.handleInput('\x1b')
    expect(close).toHaveBeenCalledOnce()
  })

  it('preserves selection through refresh and has a safe empty state', () => {
    const first = { ...row, originType: 'standard' as const }
    const second = { ...row, id: SessionId('child-2'), originType: 'fork' as const }
    const select = vi.fn()
    const close = vi.fn()
    const picker = new SubagentPicker([first, second], second.id, () => 20, new TuiKeymap(), palette, vi.fn(), select, close)
    picker.setRows([second, first])
    picker.handleInput('\r')
    expect(select).toHaveBeenCalledWith(second.id)
    picker.setRows([])
    expect(picker.render(80).join('\n')).toContain('No child agents to view.')
    picker.handleInput('\r')
    expect(select).toHaveBeenCalledTimes(1)
    picker.handleInput('\x1b')
    expect(close).toHaveBeenCalledOnce()
  })

  it('owns Esc while viewing a child without rendering a pinned line or changing composer bindings', () => {
    const keys = new TuiKeymap()
    const back = vi.fn()
    const control = new ChildViewKeys(keys, back)
    expect(control.render(80)).toEqual([])
    control.handleInput('a')
    expect(back).not.toHaveBeenCalled()
    control.handleInput('\x1b')
    expect(back).toHaveBeenCalledOnce()
    expect(keys.resolve('\x1b', 'composer')).toBe('cancel')
    expect(keys.resolve('\x1b', 'subagentBrowser')).toBe('subagentBack')
  })
})

describe('read-only child transcript and provenance', () => {
  it('replays a live/snapshot boundary and returns to main without a leaked listener', async () => {
    const deferred = Promise.withResolvers<SessionObservation>()
    const listeners = new Map<string, Function>()
    const on = (name: string, callback: Function): (() => void) => {
      listeners.set(name, callback)
      return () => { listeners.delete(name) }
    }
    const observeSession = vi.fn().mockImplementation(() =>
      observeSession.mock.calls.length === 1 ? Promise.resolve(observation(childId)) : deferred.promise)
    const ctx = {
      agents: { get: () => child, isOwnedBy: () => true },
      subagents: { listChildren: async () => [row] },
      get: () => ({ observeSession }), on,
    } as unknown as Context
    const views: unknown[] = []
    const errors: string[] = []
    const switcher = createSubagentSwitcher({
      ctx, main, palette, resolved: resolveTuiConfig(undefined),
      onRows: () => {}, onView: view => { views.push(view) },
      onRender: () => {}, onError: message => { errors.push(message) },
    })
    try {
      await switcher.refresh()
      await vi.waitFor(() => expect(switcher.rows[0]).toHaveProperty('originType', 'standard'))
      expect(switcher.select(childId)).toBe(true)
      expect(views.at(-1)).toHaveProperty('text', expect.stringContaining('Loading child'))
      const emit = listeners.get('session/event')!
      emit({ id: childId }, event(1, 'during snapshot'))
      const release = vi.fn()
      deferred.resolve({ ...observation(childId, [event(0, 'snapshot')]), [Symbol.dispose]: release } as SessionObservation)
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
    } finally { switcher.dispose() }
  })

  it('caches Standard/Fork headers once per ID and drops mismatched lineage', async () => {
    const forkId = SessionId('fork-child')
    const badId = SessionId('wrong-parent')
    const badOriginId = SessionId('wrong-origin')
    const listed = [row, { ...row, id: forkId }, { ...row, id: badId }, { ...row, id: badOriginId }]
    const observeSession = vi.fn((id: SessionId) => Promise.resolve(
      id === forkId ? observation(id, [], true)
        : id === badId ? observation(id, [], false, SessionId('other'))
          : id === badOriginId ? observation(id, [], false, mainId, 'other')
            : observation(id)))
    const ctx = {
      agents: { get: () => child, isOwnedBy: () => true },
      subagents: { listChildren: async () => listed },
      get: () => ({ observeSession }), on: () => () => {},
    } as unknown as Context
    const switcher = createSubagentSwitcher({
      ctx, main, palette, resolved: resolveTuiConfig(undefined),
      onRows: () => {}, onView: () => {}, onRender: () => {}, onError: () => {},
    })
    try {
      await switcher.refresh()
      await vi.waitFor(() => expect(switcher.rows.filter(r => r.kind === 'child')).toHaveLength(2))
      expect(switcher.rows.find(r => r.id === childId)).toHaveProperty('originType', 'standard')
      expect(switcher.rows.find(r => r.id === forkId)).toHaveProperty('originType', 'fork')
      await switcher.refresh()
      await switcher.refresh()
      expect(observeSession).toHaveBeenCalledTimes(4)
    } finally { switcher.dispose() }
  })

  it('ignores stale header completion after removal and re-addition of the same ID', async () => {
    const delayed = Promise.withResolvers<SessionObservation>()
    let listed: SubagentListEntry[] = [row]
    const observeSession = vi.fn().mockImplementation(() =>
      observeSession.mock.calls.length === 1 ? delayed.promise : Promise.resolve(observation(childId, [], true)))
    const ctx = {
      agents: { get: () => child, isOwnedBy: () => true },
      subagents: { listChildren: async () => listed },
      get: () => ({ observeSession }), on: () => () => {},
    } as unknown as Context
    const switcher = createSubagentSwitcher({
      ctx, main, palette, resolved: resolveTuiConfig(undefined),
      onRows: () => {}, onView: () => {}, onRender: () => {}, onError: () => {},
    })
    try {
      await switcher.refresh()
      expect(observeSession).toHaveBeenCalledTimes(1)
      listed = []
      await switcher.refresh()
      listed = [row]
      await switcher.refresh()
      await vi.waitFor(() => expect(switcher.rows[0]).toHaveProperty('originType', 'fork'))
      expect(observeSession).toHaveBeenCalledTimes(2)
      delayed.resolve(observation(childId, [], false, SessionId('other')))
      await Promise.resolve()
      expect(switcher.rows[0]).toHaveProperty('originType', 'fork')
    } finally { switcher.dispose() }
  })

  it('shows Unknown when a header lacks fork metadata or observation fails', async () => {
    const missingId = SessionId('missing-type')
    const rejectedId = SessionId('unreadable-type')
    const listed = [{ ...row, id: missingId }, { ...row, id: rejectedId }]
    const observeSession = vi.fn((id: SessionId) => id === rejectedId
      ? Promise.reject(new Error('unavailable'))
      : Promise.resolve({
        header: { id, parentSession: mainId, origin: 'subagent' },
        [Symbol.dispose]: vi.fn(),
      } as unknown as SessionObservation))
    const ctx = {
      agents: { get: () => undefined, isOwnedBy: () => false },
      subagents: { listChildren: async () => listed },
      get: () => ({ observeSession }), on: () => () => {},
    } as unknown as Context
    const switcher = createSubagentSwitcher({
      ctx, main, palette, resolved: resolveTuiConfig(undefined),
      onRows: () => {}, onView: () => {}, onRender: () => {}, onError: () => {},
    })
    try {
      await switcher.refresh()
      await vi.waitFor(() => expect(observeSession).toHaveBeenCalledTimes(2))
      await Promise.resolve()
      await switcher.refresh()
      expect(observeSession).toHaveBeenCalledTimes(2)
      expect(switcher.rows).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: missingId, originType: 'unknown' }),
        expect.objectContaining({ id: rejectedId, originType: 'unknown' }),
      ]))
    } finally { switcher.dispose() }
  })

  it('returns safely with a clear error when the selected transcript has no header', async () => {
    const observeSession = vi.fn().mockImplementation(() =>
      observeSession.mock.calls.length === 1
        ? Promise.resolve(observation(childId))
        : Promise.resolve({ header: undefined, [Symbol.dispose]: vi.fn() }))
    const errors: string[] = []
    const views: unknown[] = []
    const ctx = {
      agents: { get: () => child, isOwnedBy: () => true },
      subagents: { listChildren: async () => [row] },
      get: () => ({ observeSession }), on: () => () => {},
    } as unknown as Context
    const switcher = createSubagentSwitcher({
      ctx, main, palette, resolved: resolveTuiConfig(undefined),
      onRows: () => {}, onView: view => { views.push(view) },
      onRender: () => {}, onError: message => { errors.push(message) },
    })
    try {
      await switcher.refresh()
      await vi.waitFor(() => expect(switcher.rows[0]).toHaveProperty('originType', 'standard'))
      expect(switcher.select(childId)).toBe(true)
      await vi.waitFor(() => expect(errors).toContain('Child session metadata is unavailable.'))
      expect(switcher.selectedId).toBeUndefined()
      expect(views.at(-1)).toBeUndefined()
    } finally { switcher.dispose() }
  })

  it('keeps empty catalogs and unavailable transcript service safe', async () => {
    let listed: SubagentListEntry[] = []
    const errors: string[] = []
    const views: unknown[] = []
    const ctx = {
      agents: { get: () => undefined, isOwnedBy: () => false },
      subagents: { listChildren: async () => listed },
      get: () => undefined, on: () => () => {},
    } as unknown as Context
    const switcher = createSubagentSwitcher({
      ctx, main, palette, resolved: resolveTuiConfig(undefined),
      onRows: () => {}, onView: view => { views.push(view) },
      onRender: () => {}, onError: message => { errors.push(message) },
    })
    try {
      await switcher.refresh()
      expect(switcher.rows).toEqual([])
      expect(views).toEqual([])
      listed = [row]
      await switcher.refresh()
      expect(switcher.rows[0]).toHaveProperty('originType', 'unknown')
      expect(switcher.select(childId)).toBe(false)
      expect(errors).toContain('Child transcript service is unavailable.')
      expect(views).toEqual([])
    } finally { switcher.dispose() }
  })
})
