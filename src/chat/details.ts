/** Shared transcript-detail controls used by the keyboard and slash command. */
import { Key, matchesKey } from '@earendil-works/pi-tui'
import type { CommandResult } from '@deepseek-ai/dsh-commands'
import type { ReasoningFold } from '../config.ts'
import type { ToolCardVisibility } from '../components/transcript.ts'

const USAGE = '/details [collapsed|expanded|hidden] [reasoning off|preview|full]'

/** First press from the stock full view hides reasoning. */
export function nextReasoningFold(current: ReasoningFold): ReasoningFold {
  return current === 'full' ? 'off' : current === 'off' ? 'preview' : 'full'
}

/** Handle the actual Ctrl+R chord; return whether it consumed this input. */
export function handleReasoningShortcut(
  data: string,
  current: ReasoningFold,
  setReasoningFold: (fold: ReasoningFold) => void,
): boolean {
  if (!matchesKey(data, Key.ctrl('r'))) return false
  setReasoningFold(nextReasoningFold(current))
  return true
}

/** Parse the whole command before applying either dimension. */
export function applyDetailsArguments(
  rawInput: string,
  setToolsVisibility: (visibility: ToolCardVisibility) => void,
  setReasoningFold: (fold: ReasoningFold) => void,
): CommandResult {
  const tokens = rawInput.split(/\s+/u).filter(token => token !== '')
  let tools: ToolCardVisibility | undefined
  let reasoning: ReasoningFold | undefined
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]
    if (token === 'collapsed' || token === 'expanded' || token === 'hidden') {
      tools = token
    } else if (token === 'reasoning') {
      const value = tokens[index + 1]
      if (value === undefined) return { kind: 'error', text: `Missing reasoning value. Usage: ${USAGE}` }
      if (value === 'on' || value === 'full') reasoning = 'full'
      else if (value === 'off' || value === 'preview') reasoning = value
      else return { kind: 'error', text: `Unknown /details argument "${value}". Usage: ${USAGE}` }
      index += 1
    } else {
      return { kind: 'error', text: `Unknown /details argument "${token}". Usage: ${USAGE}` }
    }
  }
  // Reasoning rebuilds the transcript, so apply visibility after it.
  if (reasoning !== undefined) setReasoningFold(reasoning)
  if (tools !== undefined) setToolsVisibility(tools)
  return { kind: 'success' }
}

/** The two session-local transcript-detail dimensions. */
export interface TranscriptView {
  readonly tools: ToolCardVisibility
  readonly reasoning: ReasoningFold
}

const isQuiet = (view: TranscriptView): boolean => view.tools === 'hidden' && view.reasoning === 'off'
const STOCK_VIEW: TranscriptView = { tools: 'collapsed', reasoning: 'full' }

/** Build `/quiet` with one remembered non-quiet view for this TUI session. */
export function createQuietCommand(
  startup: TranscriptView,
  current: () => TranscriptView,
  setToolsVisibility: (visibility: ToolCardVisibility) => void,
  setReasoningFold: (fold: ReasoningFold) => void,
): (rawInput: string) => CommandResult {
  const startupView = { ...startup }
  let preQuiet: TranscriptView | undefined

  return (rawInput: string): CommandResult => {
    const mode = rawInput.trim()
    if (mode !== '' && mode !== 'on' && mode !== 'off') {
      return { kind: 'error', text: 'Usage: /quiet [on|off]' }
    }

    const before = current()
    const turnOn = mode === 'on' || (mode === '' && !isQuiet(before))
    if (turnOn) {
      if (isQuiet(before)) return { kind: 'success' } // repeated on never overwrites the prior view
      preQuiet = { ...before }
      // Use the existing setters: reasoning rebuilds the transcript, then tools
      // updates card visibility and turn folding on the rebuilt components.
      setReasoningFold('off')
      setToolsVisibility('hidden')
    } else {
      const restore = preQuiet ?? (isQuiet(startupView) ? STOCK_VIEW : startupView)
      setReasoningFold(restore.reasoning)
      setToolsVisibility(restore.tools)
      preQuiet = undefined
    }
    return { kind: 'success' }
  }
}
