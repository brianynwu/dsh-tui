import { describe, expect, it, vi } from 'vitest'
import { Key, matchesKey } from '@earendil-works/pi-tui'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import { CardsOverlay, cardsOverlayWidth } from '../src/components/cards-overlay.ts'
import { ToolCardComponent } from '../src/components/transcript.ts'
import { markdownTheme, type Palette } from '../src/components/theme.ts'

const palette = new Proxy({}, { get: () => (text: string) => text }) as Palette

function card(name: string, maxOutputLines = 2, definition?: ToolDefinition): ToolCardComponent {
  return new ToolCardComponent(
    name, { value: {}, valid: true }, definition, maxOutputLines, 1,
    palette, markdownTheme(palette),
  )
}

function result(card: ToolCardComponent, text: string): void {
  card.updateResult({
    message: { content: [{ content: [{ type: 'text', text }], isError: false }] },
  } as Parameters<ToolCardComponent['updateResult']>[0])
}

function overlay(cards: ToolCardComponent[], close = vi.fn()) {
  const changed = vi.fn()
  return { pane: new CardsOverlay(cards, 80, () => 24, palette, changed, close), changed, close }
}

describe('read-only tool-card browser', () => {
  it('shows a retained long body in full while the transcript remains hidden', () => {
    const tool = card('read', 2)
    result(tool, Array.from({ length: 24 }, (_, i) => `line-${i}`).join('\n\n'))
    tool.setVisibility('hidden')
    expect(tool.render(76)).toEqual([])
    const { pane } = overlay([tool])
    expect(pane.render(80).join('\n')).toContain('line-0')
    pane.handleInput('\x1b[F') // End
    expect(pane.render(80).join('\n')).toContain('line-23')
    expect(tool.render(76)).toEqual([])
    expect(tool.renderFull(76).join('\n')).toContain('line-12')
  })

  it('uses the existing bounded diff builder and names an over-cap exact diff', () => {
    const definition = {
      presentCall: () => ({
        card: 'diff', title: 'Edit files',
        diffs: [{ path: 'file.txt', oldText: 'a\nb\nc\n', newText: 'x\ny\nz\n' }],
      }),
    } as unknown as ToolDefinition
    const tool = card('edit', 1, definition)
    tool.setVisibility('hidden')
    const rendered = overlay([tool]).pane.render(80).join('\n')
    expect(rendered).toContain('Tool / edit')
    expect(rendered).toContain('file.txt')
    expect(rendered).toContain('[exact line diff omitted: >1 changed lines]')
    expect(tool.render(76)).toEqual([])
  })

  it('starts on the latest card, navigates cards and body, and closes by Esc or q', () => {
    const first = card('first')
    const last = card('last')
    result(first, Array.from({ length: 30 }, (_, i) => `row-${i}`).join('\n\n'))
    result(last, 'latest result')
    const { pane, changed, close } = overlay([first, last])
    expect(pane.render(80).join('\n')).toContain('Card 2/2')
    expect(pane.render(80).join('\n')).toContain('latest result')
    pane.handleInput('\x1b[D') // Left
    expect(pane.render(80).join('\n')).toContain('Card 1/2')
    pane.handleInput('\x1b[6~') // PageDown
    expect(pane.render(80).join('\n')).not.toContain('row-0')
    pane.handleInput('\x1b[H') // Home
    expect(pane.render(80).join('\n')).toContain('row-0')
    pane.handleInput('\x1b[C') // Right
    expect(pane.render(80).join('\n')).toContain('Card 2/2')
    expect(changed).toHaveBeenCalledTimes(4)
    pane.handleInput('q')
    expect(close).toHaveBeenCalledTimes(1)
    pane.handleInput('\x1b')
    expect(close).toHaveBeenCalledTimes(2)
  })

  it('snapshots on open and refreshes a streaming result on reopening', () => {
    const tool = card('stream')
    result(tool, 'first result')
    const first = overlay([tool]).pane
    result(tool, 'later result')
    expect(first.render(80).join('\n')).toContain('first result')
    expect(first.render(80).join('\n')).not.toContain('later result')
    expect(overlay([tool]).pane.render(80).join('\n')).toContain('later result')
  })

  it('leaves collapsed and expanded transcript card phases unchanged after browsing', () => {
    const collapsed = card('collapsed', 1)
    const expanded = card('expanded', 1)
    result(collapsed, 'one\n\ntwo\n\nthree')
    result(expanded, 'one\n\ntwo\n\nthree')
    collapsed.setVisibility('collapsed')
    expanded.setVisibility('expanded')
    const before = [collapsed.render(76), expanded.render(76)]
    const { pane } = overlay([collapsed, expanded])
    pane.render(80)
    pane.handleInput('\x1b[D')
    pane.render(80)
    pane.handleInput('q')
    expect([collapsed.render(76), expanded.render(76)]).toEqual(before)
    expect(before[0].join('\n')).toContain('Alt+T to expand')
    expect(before[1].join('\n')).toContain('three')
  })

  it('has an empty state and a recognized, otherwise unused Ctrl+T chord', () => {
    const { pane } = overlay([])
    expect(pane.render(80).join('\n')).toContain('No tool cards in this session.')
    pane.handleInput('\x1b[C')
    expect(pane.render(80).join('\n')).toContain('No tool cards in this session.')
    expect(cardsOverlayWidth(120)).toBe(100)
    expect(matchesKey('\x14', Key.ctrl('t'))).toBe(true)
  })
})
