/**
 * Reconstruct durable steering identity from the event-sourced agent inbox:
 * `agent/inbox/spliced` events preserve whether an admitted `user/message`
 * came from the queued-turn list or the mid-turn next-step list. Ported from
 * the harness web client's React-free steering-history fold.
 * @module @brianynwu/dsh-tui/chat/steering
 */
import type { SessionEvent } from '@deepseek-ai/dsh-session';
/**
 * Incrementally identifies `user/message` events claimed from the next-step
 * inbox. Feed every session event in sequence order through {@link apply}.
 */
export declare class SteeringHistory {
    private readonly inbox;
    private readonly claimedNextStep;
    /**
     * Apply one event and report whether it is a durable human steering message.
     * @param event - next raw session event in sequence order.
     * @returns true only for a user-origin message previously claimed from `next-step`.
     */
    apply(event: SessionEvent): boolean;
    /** Replay one host-validated inbox splice. */
    private applySplice;
}
//# sourceMappingURL=steering.d.ts.map