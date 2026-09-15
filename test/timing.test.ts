/**
 * Tests for latestStep: the dashboard's timing position source. Unlike the
 * open-step scan, it returns the most recent step whether or not it has closed,
 * so a step's final durations stay shown between steps and on a resumed log
 * whose steps are all complete.
 */
import { describe, it, expect } from 'vitest'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { AssistantStreamAccumulator, type StreamChunk, type TimedStreamChunk } from '@deepseek-ai/dsh-llm'
import {
  latestStep,
  LiveStepPhase,
  StepTimingTracker,
  streamTimingTotals,
} from '../src/chat/timing.ts'

/** Minimal step/turn events, cast to the union — only type/time/data are read. */
function ev(type: string, turn: number, step = 0, time = 0): SessionEvent {
  return { type, time, data: { turn, step } } as unknown as SessionEvent
}

const reasoning = (text: string, index = 0): StreamChunk => ({ type: 'reasoning-delta', index, text })
const text = (t: string, index = 1): StreamChunk => ({ type: 'text-delta', index, text: t })

/** Build a valid embedded stream (compact records) from timed chunks. */
function embed(chunks: readonly TimedStreamChunk[]): ReturnType<AssistantStreamAccumulator['snapshot']> {
  const acc = new AssistantStreamAccumulator()
  for (const c of chunks) acc.push(c)
  return acc.snapshot()
}

/** An assistant/message event carrying an embedded stream. */
function assistantMessage(turn: number, step: number, time: number, chunks: readonly TimedStreamChunk[]): SessionEvent {
  return {
    type: 'assistant/message',
    time,
    data: { turn, step, message: { content: [] }, stream: embed(chunks) },
  } as unknown as SessionEvent
}

describe('latestStep', () => {
  it('returns undefined for a log with no step', () => {
    expect(latestStep([])).toBeUndefined()
    expect(latestStep([ev('turn/start', 1)])).toBeUndefined()
  })

  it('returns the open step while one is running', () => {
    const events = [ev('turn/start', 1), ev('step/start', 1, 0)]
    expect(latestStep(events)).toEqual({ turn: 1, step: 0 })
  })

  it('still returns the step after it closes (final durations persist)', () => {
    const events = [ev('turn/start', 1), ev('step/start', 1, 0), ev('step/end', 1, 0)]
    expect(latestStep(events)).toEqual({ turn: 1, step: 0 })
  })

  it('returns the most recent of several steps', () => {
    const events = [
      ev('step/start', 1, 0), ev('step/end', 1, 0),
      ev('step/start', 1, 1), ev('step/end', 1, 1),
    ]
    expect(latestStep(events)).toEqual({ turn: 1, step: 1 })
  })

  it('returns the last completed step on a fully-closed (resumed) log', () => {
    const events = [
      ev('turn/start', 1), ev('step/start', 1, 0), ev('step/end', 1, 0), ev('turn/end', 1),
    ]
    expect(latestStep(events)).toEqual({ turn: 1, step: 0 })
  })
})

describe('streamTimingTotals (replay fold over an attempt stream)', () => {
  it('splits model-wait, thinking, and responding from chunk timestamps', () => {
    const totals = streamTimingTotals(0, [
      { time: 10, chunk: reasoning('thinking...') },
      { time: 20, chunk: text('answer') },
    ], 30)
    expect(totals.ttft).toBe(10)      // step-start -> first chunk
    expect(totals.thinking).toBe(10)  // reasoning -> text
    expect(totals.responding).toBe(10) // text -> end clock
    expect(totals.tools).toBe(0)
  })
})

describe('StepTimingTracker over the V3 embedded stream', () => {
  it('derives per-phase timing from assistant/message + tool events (no assistant/chunk log events)', () => {
    const events = [
      ev('step/start', 1, 0, 0),
      assistantMessage(1, 0, 21, [
        { time: 10, chunk: reasoning('r') },
        { time: 20, chunk: text('t') },
      ]),
      ev('tool/call', 1, 0, 25),
      ev('step/end', 1, 0, 30),
    ]
    const totals = new StepTimingTracker().totalsAt(events, { turn: 1, step: 0 }, 30)
    expect(totals.thinking).toBeGreaterThan(0)
    expect(totals.responding).toBeGreaterThan(0)
    expect(totals.tools).toBeGreaterThan(0)
  })
})

describe('LiveStepPhase (glyph phase fed by frames)', () => {
  it('transitions model-wait -> thinking -> responding, then clears on reset', () => {
    const phase = new LiveStepPhase()
    expect(phase.phase()).toBeUndefined()
    phase.begin()
    expect(phase.phase()).toBe('ttft')
    phase.observe(10, reasoning('r'))
    expect(phase.phase()).toBe('thinking')
    phase.observe(20, text('t'))
    expect(phase.phase()).toBe('responding')
    phase.reset()
    expect(phase.phase()).toBeUndefined()
  })
})
