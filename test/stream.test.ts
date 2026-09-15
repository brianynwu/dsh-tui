/**
 * LiveStreamController: the frame identity guard for live assistant streaming.
 * The V3 `agent/assistant-stream` channel is asynchronous, so a delayed frame or
 * a frame from a superseded attempt can arrive; the controller must reject any
 * frame whose (attemptId, revision) does not match the attempt streaming live so
 * a stale frame cannot corrupt the render.
 */
import { describe, it, expect } from 'vitest'
import type { StreamChunk } from '@deepseek-ai/dsh-llm'
import type { AssistantStreamFrame } from '@deepseek-ai/dsh-agent'
import { LiveStreamController } from '../src/chat/stream.ts'

const textDelta = (text: string, index = 0): StreamChunk => ({ type: 'text-delta', index, text })

const start = (attemptId: string, revision: number, turn = 1, step = 0): AssistantStreamFrame =>
  ({ type: 'start', attemptId, revision, turn, step }) as unknown as AssistantStreamFrame

const chunk = (attemptId: string, revision: number, chunk: StreamChunk, time = 0, index = 0): AssistantStreamFrame =>
  ({ type: 'chunk', attemptId, revision, index, time, chunk }) as unknown as AssistantStreamFrame

const end = (
  attemptId: string,
  revision: number,
  outcome: { kind: 'abandoned' } | { kind: 'committed'; eventType: 'assistant/message' | 'assistant/attempt'; seq: number },
): AssistantStreamFrame =>
  ({ type: 'end', attemptId, revision, index: 1, outcome }) as unknown as AssistantStreamFrame

describe('LiveStreamController', () => {
  it('begins a step and folds a live chunk of the same attempt', () => {
    const c = new LiveStreamController()
    expect(c.frame(start('a1', 1))).toEqual({ kind: 'begin', position: { turn: 1, step: 0 }, superseded: false })
    const action = c.frame(chunk('a1', 1, textDelta('hi'), 5))
    expect(action).toEqual({ kind: 'chunk', chunk: textDelta('hi'), time: 5, position: { turn: 1, step: 0 } })
  })

  it('ignores a chunk from a foreign attemptId', () => {
    const c = new LiveStreamController()
    c.frame(start('a1', 1))
    expect(c.frame(chunk('other', 1, textDelta('x')))).toEqual({ kind: 'ignore' })
  })

  it('ignores a chunk of the same attemptId but a superseded revision', () => {
    const c = new LiveStreamController()
    c.frame(start('a1', 2))
    expect(c.frame(chunk('a1', 1, textDelta('stale')))).toEqual({ kind: 'ignore' })
  })

  it('marks a start for a different attempt as superseding the open one', () => {
    const c = new LiveStreamController()
    c.frame(start('a1', 1))
    expect(c.frame(start('a2', 1))).toEqual({ kind: 'begin', position: { turn: 1, step: 0 }, superseded: true })
  })

  it('a stale end neither retracts nor clears the live attempt', () => {
    const c = new LiveStreamController()
    c.frame(start('a1', 2))
    // an end for a superseded revision must be ignored...
    expect(c.frame(end('a1', 1, { kind: 'abandoned' }))).toEqual({ kind: 'ignore' })
    // ...and a following live chunk of the current attempt still renders.
    expect(c.frame(chunk('a1', 2, textDelta('live'), 9))).toMatchObject({ kind: 'chunk' })
  })

  it('retracts on an abandoned end', () => {
    const c = new LiveStreamController()
    c.frame(start('a1', 1))
    expect(c.frame(end('a1', 1, { kind: 'abandoned' }))).toEqual({ kind: 'end', retract: true })
  })

  it('does not retract on a committed assistant/message end (the durable event settles it)', () => {
    const c = new LiveStreamController()
    c.frame(start('a1', 1))
    expect(c.frame(end('a1', 1, { kind: 'committed', eventType: 'assistant/message', seq: 3 })))
      .toEqual({ kind: 'end', retract: false })
  })

  it('retracts on a committed attempt-only end (no surface message)', () => {
    const c = new LiveStreamController()
    c.frame(start('a1', 1))
    expect(c.frame(end('a1', 1, { kind: 'committed', eventType: 'assistant/attempt', seq: 4 })))
      .toEqual({ kind: 'end', retract: true })
  })

  it('after an end, a late chunk of the ended attempt is ignored', () => {
    const c = new LiveStreamController()
    c.frame(start('a1', 1))
    c.frame(end('a1', 1, { kind: 'committed', eventType: 'assistant/message', seq: 1 }))
    expect(c.frame(chunk('a1', 1, textDelta('late')))).toEqual({ kind: 'ignore' })
  })

  it('reset() drops tracking so later frames of that attempt are stale', () => {
    const c = new LiveStreamController()
    c.frame(start('a1', 1))
    c.reset()
    expect(c.frame(chunk('a1', 1, textDelta('x')))).toEqual({ kind: 'ignore' })
  })
})
