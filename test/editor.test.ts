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
import type { SelectListTheme } from '@earendil-works/pi-tui'
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
