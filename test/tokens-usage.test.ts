/**
 * recordEventUsage under the V3 format: usage rides the settled
 * `assistant/message` (its `usage` field) or an `assistant/attempt`'s embedded
 * stream, never a standalone `assistant/chunk` usage event. A message must be
 * counted once even when both its field and a stream usage chunk are present.
 */
import { describe, it, expect } from 'vitest'
import { AssistantStreamAccumulator, type StreamChunk, type TokenUsage } from '@deepseek-ai/dsh-llm'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { recordEventUsage, type SessionTokenTotals } from '../src/chat/tokens.ts'

function emptyTotals(): SessionTokenTotals {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, byStep: new Map() }
}

function usageChunkStream(usage: TokenUsage): ReturnType<AssistantStreamAccumulator['snapshot']> {
  const acc = new AssistantStreamAccumulator()
  acc.push({ time: 5, chunk: { type: 'usage', usage } as StreamChunk })
  return acc.snapshot()
}

function assistantMessage(turn: number, step: number, usage: TokenUsage | undefined, streamUsage: TokenUsage): SessionEvent {
  return {
    type: 'assistant/message',
    time: 10,
    data: { turn, step, message: { content: [] }, stream: usageChunkStream(streamUsage), ...usage === undefined ? {} : { usage } },
  } as unknown as SessionEvent
}

function assistantAttempt(turn: number, step: number, streamUsage: TokenUsage): SessionEvent {
  return {
    type: 'assistant/attempt',
    time: 10,
    data: { turn, step, stream: usageChunkStream(streamUsage) },
  } as unknown as SessionEvent
}

describe('recordEventUsage (V3 usage sources)', () => {
  it('prefers the assistant/message usage field over the stream chunk — single count', () => {
    const totals = emptyTotals()
    recordEventUsage(totals, assistantMessage(1, 0, { inputTokens: 100, outputTokens: 50 }, { inputTokens: 999, outputTokens: 999 }))
    expect(totals.input).toBe(100)
    expect(totals.output).toBe(50)
  })

  it('falls back to the stream usage chunk when the message has no usage field', () => {
    const totals = emptyTotals()
    recordEventUsage(totals, assistantMessage(1, 0, undefined, { inputTokens: 42, outputTokens: 7 }))
    expect(totals.input).toBe(42)
    expect(totals.output).toBe(7)
  })

  it('records usage from an assistant/attempt stream (no surface message)', () => {
    const totals = emptyTotals()
    recordEventUsage(totals, assistantAttempt(2, 1, { inputTokens: 8, outputTokens: 3 }))
    expect(totals.input).toBe(8)
    expect(totals.output).toBe(3)
  })

  it('replaces (not doubles) usage re-logged for the same turn/step', () => {
    const totals = emptyTotals()
    recordEventUsage(totals, assistantMessage(1, 0, { inputTokens: 100, outputTokens: 50 }, { inputTokens: 0, outputTokens: 0 }))
    recordEventUsage(totals, assistantMessage(1, 0, { inputTokens: 120, outputTokens: 60 }, { inputTokens: 0, outputTokens: 0 }))
    expect(totals.input).toBe(120)
    expect(totals.output).toBe(60)
  })
})
