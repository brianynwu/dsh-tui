/** Zero-height focus target: child transcripts are read-only, and Esc returns to the picker. */
import { Key, matchesKey, type Component, type Focusable } from '@earendil-works/pi-tui'
import type { TuiKeymap } from '../chat/keymap.ts'

export class ChildViewKeys implements Component, Focusable {
  focused = false

  constructor(
    private readonly keymap: TuiKeymap,
    private readonly back: () => void,
    private readonly changeDetail: (action: 'tools' | 'reasoning' | 'context') => void,
  ) {}

  render(_width: number): string[] { return [] }
  invalidate(): void {}

  handleInput(data: string): void {
    const action = this.keymap.resolve(data, 'subagentBrowser')
    if (action === 'subagentBack' || matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl('c'))) this.back()
    else if (action === 'tools' || action === 'reasoning' || action === 'context') this.changeDetail(action)
  }
}
