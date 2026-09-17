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
