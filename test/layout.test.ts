/**
 * Tests for the alt-screen layout adoption (pi-tui 0.85): the render-tree shape
 * (buildTuiLayout), the pinned-vs-scrolled flex contract, the primary ScrollView
 * follow-end/scroll behavior, and the Home/End keybinding fix (freeEditorHomeEnd).
 *
 * The real viewport ALLOCATION (pinned entries keeping height under overflow) and
 * the terminal enter/exit path run in TuiAltScreen's layout engine, which is not
 * part of pi-tui's public API — those are covered by attended live-verify. Here
 * we pin the structural contract (entry flex options) and the ScrollView unit.
 */
import { describe, it, expect } from 'vitest'
import {
  type Component,
  KeybindingsManager,
  ScrollView,
  TUI_KEYBINDINGS,
  VStack,
} from '@earendil-works/pi-tui'
import { buildTuiLayout, freeEditorHomeEnd, type TuiLayoutParts } from '../src/chat/layout.ts'

/** A minimal component that renders a fixed number of lines. */
class Lines implements Component {
  constructor(private readonly n: number, private readonly label = 'x') {}
  render(): string[] {
    return Array.from({ length: this.n }, (_, i) => `${this.label} ${i}`)
  }
  invalidate(): void {}
}

function makeParts(): TuiLayoutParts {
  return {
    header: new Lines(1, 'header'),
    chat: new Lines(1, 'chat'),
    todoContainer: new Lines(1, 'todo'),
    compactionStatusLine: new Lines(1, 'compaction'),
    promptContext: new Lines(1, 'prompt'),
    questionContainer: new Lines(0, 'question'),
    editor: new Lines(1, 'editor'),
  }
}

/** Read the private Stack entries at runtime (not on the public type). */
function entries(stack: VStack): Array<{ component: Component; grow?: number; shrink?: number; basis?: number | 'auto' }> {
  return (stack as unknown as { entries: Array<{ component: Component; grow?: number; shrink?: number; basis?: number | 'auto' }> }).entries
}

describe('buildTuiLayout render-tree shape', () => {
  it('roots a VStack whose sole grow+shrink entry is the primary follow-end ScrollView', () => {
    const parts = makeParts()
    const { root, transcriptScroll, scrollBody } = buildTuiLayout(parts)

    expect(root).toBeInstanceOf(VStack)
    expect(transcriptScroll).toBeInstanceOf(ScrollView)
    expect(scrollBody).toBeInstanceOf(VStack)

    const rootEntries = entries(root)
    expect(rootEntries).toHaveLength(4)

    // Entry 0 = the scroll region: the ONLY entry that grows and shrinks.
    expect(rootEntries[0].component).toBe(transcriptScroll)
    expect(rootEntries[0].grow).toBe(1)
    expect(rootEntries[0].shrink).toBe(1)
    expect(rootEntries[0].basis).toBe(0)

    // Entries 1..3 = pinned: never grow, never shrink (B1: a long transcript
    // can never clip the prompt/modal/editor).
    expect(rootEntries[1].component).toBe(parts.promptContext)
    expect(rootEntries[2].component).toBe(parts.questionContainer)
    expect(rootEntries[3].component).toBe(parts.editor) // editor is last / at the bottom
    for (const e of rootEntries.slice(1)) {
      expect(e.grow).toBe(0)
      expect(e.shrink).toBe(0)
    }
  })

  it('keeps chat transcript-only: chat lives in scrollBody, never as a root entry', () => {
    const parts = makeParts()
    const { root, scrollBody } = buildTuiLayout(parts)

    const rootComponents = entries(root).map(e => e.component)
    expect(rootComponents).not.toContain(parts.chat)
    expect(rootComponents).not.toContain(parts.header)
    expect(rootComponents).not.toContain(parts.todoContainer)

    // header, chat, <spacer>, todo, compaction all scroll together.
    const bodyComponents = entries(scrollBody).map(e => e.component)
    expect(bodyComponents).toContain(parts.chat)
    expect(bodyComponents).toContain(parts.header)
    expect(bodyComponents).toContain(parts.todoContainer)
    expect(bodyComponents).toContain(parts.compactionStatusLine)
    // header first, compaction last; a spacer sits between chat and todo.
    expect(bodyComponents[0]).toBe(parts.header)
    expect(bodyComponents[1]).toBe(parts.chat)
    expect(bodyComponents.at(-1)).toBe(parts.compactionStatusLine)
    expect(bodyComponents).toHaveLength(5) // header, chat, spacer, todo, compaction
  })
})

describe('primary ScrollView follow-end + scroll (B1)', () => {
  it('follows the end, scrollBy releases follow, scrollToEnd/Start re-seek', () => {
    const sv = new ScrollView(new Lines(100), { primary: true, follow: 'end' })
    sv.updateLayout(100, 10, () => {})

    sv.scrollToEnd()
    expect(sv.isFollowingEnd).toBe(true)
    expect(sv.scrollTop).toBe(90) // contentHeight - viewportHeight

    sv.scrollBy(-5)
    expect(sv.scrollTop).toBe(85)
    expect(sv.isFollowingEnd).toBe(false)

    sv.scrollToEnd()
    expect(sv.scrollTop).toBe(90)
    expect(sv.isFollowingEnd).toBe(true)

    sv.scrollToStart()
    expect(sv.scrollTop).toBe(0)
    expect(sv.isFollowingEnd).toBe(false)
  })

  it('while following, new content stays pinned to the newest line', () => {
    const sv = new ScrollView(new Lines(100), { primary: true, follow: 'end' })
    sv.updateLayout(100, 10, () => {})
    sv.scrollToEnd()
    expect(sv.scrollTop).toBe(90)

    // Content grows (a new turn arrives) — follow-end keeps us at the bottom.
    sv.updateLayout(140, 10, () => {})
    expect(sv.isFollowingEnd).toBe(true)
    expect(sv.scrollTop).toBe(130)
  })

  it('while scrolled up, new content does NOT jerk the viewport to the bottom', () => {
    const sv = new ScrollView(new Lines(100), { primary: true, follow: 'end' })
    sv.updateLayout(100, 10, () => {})
    sv.scrollToEnd()
    sv.scrollBy(-40) // read back at scrollTop 50
    expect(sv.scrollTop).toBe(50)
    expect(sv.isFollowingEnd).toBe(false)

    sv.updateLayout(140, 10, () => {})
    expect(sv.isFollowingEnd).toBe(false)
    expect(sv.scrollTop).toBe(50) // stays where the reader left it
  })
})

describe('freeEditorHomeEnd — Home/End belong to the editor (B3)', () => {
  it('unbinds viewport top/bottom, preserves editor line-nav and other viewport keys', () => {
    const kb = new KeybindingsManager(TUI_KEYBINDINGS)

    // Before: the collision the fix targets.
    expect(kb.getKeys('tui.altScreen.top')).toContain('home')
    expect(kb.getKeys('tui.altScreen.bottom')).toContain('end')

    freeEditorHomeEnd(kb)

    // Viewport top/bottom are unbound…
    expect(kb.getKeys('tui.altScreen.top')).toEqual([])
    expect(kb.getKeys('tui.altScreen.bottom')).toEqual([])
    // …so Home/End reach the focused editor's line-start/line-end.
    expect(kb.getKeys('tui.editor.cursorLineStart')).toContain('home')
    expect(kb.getKeys('tui.editor.cursorLineEnd')).toContain('end')
    // Transcript scrolling still has a keyboard path.
    expect(kb.getKeys('tui.altScreen.pageUp')).toContain('pageUp')
    expect(kb.getKeys('tui.altScreen.pageDown')).toContain('pageDown')
    // Unrelated viewport bindings survive the merge.
    expect(kb.getKeys('tui.altScreen.search')).toContain('ctrl+shift+f')
  })

  it('is merge-preserving: an existing user binding is retained', () => {
    const kb = new KeybindingsManager(TUI_KEYBINDINGS)
    kb.setUserBindings({ 'tui.altScreen.search': 'ctrl+s' })
    freeEditorHomeEnd(kb)
    expect(kb.getKeys('tui.altScreen.search')).toContain('ctrl+s')
    expect(kb.getKeys('tui.altScreen.top')).toEqual([])
  })
})
