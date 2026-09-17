/** Pinned, keyboard-owned row for choosing a read-only child transcript. */
import { truncateToWidth, type Component, type Focusable } from '@earendil-works/pi-tui'
import type { TuiKeymap } from '../chat/keymap.ts'
import type { SubagentRow } from '../chat/subagents.ts'
import { displayText } from './text.ts'
import type { Palette } from './theme.ts'

export class SubagentStrip implements Component, Focusable {
  focused = false
  private rows: readonly SubagentRow[] = []
  private selectedId: string | undefined

  constructor(
    private readonly keymap: TuiKeymap,
    private readonly palette: Palette,
    private readonly prev: () => void,
    private readonly next: () => void,
    private readonly back: () => void,
  ) {}

  setRows(rows: readonly SubagentRow[], selectedId: string | undefined): void {
    this.rows = rows
    this.selectedId = selectedId
  }

  hasChildren(): boolean {
    return this.rows.some(row => row.kind === 'child')
  }

  handleInput(data: string): void {
    switch (this.keymap.resolve(data, 'subagentStrip')) {
      case 'subagentPrev': this.prev(); break
      case 'subagentNext': this.next(); break
      case 'subagentBack': this.back(); break
    }
  }

  invalidate(): void {}

  render(width: number): string[] {
    if (this.rows.length === 0) return []
    const parts = this.rows.map(row => {
      if (row.kind === 'diagnostic') return this.palette.warning(`! ${displayText(row.id)} ${row.reason}`)
      const name = displayText(row.label ?? row.id)
      const status = row.execution === 'running' ? 'active' : row.activity
      const text = `${row.id === this.selectedId ? '●' : '○'} ${name} (${status})`
      return row.id === this.selectedId ? this.palette.accent(text) : this.palette.dim(text)
    })
    const prefix = this.focused ? this.palette.accent('Agents ←/→ · Esc main  ') : this.palette.dim('Agents /agents  ')
    return [truncateToWidth(`${prefix}${parts.join('  ')}`, Math.max(1, width), '…')]
  }
}
