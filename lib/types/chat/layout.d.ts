/**
 * Alt-screen layout assembly for the TUI (pi-tui 0.85 adoption).
 *
 * The TUI renders into a full-screen {@link TuiAltScreen} viewport that has no
 * native terminal scrollback, so the flow content lives inside ONE primary
 * {@link ScrollView} (wheel/keyboard/scrollbar/search bind to it) while the live
 * input surface (prompt, inline-modal mount, editor) is pinned outside it.
 *
 * This module is a pure tree builder so the render-tree shape and the
 * pinned-vs-scrolled sizing contract are unit-testable without standing up the
 * whole `createTuiChat` closure (a Cordis Context + a running agent).
 * @module @deepseek-ai/dsh-tui/chat/layout
 */
import { type Component, type KeybindingsManager, ScrollView, VStack } from '@earendil-works/pi-tui';
/**
 * Free Home/End (and ctrl+home/ctrl+end/ctrl+a/ctrl+e) for the focused editor.
 *
 * `TuiAltScreen` registers its viewport input listener in its constructor, and
 * `TuiBase.handleTerminalInput` runs input listeners BEFORE the focused
 * component — so a viewport binding wins over the focused editor. The defaults
 * `tui.altScreen.top`/`tui.altScreen.bottom` are `home`/`end`, which collide with
 * the editor's `cursorLineStart`/`cursorLineEnd`. Unbind viewport top/bottom
 * (PageUp/PageDown + the wheel still scroll the transcript; repeated Page reaches
 * the ends). ctrl+home/ctrl+end are also editor-bound, so they are NOT a valid
 * replacement — unbinding is the only conflict-free fix. Merge-preserving: any
 * other user binding is retained.
 */
export declare function freeEditorHomeEnd(keybindings: KeybindingsManager): void;
/** The components the front door assembles into the layout tree. */
export interface TuiLayoutParts {
    /** Banner; scrolls with the transcript as the top of the flow content. */
    header: Component;
    /** The transcript container — mutated in place; kept transcript-only. */
    chat: Component;
    /** Wraps the todo component; a scrollBody sibling of `chat`, never folded in. */
    todoContainer: Component;
    /** Context-compaction status line; a scrollBody sibling of `chat`. */
    compactionStatusLine: Component;
    /** The left/right prompt line; pinned above the editor. */
    promptContext: Component;
    /** Inline-modal / question mount point; pinned. */
    questionContainer: Component;
    /** The input editor; pinned at the bottom, always visible. */
    editor: Component;
}
/** The assembled tree plus the handles the front door needs to drive it. */
export interface TuiLayout {
    /** Hand this to `ui.setLayoutRoot(...)`. */
    root: VStack;
    /** The sole primary scroll view (wheel/keys/scrollbar/search target). */
    transcriptScroll: ScrollView;
    /** The scrolled flow content (header, chat, spacer, todo, compaction). */
    scrollBody: VStack;
}
/**
 * Build the alt-screen layout tree.
 *
 * The scroll region is the SOLE grow+shrink entry (`grow:1, shrink:1, basis:0`);
 * the pinned entries are `shrink:0` so a long transcript can never clip the
 * editor / prompt / question modal (Stack defaults are `grow??0, shrink??1`, so
 * pinned entries MUST override shrink). `follow:'end'` keeps the newest output
 * pinned until the reader scrolls up; `scrollToEnd()` re-engages it.
 */
export declare function buildTuiLayout(parts: TuiLayoutParts): TuiLayout;
//# sourceMappingURL=layout.d.ts.map