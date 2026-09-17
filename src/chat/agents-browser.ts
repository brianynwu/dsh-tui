/** /agents navigation: popup → read-only child → popup → main composer. */
import type { SessionId } from '@deepseek-ai/dsh-session'
import type { TuiOverlaySession } from '../extension/types.ts'
import type { TuiOverlayManager } from '../extension/overlay-manager.ts'
import type { TuiKeymap } from './keymap.ts'
import type { SubagentRow, SubagentSwitcher } from './subagents.ts'
import { SubagentPicker } from '../components/subagent-picker.ts'
import type { Palette } from '../components/theme.ts'

export interface AgentsBrowserDeps {
  switcher: SubagentSwitcher
  overlays: TuiOverlayManager
  keymap: TuiKeymap
  palette: Palette
  viewport(): { columns: number; rows: number }
  focusChild(): void
  isDisposed(): boolean
}

export class AgentsBrowser {
  private overlay: TuiOverlaySession | undefined
  private picker: SubagentPicker | undefined

  constructor(private readonly deps: AgentsBrowserDeps) {}

  async open(): Promise<void> {
    await this.deps.switcher.refresh()
    if (!this.deps.isDisposed()) this.showPicker()
  }

  setRows(rows: readonly SubagentRow[]): void {
    this.picker?.setRows(rows)
  }

  backFromChild(): void {
    const previous = this.deps.switcher.selectedId
    this.deps.switcher.back()
    if (!this.deps.isDisposed()) this.showPicker(previous)
  }

  private showPicker(preferredId?: SessionId): void {
    void this.overlay?.close()
    const { columns } = this.deps.viewport()
    const width = Math.max(1, Math.min(100, columns - 2))
    const session = this.deps.overlays.open({
      create: host => {
        const picker = new SubagentPicker(
          this.deps.switcher.rows, preferredId, () => this.deps.viewport().rows,
          this.deps.keymap, this.deps.palette, () => host.invalidate(),
          id => {
            if (!this.deps.switcher.select(id)) return
            void session.close()
            this.deps.focusChild()
          },
          () => { void session.close() },
        )
        this.picker = picker
        return picker
      },
      options: { width, maxHeight: '80%', anchor: 'center', margin: 1 },
    })
    this.overlay = session
    void session.closed.then(() => {
      if (this.overlay === session) {
        this.overlay = undefined
        this.picker = undefined
      }
    })
  }
}
