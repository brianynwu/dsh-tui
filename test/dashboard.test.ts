/**
 * Tests for the runtime dashboard spike: the structured metric service
 * (insertion-ordered groups, clear, coalesced notify) and the pane's render
 * shape (framed columns, undefined → em dash, empty state). Live viewport
 * allocation and repaint cadence are attended live-verify, as for layout.
 */
import { describe, it, expect, vi } from 'vitest'
import { visibleWidth, type TuiMouseEvent } from '@earendil-works/pi-tui'
import { TuiDashboardService, type DashboardGroup } from '../src/dashboard.ts'
import { DashboardPane } from '../src/components/dashboard-pane.ts'
import type { Palette } from '../src/components/theme.ts'

/** A no-color palette so assertions read plain text (roles pass through). */
const plainPalette = new Proxy({}, {
  get: () => (text: string) => text,
}) as unknown as Palette

/** Build a service without standing up a full Cordis app: stub the two ctx uses. */
function makeService(): TuiDashboardService {
  const ctx = {
    effect: (fn: () => () => void) => fn(),
    logger: { warn: () => {} },
  }
  // The Service base only needs `ctx` reachable; construct against the stub.
  const service = Object.create(TuiDashboardService.prototype) as TuiDashboardService
  Object.assign(service, {
    store: new Map<string, DashboardGroup>(),
    listeners: new Set(),
    notificationQueued: false,
    ctx,
  })
  return service
}

describe('TuiDashboardService', () => {
  it('keeps groups in first-set order and clears on undefined', () => {
    const s = makeService()
    s.setGroup('timing', { title: 'Timing', metrics: [{ label: 'wait', value: '0.4s' }] })
    s.setGroup('tokens', { title: 'Tokens', metrics: [{ label: 'in', value: '12k' }] })
    // Re-set an existing key: order preserved, not moved to the end.
    s.setGroup('timing', { title: 'Timing', metrics: [{ label: 'wait', value: '0.9s' }] })
    expect(s.groups().map(g => g.title)).toEqual(['Timing', 'Tokens'])
    expect(s.groups()[0].metrics[0].value).toBe('0.9s')

    s.setGroup('timing', undefined)
    expect(s.groups().map(g => g.title)).toEqual(['Tokens'])
  })

  it('coalesces a burst of mutations into one notification', async () => {
    const s = makeService()
    const listener = vi.fn()
    s.subscribe(listener)
    s.setGroup('a', { title: 'A', metrics: [] })
    s.setGroup('b', { title: 'B', metrics: [] })
    s.setGroup('c', { title: 'C', metrics: [] })
    expect(listener).not.toHaveBeenCalled() // deferred to a microtask
    await Promise.resolve()
    expect(listener).toHaveBeenCalledTimes(1)
  })
})

describe('DashboardPane render', () => {
  it('frames grouped columns and renders an undefined value as an em dash', () => {
    const groups: DashboardGroup[] = [
      { title: 'Timing', metrics: [{ label: 'wait', value: '0.4s' }] },
      { title: 'Provider', metrics: [{ label: 'via', value: undefined }] },
    ]
    const pane = new DashboardPane(() => groups, plainPalette)
    const lines = pane.render(60)

    expect(lines[0]).toContain('runtime') // titled top border
    expect(lines[0].startsWith('╭')).toBe(true)
    expect(lines.at(-1)?.startsWith('╰')).toBe(true)
    const body = lines.slice(1, -1).join('\n')
    expect(body).toContain('Timing')
    expect(body).toContain('Provider')
    expect(body).toContain('0.4s')
    expect(body).toContain('—') // the undefined provider value
    // Every rendered line is padded to exactly the requested visible width.
    for (const line of lines) expect(visibleWidth(line)).toBe(60)
  })

  it('shows an empty-state row when no group is set', () => {
    const pane = new DashboardPane(() => [], plainPalette)
    const lines = pane.render(40)
    expect(lines.join('\n')).toContain('no metrics yet')
  })

  it('collapses to a single tappable bar and expands again on a left click', () => {
    const groups: DashboardGroup[] = [{ title: 'Timing', metrics: [{ label: 'wait', value: '0.4s' }] }]
    const pane = new DashboardPane(() => groups, plainPalette)
    expect(pane.render(60).length).toBeGreaterThan(1) // starts expanded

    const click: TuiMouseEvent = {
      type: 'click', button: 'left', x: 3, y: 0, screenX: 3, screenY: 20,
      width: 60, height: 3, shift: false, alt: false, ctrl: false,
    }
    expect(pane.handleMouse(click)).toEqual({ handled: true, render: true })
    const collapsed = pane.render(60)
    expect(collapsed).toHaveLength(1)
    expect(collapsed[0]).toContain('runtime')
    expect(collapsed[0]).toContain('tap to expand')
    expect(collapsed[0]).not.toContain('0.4s') // metrics are hidden while collapsed

    pane.handleMouse(click) // toggles back
    expect(pane.render(60).length).toBeGreaterThan(1)
  })

  it('ignores non-left and non-click mouse events (keeps propagating)', () => {
    const pane = new DashboardPane(() => [], plainPalette)
    const base = {
      x: 0, y: 0, screenX: 0, screenY: 0, width: 60, height: 3,
      shift: false, alt: false, ctrl: false,
    }
    expect(pane.handleMouse({ ...base, type: 'click', button: 'right' })).toBeUndefined()
    expect(pane.handleMouse({ ...base, type: 'wheel', button: 'none', wheelDelta: -1 })).toBeUndefined()
    expect(pane.handleMouse({ ...base, type: 'press', button: 'left' })).toBeUndefined()
    expect(pane.render(60).length).toBeGreaterThan(1) // still expanded — nothing toggled
  })

  it('never overflows the requested width, down to a very narrow viewport', () => {
    const groups: DashboardGroup[] = [
      { title: 'Timing', metrics: [{ label: 'wait', value: '0.4s' }, { label: 'tools', value: '2.1s' }] },
      { title: 'Tokens', metrics: [{ label: 'in', value: '128k' }] },
    ]
    const pane = new DashboardPane(() => groups, plainPalette)
    for (const width of [80, 40, 20, 10, 6, 3, 1]) {
      for (const line of pane.render(width)) expect(visibleWidth(line)).toBe(width)
      pane.handleMouse({
        type: 'click', button: 'left', x: 0, y: 0, screenX: 0, screenY: 0,
        width, height: 1, shift: false, alt: false, ctrl: false,
      })
      for (const line of pane.render(width)) expect(visibleWidth(line)).toBe(width) // collapsed too
      pane.handleMouse({
        type: 'click', button: 'left', x: 0, y: 0, screenX: 0, screenY: 0,
        width, height: 1, shift: false, alt: false, ctrl: false,
      })
    }
  })
})
