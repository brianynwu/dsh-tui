/** A narrow UI adapter over the core's permission-preset read side and /permission command. */
import type { Session } from '@deepseek-ai/dsh-session'
import type { Palette } from '../components/theme.ts'
import { displayText } from '../components/text.ts'

export interface PermissionPresets {
  readonly names: readonly string[]
  current(session: Session): string
}

export interface PermissionModeController {
  current(): string
  label(): string
  cycle(): Promise<void>
}

/** Never maintain a shadow mode: every read comes from the core's effective state. */
export function createPermissionModeController(
  presets: PermissionPresets,
  session: Session,
  palette: Palette,
  runCommand: (text: string) => Promise<void>,
  notice: (text: string) => void,
): PermissionModeController {
  let transitions = Promise.resolve()
  const current = (): string => presets.current(session)
  const label = (): string => {
    const mode = current()
    const safe = displayText(mode)
    const paint = mode === 'read-only' ? palette.success
      : mode === 'workspace-write' ? palette.accent
        : palette.warning
    return `permission ${paint(safe)}`
  }
  const cycle = (): Promise<void> => {
    const transition = transitions.then(async () => {
      const names = presets.names.filter(name => name !== 'custom')
      const mode = current()
      if (mode === 'custom') {
        notice('Custom permission policy. Use /permission <name> to select a named preset.')
        return
      }
      const index = names.indexOf(mode)
      if (index < 0 || names.length === 0) {
        notice('Permission presets are unavailable. Use /permission to inspect them.')
        return
      }
      const next = names[(index + 1) % names.length]
      if (next === undefined) return
      await runCommand(`/permission ${next}`)
    })
    // A failed transition cannot poison the serial queue for the next keypress.
    transitions = transition.catch(() => {})
    return transition
  }
  return { current, label, cycle }
}
