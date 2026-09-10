/**
 * Running token accounting for the terminal footer. Usage is keyed per
 * turn/step so replayed or re-emitted usage replaces rather than double-counts.
 * @module @deepseek-ai/dsh-tui/chat/tokens
 */
import type { TokenUsage } from '@deepseek-ai/dsh-llm';
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session';
/**
 * Running token totals for the footer, keyed per turn/step so replayed or
 * re-emitted usage replaces rather than double-counts; `input` is uncached
 * input, cache buckets are disjoint.
 */
export interface SessionTokenTotals {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    readonly byStep: Map<string, TokenUsage>;
}
/**
 * Fold one step's usage into the running totals, replacing any prior usage
 * logged for the same turn/step.
 * @param totals - Running totals mutated in place.
 * @param turn - Turn index of the usage.
 * @param step - Step index of the usage.
 * @param usage - The step's token usage.
 */
export declare function recordTokenUsage(totals: SessionTokenTotals, turn: number, step: number, usage: TokenUsage): void;
/**
 * Fold a usage-bearing session event into the running totals.
 * @param totals - Running totals mutated in place.
 * @param event - Session event; ignored when it carries no usage.
 */
export declare function recordEventUsage(totals: SessionTokenTotals, event: SessionEvent): void;
/**
 * Share of billed input (prompt) tokens served from the provider cache, as an
 * integer percent, or `undefined` before any input is billed (avoids 0/0 and a
 * meaningless rate on an empty session).
 * @param totals - Running totals to measure.
 * @returns The cache hit rate percent, or `undefined` when no input is billed.
 */
export declare function cacheHitRate(totals: SessionTokenTotals): number | undefined;
/**
 * Fold every usage-bearing event in a session into fresh totals.
 * @param session - Session whose events supply usage.
 * @returns The accumulated token totals.
 */
export declare function sessionTokens(session: Session): SessionTokenTotals;
/**
 * Output-token throughput (tokens/second) for one step: its output tokens over the
 * step's response wall-time. Returns `undefined` when either input is missing or
 * non-positive (no usage reported yet, or a zero/absent response duration) so the
 * caller shows a placeholder rather than a 0 or a divide-by-zero.
 * @param outputTokens - The step's output token count (from the llm stream usage).
 * @param respondingMs - The step's accumulated response wall-time in milliseconds.
 * @returns Tokens per second, or `undefined` when it cannot be computed.
 */
export declare function tokenThroughput(outputTokens: number | undefined, respondingMs: number): number | undefined;
/**
 * Format a token count with a compact k/m suffix for the footer.
 * @param value - Token count.
 * @returns The compact display string.
 */
export declare function formatTokens(value: number): string;
/**
 * Format context-window usage for the status line: the fill percentage plus the
 * used/total token breakdown, e.g. `45% context (59k/131k)`. Percent clamps to
 * 100 so an over-window measurement never reads above full.
 * @param usedTokens - Tokens the current request occupies (>= 0).
 * @param contextWindow - The model's total context window in tokens (> 0).
 * @returns The compact context-usage label.
 */
export declare function formatContextLabel(usedTokens: number, contextWindow: number): string;
//# sourceMappingURL=tokens.d.ts.map