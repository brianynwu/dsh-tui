/** Bounded popup for choosing a direct child without occupying the chat layout. */
import { Key, matchesKey, type Component } from '@earendil-works/pi-tui'
import type { SessionId } from '@deepseek-ai/dsh-session'
import type { TuiKeymap } from '../chat/keymap.ts'
import type { SubagentRow } from '../chat/subagents.ts'
import { renderDialog } from './dialogs.ts'
import { displayInlineText } from './text.ts'
import type { Palette } from './theme.ts'

type ChildRow = Extract<SubagentRow, { kind: 'child' }>

export class SubagentPicker implements Component {
  private rows: readonly SubagentRow[] = []
  private selectedId: SessionId | undefined
  private scrollTop = 0

  constructor(
    rows: readonly SubagentRow[],
    preferredId: SessionId | undefined,
    private readonly terminalRows: () => number,
    private readonly keymap: TuiKeymap,
    private readonly palette: Palette,
    private readonly changed: () => void,
    private readonly select: (id: SessionId) => void,
    private readonly close: () => void,
  ) {
    this.selectedId = preferredId
    this.setRows(rows)
  }

  private children(): ChildRow[] {
    return this.rows.filter((row): row is ChildRow => row.kind === 'child')
  }

  setRows(rows: readonly SubagentRow[]): void {
    this.rows = rows
    const children = this.children()
    if (!children.some(row => row.id === this.selectedId)) this.selectedId = children[0]?.id
    this.scrollTop = Math.min(this.scrollTop, Math.max(0, children.length - 1))
    this.changed()
  }

  invalidate(): void {}

  handleInput(data: string): void {
    const action = this.keymap.resolve(data, 'subagentBrowser')
    if (action === 'subagentBack' || matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl('c'))) {
      this.close()
      return
    }
    const children = this.children()
    if (children.length === 0) return
    if (matchesKey(data, Key.enter)) {
      if (this.selectedId !== undefined) this.select(this.selectedId)
      return
    }
    const direction = action === 'subagentPrev' || matchesKey(data, Key.up) ? -1
      : action === 'subagentNext' || matchesKey(data, Key.down) ? 1 : 0
    if (direction === 0) return
    const current = children.findIndex(row => row.id === this.selectedId)
    const next = (current + direction + children.length) % children.length
    this.selectedId = children[next]?.id
    this.changed()
  }

  render(width: number): string[] {
    const children = this.children()
    const maxHeight = Math.max(6, Math.floor(this.terminalRows() * 0.8))
    // Border, count, scroll marker, and key hint leave two lines per child.
    const visible = Math.max(1, Math.floor((maxHeight - 5) / 2))
    const selected = Math.max(0, children.findIndex(row => row.id === this.selectedId))
    if (selected < this.scrollTop) this.scrollTop = selected
    if (selected >= this.scrollTop + visible) this.scrollTop = selected - visible + 1
    const end = Math.min(children.length, this.scrollTop + visible)
    const diagnostics = this.rows.length - children.length
    const count = `${children.length} child agent${children.length === 1 ? '' : 's'}`
    const body: string[] = [this.palette.dim(`${count}${diagnostics ? ` · ${diagnostics} unavailable` : ''}`)]
    if (children.length === 0) body.push(this.palette.dim('No child agents to view.'))
    for (let i = this.scrollTop; i < end; i += 1) {
      const row = children[i]
      if (row === undefined) continue
      const isSelected = row.id === this.selectedId
      const type = row.originType === 'fork' ? 'Fork'
        : row.originType === 'standard' ? 'Standard' : 'Unknown'
      const status = row.execution === 'running' ? 'Active' : 'Inactive'
      const title = displayInlineText(row.label ?? '(untitled)')
      const heading = `${isSelected ? '▸' : ' '} ${status} · ${type} · ${title}`
      const id = `  ID ${displayInlineText(row.id)}`
      body.push(isSelected ? this.palette.selected(this.palette.accent(heading)) : heading)
      body.push(isSelected ? this.palette.accent(id) : this.palette.dim(id))
    }
    if (children.length > visible) body.push(this.palette.dim(`Rows ${this.scrollTop + 1}-${end} of ${children.length}`))
    body.push(this.palette.dim('↑/↓ or ←/→ select · Enter view · Esc close'))
    return renderDialog('Agents', body, width, this.palette)
  }
}
