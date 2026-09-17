export declare const HISTORY_MAX_ENTRIES = 500;
export declare const HISTORY_MAX_BYTES: number;
export declare const HISTORY_MAX_RECORD_BYTES: number;
/** Files are immutable; each writer publishes its own uniquely named record. */
export declare class HistoryStore {
    readonly directory: string;
    constructor(directory?: string);
    private ensureDirectory;
    private readRecord;
    /** Newest first. Prune the oldest complete records under both ceilings. */
    load(): string[];
    /** Publish the submitted text atomically; oversized prompts remain sendable in memory. */
    append(text: string): boolean;
}
//# sourceMappingURL=history-store.d.ts.map