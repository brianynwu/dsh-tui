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

import {
  CURSOR_MARKER,
  SelectList,
  decodeKittyPrintable,
  getKeybindings,
  matchesKey,
  truncateToWidth,
  visibleWidth,
} from '@earendil-works/pi-tui'
import type {
  AutocompleteItem,
  AutocompleteProvider,
  AutocompleteSuggestions,
  Component,
  Focusable,
  SelectListLayoutOptions,
  SelectListTheme,
  TUI,
} from '@earendil-works/pi-tui'

//#region vendored pi-tui internals (not exported by 0.80.7)

const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
const wordSegmenter = new Intl.Segmenter(undefined, { granularity: 'word' })

const cjkBreakRegex =
  /[\p{Script_Extensions=Han}\p{Script_Extensions=Hiragana}\p{Script_Extensions=Katakana}\p{Script_Extensions=Hangul}\p{Script_Extensions=Bopomofo}]/u

const PUNCTUATION_REGEX = /[(){}[\]<>.,;:'"!?+\-=*/\\|&%^$#@~`]/

/** Check if a character is whitespace. */
function isWhitespaceChar(char: string): boolean {
  return /\s/.test(char)
}

const MODIFIERS = {
  shift: 1,
  alt: 2,
  ctrl: 4,
  super: 8,
} as const

interface ModifyOtherKeysSequence {
  codepoint: number
  modifier: number
}

function parseModifyOtherKeysSequence(data: string): ModifyOtherKeysSequence | null {
  const match = data.match(/^\x1b\[27;(\d+);(\d+)~$/)
  if (!match) return null
  const modValue = parseInt(match[1]!, 10)
  return {
    codepoint: parseInt(match[2]!, 10),
    modifier: modValue - 1,
  }
}

function decodeModifyOtherKeysPrintable(data: string): string | undefined {
  const parsed = parseModifyOtherKeysSequence(data)
  if (!parsed) return undefined
  if ((parsed.modifier & -193 & ~MODIFIERS.shift) !== 0) return undefined
  if (!Number.isFinite(parsed.codepoint) || parsed.codepoint < 32) return undefined
  try {
    return String.fromCodePoint(parsed.codepoint)
  } catch {
    return
  }
}

function decodePrintableKey(data: string): string | undefined {
  return decodeKittyPrintable(data) ?? decodeModifyOtherKeysPrintable(data)
}

/** A single segment produced by segmentation (Intl.SegmentData compatible). */
interface SegmentInfo {
  segment: string
  index: number
  input: string
  isWordLike?: boolean
}

/** Regex matching paste markers like `[paste #1 +123 lines]` or `[paste #2 1234 chars]`. */
const PASTE_MARKER_REGEX = /\[paste #(\d+)( (\+\d+ lines|\d+ chars))?\]/g
/** Non-global version for single-segment testing. */
const PASTE_MARKER_SINGLE = /^\[paste #(\d+)( (\+\d+ lines|\d+ chars))?\]$/

/** Check if a segment is a paste marker (i.e. was merged by segmentWithMarkers). */
function isPasteMarker(segment: string): boolean {
  return segment.length >= 10 && PASTE_MARKER_SINGLE.test(segment)
}

/**
 * A segmenter that wraps Intl.Segmenter and merges graphemes that fall
 * within paste markers into single atomic segments. This makes cursor
 * movement, deletion, word-wrap, etc. treat paste markers as single units.
 *
 * Only markers whose numeric ID exists in `validIds` are merged.
 */
function segmentWithMarkers(
  text: string,
  baseSegmenter: Intl.Segmenter,
  validIds: Set<number>,
): Iterable<SegmentInfo> {
  if (validIds.size === 0 || !text.includes('[paste #')) return baseSegmenter.segment(text)
  const markers: { start: number; end: number }[] = []
  for (const m of text.matchAll(PASTE_MARKER_REGEX)) {
    const id = Number.parseInt(m[1]!, 10)
    if (!validIds.has(id)) continue
    markers.push({
      start: m.index,
      end: m.index + m[0].length,
    })
  }
  if (markers.length === 0) return baseSegmenter.segment(text)
  const baseSegments = baseSegmenter.segment(text)
  const result: SegmentInfo[] = []
  let markerIdx = 0
  for (const seg of baseSegments) {
    while (markerIdx < markers.length && markers[markerIdx]!.end <= seg.index) markerIdx++
    const marker = markerIdx < markers.length ? markers[markerIdx]! : null
    if (marker && seg.index >= marker.start && seg.index < marker.end) {
      if (seg.index === marker.start) {
        const markerText = text.slice(marker.start, marker.end)
        result.push({
          segment: markerText,
          index: marker.start,
          input: text,
        })
      }
    } else result.push(seg)
  }
  return result
}

interface WordNavigationOptions {
  segment?: (text: string) => Iterable<SegmentInfo>
  isAtomicSegment?: (segment: string) => boolean
}

/**
 * Find the cursor position after moving one word backward from `cursor` in `text`.
 * Skips trailing whitespace, then stops at the next word/punctuation boundary.
 *
 * Pure function - does not mutate any state.
 */
function findWordBackward(text: string, cursor: number, options?: WordNavigationOptions): number {
  if (cursor <= 0) return 0
  const textBeforeCursor = text.slice(0, cursor)
  const segmentFn = options?.segment
  const isAtomic = options?.isAtomicSegment
  const segments: SegmentInfo[] = segmentFn
    ? [...segmentFn(textBeforeCursor)]
    : [...wordSegmenter.segment(textBeforeCursor)]
  let newCursor = cursor
  while (
    segments.length > 0 &&
    !isAtomic?.(segments[segments.length - 1]?.segment || '') &&
    isWhitespaceChar(segments[segments.length - 1]?.segment || '')
  )
    newCursor -= segments.pop()?.segment.length || 0
  if (segments.length === 0) return newCursor
  const last = segments[segments.length - 1]!
  if (isAtomic?.(last.segment)) newCursor -= last.segment.length
  else if (last.isWordLike) {
    const segment = last.segment
    const matches = [...segment.matchAll(new RegExp(PUNCTUATION_REGEX, 'g'))]
    if (matches.length <= 0) newCursor -= segment.length
    else {
      const lastMatch = matches[matches.length - 1]!
      newCursor -= segment.length - (lastMatch.index + lastMatch[0].length)
    }
  } else
    while (
      segments.length > 0 &&
      !isAtomic?.(segments[segments.length - 1]?.segment || '') &&
      !segments[segments.length - 1]?.isWordLike &&
      !isWhitespaceChar(segments[segments.length - 1]?.segment || '')
    )
      newCursor -= segments.pop()?.segment.length || 0
  return newCursor
}

/**
 * Find the cursor position after moving one word forward from `cursor` in `text`.
 * Skips leading whitespace, then stops at the next word/punctuation boundary.
 *
 * Pure function - does not mutate any state.
 */
function findWordForward(text: string, cursor: number, options?: WordNavigationOptions): number {
  if (cursor >= text.length) return text.length
  const textAfterCursor = text.slice(cursor)
  const segmentFn = options?.segment
  const isAtomic = options?.isAtomicSegment
  const iterator = (
    segmentFn ? segmentFn(textAfterCursor) : wordSegmenter.segment(textAfterCursor)
  )[Symbol.iterator]()
  let next = iterator.next()
  let newCursor = cursor
  while (!next.done && !isAtomic?.(next.value.segment) && isWhitespaceChar(next.value.segment)) {
    newCursor += next.value.segment.length
    next = iterator.next()
  }
  if (next.done) return newCursor
  if (isAtomic?.(next.value.segment)) newCursor += next.value.segment.length
  else if (next.value.isWordLike)
    newCursor += PUNCTUATION_REGEX.exec(next.value.segment)?.index ?? next.value.segment.length
  else
    while (
      !next.done &&
      !isAtomic?.(next.value.segment) &&
      !next.value.isWordLike &&
      !isWhitespaceChar(next.value.segment)
    ) {
      newCursor += next.value.segment.length
      next = iterator.next()
    }
  return newCursor
}

interface KillRingPushOptions {
  prepend: boolean
  accumulate: boolean
}

class KillRing {
  private ring: string[] = []

  /**
   * Add text to the kill ring.
   *
   * @param text - The killed text to add
   * @param opts - Push options
   * @param opts.prepend - If accumulating, prepend (backward deletion) or append (forward deletion)
   * @param opts.accumulate - Merge with the most recent entry instead of creating a new one
   */
  push(text: string, opts: KillRingPushOptions): void {
    if (!text) return
    if (opts.accumulate && this.ring.length > 0) {
      const last = this.ring.pop()
      this.ring.push(opts.prepend ? text + last : last + text)
    } else this.ring.push(text)
  }

  /** Get most recent entry without modifying the ring. */
  peek(): string | undefined {
    return this.ring.length > 0 ? this.ring[this.ring.length - 1] : undefined
  }

  /** Move last entry to front (for yank-pop cycling). */
  rotate(): void {
    if (this.ring.length > 1) {
      const last = this.ring.pop()!
      this.ring.unshift(last)
    }
  }

  get length(): number {
    return this.ring.length
  }
}

class UndoStack {
  private stack: UndoSnapshot[] = []

  /** Push a deep clone of the given snapshot onto the stack (clones the pastes Map too). */
  push(snapshot: UndoSnapshot): void {
    this.stack.push(structuredClone(snapshot))
  }

  /** Pop and return the most recent snapshot, or undefined if empty. */
  pop(): UndoSnapshot | undefined {
    return this.stack.pop()
  }

  /** Remove all snapshots. */
  clear(): void {
    this.stack.length = 0
  }

  get length(): number {
    return this.stack.length
  }
}

//#endregion

//#region Editor

/** A word-wrapped chunk of a logical line with position information. */
export interface TextChunk {
  text: string
  startIndex: number
  endIndex: number
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
export function wordWrapLine(
  line: string,
  maxWidth: number,
  preSegmented?: SegmentInfo[],
  continuationWidth: number = maxWidth,
): TextChunk[] {
  if (!line || maxWidth <= 0)
    return [
      {
        text: '',
        startIndex: 0,
        endIndex: 0,
      },
    ]
  if (visibleWidth(line) <= maxWidth)
    return [
      {
        text: line,
        startIndex: 0,
        endIndex: line.length,
      },
    ]
  const chunks: TextChunk[] = []
  const segments: SegmentInfo[] = preSegmented ?? [...graphemeSegmenter.segment(line)]
  let currentWidth = 0
  let currentMaxWidth = maxWidth
  let chunkStart = 0
  let wrapOppIndex = -1
  let wrapOppWidth = 0
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!
    const grapheme = seg.segment
    const gWidth = visibleWidth(grapheme)
    const charIndex = seg.index
    const isWs = !isPasteMarker(grapheme) && isWhitespaceChar(grapheme)
    if (currentWidth + gWidth > currentMaxWidth) {
      if (wrapOppIndex >= 0 && currentWidth - wrapOppWidth + gWidth <= continuationWidth) {
        chunks.push({
          text: line.slice(chunkStart, wrapOppIndex),
          startIndex: chunkStart,
          endIndex: wrapOppIndex,
        })
        currentMaxWidth = continuationWidth
        chunkStart = wrapOppIndex
        currentWidth -= wrapOppWidth
      } else if (chunkStart < charIndex) {
        chunks.push({
          text: line.slice(chunkStart, charIndex),
          startIndex: chunkStart,
          endIndex: charIndex,
        })
        currentMaxWidth = continuationWidth
        chunkStart = charIndex
        currentWidth = 0
      }
      wrapOppIndex = -1
    }
    if (gWidth > currentMaxWidth) {
      if (segments.length === 1) {
        chunks.push({
          text: grapheme,
          startIndex: charIndex,
          endIndex: charIndex + grapheme.length,
        })
        return chunks
      }
      const subChunks = wordWrapLine(grapheme, currentMaxWidth, undefined, continuationWidth)
      for (let j = 0; j < subChunks.length - 1; j++) {
        const sc = subChunks[j]!
        chunks.push({
          text: sc.text,
          startIndex: charIndex + sc.startIndex,
          endIndex: charIndex + sc.endIndex,
        })
      }
      const last = subChunks[subChunks.length - 1]!
      if (subChunks.length > 1) currentMaxWidth = continuationWidth
      chunkStart = charIndex + last.startIndex
      currentWidth = visibleWidth(last.text)
      wrapOppIndex = -1
      continue
    }
    currentWidth += gWidth
    const next = segments[i + 1]
    if (isWs && next && (isPasteMarker(next.segment) || !isWhitespaceChar(next.segment))) {
      wrapOppIndex = next.index
      wrapOppWidth = currentWidth
    } else if (!isWs && next && !isWhitespaceChar(next.segment)) {
      const isCjk = !isPasteMarker(grapheme) && cjkBreakRegex.test(grapheme)
      const nextIsCjk = !isPasteMarker(next.segment) && cjkBreakRegex.test(next.segment)
      if (isCjk || nextIsCjk) {
        wrapOppIndex = next.index
        wrapOppWidth = currentWidth
      }
    }
  }
  chunks.push({
    text: line.slice(chunkStart),
    startIndex: chunkStart,
    endIndex: line.length,
  })
  return chunks
}

const SLASH_COMMAND_SELECT_LIST_LAYOUT: SelectListLayoutOptions = {
  minPrimaryColumnWidth: 12,
  maxPrimaryColumnWidth: 32,
}
const ATTACHMENT_AUTOCOMPLETE_DEBOUNCE_MS = 20
const DEFAULT_AUTOCOMPLETE_TRIGGER_CHARACTERS = ['@', '#']

function escapeCharacterClass(value: string): string {
  return value.replace(/[\\^$.*+?()[\]{}|-]/g, '\\$&')
}
function buildTriggerPattern(triggerCharacters: string[]): RegExp {
  return new RegExp(`(?:^|[\\s])[${triggerCharacters.map(escapeCharacterClass).join('')}][^\\s]*$`)
}
function buildDebouncePattern(triggerCharacters: string[]): RegExp {
  const escapedWithoutAt = triggerCharacters
    .filter(character => character !== '@')
    .map(escapeCharacterClass)
  return new RegExp(
    `(?:^|[ \\t])(?:@(?:"[^"]*|[^\\s]*)|[${escapedWithoutAt.join('')}][^\\s]*)$`,
  )
}

/** Editor prompt-gutter prefixes; both must have equal visible widths. */
export interface EditorPrompt {
  first: string
  continuation: string
}

/** Frame model for the editor's top/bottom rules. */
export type EditorFrame = 'none' | 'horizontal'

/** Options accepted by the Editor constructor. */
export interface EditorOptions {
  paddingX?: number
  autocompleteMaxVisible?: number
  frame?: EditorFrame
  prompt?: EditorPrompt
}

/** Theme shape required by the Editor. */
export interface EditorTheme {
  borderColor: (str: string) => string
  selectList: SelectListTheme
}

interface EditorState {
  lines: string[]
  cursorLine: number
  cursorCol: number
}

/**
 * A single undo checkpoint. Beyond the text/cursor `state`, it carries the
 * paste-marker metadata (`pastes` + `pasteCounter`), which lives outside
 * `EditorState` but is mutated in lockstep with the text — so an undo that
 * restored only `state` would leave a `[paste #N ...]` marker whose backing
 * content had been dropped.
 */
interface UndoSnapshot {
  state: EditorState
  pastes: Map<number, string>
  pasteCounter: number
}

interface LayoutLine {
  text: string
  hasCursor: boolean
  cursorPos?: number
  isContinuation: boolean
}

interface VisualLine {
  logicalLine: number
  startCol: number
  length: number
}

type EditorAction = 'type-word' | 'kill' | 'yank' | null
type JumpMode = 'forward' | 'backward' | null
type AutocompleteRequestState = 'regular' | 'force'
type SegmentMode = 'word' | 'grapheme'

interface AutocompleteRequestOptions {
  force: boolean
  explicitTab: boolean
}

export class Editor implements Component, Focusable {
  state: EditorState = {
    lines: [''],
    cursorLine: 0,
    cursorCol: 0,
  }
  /** Focusable interface - set by TUI when focus changes */
  focused = false
  tui: TUI
  theme: EditorTheme
  paddingX = 0
  frame: EditorFrame = 'horizontal'
  prompt?: EditorPrompt
  promptWidth = 0
  lastWidth = 80
  lastContinuationWidth = 80
  scrollOffset = 0
  borderColor: (str: string) => string
  autocompleteProvider?: AutocompleteProvider
  autocompleteTriggerCharacters: string[] = [...DEFAULT_AUTOCOMPLETE_TRIGGER_CHARACTERS]
  autocompleteTriggerPattern = buildTriggerPattern(this.autocompleteTriggerCharacters)
  autocompleteDebouncePattern = buildDebouncePattern(this.autocompleteTriggerCharacters)
  autocompleteList?: SelectList
  autocompleteState: AutocompleteRequestState | null = null
  autocompletePrefix = ''
  autocompleteMaxVisible = 5
  autocompleteAbort?: AbortController
  autocompleteDebounceTimer?: ReturnType<typeof setTimeout>
  autocompleteRequestTask: Promise<void> = Promise.resolve()
  autocompleteStartToken = 0
  autocompleteRequestId = 0
  pastes = new Map<number, string>()
  pasteCounter = 0
  pasteBuffer = ''
  isInPaste = false
  history: string[] = []
  historyIndex = -1
  historyDraft: EditorState | null = null
  killRing = new KillRing()
  lastAction: EditorAction = null
  jumpMode: JumpMode = null
  preferredVisualCol: number | null = null
  snappedFromCursorCol: number | null = null
  undoStack = new UndoStack()
  onSubmit?: (value: string) => void
  onChange?: (value: string) => void
  disableSubmit = false

  constructor(tui: TUI, theme: EditorTheme, options: EditorOptions = {}) {
    this.tui = tui
    this.theme = theme
    this.borderColor = theme.borderColor
    const paddingX = options.paddingX ?? 0
    this.paddingX = Number.isFinite(paddingX) ? Math.max(0, Math.floor(paddingX)) : 0
    this.frame = options.frame ?? 'horizontal'
    this.prompt = options.prompt
    if (this.prompt) {
      const firstWidth = visibleWidth(this.prompt.first)
      if (firstWidth !== visibleWidth(this.prompt.continuation))
        throw new Error('Editor prompt prefixes must have equal visible widths')
      this.promptWidth = firstWidth
    }
    const maxVisible = options.autocompleteMaxVisible ?? 5
    this.autocompleteMaxVisible = Number.isFinite(maxVisible)
      ? Math.max(3, Math.min(20, Math.floor(maxVisible)))
      : 5
  }

  setPrompt(prompt: EditorPrompt): void {
    const firstWidth = visibleWidth(prompt.first)
    if (firstWidth !== visibleWidth(prompt.continuation))
      throw new Error('Editor prompt prefixes must have equal visible widths')
    this.prompt = prompt
    this.promptWidth = firstWidth
    this.invalidate()
  }

  /** Set of currently valid paste IDs, for marker-aware segmentation. */
  validPasteIds(): Set<number> {
    return new Set(this.pastes.keys())
  }

  /** Segment text with paste-marker awareness, only merging markers with valid IDs. */
  segment(text: string, mode: SegmentMode): Iterable<SegmentInfo> {
    return segmentWithMarkers(
      text,
      mode === 'word' ? wordSegmenter : graphemeSegmenter,
      this.validPasteIds(),
    )
  }

  getPaddingX(): number {
    return this.paddingX
  }

  setPaddingX(padding: number): void {
    const newPadding = Number.isFinite(padding) ? Math.max(0, Math.floor(padding)) : 0
    if (this.paddingX !== newPadding) {
      this.paddingX = newPadding
      this.tui.requestRender()
    }
  }

  getAutocompleteMaxVisible(): number {
    return this.autocompleteMaxVisible
  }

  setAutocompleteMaxVisible(maxVisible: number): void {
    const newMaxVisible = Number.isFinite(maxVisible)
      ? Math.max(3, Math.min(20, Math.floor(maxVisible)))
      : 5
    if (this.autocompleteMaxVisible !== newMaxVisible) {
      this.autocompleteMaxVisible = newMaxVisible
      this.tui.requestRender()
    }
  }

  setAutocompleteProvider(provider: AutocompleteProvider): void {
    this.cancelAutocomplete()
    this.autocompleteProvider = provider
    this.setAutocompleteTriggerCharacters(provider.triggerCharacters ?? [])
  }

  /**
   * Add a prompt to history for up/down arrow navigation.
   * Called after successful submission.
   */
  addToHistory(text: string): void {
    const trimmed = text.trim()
    if (!trimmed) return
    if (this.history.length > 0 && this.history[0] === trimmed) return
    this.history.unshift(trimmed)
    if (this.history.length > 100) this.history.pop()
  }

  isEditorEmpty(): boolean {
    return this.state.lines.length === 1 && this.state.lines[0] === ''
  }

  isOnFirstVisualLine(): boolean {
    const visualLines = this.buildVisualLineMap(this.lastWidth)
    return this.findCurrentVisualLine(visualLines) === 0
  }

  isOnLastVisualLine(): boolean {
    const visualLines = this.buildVisualLineMap(this.lastWidth)
    return this.findCurrentVisualLine(visualLines) === visualLines.length - 1
  }

  navigateHistory(direction: number): void {
    this.lastAction = null
    if (this.history.length === 0) return
    const newIndex = this.historyIndex - direction
    if (newIndex < -1 || newIndex >= this.history.length) return
    if (this.historyIndex === -1 && newIndex >= 0) {
      this.pushUndoSnapshot()
      this.historyDraft = structuredClone(this.state)
    }
    this.historyIndex = newIndex
    if (this.historyIndex === -1) {
      const draft = this.historyDraft
      this.historyDraft = null
      if (draft) {
        this.state = draft
        this.preferredVisualCol = null
        this.snappedFromCursorCol = null
        this.scrollOffset = 0
        if (this.onChange) this.onChange(this.getText())
      } else this.setTextInternal('')
    } else
      this.setTextInternal(
        this.history[this.historyIndex] || '',
        direction === -1 ? 'start' : 'end',
      )
  }

  exitHistoryBrowsing(): void {
    this.historyIndex = -1
    this.historyDraft = null
  }

  /** Internal setText that doesn't reset history state - used by navigateHistory */
  setTextInternal(text: string, cursorPlacement: 'start' | 'end' = 'end'): void {
    const lines = text.split('\n')
    this.state.lines = lines.length === 0 ? [''] : lines
    this.state.cursorLine = cursorPlacement === 'start' ? 0 : this.state.lines.length - 1
    this.setCursorCol(
      cursorPlacement === 'start' ? 0 : this.state.lines[this.state.cursorLine]?.length || 0,
    )
    this.scrollOffset = 0
    if (this.onChange) this.onChange(this.getText())
  }

  invalidate(): void {}

  render(width: number): string[] {
    const maxPadding = Math.max(0, Math.floor((width - 1) / 2))
    const paddingX = Math.min(this.paddingX, maxPadding)
    const contentWidth = Math.max(1, width - paddingX * 2)
    const inputWidth = Math.max(1, contentWidth - this.promptWidth)
    const layoutWidth = Math.max(1, inputWidth - (paddingX ? 0 : 1))
    const continuationLayoutWidth = Math.max(1, contentWidth - (paddingX ? 0 : 1))
    this.lastWidth = layoutWidth
    this.lastContinuationWidth = continuationLayoutWidth
    const horizontal = this.borderColor('─')
    const layoutLines = this.layoutText(layoutWidth, continuationLayoutWidth)
    const terminalRows = this.tui.terminal.rows
    const maxVisibleLines = Math.max(5, Math.floor(terminalRows * 0.3))
    let cursorLineIndex = layoutLines.findIndex(line => line.hasCursor)
    if (cursorLineIndex === -1) cursorLineIndex = 0
    if (cursorLineIndex < this.scrollOffset) this.scrollOffset = cursorLineIndex
    else if (cursorLineIndex >= this.scrollOffset + maxVisibleLines)
      this.scrollOffset = cursorLineIndex - maxVisibleLines + 1
    const maxScrollOffset = Math.max(0, layoutLines.length - maxVisibleLines)
    this.scrollOffset = Math.max(0, Math.min(this.scrollOffset, maxScrollOffset))
    const visibleLines = layoutLines.slice(this.scrollOffset, this.scrollOffset + maxVisibleLines)
    const result: string[] = []
    const leftPadding = ' '.repeat(paddingX)
    const rightPadding = leftPadding
    if (this.scrollOffset > 0) {
      if (this.frame === 'none') {
        const indicator = `${' '.repeat(this.promptWidth)}↑ ${this.scrollOffset} more`
        result.push(
          `${leftPadding}${this.borderColor(indicator)}${' '.repeat(Math.max(0, contentWidth - visibleWidth(indicator)))}${rightPadding}`,
        )
      } else {
        const indicator = `─── ↑ ${this.scrollOffset} more `
        const remaining = width - visibleWidth(indicator)
        if (remaining >= 0) result.push(this.borderColor(indicator + '─'.repeat(remaining)))
        else result.push(this.borderColor(truncateToWidth(indicator, width)))
      }
    } else if (this.frame === 'horizontal') result.push(horizontal.repeat(width))
    const emitCursorMarker = this.focused
    for (let visibleIndex = 0; visibleIndex < visibleLines.length; visibleIndex++) {
      const layoutLine = visibleLines[visibleIndex]
      if (!layoutLine) continue
      const absoluteIndex = this.scrollOffset + visibleIndex
      const prefix = this.prompt
        ? absoluteIndex === 0
          ? this.prompt.first
          : layoutLine.isContinuation
            ? ''
            : this.prompt.continuation
        : ''
      const lineContentWidth = inputWidth + (layoutLine.isContinuation ? this.promptWidth : 0)
      let displayText = layoutLine.text
      let lineVisibleWidth = visibleWidth(layoutLine.text)
      let cursorInPadding = false
      if (layoutLine.hasCursor && layoutLine.cursorPos !== undefined) {
        const before = displayText.slice(0, layoutLine.cursorPos)
        const after = displayText.slice(layoutLine.cursorPos)
        const marker = emitCursorMarker ? CURSOR_MARKER : ''
        if (after.length > 0) {
          const firstGrapheme = [...this.segment(after, 'grapheme')][0]?.segment || ''
          const restAfter = after.slice(firstGrapheme.length)
          const cursor = `\x1b[7m${firstGrapheme}\x1b[0m`
          displayText = before + marker + cursor + restAfter
        } else {
          displayText = before + marker + '\x1B[7m \x1B[0m'
          lineVisibleWidth = lineVisibleWidth + 1
          if (lineVisibleWidth > lineContentWidth && paddingX > 0) cursorInPadding = true
        }
      }
      const padding = ' '.repeat(Math.max(0, lineContentWidth - lineVisibleWidth))
      const lineRightPadding = cursorInPadding ? rightPadding.slice(1) : rightPadding
      result.push(`${leftPadding}${prefix}${displayText}${padding}${lineRightPadding}`)
    }
    const linesBelow = layoutLines.length - (this.scrollOffset + visibleLines.length)
    if (linesBelow > 0) {
      if (this.frame === 'none') {
        const indicator = `${' '.repeat(this.promptWidth)}↓ ${linesBelow} more`
        result.push(
          `${leftPadding}${this.borderColor(indicator)}${' '.repeat(Math.max(0, contentWidth - visibleWidth(indicator)))}${rightPadding}`,
        )
      } else {
        const indicator = `─── ↓ ${linesBelow} more `
        const remaining = width - visibleWidth(indicator)
        result.push(this.borderColor(indicator + '─'.repeat(Math.max(0, remaining))))
      }
    } else if (this.frame === 'horizontal') result.push(horizontal.repeat(width))
    if (this.autocompleteState && this.autocompleteList) {
      const autocompleteResult = this.autocompleteList.render(inputWidth)
      const autocompletePrefix = ' '.repeat(this.promptWidth)
      for (const line of autocompleteResult) {
        const lineWidth = visibleWidth(line)
        const linePadding = ' '.repeat(Math.max(0, inputWidth - lineWidth))
        result.push(`${leftPadding}${autocompletePrefix}${line}${linePadding}${rightPadding}`)
      }
    }
    return result
  }

  handleInput(data: string): void {
    const kb = getKeybindings()
    if (this.jumpMode !== null) {
      if (
        kb.matches(data, 'tui.editor.jumpForward') ||
        kb.matches(data, 'tui.editor.jumpBackward')
      ) {
        this.jumpMode = null
        return
      }
      const printable = decodePrintableKey(data) ?? (data.charCodeAt(0) >= 32 ? data : undefined)
      if (printable !== undefined) {
        const direction = this.jumpMode
        this.jumpMode = null
        this.jumpToChar(printable, direction)
        return
      }
      this.jumpMode = null
    }
    if (data.includes('\x1B[200~')) {
      this.isInPaste = true
      this.pasteBuffer = ''
      data = data.replace('\x1B[200~', '')
    }
    if (this.isInPaste) {
      this.pasteBuffer += data
      const endIndex = this.pasteBuffer.indexOf('\x1B[201~')
      if (endIndex !== -1) {
        const pasteContent = this.pasteBuffer.substring(0, endIndex)
        if (pasteContent.length > 0) this.handlePaste(pasteContent)
        this.isInPaste = false
        const remaining = this.pasteBuffer.substring(endIndex + 6)
        this.pasteBuffer = ''
        if (remaining.length > 0) this.handleInput(remaining)
        return
      }
      return
    }
    if (kb.matches(data, 'tui.input.copy')) return
    if (kb.matches(data, 'tui.editor.undo')) {
      this.undo()
      return
    }
    if (this.autocompleteState && this.autocompleteList) {
      const list = this.autocompleteList
      if (kb.matches(data, 'tui.select.cancel')) {
        this.cancelAutocomplete()
        return
      }
      if (kb.matches(data, 'tui.select.up') || kb.matches(data, 'tui.select.down')) {
        list.handleInput(data)
        return
      }
      if (kb.matches(data, 'tui.input.tab')) {
        const selected = list.getSelectedItem()
        if (selected && this.autocompleteProvider) {
          this.pushUndoSnapshot()
          this.lastAction = null
          const result = this.autocompleteProvider.applyCompletion(
            this.state.lines,
            this.state.cursorLine,
            this.state.cursorCol,
            selected,
            this.autocompletePrefix,
          )
          this.state.lines = result.lines
          this.state.cursorLine = result.cursorLine
          this.setCursorCol(result.cursorCol)
          this.cancelAutocomplete()
          if (this.onChange) this.onChange(this.getText())
        }
        return
      }
      if (kb.matches(data, 'tui.select.confirm')) {
        const selected = list.getSelectedItem()
        if (selected && this.autocompleteProvider) {
          this.pushUndoSnapshot()
          this.lastAction = null
          const result = this.autocompleteProvider.applyCompletion(
            this.state.lines,
            this.state.cursorLine,
            this.state.cursorCol,
            selected,
            this.autocompletePrefix,
          )
          this.state.lines = result.lines
          this.state.cursorLine = result.cursorLine
          this.setCursorCol(result.cursorCol)
          if (this.autocompletePrefix.startsWith('/')) this.cancelAutocomplete()
          else {
            this.cancelAutocomplete()
            if (this.onChange) this.onChange(this.getText())
            return
          }
        }
      }
    }
    if (kb.matches(data, 'tui.input.tab') && !this.autocompleteState) {
      this.handleTabCompletion()
      return
    }
    if (kb.matches(data, 'tui.editor.deleteToLineEnd')) {
      this.deleteToEndOfLine()
      return
    }
    if (kb.matches(data, 'tui.editor.deleteToLineStart')) {
      this.deleteToStartOfLine()
      return
    }
    if (kb.matches(data, 'tui.editor.deleteWordBackward')) {
      this.deleteWordBackwards()
      return
    }
    if (kb.matches(data, 'tui.editor.deleteWordForward')) {
      this.deleteWordForward()
      return
    }
    if (
      kb.matches(data, 'tui.editor.deleteCharBackward') ||
      matchesKey(data, 'shift+backspace')
    ) {
      this.handleBackspace()
      return
    }
    if (kb.matches(data, 'tui.editor.deleteCharForward') || matchesKey(data, 'shift+delete')) {
      this.handleForwardDelete()
      return
    }
    if (kb.matches(data, 'tui.editor.yank')) {
      this.yank()
      return
    }
    if (kb.matches(data, 'tui.editor.yankPop')) {
      this.yankPop()
      return
    }
    if (kb.matches(data, 'tui.editor.cursorLineStart')) {
      this.moveToLineStart()
      return
    }
    if (kb.matches(data, 'tui.editor.cursorLineEnd')) {
      this.moveToLineEnd()
      return
    }
    if (kb.matches(data, 'tui.editor.cursorWordLeft')) {
      this.moveWordBackwards()
      return
    }
    if (kb.matches(data, 'tui.editor.cursorWordRight')) {
      this.moveWordForwards()
      return
    }
    if (
      kb.matches(data, 'tui.input.newLine') ||
      (data.charCodeAt(0) === 10 && data.length > 1) ||
      data === '\x1B\r' ||
      data === '\x1B[13;2~' ||
      (data.length > 1 && data.includes('\x1B') && data.includes('\r')) ||
      (data === '\n' && data.length === 1)
    ) {
      if (this.shouldSubmitOnBackslashEnter(data, kb)) {
        this.handleBackspace()
        this.submitValue()
        return
      }
      this.addNewLine()
      return
    }
    if (kb.matches(data, 'tui.input.submit')) {
      if (this.disableSubmit) return
      const currentLine = this.state.lines[this.state.cursorLine] || ''
      if (this.state.cursorCol > 0 && currentLine[this.state.cursorCol - 1] === '\\') {
        this.handleBackspace()
        this.addNewLine()
        return
      }
      this.submitValue()
      return
    }
    if (kb.matches(data, 'tui.editor.cursorUp')) {
      if (
        this.isOnFirstVisualLine() &&
        (this.isEditorEmpty() || this.historyIndex > -1 || this.state.cursorCol === 0)
      )
        this.navigateHistory(-1)
      else if (this.isOnFirstVisualLine()) this.moveToLineStart()
      else this.moveCursor(-1, 0)
      return
    }
    if (kb.matches(data, 'tui.editor.cursorDown')) {
      if (this.historyIndex > -1 && this.isOnLastVisualLine()) this.navigateHistory(1)
      else if (this.isOnLastVisualLine()) this.moveToLineEnd()
      else this.moveCursor(1, 0)
      return
    }
    if (kb.matches(data, 'tui.editor.cursorRight')) {
      this.moveCursor(0, 1)
      return
    }
    if (kb.matches(data, 'tui.editor.cursorLeft')) {
      this.moveCursor(0, -1)
      return
    }
    if (kb.matches(data, 'tui.editor.pageUp')) {
      this.pageScroll(-1)
      return
    }
    if (kb.matches(data, 'tui.editor.pageDown')) {
      this.pageScroll(1)
      return
    }
    if (kb.matches(data, 'tui.editor.jumpForward')) {
      this.jumpMode = 'forward'
      return
    }
    if (kb.matches(data, 'tui.editor.jumpBackward')) {
      this.jumpMode = 'backward'
      return
    }
    if (matchesKey(data, 'shift+space')) {
      this.insertCharacter(' ')
      return
    }
    const printable = decodePrintableKey(data)
    if (printable !== undefined) {
      this.insertCharacter(printable)
      return
    }
    if (data.charCodeAt(0) >= 32) this.insertCharacter(data)
  }

  layoutText(contentWidth: number, continuationWidth: number): LayoutLine[] {
    const layoutLines: LayoutLine[] = []
    if (
      this.state.lines.length === 0 ||
      (this.state.lines.length === 1 && this.state.lines[0] === '')
    ) {
      layoutLines.push({
        text: '',
        hasCursor: true,
        cursorPos: 0,
        isContinuation: false,
      })
      return layoutLines
    }
    for (let i = 0; i < this.state.lines.length; i++) {
      const line = this.state.lines[i] || ''
      const isCurrentLine = i === this.state.cursorLine
      if (visibleWidth(line) <= contentWidth) {
        if (isCurrentLine)
          layoutLines.push({
            text: line,
            hasCursor: true,
            cursorPos: this.state.cursorCol,
            isContinuation: false,
          })
        else
          layoutLines.push({
            text: line,
            hasCursor: false,
            isContinuation: false,
          })
      } else {
        const chunks = wordWrapLine(
          line,
          contentWidth,
          [...this.segment(line, 'grapheme')],
          continuationWidth,
        )
        for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
          const chunk = chunks[chunkIndex]
          if (!chunk) continue
          const cursorPos = this.state.cursorCol
          const isLastChunk = chunkIndex === chunks.length - 1
          let hasCursorInChunk = false
          let adjustedCursorPos = 0
          if (isCurrentLine) {
            if (isLastChunk) {
              hasCursorInChunk = cursorPos >= chunk.startIndex
              adjustedCursorPos = cursorPos - chunk.startIndex
            } else {
              hasCursorInChunk = cursorPos >= chunk.startIndex && cursorPos < chunk.endIndex
              if (hasCursorInChunk) {
                adjustedCursorPos = cursorPos - chunk.startIndex
                if (adjustedCursorPos > chunk.text.length) adjustedCursorPos = chunk.text.length
              }
            }
          }
          if (hasCursorInChunk)
            layoutLines.push({
              text: chunk.text,
              hasCursor: true,
              cursorPos: adjustedCursorPos,
              isContinuation: chunkIndex > 0,
            })
          else
            layoutLines.push({
              text: chunk.text,
              hasCursor: false,
              isContinuation: chunkIndex > 0,
            })
        }
      }
    }
    return layoutLines
  }

  getText(): string {
    return this.state.lines.join('\n')
  }

  expandPasteMarkers(text: string): string {
    let result = text
    for (const [pasteId, pasteContent] of this.pastes) {
      const markerRegex = new RegExp(
        `\\[paste #${pasteId}( (\\+\\d+ lines|\\d+ chars))?\\]`,
        'g',
      )
      result = result.replace(markerRegex, () => pasteContent)
    }
    return result
  }

  /**
   * Get text with paste markers expanded to their actual content.
   * Use this when you need the full content (e.g., for external editor).
   */
  getExpandedText(): string {
    return this.expandPasteMarkers(this.state.lines.join('\n'))
  }

  getLines(): string[] {
    return [...this.state.lines]
  }

  getCursor(): { line: number; col: number } {
    return {
      line: this.state.cursorLine,
      col: this.state.cursorCol,
    }
  }

  setText(text: string): void {
    this.cancelAutocomplete()
    this.lastAction = null
    this.exitHistoryBrowsing()
    this.pastes.clear()
    this.pasteCounter = 0
    const normalized = this.normalizeText(text)
    if (this.getText() !== normalized) this.pushUndoSnapshot()
    this.setTextInternal(normalized)
  }

  /**
   * Insert text at the current cursor position.
   * Used for programmatic insertion (e.g., clipboard image markers).
   * This is atomic for undo - single undo restores entire pre-insert state.
   */
  insertTextAtCursor(text: string): void {
    if (!text) return
    this.cancelAutocomplete()
    this.pushUndoSnapshot()
    this.lastAction = null
    this.exitHistoryBrowsing()
    this.insertTextAtCursorInternal(text)
  }

  /**
   * Normalize text for editor storage:
   * - Normalize line endings (\r\n and \r -> \n)
   * - Expand tabs to 4 spaces
   */
  normalizeText(text: string): string {
    return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\t/g, '    ')
  }

  /**
   * Internal text insertion at cursor. Handles single and multi-line text.
   * Does not push undo snapshots or trigger autocomplete - caller is responsible.
   * Normalizes line endings and calls onChange once at the end.
   */
  insertTextAtCursorInternal(text: string): void {
    if (!text) return
    const normalized = this.normalizeText(text)
    const insertedLines = normalized.split('\n')
    const currentLine = this.state.lines[this.state.cursorLine] || ''
    const beforeCursor = currentLine.slice(0, this.state.cursorCol)
    const afterCursor = currentLine.slice(this.state.cursorCol)
    if (insertedLines.length === 1) {
      this.state.lines[this.state.cursorLine] = beforeCursor + normalized + afterCursor
      this.setCursorCol(this.state.cursorCol + normalized.length)
    } else {
      this.state.lines = [
        ...this.state.lines.slice(0, this.state.cursorLine),
        beforeCursor + insertedLines[0],
        ...insertedLines.slice(1, -1),
        insertedLines[insertedLines.length - 1] + afterCursor,
        ...this.state.lines.slice(this.state.cursorLine + 1),
      ]
      this.state.cursorLine += insertedLines.length - 1
      this.setCursorCol((insertedLines[insertedLines.length - 1] || '').length)
    }
    if (this.onChange) this.onChange(this.getText())
  }

  insertCharacter(char: string, skipUndoCoalescing?: boolean): void {
    this.exitHistoryBrowsing()
    if (!skipUndoCoalescing) {
      if (isWhitespaceChar(char) || this.lastAction !== 'type-word') this.pushUndoSnapshot()
      this.lastAction = 'type-word'
    }
    const line = this.state.lines[this.state.cursorLine] || ''
    const before = line.slice(0, this.state.cursorCol)
    const after = line.slice(this.state.cursorCol)
    this.state.lines[this.state.cursorLine] = before + char + after
    this.setCursorCol(this.state.cursorCol + char.length)
    if (this.onChange) this.onChange(this.getText())
    if (!this.autocompleteState) {
      if (char === '/' && this.isAtStartOfMessage()) this.tryTriggerAutocomplete()
      else if (this.autocompleteTriggerCharacters.includes(char)) {
        const textBeforeCursor = (this.state.lines[this.state.cursorLine] || '').slice(
          0,
          this.state.cursorCol,
        )
        const charBeforeSymbol = textBeforeCursor[textBeforeCursor.length - 2]
        if (textBeforeCursor.length === 1 || charBeforeSymbol === ' ' || charBeforeSymbol === '\t')
          this.tryTriggerAutocomplete()
      } else if (/[a-zA-Z0-9.\-_]/.test(char)) {
        const textBeforeCursor = (this.state.lines[this.state.cursorLine] || '').slice(
          0,
          this.state.cursorCol,
        )
        if (this.isInSlashCommandContext(textBeforeCursor)) this.tryTriggerAutocomplete()
        else if (this.autocompleteTriggerPattern.test(textBeforeCursor))
          this.tryTriggerAutocomplete()
      }
    } else this.updateAutocomplete()
  }

  handlePaste(pastedText: string): void {
    this.cancelAutocomplete()
    this.exitHistoryBrowsing()
    this.lastAction = null
    this.pushUndoSnapshot()
    const decodedText = pastedText.replace(/\x1b\[(\d+);5u/g, (match, code) => {
      const cp = Number(code)
      if (cp >= 97 && cp <= 122) return String.fromCharCode(cp - 96)
      if (cp >= 65 && cp <= 90) return String.fromCharCode(cp - 64)
      return match
    })
    let filteredText = this.normalizeText(decodedText)
      .split('')
      .filter(char => char === '\n' || char.charCodeAt(0) >= 32)
      .join('')
    if (/^[/~.]/.test(filteredText)) {
      const currentLine = this.state.lines[this.state.cursorLine] || ''
      const charBeforeCursor =
        this.state.cursorCol > 0 ? currentLine[this.state.cursorCol - 1] : ''
      if (charBeforeCursor && /\w/.test(charBeforeCursor)) filteredText = ` ${filteredText}`
    }
    const pastedLines = filteredText.split('\n')
    const totalChars = filteredText.length
    if (pastedLines.length > 10 || totalChars > 1e3) {
      this.pasteCounter++
      const pasteId = this.pasteCounter
      this.pastes.set(pasteId, filteredText)
      const marker =
        pastedLines.length > 10
          ? `[paste #${pasteId} +${pastedLines.length} lines]`
          : `[paste #${pasteId} ${totalChars} chars]`
      this.insertTextAtCursorInternal(marker)
      return
    }
    if (pastedLines.length === 1) {
      this.insertTextAtCursorInternal(filteredText)
      return
    }
    this.insertTextAtCursorInternal(filteredText)
  }

  addNewLine(): void {
    this.cancelAutocomplete()
    this.exitHistoryBrowsing()
    this.lastAction = null
    this.pushUndoSnapshot()
    const currentLine = this.state.lines[this.state.cursorLine] || ''
    const before = currentLine.slice(0, this.state.cursorCol)
    const after = currentLine.slice(this.state.cursorCol)
    this.state.lines[this.state.cursorLine] = before
    this.state.lines.splice(this.state.cursorLine + 1, 0, after)
    this.state.cursorLine++
    this.setCursorCol(0)
    if (this.onChange) this.onChange(this.getText())
  }

  shouldSubmitOnBackslashEnter(data: string, kb: ReturnType<typeof getKeybindings>): boolean {
    if (this.disableSubmit) return false
    if (!matchesKey(data, 'enter')) return false
    const submitKeys = kb.getKeys('tui.input.submit')
    if (!(submitKeys.includes('shift+enter') || submitKeys.includes('shift+return'))) return false
    const currentLine = this.state.lines[this.state.cursorLine] || ''
    return this.state.cursorCol > 0 && currentLine[this.state.cursorCol - 1] === '\\'
  }

  submitValue(): void {
    this.cancelAutocomplete()
    const result = this.expandPasteMarkers(this.state.lines.join('\n')).trim()
    this.state = {
      lines: [''],
      cursorLine: 0,
      cursorCol: 0,
    }
    this.pastes.clear()
    this.pasteCounter = 0
    this.exitHistoryBrowsing()
    this.scrollOffset = 0
    this.undoStack.clear()
    this.lastAction = null
    if (this.onChange) this.onChange('')
    if (this.onSubmit) this.onSubmit(result)
  }

  handleBackspace(): void {
    this.exitHistoryBrowsing()
    this.lastAction = null
    if (this.state.cursorCol > 0) {
      this.pushUndoSnapshot()
      let line = this.state.lines[this.state.cursorLine] || ''
      const beforeCursor = line.slice(0, this.state.cursorCol)
      const graphemes = [...this.segment(beforeCursor, 'grapheme')]
      const lastGrapheme = graphemes[graphemes.length - 1]
      const graphemeLength = lastGrapheme ? lastGrapheme.segment.length : 1
      const isPastedSegmented = lastGrapheme ? PASTE_MARKER_SINGLE.exec(lastGrapheme.segment) : null
      if (isPastedSegmented) {
        const targetId = Number(isPastedSegmented[1])
        // Rebuild the content map from a snapshot so the text-order walk below
        // cannot overwrite a not-yet-read entry (markers may appear in the text
        // in non-ascending id order): drop targetId, shift every higher id down.
        const renumbered = new Map<number, string>()
        for (const [id, content] of this.pastes) {
          if (id < targetId) renumbered.set(id, content)
          else if (id > targetId) renumbered.set(id - 1, content)
          // id === targetId: dropped (the deleted paste)
        }
        this.pastes = renumbered
        this.pasteCounter--
        // Rewrite marker ids in the text as a pure, order-independent transform.
        this.state.lines = this.state.lines.map(line =>
          line.replace(PASTE_MARKER_REGEX, (fullMatch, idGroup, suffixGroup) => {
            const x = Number(idGroup)
            if (x <= targetId) return fullMatch
            return `[paste #${x - 1}${suffixGroup ?? ''}]`
          }),
        )
      }
      line = this.state.lines[this.state.cursorLine] || ''
      const before = line.slice(0, this.state.cursorCol - graphemeLength)
      const after = line.slice(this.state.cursorCol)
      this.state.lines[this.state.cursorLine] = before + after
      this.setCursorCol(this.state.cursorCol - graphemeLength)
    } else if (this.state.cursorLine > 0) {
      this.pushUndoSnapshot()
      const currentLine = this.state.lines[this.state.cursorLine] || ''
      const previousLine = this.state.lines[this.state.cursorLine - 1] || ''
      this.state.lines[this.state.cursorLine - 1] = previousLine + currentLine
      this.state.lines.splice(this.state.cursorLine, 1)
      this.state.cursorLine--
      this.setCursorCol(previousLine.length)
    }
    if (this.onChange) this.onChange(this.getText())
    if (this.autocompleteState) this.updateAutocomplete()
    else {
      const textBeforeCursor = (this.state.lines[this.state.cursorLine] || '').slice(
        0,
        this.state.cursorCol,
      )
      if (this.isInSlashCommandContext(textBeforeCursor)) this.tryTriggerAutocomplete()
      else if (this.autocompleteTriggerPattern.test(textBeforeCursor)) this.tryTriggerAutocomplete()
    }
  }

  /**
   * Set cursor column and clear preferredVisualCol.
   * Use this for all non-vertical cursor movements to reset sticky column behavior.
   */
  setCursorCol(col: number): void {
    this.state.cursorCol = col
    this.preferredVisualCol = null
    this.snappedFromCursorCol = null
  }

  /**
   * Move cursor to a target visual line, applying sticky column logic.
   * Shared by moveCursor() and pageScroll().
   */
  moveToVisualLine(
    visualLines: VisualLine[],
    currentVisualLine: number,
    targetVisualLine: number,
  ): void {
    const currentVL = visualLines[currentVisualLine]
    const targetVL = visualLines[targetVisualLine]
    if (!(currentVL && targetVL)) return
    let currentVisualCol: number
    if (this.snappedFromCursorCol !== null) {
      const vlIndex = this.findVisualLineAt(
        visualLines,
        currentVL.logicalLine,
        this.snappedFromCursorCol,
      )
      currentVisualCol = this.snappedFromCursorCol! - visualLines[vlIndex]!.startCol
    } else currentVisualCol = this.state.cursorCol - currentVL.startCol
    const sourceMaxVisualCol =
      currentVisualLine === visualLines.length - 1 ||
      visualLines[currentVisualLine + 1]?.logicalLine !== currentVL.logicalLine
        ? currentVL.length
        : Math.max(0, currentVL.length - 1)
    const targetMaxVisualCol =
      targetVisualLine === visualLines.length - 1 ||
      visualLines[targetVisualLine + 1]?.logicalLine !== targetVL.logicalLine
        ? targetVL.length
        : Math.max(0, targetVL.length - 1)
    const moveToVisualCol = this.computeVerticalMoveColumn(
      currentVisualCol,
      sourceMaxVisualCol,
      targetMaxVisualCol,
    )
    this.state.cursorLine = targetVL.logicalLine
    const targetCol = targetVL.startCol + moveToVisualCol
    const logicalLine = this.state.lines[targetVL.logicalLine] || ''
    this.state.cursorCol = Math.min(targetCol, logicalLine.length)
    const segments = [...this.segment(logicalLine, 'grapheme')]
    for (const seg of segments) {
      if (seg.index > this.state.cursorCol) break
      if (seg.segment.length <= 1) continue
      if (this.state.cursorCol < seg.index + seg.segment.length) {
        if (seg.index < targetVL.startCol && targetVisualLine > currentVisualLine) {
          const segEnd = seg.index + seg.segment.length
          let next = targetVisualLine + 1
          while (
            next < visualLines.length &&
            visualLines[next]!.logicalLine === targetVL.logicalLine &&
            visualLines[next]!.startCol < segEnd
          )
            next++
          if (next < visualLines.length) {
            this.moveToVisualLine(visualLines, currentVisualLine, next)
            return
          }
        }
        this.snappedFromCursorCol = this.state.cursorCol
        this.state.cursorCol = seg.index
        return
      }
    }
    this.snappedFromCursorCol = null
  }

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
  computeVerticalMoveColumn(
    currentVisualCol: number,
    sourceMaxVisualCol: number,
    targetMaxVisualCol: number,
  ): number {
    const hasPreferred = this.preferredVisualCol !== null
    const cursorInMiddle = currentVisualCol < sourceMaxVisualCol
    const targetTooShort = targetMaxVisualCol < currentVisualCol
    if (!hasPreferred || cursorInMiddle) {
      if (targetTooShort) {
        this.preferredVisualCol = currentVisualCol
        return targetMaxVisualCol
      }
      this.preferredVisualCol = null
      return currentVisualCol
    }
    const targetCantFitPreferred = targetMaxVisualCol < this.preferredVisualCol!
    if (targetTooShort || targetCantFitPreferred) return targetMaxVisualCol
    const result = this.preferredVisualCol!
    this.preferredVisualCol = null
    return result
  }

  moveToLineStart(): void {
    this.lastAction = null
    this.setCursorCol(0)
  }

  moveToLineEnd(): void {
    this.lastAction = null
    const currentLine = this.state.lines[this.state.cursorLine] || ''
    this.setCursorCol(currentLine.length)
  }

  deleteToStartOfLine(): void {
    this.exitHistoryBrowsing()
    const currentLine = this.state.lines[this.state.cursorLine] || ''
    if (this.state.cursorCol > 0) {
      this.pushUndoSnapshot()
      const deletedText = currentLine.slice(0, this.state.cursorCol)
      this.killRing.push(deletedText, {
        prepend: true,
        accumulate: this.lastAction === 'kill',
      })
      this.lastAction = 'kill'
      this.state.lines[this.state.cursorLine] = currentLine.slice(this.state.cursorCol)
      this.setCursorCol(0)
    } else if (this.state.cursorLine > 0) {
      this.pushUndoSnapshot()
      this.killRing.push('\n', {
        prepend: true,
        accumulate: this.lastAction === 'kill',
      })
      this.lastAction = 'kill'
      const previousLine = this.state.lines[this.state.cursorLine - 1] || ''
      this.state.lines[this.state.cursorLine - 1] = previousLine + currentLine
      this.state.lines.splice(this.state.cursorLine, 1)
      this.state.cursorLine--
      this.setCursorCol(previousLine.length)
    }
    if (this.onChange) this.onChange(this.getText())
  }

  deleteToEndOfLine(): void {
    this.exitHistoryBrowsing()
    const currentLine = this.state.lines[this.state.cursorLine] || ''
    if (this.state.cursorCol < currentLine.length) {
      this.pushUndoSnapshot()
      const deletedText = currentLine.slice(this.state.cursorCol)
      this.killRing.push(deletedText, {
        prepend: false,
        accumulate: this.lastAction === 'kill',
      })
      this.lastAction = 'kill'
      this.state.lines[this.state.cursorLine] = currentLine.slice(0, this.state.cursorCol)
    } else if (this.state.cursorLine < this.state.lines.length - 1) {
      this.pushUndoSnapshot()
      this.killRing.push('\n', {
        prepend: false,
        accumulate: this.lastAction === 'kill',
      })
      this.lastAction = 'kill'
      const nextLine = this.state.lines[this.state.cursorLine + 1] || ''
      this.state.lines[this.state.cursorLine] = currentLine + nextLine
      this.state.lines.splice(this.state.cursorLine + 1, 1)
    }
    if (this.onChange) this.onChange(this.getText())
  }

  deleteWordBackwards(): void {
    this.exitHistoryBrowsing()
    const currentLine = this.state.lines[this.state.cursorLine] || ''
    if (this.state.cursorCol === 0) {
      if (this.state.cursorLine > 0) {
        this.pushUndoSnapshot()
        this.killRing.push('\n', {
          prepend: true,
          accumulate: this.lastAction === 'kill',
        })
        this.lastAction = 'kill'
        const previousLine = this.state.lines[this.state.cursorLine - 1] || ''
        this.state.lines[this.state.cursorLine - 1] = previousLine + currentLine
        this.state.lines.splice(this.state.cursorLine, 1)
        this.state.cursorLine--
        this.setCursorCol(previousLine.length)
      }
    } else {
      this.pushUndoSnapshot()
      const wasKill = this.lastAction === 'kill'
      const oldCursorCol = this.state.cursorCol
      this.moveWordBackwards()
      const deleteFrom = this.state.cursorCol
      this.setCursorCol(oldCursorCol)
      const deletedText = currentLine.slice(deleteFrom, this.state.cursorCol)
      this.killRing.push(deletedText, {
        prepend: true,
        accumulate: wasKill,
      })
      this.lastAction = 'kill'
      this.state.lines[this.state.cursorLine] =
        currentLine.slice(0, deleteFrom) + currentLine.slice(this.state.cursorCol)
      this.setCursorCol(deleteFrom)
    }
    if (this.onChange) this.onChange(this.getText())
  }

  deleteWordForward(): void {
    this.exitHistoryBrowsing()
    const currentLine = this.state.lines[this.state.cursorLine] || ''
    if (this.state.cursorCol >= currentLine.length) {
      if (this.state.cursorLine < this.state.lines.length - 1) {
        this.pushUndoSnapshot()
        this.killRing.push('\n', {
          prepend: false,
          accumulate: this.lastAction === 'kill',
        })
        this.lastAction = 'kill'
        const nextLine = this.state.lines[this.state.cursorLine + 1] || ''
        this.state.lines[this.state.cursorLine] = currentLine + nextLine
        this.state.lines.splice(this.state.cursorLine + 1, 1)
      }
    } else {
      this.pushUndoSnapshot()
      const wasKill = this.lastAction === 'kill'
      const oldCursorCol = this.state.cursorCol
      this.moveWordForwards()
      const deleteTo = this.state.cursorCol
      this.setCursorCol(oldCursorCol)
      const deletedText = currentLine.slice(this.state.cursorCol, deleteTo)
      this.killRing.push(deletedText, {
        prepend: false,
        accumulate: wasKill,
      })
      this.lastAction = 'kill'
      this.state.lines[this.state.cursorLine] =
        currentLine.slice(0, this.state.cursorCol) + currentLine.slice(deleteTo)
    }
    if (this.onChange) this.onChange(this.getText())
  }

  handleForwardDelete(): void {
    this.exitHistoryBrowsing()
    this.lastAction = null
    const currentLine = this.state.lines[this.state.cursorLine] || ''
    if (this.state.cursorCol < currentLine.length) {
      this.pushUndoSnapshot()
      const afterCursor = currentLine.slice(this.state.cursorCol)
      const firstGrapheme = [...this.segment(afterCursor, 'grapheme')][0]
      const graphemeLength = firstGrapheme ? firstGrapheme.segment.length : 1
      const before = currentLine.slice(0, this.state.cursorCol)
      const after = currentLine.slice(this.state.cursorCol + graphemeLength)
      this.state.lines[this.state.cursorLine] = before + after
    } else if (this.state.cursorLine < this.state.lines.length - 1) {
      this.pushUndoSnapshot()
      const nextLine = this.state.lines[this.state.cursorLine + 1] || ''
      this.state.lines[this.state.cursorLine] = currentLine + nextLine
      this.state.lines.splice(this.state.cursorLine + 1, 1)
    }
    if (this.onChange) this.onChange(this.getText())
    if (this.autocompleteState) this.updateAutocomplete()
    else {
      const textBeforeCursor = (this.state.lines[this.state.cursorLine] || '').slice(
        0,
        this.state.cursorCol,
      )
      if (this.isInSlashCommandContext(textBeforeCursor)) this.tryTriggerAutocomplete()
      else if (this.autocompleteTriggerPattern.test(textBeforeCursor)) this.tryTriggerAutocomplete()
    }
  }

  /**
   * Build a mapping from visual lines to logical positions.
   * Returns an array where each element represents a visual line with:
   * - logicalLine: index into this.state.lines
   * - startCol: starting column in the logical line
   * - length: length of this visual line segment
   */
  buildVisualLineMap(
    width: number,
    continuationWidth: number = this.lastContinuationWidth,
  ): VisualLine[] {
    const visualLines: VisualLine[] = []
    for (let i = 0; i < this.state.lines.length; i++) {
      const line = this.state.lines[i] || ''
      const lineVisWidth = visibleWidth(line)
      if (line.length === 0)
        visualLines.push({
          logicalLine: i,
          startCol: 0,
          length: 0,
        })
      else if (lineVisWidth <= width)
        visualLines.push({
          logicalLine: i,
          startCol: 0,
          length: line.length,
        })
      else {
        const chunks = wordWrapLine(
          line,
          width,
          [...this.segment(line, 'grapheme')],
          continuationWidth,
        )
        for (const chunk of chunks)
          visualLines.push({
            logicalLine: i,
            startCol: chunk.startIndex,
            length: chunk.endIndex - chunk.startIndex,
          })
      }
    }
    return visualLines
  }

  /**
   * Find the visual line index that contains the given logical position.
   */
  findVisualLineAt(visualLines: VisualLine[], line: number, col: number): number {
    for (let i = 0; i < visualLines.length; i++) {
      const vl = visualLines[i]
      if (!vl || vl.logicalLine !== line) continue
      const offset = col - vl.startCol
      const isLastSegmentOfLine =
        i === visualLines.length - 1 || visualLines[i + 1]?.logicalLine !== vl.logicalLine
      if (offset >= 0 && (offset < vl.length || (isLastSegmentOfLine && offset === vl.length)))
        return i
    }
    return visualLines.length - 1
  }

  /**
   * Find the visual line index for the current cursor position.
   */
  findCurrentVisualLine(visualLines: VisualLine[]): number {
    return this.findVisualLineAt(visualLines, this.state.cursorLine, this.state.cursorCol)
  }

  moveCursor(deltaLine: number, deltaCol: number): void {
    this.lastAction = null
    const visualLines = this.buildVisualLineMap(this.lastWidth)
    const currentVisualLine = this.findCurrentVisualLine(visualLines)
    if (deltaLine !== 0) {
      const targetVisualLine = currentVisualLine + deltaLine
      if (targetVisualLine >= 0 && targetVisualLine < visualLines.length)
        this.moveToVisualLine(visualLines, currentVisualLine, targetVisualLine)
    }
    if (deltaCol !== 0) {
      const currentLine = this.state.lines[this.state.cursorLine] || ''
      if (deltaCol > 0) {
        if (this.state.cursorCol < currentLine.length) {
          const afterCursor = currentLine.slice(this.state.cursorCol)
          const firstGrapheme = [...this.segment(afterCursor, 'grapheme')][0]
          this.setCursorCol(this.state.cursorCol + (firstGrapheme ? firstGrapheme.segment.length : 1))
        } else if (this.state.cursorLine < this.state.lines.length - 1) {
          this.state.cursorLine++
          this.setCursorCol(0)
        } else {
          const currentVL = visualLines[currentVisualLine]
          if (currentVL) this.preferredVisualCol = this.state.cursorCol - currentVL.startCol
        }
      } else if (this.state.cursorCol > 0) {
        const beforeCursor = currentLine.slice(0, this.state.cursorCol)
        const graphemes = [...this.segment(beforeCursor, 'grapheme')]
        const lastGrapheme = graphemes[graphemes.length - 1]
        this.setCursorCol(this.state.cursorCol - (lastGrapheme ? lastGrapheme.segment.length : 1))
      } else if (this.state.cursorLine > 0) {
        this.state.cursorLine--
        const prevLine = this.state.lines[this.state.cursorLine] || ''
        this.setCursorCol(prevLine.length)
      }
    }
    if (this.autocompleteState) this.updateAutocomplete()
  }

  /**
   * Scroll by a page (direction: -1 for up, 1 for down).
   * Moves cursor by the page size while keeping it in bounds.
   */
  pageScroll(direction: number): void {
    this.lastAction = null
    const terminalRows = this.tui.terminal.rows
    const pageSize = Math.max(5, Math.floor(terminalRows * 0.3))
    const visualLines = this.buildVisualLineMap(this.lastWidth)
    const currentVisualLine = this.findCurrentVisualLine(visualLines)
    const targetVisualLine = Math.max(
      0,
      Math.min(visualLines.length - 1, currentVisualLine + direction * pageSize),
    )
    this.moveToVisualLine(visualLines, currentVisualLine, targetVisualLine)
  }

  moveWordBackwards(): void {
    this.lastAction = null
    const currentLine = this.state.lines[this.state.cursorLine] || ''
    if (this.state.cursorCol === 0) {
      if (this.state.cursorLine > 0) {
        this.state.cursorLine--
        const prevLine = this.state.lines[this.state.cursorLine] || ''
        this.setCursorCol(prevLine.length)
      }
      return
    }
    this.setCursorCol(
      findWordBackward(currentLine, this.state.cursorCol, {
        segment: text => this.segment(text, 'word'),
        isAtomicSegment: isPasteMarker,
      }),
    )
  }

  /**
   * Yank (paste) the most recent kill ring entry at cursor position.
   */
  yank(): void {
    if (this.killRing.length === 0) return
    this.pushUndoSnapshot()
    const text = this.killRing.peek()
    if (text === undefined) return
    this.insertYankedText(text)
    this.lastAction = 'yank'
  }

  /**
   * Cycle through kill ring (only works immediately after yank or yank-pop).
   * Replaces the last yanked text with the previous entry in the ring.
   */
  yankPop(): void {
    if (this.lastAction !== 'yank' || this.killRing.length <= 1) return
    this.pushUndoSnapshot()
    this.deleteYankedText()
    this.killRing.rotate()
    const text = this.killRing.peek()
    if (text === undefined) return
    this.insertYankedText(text)
    this.lastAction = 'yank'
  }

  /**
   * Insert text at cursor position (used by yank operations).
   */
  insertYankedText(text: string): void {
    this.exitHistoryBrowsing()
    const lines = text.split('\n')
    if (lines.length === 1) {
      const currentLine = this.state.lines[this.state.cursorLine] || ''
      const before = currentLine.slice(0, this.state.cursorCol)
      const after = currentLine.slice(this.state.cursorCol)
      this.state.lines[this.state.cursorLine] = before + text + after
      this.setCursorCol(this.state.cursorCol + text.length)
    } else {
      const currentLine = this.state.lines[this.state.cursorLine] || ''
      const before = currentLine.slice(0, this.state.cursorCol)
      const after = currentLine.slice(this.state.cursorCol)
      this.state.lines[this.state.cursorLine] = before + (lines[0] || '')
      for (let i = 1; i < lines.length - 1; i++)
        this.state.lines.splice(this.state.cursorLine + i, 0, lines[i] || '')
      const lastLineIndex = this.state.cursorLine + lines.length - 1
      this.state.lines.splice(lastLineIndex, 0, (lines[lines.length - 1] || '') + after)
      this.state.cursorLine = lastLineIndex
      this.setCursorCol((lines[lines.length - 1] || '').length)
    }
    if (this.onChange) this.onChange(this.getText())
  }

  /**
   * Delete the previously yanked text (used by yank-pop).
   * The yanked text is derived from killRing[end] since it hasn't been rotated yet.
   */
  deleteYankedText(): void {
    const yankedText = this.killRing.peek()
    if (!yankedText) return
    const yankLines = yankedText.split('\n')
    if (yankLines.length === 1) {
      const currentLine = this.state.lines[this.state.cursorLine] || ''
      const deleteLen = yankedText.length
      const before = currentLine.slice(0, this.state.cursorCol - deleteLen)
      const after = currentLine.slice(this.state.cursorCol)
      this.state.lines[this.state.cursorLine] = before + after
      this.setCursorCol(this.state.cursorCol - deleteLen)
    } else {
      const startLine = this.state.cursorLine - (yankLines.length - 1)
      const startCol = (this.state.lines[startLine] || '').length - (yankLines[0] || '').length
      const afterCursor = (this.state.lines[this.state.cursorLine] || '').slice(this.state.cursorCol)
      const beforeYank = (this.state.lines[startLine] || '').slice(0, startCol)
      this.state.lines.splice(startLine, yankLines.length, beforeYank + afterCursor)
      this.state.cursorLine = startLine
      this.setCursorCol(startCol)
    }
    if (this.onChange) this.onChange(this.getText())
  }

  pushUndoSnapshot(): void {
    this.undoStack.push({
      state: this.state,
      pastes: this.pastes,
      pasteCounter: this.pasteCounter,
    })
  }

  undo(): void {
    this.exitHistoryBrowsing()
    const snapshot = this.undoStack.pop()
    if (!snapshot) return
    Object.assign(this.state, snapshot.state)
    // The popped snapshot is an owned deep clone; a later pushUndoSnapshot
    // re-clones, so adopting its Map directly cannot alias a stacked entry.
    this.pastes = snapshot.pastes
    this.pasteCounter = snapshot.pasteCounter
    this.lastAction = null
    this.preferredVisualCol = null
    if (this.onChange) this.onChange(this.getText())
  }

  /**
   * Jump to the first occurrence of a character in the specified direction.
   * Multi-line search. Case-sensitive. Skips the current cursor position.
   */
  jumpToChar(char: string, direction: 'forward' | 'backward'): void {
    this.lastAction = null
    const isForward = direction === 'forward'
    const lines = this.state.lines
    const end = isForward ? lines.length : -1
    const step = isForward ? 1 : -1
    for (let lineIdx = this.state.cursorLine; lineIdx !== end; lineIdx += step) {
      const line = lines[lineIdx] || ''
      const searchFrom =
        lineIdx === this.state.cursorLine
          ? isForward
            ? this.state.cursorCol + 1
            : this.state.cursorCol - 1
          : undefined
      const idx = isForward ? line.indexOf(char, searchFrom) : line.lastIndexOf(char, searchFrom)
      if (idx !== -1) {
        this.state.cursorLine = lineIdx
        this.setCursorCol(idx)
        return
      }
    }
  }

  moveWordForwards(): void {
    this.lastAction = null
    const currentLine = this.state.lines[this.state.cursorLine] || ''
    if (this.state.cursorCol >= currentLine.length) {
      if (this.state.cursorLine < this.state.lines.length - 1) {
        this.state.cursorLine++
        this.setCursorCol(0)
      }
      return
    }
    this.setCursorCol(
      findWordForward(currentLine, this.state.cursorCol, {
        segment: text => this.segment(text, 'word'),
        isAtomicSegment: isPasteMarker,
      }),
    )
  }

  isSlashMenuAllowed(): boolean {
    return this.state.cursorLine === 0
  }

  isAtStartOfMessage(): boolean {
    if (!this.isSlashMenuAllowed()) return false
    const beforeCursor = (this.state.lines[this.state.cursorLine] || '').slice(
      0,
      this.state.cursorCol,
    )
    return beforeCursor.trim() === '' || beforeCursor.trim() === '/'
  }

  isInSlashCommandContext(textBeforeCursor: string): boolean {
    return this.isSlashMenuAllowed() && textBeforeCursor.trimStart().startsWith('/')
  }

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
  getBestAutocompleteMatchIndex(items: AutocompleteItem[], prefix: string): number {
    if (!prefix) return -1
    let firstPrefixIndex = -1
    for (let i = 0; i < items.length; i++) {
      const value = items[i]!.value
      if (value === prefix) return i
      if (firstPrefixIndex === -1 && value.startsWith(prefix)) firstPrefixIndex = i
    }
    return firstPrefixIndex
  }

  createAutocompleteList(prefix: string, items: AutocompleteItem[]): SelectList {
    const layout = prefix.startsWith('/') ? SLASH_COMMAND_SELECT_LIST_LAYOUT : undefined
    return new SelectList(items, this.autocompleteMaxVisible, this.theme.selectList, layout)
  }

  tryTriggerAutocomplete(explicitTab = false): void {
    this.requestAutocomplete({
      force: false,
      explicitTab,
    })
  }

  handleTabCompletion(): void {
    if (!this.autocompleteProvider) return
    const beforeCursor = (this.state.lines[this.state.cursorLine] || '').slice(
      0,
      this.state.cursorCol,
    )
    if (this.isInSlashCommandContext(beforeCursor) && !beforeCursor.trimStart().includes(' '))
      this.handleSlashCommandCompletion()
    else this.forceFileAutocomplete(true)
  }

  handleSlashCommandCompletion(): void {
    this.requestAutocomplete({
      force: false,
      explicitTab: true,
    })
  }

  forceFileAutocomplete(explicitTab = false): void {
    this.requestAutocomplete({
      force: true,
      explicitTab,
    })
  }

  requestAutocomplete(options: AutocompleteRequestOptions): void {
    if (!this.autocompleteProvider) return
    if (options.force) {
      if (
        !(
          !this.autocompleteProvider.shouldTriggerFileCompletion ||
          this.autocompleteProvider.shouldTriggerFileCompletion(
            this.state.lines,
            this.state.cursorLine,
            this.state.cursorCol,
          )
        )
      )
        return
    }
    this.cancelAutocompleteRequest()
    const startToken = ++this.autocompleteStartToken
    const debounceMs = this.getAutocompleteDebounceMs(options)
    if (debounceMs > 0) {
      this.autocompleteDebounceTimer = setTimeout(() => {
        this.autocompleteDebounceTimer = undefined
        this.startAutocompleteRequest(startToken, options)
      }, debounceMs)
      return
    }
    this.startAutocompleteRequest(startToken, options)
  }

  async startAutocompleteRequest(
    startToken: number,
    options: AutocompleteRequestOptions,
  ): Promise<void> {
    const previousTask = this.autocompleteRequestTask
    this.autocompleteRequestTask = (async () => {
      await previousTask
      if (startToken !== this.autocompleteStartToken || !this.autocompleteProvider) return
      const controller = new AbortController()
      this.autocompleteAbort = controller
      const requestId = ++this.autocompleteRequestId
      const snapshotText = this.getText()
      const snapshotLine = this.state.cursorLine
      const snapshotCol = this.state.cursorCol
      await this.runAutocompleteRequest(
        requestId,
        controller,
        snapshotText,
        snapshotLine,
        snapshotCol,
        options,
      )
    })().catch(() => {
      // A rejected/aborted provider call (the common, expected abort case
      // included) is swallowed at the chain boundary so it neither poisons the
      // next request's `await previousTask` nor escapes as an unhandled
      // rejection. Matches upstream's no-logging posture.
    })
    await this.autocompleteRequestTask
  }

  setAutocompleteTriggerCharacters(triggerCharacters: string[]): void {
    const next = [...DEFAULT_AUTOCOMPLETE_TRIGGER_CHARACTERS]
    for (const character of triggerCharacters) {
      if (
        character.length !== 1 ||
        character === '/' ||
        isWhitespaceChar(character) ||
        next.includes(character)
      )
        continue
      next.push(character)
    }
    this.autocompleteTriggerCharacters = next
    this.autocompleteTriggerPattern = buildTriggerPattern(next)
    this.autocompleteDebouncePattern = buildDebouncePattern(next)
  }

  getAutocompleteDebounceMs(options: AutocompleteRequestOptions): number {
    if (options.explicitTab || options.force) return 0
    const textBeforeCursor = (this.state.lines[this.state.cursorLine] || '').slice(
      0,
      this.state.cursorCol,
    )
    return this.autocompleteDebouncePattern.test(textBeforeCursor)
      ? ATTACHMENT_AUTOCOMPLETE_DEBOUNCE_MS
      : 0
  }

  async runAutocompleteRequest(
    requestId: number,
    controller: AbortController,
    snapshotText: string,
    snapshotLine: number,
    snapshotCol: number,
    options: AutocompleteRequestOptions,
  ): Promise<void> {
    if (!this.autocompleteProvider) return
    const suggestions = await this.autocompleteProvider.getSuggestions(
      this.state.lines,
      this.state.cursorLine,
      this.state.cursorCol,
      {
        signal: controller.signal,
        force: options.force,
      },
    )
    if (
      !this.isAutocompleteRequestCurrent(
        requestId,
        controller,
        snapshotText,
        snapshotLine,
        snapshotCol,
      )
    )
      return
    this.autocompleteAbort = undefined
    if (!suggestions || !Array.isArray(suggestions.items) || suggestions.items.length === 0) {
      this.cancelAutocomplete()
      this.tui.requestRender()
      return
    }
    if (options.force && options.explicitTab && suggestions.items.length === 1) {
      const item = suggestions.items[0]!
      this.pushUndoSnapshot()
      this.lastAction = null
      const result = this.autocompleteProvider!.applyCompletion(
        this.state.lines,
        this.state.cursorLine,
        this.state.cursorCol,
        item,
        suggestions.prefix,
      )
      this.state.lines = result.lines
      this.state.cursorLine = result.cursorLine
      this.setCursorCol(result.cursorCol)
      if (this.onChange) this.onChange(this.getText())
      this.tui.requestRender()
      return
    }
    this.applyAutocompleteSuggestions(suggestions, options.force ? 'force' : 'regular')
    this.tui.requestRender()
  }

  isAutocompleteRequestCurrent(
    requestId: number,
    controller: AbortController,
    snapshotText: string,
    snapshotLine: number,
    snapshotCol: number,
  ): boolean {
    return (
      !controller.signal.aborted &&
      requestId === this.autocompleteRequestId &&
      this.getText() === snapshotText &&
      this.state.cursorLine === snapshotLine &&
      this.state.cursorCol === snapshotCol
    )
  }

  applyAutocompleteSuggestions(
    suggestions: AutocompleteSuggestions,
    state: AutocompleteRequestState,
  ): void {
    this.autocompletePrefix = suggestions.prefix
    this.autocompleteList = this.createAutocompleteList(suggestions.prefix, suggestions.items)
    const bestMatchIndex = this.getBestAutocompleteMatchIndex(suggestions.items, suggestions.prefix)
    if (bestMatchIndex >= 0) this.autocompleteList.setSelectedIndex(bestMatchIndex)
    this.autocompleteState = state
  }

  cancelAutocompleteRequest(): void {
    this.autocompleteStartToken += 1
    if (this.autocompleteDebounceTimer) {
      clearTimeout(this.autocompleteDebounceTimer)
      this.autocompleteDebounceTimer = undefined
    }
    this.autocompleteAbort?.abort()
    this.autocompleteAbort = undefined
  }

  clearAutocompleteUi(): void {
    this.autocompleteState = null
    this.autocompleteList = undefined
    this.autocompletePrefix = ''
  }

  cancelAutocomplete(): void {
    this.cancelAutocompleteRequest()
    this.clearAutocompleteUi()
  }

  isShowingAutocomplete(): boolean {
    return this.autocompleteState !== null
  }

  updateAutocomplete(): void {
    if (!this.autocompleteState || !this.autocompleteProvider) return
    this.requestAutocomplete({
      force: this.autocompleteState === 'force',
      explicitTab: false,
    })
  }
}

//#endregion
