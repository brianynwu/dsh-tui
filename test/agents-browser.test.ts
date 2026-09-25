import { describe, expect, it, vi } from 'vitest'
import { Container, ScrollView, type Component } from '@earendil-works/pi-tui'
import { SessionId } from '@deepseek-ai/dsh-session'
import { AgentsBrowser } from '../src/chat/agents-browser.ts'
import { ChildViewSlot } from '../src/chat/child-view.ts'
import type { SubagentRow, SubagentSwitcher } from '../src/chat/subagents.ts'
import type { TranscriptView } from '../src/chat/details.ts'
import { ChildViewKeys } from '../src/components/child-view-keys.ts'
import { createPalette } from '../src/components/theme.ts'
import { TuiKeymap } from '../src/chat/keymap.ts'
import { TuiOverlayManager } from '../src/extension/overlay-manager.ts'
import type { TuiTheme } from '../src/extension/types.ts'

class Lines implements Component {
  constructor(private readonly count: number, private readonly name: string) {}
  render(): string[] { return Array.from({ length: this.count }, (_, i) => `${this.name} ${i}`) }
  invalidate(): void {}
}

describe('assembled /agents navigation', () => {
  it('uses Enter/Esc/Esc to restore nonzero main scroll and composer focus', async () => {
    const main = new Lines(40, 'main')
    const slot = new Container()
    slot.addChild(main)
    const scroll = new ScrollView(slot, { follow: 'end' })
    scroll.updateLayout(40, 5, () => {})
    scroll.scrollTo(7, { disableFollow: true })
    expect(scroll.scrollTop).toBe(7)

    let focus = 'composer'
    let shown: Component | undefined
    const view = new ChildViewSlot(slot, main, scroll, () => { focus = 'composer' }, () => {})
    let selectedId: SessionId | undefined
    let mainDetails: TranscriptView = { tools: 'hidden', reasoning: 'off', context: 'hidden' }
    let childDetails: TranscriptView = { tools: 'collapsed', reasoning: 'full', context: 'collapsed' }
    const childId = SessionId('child-1')
    const rows: SubagentRow[] = [{
      kind: 'child', id: childId, mode: 'one-shot', label: 'Read runbook',
      execution: 'running', originType: 'standard',
    }]
    const switcher = {
      get rows() { return rows },
      get selectedId() { return selectedId },
      get details() { return childDetails },
      setDetails: vi.fn((details: TranscriptView) => { childDetails = { ...details } }),
      refresh: vi.fn(async () => {}),
      select: vi.fn((id: SessionId) => {
        selectedId = id
        view.set(new Lines(3, 'child'))
        return true
      }),
      back: vi.fn(() => { selectedId = undefined; view.set(undefined) }),
      dispose: vi.fn(),
    } as SubagentSwitcher
    const overlays = new TuiOverlayManager({
      viewport: () => ({ columns: 100, rows: 20 }),
      theme: () => ({} as TuiTheme), display: text => text,
      show: component => {
        shown = component
        focus = 'overlay'
        return { hide: () => { shown = undefined; focus = 'composer' } }
      },
      invalidate: () => {}, reportError: vi.fn(),
    })
    let browser!: AgentsBrowser
    const control = new ChildViewKeys(new TuiKeymap(), () => browser.backFromChild(), action => {
      const current = switcher.details
      switcher.setDetails(action === 'tools' ? { ...current, tools: 'expanded' }
        : action === 'reasoning' ? { ...current, reasoning: 'preview' }
          : { ...current, context: 'expanded' })
    })
    browser = new AgentsBrowser({
      switcher, overlays, keymap: new TuiKeymap(), palette: createPalette(false),
      mainDetails: () => ({ ...mainDetails }),
      viewport: () => ({ columns: 100, rows: 20 }),
      focusChild: () => { focus = 'child' }, isDisposed: () => false,
    })

    await browser.open()
    expect(childDetails).toEqual(mainDetails)
    expect(focus).toBe('overlay')
    expect(shown?.render(98).join('\n')).toContain('ID child-1')
    shown?.handleInput?.('\r')
    expect(focus).toBe('child')
    expect(slot.children[0]?.render(80).join('\n')).toContain('child 0')
    control.handleInput('\x1bt')
    control.handleInput('\x1br')
    control.handleInput('\x1bc')
    expect(childDetails).toEqual({ tools: 'expanded', reasoning: 'preview', context: 'expanded' })
    expect(mainDetails).toEqual({ tools: 'hidden', reasoning: 'off', context: 'hidden' })
    control.handleInput('\x1b')
    expect(focus).toBe('overlay')
    expect(shown?.render(98).join('\n')).toContain('ID child-1')
    shown?.handleInput?.('\x1b')
    await Promise.resolve()
    expect(focus).toBe('composer')
    expect(slot.children).toEqual([main])
    expect(scroll.scrollTop).toBe(7)
    expect(control.render(98)).toEqual([])
    expect(shown).toBeUndefined()
    mainDetails = { tools: 'collapsed', reasoning: 'full', context: 'expanded' }
    await browser.open()
    expect(childDetails).toEqual(mainDetails)
    await overlays.dispose()
  })
})
