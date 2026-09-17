/** Fixed OSC 9 signal for a newly actionable question in one mounted TUI. */
export const QUESTION_OSC9 = '\x1b]9;Input needed\x07'

export class QuestionNotifier {
  private readonly seen = new WeakSet<object>()
  private disposed = false

  constructor(
    private readonly write: (bytes: string) => void,
    private readonly enabled: boolean,
  ) {}

  /** Mark any questions already pending at mount as silent baseline. */
  baseline(pending: readonly object[]): void {
    for (const request of pending) this.seen.add(request)
  }

  /** A queued question becomes actionable only when its overlay owns focus. */
  actionable(request: object): void {
    if (this.disposed || !this.enabled || this.seen.has(request)) return
    this.seen.add(request)
    // Terminal delivery is best effort and cannot block the answerer.
    try { this.write(QUESTION_OSC9) } catch { /* terminal shutdown or unsupported writer */ }
  }

  dispose(): void {
    this.disposed = true
  }
}
