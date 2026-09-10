/**
 * Tests for latestStep: the dashboard's timing position source. Unlike the
 * open-step scan, it returns the most recent step whether or not it has closed,
 * so a step's final durations stay shown between steps and on a resumed log
 * whose steps are all complete.
 */
import { describe, it, expect } from 'vitest'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { latestStep } from '../src/chat/timing.ts'

/** Minimal step/turn events, cast to the union — only type/time/data are read. */
function ev(type: string, turn: number, step = 0, time = 0): SessionEvent {
  return { type, time, data: { turn, step } } as unknown as SessionEvent
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
