/**
 * Live assistant-stream frame classifier for the interactive chat channel.
 *
 * The V3 session format no longer logs per-chunk `assistant/chunk` events (an
 * attempt's whole provider stream is embedded in its settled
 * `assistant/message` / `assistant/attempt` event). Live token-by-token deltas
 * instead arrive on the ephemeral, agent-scoped `agent/assistant-stream`
 * channel as ordered `start` / `chunk` / `end` frames. Because that channel is
 * asynchronous, a delayed frame or a frame from a superseded attempt can still
 * arrive; this controller is the pure state machine that tracks which attempt
 * is streaming live and rejects any frame whose identity (`attemptId` +
 * `revision`) does not match, so a stale frame cannot corrupt the render.
 * @module @deepseek-ai/dsh-tui/chat/stream
 */

import type { StreamChunk } from '@deepseek-ai/dsh-llm'
import type { AssistantStreamFrame } from '@deepseek-ai/dsh-agent'
import type { StepPosition } from './timing.ts'

/**
 * The action the renderer should apply for one frame. The controller decides
 * WHICH frames act; the caller performs the transcript-component effects.
 */
export type StreamFrameAction =
  /** Begin (or ensure) the step's live component; `superseded` when a prior in-flight attempt must be dropped first. */
  | { readonly kind: 'begin'; readonly position: StepPosition; readonly superseded: boolean }
  /** Fold one live delta into the open component. */
  | { readonly kind: 'chunk'; readonly chunk: StreamChunk; readonly time: number; readonly position: StepPosition }
  /** The live attempt ended; `retract` when it left no surface message (abandoned or attempt-only commit). */
  | { readonly kind: 'end'; readonly retract: boolean }
  /** A stale or non-actionable frame: do nothing. */
  | { readonly kind: 'ignore' }

/** Identity of the attempt currently streaming live. */
interface LiveAttempt {
  readonly attemptId: AssistantStreamFrame['attemptId']
  readonly revision: number
  readonly turn: number
  readonly step: number
}

/**
 * Tracks the attempt streaming live and classifies each `agent/assistant-stream`
 * frame into a {@link StreamFrameAction}. Pure and self-contained so the guard
 * is unit-testable in isolation; the chat channel applies the returned action.
 */
export class LiveStreamController {
  private live: LiveAttempt | undefined
  // Highest revision ever begun. Revisions are monotone within one attached
  // Agent lifecycle, so a start at or below the mark is a stale or duplicate
  // frame; it must not retract the current render or resurrect a finished
  // attempt. Deliberately survives reset() so a completed attempt's late start
  // stays ignored.
  private maxRevision = 0

  /**
   * Classify one frame, updating the tracked live attempt as a side effect.
   * @param frame - one assistant-stream frame.
   * @returns the action the renderer should apply.
   */
  frame(frame: AssistantStreamFrame): StreamFrameAction {
    switch (frame.type) {
      case 'start': {
        // Ignore a stale/duplicate start (revision not beyond the high-water mark).
        if (frame.revision <= this.maxRevision) return { kind: 'ignore' }
        this.maxRevision = frame.revision
        // A start for a different attempt supersedes any partial render still open.
        const superseded = this.live !== undefined && !this.isLive(frame)
        this.live = {
          attemptId: frame.attemptId,
          revision: frame.revision,
          turn: frame.turn,
          step: frame.step,
        }
        return { kind: 'begin', position: { turn: frame.turn, step: frame.step }, superseded }
      }
      case 'chunk': {
        if (!this.isLive(frame)) return { kind: 'ignore' }
        const live = this.live as LiveAttempt
        return {
          kind: 'chunk',
          chunk: frame.chunk,
          time: frame.time,
          position: { turn: live.turn, step: live.step },
        }
      }
      case 'end': {
        // A stale end must neither retract the current attempt nor clear tracking.
        if (!this.isLive(frame)) return { kind: 'ignore' }
        const retract = frame.outcome.kind === 'abandoned'
          || (frame.outcome.kind === 'committed' && frame.outcome.eventType === 'assistant/attempt')
        this.live = undefined
        return { kind: 'end', retract }
      }
      /* v8 ignore next 2 -- AssistantStreamFrame is a closed three-arm union. */
      default:
        return { kind: 'ignore' }
    }
  }

  /**
   * Forget the live attempt. Called when the step ends or the transcript is torn
   * down out of band, so a later frame from that dead attempt is treated as stale.
   */
  reset(): void {
    this.live = undefined
  }

  /** Whether a frame belongs to the attempt currently streaming live. */
  private isLive(frame: AssistantStreamFrame): boolean {
    return this.live !== undefined
      && frame.attemptId === this.live.attemptId
      && frame.revision === this.live.revision
  }
}
