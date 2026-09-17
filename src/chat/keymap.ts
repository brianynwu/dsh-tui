/** Composer shortcuts owned by dsh-tui. pi-tui's editor and modal bindings stay in their own components. */
import { matchesKey, type KeyId } from '@earendil-works/pi-tui'

export const DEFAULT_KEYS = Object.freeze({
  cards: 'ctrl+t',
  tools: 'ctrl+o',
  reasoning: 'ctrl+r',
  context: 'alt+c',
  redraw: 'ctrl+l',
  cancel: 'escape',
  interruptOrExit: 'ctrl+c',
  exit: 'ctrl+d',
  cyclePermission: 'shift+tab',
  agents: 'ctrl+g',
  subagentPrev: 'left',
  subagentNext: 'right',
  subagentBack: 'escape',
} as const)

export type TuiAction = keyof typeof DEFAULT_KEYS
export type TuiKeyBindings = Partial<Record<TuiAction, string>>
export type ResolvedTuiKeys = Readonly<Record<TuiAction, KeyId>>
export type TuiKeyContext = 'composer' | 'subagentBrowser' | 'modal'

const actions = Object.keys(DEFAULT_KEYS) as TuiAction[]
const browserOnlyActions: readonly TuiAction[] = ['subagentPrev', 'subagentNext', 'subagentBack']
const sharedDetailsActions: readonly TuiAction[] = ['tools', 'reasoning', 'context']
const browserActions: readonly TuiAction[] = [...browserOnlyActions, ...sharedDetailsActions]
const composerActions = actions.filter(action => !browserOnlyActions.includes(action))
const modifierOrder = ['shift', 'ctrl', 'alt', 'super'] as const
const modifiers = new Set<string>(modifierOrder)
const specialKeys = new Map<string, string>([
  ...['escape', 'enter', 'tab', 'space', 'backspace', 'delete', 'insert', 'clear', 'home', 'end', 'up', 'down', 'left', 'right']
    .map(key => [key, key] as const),
  ['esc', 'escape'], ['return', 'enter'], ['pageup', 'pageUp'], ['pagedown', 'pageDown'],
  ...Array.from({ length: 12 }, (_, index) => [`f${index + 1}`, `f${index + 1}`] as const),
])
// A literal '+' cannot be expressed by pi-tui's plus-delimited parser.
const symbolKeys = new Set([...`\`-=[]{ }\\;',./!@#$%^&*()_|~:<>?`.replace(' ', '')])

/** Validate and canonicalize pi-tui's KeyId grammar before passing it to matchesKey. */
export function parseBinding(value: string): KeyId {
  if (value !== value.trim() || value === '') {
    throw new Error('Key binding must be a nonempty pi-tui key identifier')
  }
  const parts = value.toLowerCase().split('+')
  const base = parts.pop()
  if (base === undefined || base === '') throw new Error('Key binding has no base key')
  const seen = new Set<string>()
  for (const modifier of parts) {
    if (!modifiers.has(modifier) || seen.has(modifier)) throw new Error('Key binding has an invalid modifier')
    seen.add(modifier)
  }
  const key = specialKeys.get(base) ?? (/^[a-z0-9]$/u.test(base) || symbolKeys.has(base) ? base : undefined)
  if (key === undefined) throw new Error('Key binding has an unknown base key')
  if (key === 'escape' && seen.size > 0) throw new Error('Modified escape is not supported by pi-tui')
  const ordered = modifierOrder.filter(modifier => seen.has(modifier))
  return [...ordered, key].join('+') as KeyId
}

/** Reject an entire replacement map if any binding is invalid or a safety action is unreachable. */
export function resolveKeymap(overrides: Record<string, string> | undefined): ResolvedTuiKeys {
  const map = { ...DEFAULT_KEYS } as Record<TuiAction, string>
  for (const [action, binding] of Object.entries(overrides ?? {})) {
    if (!actions.includes(action as TuiAction)) throw new Error(`Unknown TUI key action: ${action}`)
    map[action as TuiAction] = binding
  }
  const resolved = {} as Record<TuiAction, KeyId>
  const occupied = { composer: new Set<KeyId>(), subagentBrowser: new Set<KeyId>() }
  for (const action of actions) {
    const binding = parseBinding(map[action])
    for (const context of (browserActions.includes(action) && composerActions.includes(action)
      ? ['composer', 'subagentBrowser'] : browserActions.includes(action) ? ['subagentBrowser'] : ['composer']) as TuiKeyContext[]) {
      if (context === 'modal') continue
      if (occupied[context].has(binding)) throw new Error(`Duplicate TUI key binding: ${binding}`)
      occupied[context].add(binding)
    }
    resolved[action] = binding
  }
  // The same chord may have distinct owners in mutually exclusive contexts.
  for (const safety of ['cancel', 'exit', 'subagentBack'] as const) {
    const context = safety === 'subagentBack' ? browserActions : composerActions
    if (context.find(action => resolved[action] === resolved[safety]) !== safety) {
      throw new Error(`Unreachable TUI safety action: ${safety}`)
    }
  }
  return Object.freeze(resolved)
}

/** One atomic in-memory replacement for a config reload. Invalid maps leave the last good map active. */
export class TuiKeymap {
  private current: ResolvedTuiKeys

  constructor(overrides?: Record<string, string>) {
    this.current = resolveKeymap(overrides)
  }

  replace(overrides: Record<string, string>): void {
    this.current = resolveKeymap(overrides)
  }

  binding(action: TuiAction): KeyId {
    return this.current[action]
  }

  resolve(data: string, context: TuiKeyContext = 'composer'): TuiAction | undefined {
    if (context === 'modal') return undefined
    const owned = context === 'composer' ? composerActions : browserActions
    return owned.find(action => matchesKey(data, this.current[action]))
  }
}
