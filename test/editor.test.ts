/**
 * Regression tests for the vendored prompt-gutter Editor (src/vendor/editor.ts)
 * and the HintEditor placeholder overlay (src/chat/helpers.ts). These pin the
 * renderer behavior the fork depends on — the frameless prompt gutter that the
 * published @earendil-works/pi-tui no longer provides — so a future rebuild
 * cannot silently drift. Assertions strip ANSI and check gutter/content, not
 * exact styled bytes.
 */
import { describe, it, expect } from 'vitest'
import type { TUI } from '@earendil-works/pi-tui'
import type {
  AutocompleteProvider,
  AutocompleteSuggestions,
  SelectListTheme,
} from '@earendil-works/pi-tui'
import { Editor, type EditorTheme } from '../src/vendor/editor.ts'
import { HintEditor } from '../src/chat/helpers.ts'

const stripAnsi = (s: string): string => s.replace(/\x1B\[[0-9;]*m/g, '')

function makeTui(rows = 24): TUI {
  return { terminal: { rows, columns: 80 }, requestRender() {} } as unknown as TUI
}

const theme: EditorTheme = {
  borderColor: (s: string) => s, // identity: no ANSI, so assertions read clean
  selectList: {} as unknown as SelectListTheme,
}

const PROMPT = { first: '> ', continuation: '  ' }

describe('vendored Editor prompt gutter', () => {
  it('(a) unwrapped active input: first-line gutter present, text intact, no border', () => {
    const ed = new Editor(makeTui(), theme, { paddingX: 1, frame: 'none', prompt: PROMPT })
    ed.setText('hello')
    const lines = ed.render(40).map(stripAnsi)
    // frame:'none' emits no full-width border line
    expect(lines.some(l => /^─+$/.test(l.trim()))).toBe(false)
    const content = lines.find(l => l.includes('hello'))
    expect(content).toBeDefined()
    // leftPadding(1) + prompt.first('> ') + text
    expect(content!.trimStart()).toMatch(/^> hello/)
  })

  it('(b) wrapped active input: wraps into multiple lines keeping the first-line gutter', () => {
    const ed = new Editor(makeTui(), theme, { paddingX: 1, frame: 'none', prompt: PROMPT })
    ed.setText('hello world alpha beta gamma delta')
    const lines = ed.render(14).map(stripAnsi) // narrow -> forced wrap
    const content = lines.filter(l => l.trim() !== '')
    expect(content.length).toBeGreaterThan(1)
    expect(content[0]!.trimStart()).toMatch(/^> hello/)
    // all input words survive across the wrapped lines
    const joined = content.map(l => stripAnsi(l)).join(' ')
    for (const w of ['hello', 'world', 'alpha', 'beta', 'gamma', 'delta']) {
      expect(joined).toContain(w)
    }
  })

  it('(b2) wrapped active input: cursor renders on the wrapped line when focused', () => {
    const ed = new Editor(makeTui(), theme, { paddingX: 1, frame: 'none', prompt: PROMPT })
    ed.focused = true
    ed.setText('hello world alpha beta gamma delta') // cursor at end (last visual line)
    const raw = ed.render(14)
    // inverse-video cursor styling appears somewhere in the rendered output
    expect(raw.some(l => l.includes('\x1B[7m'))).toBe(true)
  })

  it('(c) frame:"none" with empty text emits no border line', () => {
    const ed = new Editor(makeTui(), theme, { paddingX: 1, frame: 'none', prompt: PROMPT })
    const lines = ed.render(40).map(stripAnsi)
    expect(lines.every(l => !/^─+$/.test(l.trim()))).toBe(true)
  })

  it('(c2) frame:"horizontal" DOES emit a border line (guards the frame switch)', () => {
    const ed = new Editor(makeTui(), theme, { paddingX: 1, frame: 'horizontal', prompt: PROMPT })
    ed.setText('x')
    const lines = ed.render(40).map(stripAnsi)
    expect(lines.some(l => /^─+$/.test(l.trim()))).toBe(true)
  })
})

describe('HintEditor empty-state placeholder', () => {
  it('(d) shows the hint prefixed by hintPrefix while the input is empty', () => {
    const he = new HintEditor(makeTui(), theme, { paddingX: 1, frame: 'none', prompt: PROMPT })
    he.hint = 'type a message'
    he.hintPrefix = '> '
    expect(he.getText()).toBe('')
    const line0 = stripAnsi(he.render(40)[0] ?? '')
    expect(line0).toContain('type a message')
    expect(line0.trimStart()).toMatch(/^> /)
  })

  it('(d2) once text is entered, the placeholder is gone and the text renders', () => {
    const he = new HintEditor(makeTui(), theme, { paddingX: 1, frame: 'none', prompt: PROMPT })
    he.hint = 'type a message'
    he.hintPrefix = '> '
    he.setText('real input')
    const lines = he.render(40).map(stripAnsi)
    expect(lines.some(l => l.includes('type a message'))).toBe(false)
    expect(lines.some(l => l.includes('real input'))).toBe(true)
  })
})

// Regression tests for the three pre-existing upstream editor defects (see the
// src/vendor/editor.ts header). Each FAILS on the pre-fix renderer and passes
// after the fix.

/** A large single-line paste body forces a `[paste #N <chars> chars]` marker. */
const bigPaste = (ch: string): string => ch.repeat(1100)

describe('paste-marker defect fixes', () => {
  it('(D1) undo restores paste metadata so the marker still expands to its content', () => {
    const ed = new Editor(makeTui(), theme, { prompt: PROMPT })
    const content = bigPaste('a')
    ed.handlePaste(content)
    // One marker on the line, backed by pastes{1:content}.
    expect(ed.getExpandedText()).toBe(content)
    // Delete the marker (cursor is at end after the paste).
    ed.handleBackspace()
    expect(ed.getText()).toBe('')
    // Undo must bring back BOTH the marker text and its backing content.
    ed.undo()
    expect(ed.getExpandedText()).toBe(content)
    expect(ed.getText()).not.toBe(content) // still the compact marker, not the body
  })

  it('(D2) deleting the lowest paste id renumbers content order-independently', () => {
    const ed = new Editor(makeTui(), theme, { prompt: PROMPT })
    const A = bigPaste('A')
    const B = bigPaste('B')
    const C = bigPaste('C')
    // Insert each at col 0 so text order is id-DESCENDING: [#3 C][#2 B][#1 A].
    ed.handlePaste(A)
    ed.state.cursorCol = 0
    ed.handlePaste(B)
    ed.state.cursorCol = 0
    ed.handlePaste(C)
    // Sanity: three markers, text order #3,#2,#1, all expand correctly pre-delete.
    expect(ed.getExpandedText()).toBe(C + B + A)
    // Delete the lowest id (#1 = A): cursor to end-of-line, backspace the marker.
    ed.state.cursorCol = ed.getLines()[0]!.length
    ed.handleBackspace()
    const expanded = ed.getExpandedText()
    // Survivors keep their OWN content; A is gone; no residual literal marker.
    expect(expanded).toBe(C + B)
    expect(expanded).not.toContain('A')
    expect(expanded).not.toContain('[paste #')
  })
})

describe('(D3) autocomplete request chain tolerates provider rejection', () => {
  it('a rejected request neither throws to the caller nor poisons the next request', async () => {
    const ed = new Editor(makeTui(), theme, { prompt: PROMPT })
    let calls = 0
    const empty: AutocompleteSuggestions = { items: [], prefix: '' }
    const provider: AutocompleteProvider = {
      triggerCharacters: [],
      async getSuggestions() {
        calls++
        if (calls === 1) throw new Error('provider boom')
        return empty
      },
      applyCompletion(lines, cursorLine, cursorCol) {
        return { lines, cursorLine, cursorCol }
      },
    }
    ed.setAutocompleteProvider(provider)
    const drive = (): Promise<void> => {
      ed.autocompleteStartToken++
      return ed.startAutocompleteRequest(ed.autocompleteStartToken, { force: false, explicitTab: false })
    }
    // First request's provider call rejects — must not surface to the caller.
    await expect(drive()).resolves.toBeUndefined()
    // The serialized chain must not be left rejected (would re-throw on next await).
    await expect(ed.autocompleteRequestTask).resolves.toBeUndefined()
    // Second request runs the provider again and completes normally.
    await expect(drive()).resolves.toBeUndefined()
    expect(calls).toBe(2)
  })
})
