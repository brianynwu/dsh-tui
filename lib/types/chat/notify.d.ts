/** Fixed OSC 9 signal for a newly actionable question in one mounted TUI. */
export declare const QUESTION_OSC9 = "\u001B]9;Input needed\u0007";
export declare class QuestionNotifier {
    private readonly write;
    private readonly enabled;
    private readonly seen;
    private disposed;
    constructor(write: (bytes: string) => void, enabled: boolean);
    /** Mark any questions already pending at mount as silent baseline. */
    baseline(pending: readonly object[]): void;
    /** A queued question becomes actionable only when its overlay owns focus. */
    actionable(request: object): void;
    dispose(): void;
}
//# sourceMappingURL=notify.d.ts.map