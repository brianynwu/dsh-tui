/**
 * Running token accounting for the terminal footer. Usage is keyed per
 * turn/step so replayed or re-emitted usage replaces rather than double-counts.
 * @module @deepseek-ai/dsh-tui/chat/tokens
 */

import { assistantStreamChunks, type AssistantStreamRecord, type TokenUsage } from '@deepseek-ai/dsh-llm'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'

/**
 * Running token totals for the footer, keyed per turn/step so replayed or
 * re-emitted usage replaces rather than double-counts; `input` is uncached
 * input, cache buckets are disjoint.
 */
export interface SessionTokenTotals {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  readonly byStep: Map<string, TokenUsage>
}

/**
 * Fold one step's usage into the running totals, replacing any prior usage
 * logged for the same turn/step.
 * @param totals - Running totals mutated in place.
 * @param turn - Turn index of the usage.
 * @param step - Step index of the usage.
 * @param usage - The step's token usage.
 */
export function recordTokenUsage(totals: SessionTokenTotals, turn: number, step: number, usage: TokenUsage): void {
  const key = `${turn}:${step}`
  const previous = totals.byStep.get(key)
  if (previous !== undefined) {
    totals.input -= previous.inputTokens
    totals.output -= previous.outputTokens
    totals.cacheRead -= previous.cacheReadTokens ?? 0
    totals.cacheWrite -= previous.cacheWriteTokens ?? 0
  }
  totals.byStep.set(key, usage)
  totals.input += usage.inputTokens
  totals.output += usage.outputTokens
  totals.cacheRead += usage.cacheReadTokens ?? 0
  totals.cacheWrite += usage.cacheWriteTokens ?? 0
}

/**
 * The final usage reported inside an attempt's embedded stream, or `undefined`
 * when the stream carries no usage chunk. In the V3 format usage rides the
 * attempt's stream rather than a standalone `assistant/chunk` usage event.
 * @param stream - the attempt's compact stream records.
 * @returns the last usage chunk's usage, or `undefined`.
 */
function streamUsage(stream: readonly AssistantStreamRecord[]): TokenUsage | undefined {
  return assistantStreamChunks(stream, 'usage').at(-1)?.usage
}

/**
 * Fold a usage-bearing session event into the running totals. An
 * `assistant/message` prefers its own `usage` field and falls back to the
 * stream's final usage chunk (never both, so a step is counted once); an
 * `assistant/attempt` (no surface message) reads usage from its stream.
 * @param totals - Running totals mutated in place.
 * @param event - Session event; ignored when it carries no usage.
 */
export function recordEventUsage(totals: SessionTokenTotals, event: SessionEvent): void {
  if (event.type === 'assistant/message') {
    const usage = event.data.usage ?? streamUsage(event.data.stream)
    if (usage !== undefined) recordTokenUsage(totals, event.data.turn, event.data.step, usage)
  } else if (event.type === 'assistant/attempt') {
    const usage = streamUsage(event.data.stream)
    if (usage !== undefined) recordTokenUsage(totals, event.data.turn, event.data.step, usage)
  }
}

/**
 * Share of billed input (prompt) tokens served from the provider cache, as an
 * integer percent, or `undefined` before any input is billed (avoids 0/0 and a
 * meaningless rate on an empty session).
 * @param totals - Running totals to measure.
 * @returns The cache hit rate percent, or `undefined` when no input is billed.
 */
export function cacheHitRate(totals: SessionTokenTotals): number | undefined {
  const billedInput = totals.input + totals.cacheRead + totals.cacheWrite
  if (billedInput === 0) return undefined
  return Math.round((totals.cacheRead / billedInput) * 100)
}

/**
 * Fold every usage-bearing event in a session into fresh totals.
 * @param session - Session whose events supply usage.
 * @returns The accumulated token totals.
 */
export function sessionTokens(session: Session): SessionTokenTotals {
  const totals: SessionTokenTotals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, byStep: new Map() }
  for (const event of session.snapshotEvents()) {
    recordEventUsage(totals, event)
  }
  return totals
}

/**
 * Output-token throughput (tokens/second) for one step: its output tokens over the
 * step's response wall-time. Returns `undefined` when either input is missing or
 * non-positive (no usage reported yet, or a zero/absent response duration) so the
 * caller shows a placeholder rather than a 0 or a divide-by-zero.
 * @param outputTokens - The step's output token count (from the llm stream usage).
 * @param respondingMs - The step's accumulated response wall-time in milliseconds.
 * @returns Tokens per second, or `undefined` when it cannot be computed.
 */
export function tokenThroughput(outputTokens: number | undefined, respondingMs: number): number | undefined {
  if (outputTokens === undefined || outputTokens <= 0) return undefined
  const seconds = respondingMs / 1000
  if (seconds <= 0) return undefined
  return outputTokens / seconds
}

/**
 * Format a token count with a compact k/m suffix for the footer.
 * @param value - Token count.
 * @returns The compact display string.
 */
export function formatTokens(value: number): string {
  if (value < 1_000) return String(value)
  if (value < 10_000) return `${(value / 1_000).toFixed(1)}k`
  if (value < 1_000_000) return `${Math.round(value / 1_000)}k`
  return `${(value / 1_000_000).toFixed(1)}m`
}

/**
 * Format context-window usage for the status line: the fill percentage plus the
 * used/total token breakdown, e.g. `45% context (59k/131k)`. Percent clamps to
 * 100 so an over-window measurement never reads above full.
 * @param usedTokens - Tokens the current request occupies (>= 0).
 * @param contextWindow - The model's total context window in tokens (> 0).
 * @returns The compact context-usage label.
 */
export function formatContextLabel(usedTokens: number, contextWindow: number): string {
  const percent = Math.min(100, Math.round((usedTokens / contextWindow) * 100))
  return `${percent}% context (${formatTokens(usedTokens)}/${formatTokens(contextWindow)})`
}
