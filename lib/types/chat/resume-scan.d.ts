/**
 * Resume-list row resolution: each session's title and last-activity time.
 *
 * rc.2 removed the metadata path/mtime accessor and reshaped the projection
 * cache (its cold fold now needs the complete event log plus the fork-inherited
 * prefix length), so a not-live row's last-activity time can no longer be read
 * from file metadata — it comes from the log tail. This module reads each
 * not-live session's log ONCE through an injected reader and derives both the
 * title (cold-folded when the projection cache is mounted, else from a batch
 * snapshot that opens no log) and the last-activity time from that one read,
 * under a bounded worker pool. The store access is injected so the orchestration
 * is unit-testable without a live engine.
 * @module @deepseek-ai/dsh-tui/chat/resume-scan
 */
import type { SessionEvent, SessionId, SessionLogOffset } from '@deepseek-ai/dsh-session';
import type { SessionQueryEngine, SessionRecord } from '@deepseek-ai/dsh-session-query';
/** One element of the batch title read (the cache-absent path). */
export type TitleSnapshotResult = Awaited<ReturnType<SessionQueryEngine['readTitleSnapshots']>>[number];
/** A not-live session's complete log plus its fork-inherited prefix length. */
export interface CompleteLog {
    readonly events: readonly SessionEvent[];
    readonly inheritedEventCount: SessionLogOffset;
}
/** Minimal read handle: the structural subset of `SessionHandle` this scan uses. */
export interface ReadHandle {
    readonly inheritedEventCount: SessionLogOffset;
    read(offset?: number, length?: number, options?: {
        signal?: AbortSignal;
    }): Promise<{
        events: readonly SessionEvent[];
    }>;
    close(): Promise<void>;
}
/** Minimal persistence: the structural subset of `SessionPersistence` this scan uses. */
export interface SessionLogSource {
    open(id: SessionId, access: 'read', options?: {
        signal?: AbortSignal;
    }): Promise<ReadHandle>;
}
/**
 * Read a not-live session's complete logical log and its fork-inherited prefix
 * length through ONE handle, always closed. rc.2 removed the metadata path/mtime
 * accessor and the projection cache's cold fold needs the full log plus
 * `inheritedEventCount`, so this one read serves both the row's title and its
 * last-activity time. Returns `undefined` when no persistence is mounted; a
 * read/open failure throws to the caller.
 * @param source - the persistence service, or `undefined` when none is mounted.
 * @param id - the session to read.
 * @param signal - abort observed by open and read; the handle is always closed.
 */
export declare function readCompleteLog(source: SessionLogSource | undefined, id: SessionId, signal: AbortSignal): Promise<CompleteLog | undefined>;
/** One row's resolved metadata: a title (absent for untitled), a last-activity time, or an isolated failure. */
export interface ResumeRowMeta {
    title?: string;
    lastActivityAt?: number;
    failure?: unknown;
}
/** Store access the resume scan needs, all derived from the plugin context. */
export interface ResumeScanDeps {
    /** In-memory events of a live session, or `undefined` when it is not live. */
    liveEvents(id: SessionId): readonly SessionEvent[] | undefined;
    /** Title projection of a live session (registry snapshot). */
    liveTitle(id: SessionId): string | null | undefined;
    /**
     * Read a not-live session's complete log and inherited prefix length through
     * one handle. `undefined` when no persistence is mounted; THROWS on a read or
     * open failure (the caller decides whether that disables the row).
     */
    readLog(id: SessionId, signal: AbortSignal): Promise<CompleteLog | undefined>;
    /**
     * Fold a not-live session's title from the projection cache, given its
     * complete log; present only when the cache is mounted. `undefined`/`null`
     * means untitled.
     */
    cacheTitle?: (record: SessionRecord, log: CompleteLog) => string | null | undefined;
    /** Batch title read that opens no session log (the cache-absent path). */
    batchTitles(records: readonly SessionRecord[], signal: AbortSignal): Promise<readonly TitleSnapshotResult[]>;
    /** Maximum concurrent per-row reads. */
    concurrency: number;
}
/**
 * Resolve every row's title and last-activity time under one bounded worker pool
 * (`deps.concurrency`): one log read per not-live row feeds both. A per-row
 * failure isolates to that row's `failure` (a disabled picker entry) rather than
 * failing the whole scan.
 * @returns one {@link ResumeRowMeta} per input record, in input order.
 */
export declare function resolveRows(deps: ResumeScanDeps, records: readonly SessionRecord[], signal: AbortSignal): Promise<ResumeRowMeta[]>;
//# sourceMappingURL=resume-scan.d.ts.map