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
import type { StreamChunk } from '@deepseek-ai/dsh-llm';
import type { AssistantStreamFrame } from '@deepseek-ai/dsh-agent';
import type { StepPosition } from './timing.ts';
/**
 * The action the renderer should apply for one frame. The controller decides
 * WHICH frames act; the caller performs the transcript-component effects.
 */
export type StreamFrameAction = 
/** Begin (or ensure) the step's live component; `superseded` when a prior in-flight attempt must be dropped first. */
{
    readonly kind: 'begin';
    readonly position: StepPosition;
    readonly superseded: boolean;
}
/** Fold one live delta into the open component. */
 | {
    readonly kind: 'chunk';
    readonly chunk: StreamChunk;
    readonly time: number;
    readonly position: StepPosition;
}
/** The live attempt ended; `retract` when it left no surface message (abandoned or attempt-only commit). */
 | {
    readonly kind: 'end';
    readonly retract: boolean;
}
/** A stale or non-actionable frame: do nothing. */
 | {
    readonly kind: 'ignore';
};
/**
 * Tracks the attempt streaming live and classifies each `agent/assistant-stream`
 * frame into a {@link StreamFrameAction}. Pure and self-contained so the guard
 * is unit-testable in isolation; the chat channel applies the returned action.
 */
export declare class LiveStreamController {
    private live;
    private maxRevision;
    /**
     * Classify one frame, updating the tracked live attempt as a side effect.
     * @param frame - one assistant-stream frame.
     * @returns the action the renderer should apply.
     */
    frame(frame: AssistantStreamFrame): StreamFrameAction;
    /**
     * Forget the live attempt. Called when the step ends or the transcript is torn
     * down out of band, so a later frame from that dead attempt is treated as stale.
     */
    reset(): void;
    /** Whether a frame belongs to the attempt currently streaming live. */
    private isLive;
}
//# sourceMappingURL=stream.d.ts.map