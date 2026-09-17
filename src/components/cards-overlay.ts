/** Read-only, session-scoped browser over the tool cards retained by the transcript. */
import { Key, matchesKey, type Component } from '@earendil-works/pi-tui'
import { renderDialog } from './dialogs.ts'
import type { Palette } from './theme.ts'
import type { ToolCardComponent } from './transcript.ts'

/** The overlay uses the same fixed width for its opening snapshot and modal. */
export function cardsOverlayWidth(columns: number): number {
  return Math.max(1, Math.min(100, columns - 2))
}

export class CardsOverlay implements Component {
  private readonly cards: readonly (readonly string[])[]
  private selected: number
  private scrollTop = 0
  private pageSize = 1

  constructor(
    cards: readonly ToolCardComponent[],
    width: number,
    private readonly rows: () => number,
    private readonly palette: Palette,
    private readonly changed: () => void,
    private readonly close: () => void,
  ) {
    // Capture full rendered bodies now. Results that arrive while the browser is
    // open appear on the next open, rather than changing the row under the reader.
    this.cards = cards.map(card => card.renderFull(Math.max(1, width - 4)))
    this.selected = Math.max(0, cards.length - 1)
  }

  invalidate(): void {}

  render(width: number): string[] {
    // pi-tui clips at 80% of the terminal height; return that many rows so our
    // own scroll window, rather than pi-tui's top-only clip, chooses the body.
    const maxRows = Math.max(1, Math.floor(this.rows() * 0.8))
    this.pageSize = Math.max(1, maxRows - 5) // border, index row, and key hint
    const card = this.cards[this.selected]
    if (card === undefined) {
      return renderDialog('Tool cards', [
        '',
        this.palette.dim('No tool cards in this session.'),
        '',
        this.palette.dim('Esc/q close'),
      ], width, this.palette)
    }
    this.scrollTop = Math.min(this.scrollTop, Math.max(0, card.length - this.pageSize))
    const end = Math.min(card.length, this.scrollTop + this.pageSize)
    return renderDialog('Tool cards', [
      this.palette.dim(`Card ${this.selected + 1}/${this.cards.length} · rows ${this.scrollTop + 1}-${end}/${card.length}`),
      ...card.slice(this.scrollTop, end),
      this.palette.dim('←/→ card · ↑/↓ scroll · PgUp/PgDn · Home/End · Esc/q close'),
    ], width, this.palette)
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.escape) || data === 'q') {
      this.close()
      return
    }
    if (this.cards.length === 0) return
    const card = this.cards[this.selected]
    if (matchesKey(data, Key.left) || data === 'p') {
      this.selected = Math.max(0, this.selected - 1)
      this.scrollTop = 0
    } else if (matchesKey(data, Key.right) || data === 'n') {
      this.selected = Math.min(this.cards.length - 1, this.selected + 1)
      this.scrollTop = 0
    } else if (card !== undefined) {
      const last = Math.max(0, card.length - this.pageSize)
      if (matchesKey(data, Key.up)) this.scrollTop = Math.max(0, this.scrollTop - 1)
      else if (matchesKey(data, Key.down)) this.scrollTop = Math.min(last, this.scrollTop + 1)
      else if (matchesKey(data, Key.pageUp)) this.scrollTop = Math.max(0, this.scrollTop - this.pageSize)
      else if (matchesKey(data, Key.pageDown)) this.scrollTop = Math.min(last, this.scrollTop + this.pageSize)
      else if (matchesKey(data, Key.home)) this.scrollTop = 0
      else if (matchesKey(data, Key.end)) this.scrollTop = last
    }
    this.changed()
  }
}
