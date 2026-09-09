/**
 * Vendored from the MIT-licensed @deepseek-ai/dsh-tui bundle's internal pi-tui
 * Editor (frameless prompt-gutter model, removed from published
 * @earendil-works/pi-tui). Reconstructed as TypeScript; behavior preserved.
 *
 * The compiled source of truth is this package's own `lib/index.js`. Only the
 * primitives that 0.80.7 still publishes with a compatible shape are imported
 * from `@earendil-works/pi-tui`; everything the published entry point no longer
 * exports (segmenters, paste-marker segmentation, kill ring, undo stack, word
 * navigation, the modifyOtherKeys printable decoder, and the word-wrap /
 * autocomplete-trigger helpers) is vendored below.
 *
 * License: MIT (see ../../LICENSE, unchanged).
 *
 * EDITOR-HARDENING PASS (2026-09-09) — three pre-existing upstream defects that
 * the initial vendoring carried faithfully are now FIXED here (operator-authorized
 * hardening pass; all interactive-editor only, off the orchestrator's automated
 * path — routing / in-place model swap / instructions residency). Regression
 * tests: `test/editor.test.ts` (D1/D2/D3). Everything else stays byte-faithful.
 *   1. FIXED — Undo now snapshots paste metadata. The undo stack stores an
 *      `UndoSnapshot` (`state` + `pastes` + `pasteCounter`), not bare
 *      `EditorState`, so `undo()` no longer restores a `[paste #N ...]` marker
 *      whose backing content was dropped.
 *   2. FIXED — `handleBackspace` renumbers paste IDs by rebuilding `this.pastes`
 *      from a snapshot, then rewriting marker ids in the text as a pure
 *      transform. Text-order traversal can no longer overwrite a not-yet-read
 *      entry when markers appear in non-ascending id order.
 *   3. FIXED — the autocomplete request chain catches a rejected/aborted provider
 *      call at the chain boundary, so it neither poisons the serialized chain
 *      (`await previousTask`) nor escapes as an unhandled rejection.
 */
import { SelectList, getKeybindings } from '@earendil-works/pi-tui';
import type { AutocompleteItem, AutocompleteProvider, AutocompleteSuggestions, Component, Focusable, SelectListTheme, TUI } from '@earendil-works/pi-tui';
/** A single segment produced by segmentation (Intl.SegmentData compatible). */
interface SegmentInfo {
    segment: string;
    index: number;
    input: string;
    isWordLike?: boolean;
}
interface KillRingPushOptions {
    prepend: boolean;
    accumulate: boolean;
}
declare class KillRing {
    private ring;
    /**
     * Add text to the kill ring.
     *
     * @param text - The killed text to add
     * @param opts - Push options
     * @param opts.prepend - If accumulating, prepend (backward deletion) or append (forward deletion)
     * @param opts.accumulate - Merge with the most recent entry instead of creating a new one
     */
    push(text: string, opts: KillRingPushOptions): void;
    /** Get most recent entry without modifying the ring. */
    peek(): string | undefined;
    /** Move last entry to front (for yank-pop cycling). */
    rotate(): void;
    get length(): number;
}
declare class UndoStack {
    private stack;
    /** Push a deep clone of the given snapshot onto the stack (clones the pastes Map too). */
    push(snapshot: UndoSnapshot): void;
    /** Pop and return the most recent snapshot, or undefined if empty. */
    pop(): UndoSnapshot | undefined;
    /** Remove all snapshots. */
    clear(): void;
    get length(): number;
}
/** A word-wrapped chunk of a logical line with position information. */
export interface TextChunk {
    text: string;
    startIndex: number;
    endIndex: number;
}
/**
 * Split a line into word-wrapped chunks.
 * Wraps at word boundaries when possible, falling back to character-level
 * wrapping for words longer than the available width.
 *
 * @param line - The text line to wrap
 * @param maxWidth - Maximum visible width per chunk
 * @param preSegmented - Optional pre-segmented graphemes (e.g. with paste-marker awareness).
 *                       When omitted the default Intl.Segmenter is used.
 * @param continuationWidth - Maximum visible width for continuation chunks.
 * @returns Array of chunks with text and position information
 */
export declare function wordWrapLine(line: string, maxWidth: number, preSegmented?: SegmentInfo[], continuationWidth?: number): TextChunk[];
/** Editor prompt-gutter prefixes; both must have equal visible widths. */
export interface EditorPrompt {
    first: string;
    continuation: string;
}
/** Frame model for the editor's top/bottom rules. */
export type EditorFrame = 'none' | 'horizontal';
/** Options accepted by the Editor constructor. */
export interface EditorOptions {
    paddingX?: number;
    autocompleteMaxVisible?: number;
    frame?: EditorFrame;
    prompt?: EditorPrompt;
}
/** Theme shape required by the Editor. */
export interface EditorTheme {
    borderColor: (str: string) => string;
    selectList: SelectListTheme;
}
interface EditorState {
    lines: string[];
    cursorLine: number;
    cursorCol: number;
}
/**
 * A single undo checkpoint. Beyond the text/cursor `state`, it carries the
 * paste-marker metadata (`pastes` + `pasteCounter`), which lives outside
 * `EditorState` but is mutated in lockstep with the text — so an undo that
 * restored only `state` would leave a `[paste #N ...]` marker whose backing
 * content had been dropped.
 */
interface UndoSnapshot {
    state: EditorState;
    pastes: Map<number, string>;
    pasteCounter: number;
}
interface LayoutLine {
    text: string;
    hasCursor: boolean;
    cursorPos?: number;
    isContinuation: boolean;
}
interface VisualLine {
    logicalLine: number;
    startCol: number;
    length: number;
}
type EditorAction = 'type-word' | 'kill' | 'yank' | null;
type JumpMode = 'forward' | 'backward' | null;
type AutocompleteRequestState = 'regular' | 'force';
type SegmentMode = 'word' | 'grapheme';
interface AutocompleteRequestOptions {
    force: boolean;
    explicitTab: boolean;
}
export declare class Editor implements Component, Focusable {
    state: EditorState;
    /** Focusable interface - set by TUI when focus changes */
    focused: boolean;
    tui: TUI;
    theme: EditorTheme;
    paddingX: number;
    frame: EditorFrame;
    prompt?: EditorPrompt;
    promptWidth: number;
    lastWidth: number;
    lastContinuationWidth: number;
    scrollOffset: number;
    borderColor: (str: string) => string;
    autocompleteProvider?: AutocompleteProvider;
    autocompleteTriggerCharacters: string[];
    autocompleteTriggerPattern: RegExp;
    autocompleteDebouncePattern: RegExp;
    autocompleteList?: SelectList;
    autocompleteState: AutocompleteRequestState | null;
    autocompletePrefix: string;
    autocompleteMaxVisible: number;
    autocompleteAbort?: AbortController;
    autocompleteDebounceTimer?: ReturnType<typeof setTimeout>;
    autocompleteRequestTask: Promise<void>;
    autocompleteStartToken: number;
    autocompleteRequestId: number;
    pastes: Map<number, string>;
    pasteCounter: number;
    pasteBuffer: string;
    isInPaste: boolean;
    history: string[];
    historyIndex: number;
    historyDraft: EditorState | null;
    killRing: KillRing;
    lastAction: EditorAction;
    jumpMode: JumpMode;
    preferredVisualCol: number | null;
    snappedFromCursorCol: number | null;
    undoStack: UndoStack;
    onSubmit?: (value: string) => void;
    onChange?: (value: string) => void;
    disableSubmit: boolean;
    constructor(tui: TUI, theme: EditorTheme, options?: EditorOptions);
    setPrompt(prompt: EditorPrompt): void;
    /** Set of currently valid paste IDs, for marker-aware segmentation. */
    validPasteIds(): Set<number>;
    /** Segment text with paste-marker awareness, only merging markers with valid IDs. */
    segment(text: string, mode: SegmentMode): Iterable<SegmentInfo>;
    getPaddingX(): number;
    setPaddingX(padding: number): void;
    getAutocompleteMaxVisible(): number;
    setAutocompleteMaxVisible(maxVisible: number): void;
    setAutocompleteProvider(provider: AutocompleteProvider): void;
    /**
     * Add a prompt to history for up/down arrow navigation.
     * Called after successful submission.
     */
    addToHistory(text: string): void;
    isEditorEmpty(): boolean;
    isOnFirstVisualLine(): boolean;
    isOnLastVisualLine(): boolean;
    navigateHistory(direction: number): void;
    exitHistoryBrowsing(): void;
    /** Internal setText that doesn't reset history state - used by navigateHistory */
    setTextInternal(text: string, cursorPlacement?: 'start' | 'end'): void;
    invalidate(): void;
    render(width: number): string[];
    handleInput(data: string): void;
    layoutText(contentWidth: number, continuationWidth: number): LayoutLine[];
    getText(): string;
    expandPasteMarkers(text: string): string;
    /**
     * Get text with paste markers expanded to their actual content.
     * Use this when you need the full content (e.g., for external editor).
     */
    getExpandedText(): string;
    getLines(): string[];
    getCursor(): {
        line: number;
        col: number;
    };
    setText(text: string): void;
    /**
     * Insert text at the current cursor position.
     * Used for programmatic insertion (e.g., clipboard image markers).
     * This is atomic for undo - single undo restores entire pre-insert state.
     */
    insertTextAtCursor(text: string): void;
    /**
     * Normalize text for editor storage:
     * - Normalize line endings (\r\n and \r -> \n)
     * - Expand tabs to 4 spaces
     */
    normalizeText(text: string): string;
    /**
     * Internal text insertion at cursor. Handles single and multi-line text.
     * Does not push undo snapshots or trigger autocomplete - caller is responsible.
     * Normalizes line endings and calls onChange once at the end.
     */
    insertTextAtCursorInternal(text: string): void;
    insertCharacter(char: string, skipUndoCoalescing?: boolean): void;
    handlePaste(pastedText: string): void;
    addNewLine(): void;
    shouldSubmitOnBackslashEnter(data: string, kb: ReturnType<typeof getKeybindings>): boolean;
    submitValue(): void;
    handleBackspace(): void;
    /**
     * Set cursor column and clear preferredVisualCol.
     * Use this for all non-vertical cursor movements to reset sticky column behavior.
     */
    setCursorCol(col: number): void;
    /**
     * Move cursor to a target visual line, applying sticky column logic.
     * Shared by moveCursor() and pageScroll().
     */
    moveToVisualLine(visualLines: VisualLine[], currentVisualLine: number, targetVisualLine: number): void;
    /**
     * Compute the target visual column for vertical cursor movement.
     * Implements the sticky column decision table:
     *
     * | P | S | T | U | Scenario                                             | Set Preferred | Move To     |
     * |---|---|---|---| ---------------------------------------------------- |---------------|-------------|
     * | 0 | * | 0 | - | Start nav, target fits                               | null          | current     |
     * | 0 | * | 1 | - | Start nav, target shorter                            | current       | target end  |
     * | 1 | 0 | 0 | 0 | Clamped, target fits preferred                       | null          | preferred   |
     * | 1 | 0 | 0 | 1 | Clamped, target longer but still can't fit preferred | keep          | target end  |
     * | 1 | 0 | 1 | - | Clamped, target even shorter                         | keep          | target end  |
     * | 1 | 1 | 0 | - | Rewrapped, target fits current                       | null          | current     |
     * | 1 | 1 | 1 | - | Rewrapped, target shorter than current               | current       | target end  |
     *
     * Where:
     * - P = preferred col is set
     * - S = cursor in middle of source line (not clamped to end)
     * - T = target line shorter than current visual col
     * - U = target line shorter than preferred col
     */
    computeVerticalMoveColumn(currentVisualCol: number, sourceMaxVisualCol: number, targetMaxVisualCol: number): number;
    moveToLineStart(): void;
    moveToLineEnd(): void;
    deleteToStartOfLine(): void;
    deleteToEndOfLine(): void;
    deleteWordBackwards(): void;
    deleteWordForward(): void;
    handleForwardDelete(): void;
    /**
     * Build a mapping from visual lines to logical positions.
     * Returns an array where each element represents a visual line with:
     * - logicalLine: index into this.state.lines
     * - startCol: starting column in the logical line
     * - length: length of this visual line segment
     */
    buildVisualLineMap(width: number, continuationWidth?: number): VisualLine[];
    /**
     * Find the visual line index that contains the given logical position.
     */
    findVisualLineAt(visualLines: VisualLine[], line: number, col: number): number;
    /**
     * Find the visual line index for the current cursor position.
     */
    findCurrentVisualLine(visualLines: VisualLine[]): number;
    moveCursor(deltaLine: number, deltaCol: number): void;
    /**
     * Scroll by a page (direction: -1 for up, 1 for down).
     * Moves cursor by the page size while keeping it in bounds.
     */
    pageScroll(direction: number): void;
    moveWordBackwards(): void;
    /**
     * Yank (paste) the most recent kill ring entry at cursor position.
     */
    yank(): void;
    /**
     * Cycle through kill ring (only works immediately after yank or yank-pop).
     * Replaces the last yanked text with the previous entry in the ring.
     */
    yankPop(): void;
    /**
     * Insert text at cursor position (used by yank operations).
     */
    insertYankedText(text: string): void;
    /**
     * Delete the previously yanked text (used by yank-pop).
     * The yanked text is derived from killRing[end] since it hasn't been rotated yet.
     */
    deleteYankedText(): void;
    pushUndoSnapshot(): void;
    undo(): void;
    /**
     * Jump to the first occurrence of a character in the specified direction.
     * Multi-line search. Case-sensitive. Skips the current cursor position.
     */
    jumpToChar(char: string, direction: 'forward' | 'backward'): void;
    moveWordForwards(): void;
    isSlashMenuAllowed(): boolean;
    isAtStartOfMessage(): boolean;
    isInSlashCommandContext(textBeforeCursor: string): boolean;
    /**
     * Find the best autocomplete item index for the given prefix.
     * Returns -1 if no match is found.
     *
     * Match priority:
     * 1. Exact match (prefix === item.value) -> always selected
     * 2. Prefix match -> first item whose value starts with prefix
     * 3. No match -> -1 (keep default highlight)
     *
     * Matching is case-sensitive and checks item.value only.
     */
    getBestAutocompleteMatchIndex(items: AutocompleteItem[], prefix: string): number;
    createAutocompleteList(prefix: string, items: AutocompleteItem[]): SelectList;
    tryTriggerAutocomplete(explicitTab?: boolean): void;
    handleTabCompletion(): void;
    handleSlashCommandCompletion(): void;
    forceFileAutocomplete(explicitTab?: boolean): void;
    requestAutocomplete(options: AutocompleteRequestOptions): void;
    startAutocompleteRequest(startToken: number, options: AutocompleteRequestOptions): Promise<void>;
    setAutocompleteTriggerCharacters(triggerCharacters: string[]): void;
    getAutocompleteDebounceMs(options: AutocompleteRequestOptions): number;
    runAutocompleteRequest(requestId: number, controller: AbortController, snapshotText: string, snapshotLine: number, snapshotCol: number, options: AutocompleteRequestOptions): Promise<void>;
    isAutocompleteRequestCurrent(requestId: number, controller: AbortController, snapshotText: string, snapshotLine: number, snapshotCol: number): boolean;
    applyAutocompleteSuggestions(suggestions: AutocompleteSuggestions, state: AutocompleteRequestState): void;
    cancelAutocompleteRequest(): void;
    clearAutocompleteUi(): void;
    cancelAutocomplete(): void;
    isShowingAutocomplete(): boolean;
    updateAutocomplete(): void;
}
export {};
//# sourceMappingURL=editor.d.ts.map