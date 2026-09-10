/**
 * LaTeX-in-transcript is satisfied by the PLATFORM: pi-tui 0.85.1's Markdown
 * renders LaTeX by default (renderLatex ?? raw fallback), and the transcript's
 * assistant text uses default MarkdownOptions (no renderLatex:false override).
 *
 * These tests drive the SHIPPED transcript construction (assistantTextMarkdown —
 * the exact component the assistant response text renders through), and assert
 * the EXACT rendered string per case. Exact equality is deliberate: it proves
 * rendering (x^2 -> x²), COMPLETE delimiter removal, COMPLETE raw fallback (no
 * dropped chars), and non-mangling of non-math — the whole Stage A2 floor — in
 * one assertion, so a renderer regression cannot slip past a substring check.
 * A failure here is a platform limitation to surface (defer LaTeX) — NOT a cue
 * to add a custom scanner.
 */
import { describe, it, expect } from 'vitest'
import { createPalette, markdownTheme } from '../src/components/theme.ts'
import { assistantTextMarkdown } from '../src/components/transcript.ts'

const stripAnsi = (s: string): string => s.replace(/\x1B\[[0-9;]*m/g, '')

// createPalette(false) = no-color palette; markdownTheme is the real transcript
// theme. LaTeX tokenization/rendering is theme-independent — this is the shipped
// construction with its default (LaTeX-on) options.
const palette = createPalette(false)
const mdTheme = markdownTheme(palette)

/** Render assistant Markdown exactly as the transcript does, trimmed to text. */
function md(source: string): string {
  return assistantTextMarkdown(source, palette, mdTheme)
    .render(80)
    .map(line => stripAnsi(line).replace(/\s+$/, ''))
    .join('\n')
    .trim()
}

describe('LaTeX renders via the shipped transcript Markdown (default on)', () => {
  // x^2 -> x² is a transform ONLY the LaTeX tokenizer produces; exact equality
  // also proves the delimiters are gone for every form.
  it('renders inline $…$ math to Unicode, delimiters removed', () => {
    expect(md('energy $E=mc^2$ ok')).toBe('energy E = mc² ok')
  })
  it('renders inline \\(…\\) math to Unicode, delimiters removed', () => {
    expect(md('sum \\(x^2\\) done')).toBe('sum x² done')
  })
  it('renders display $$…$$ math to Unicode, delimiters removed', () => {
    expect(md('$$x^2$$')).toBe('x²')
  })
  it('renders display \\[…\\] math to Unicode, delimiters removed', () => {
    expect(md('\\[x^2\\]')).toBe('x²')
  })
})

describe('LaTeX floor: content is never dropped, non-math is never mangled', () => {
  it('falls back to the COMPLETE raw source for unsupported math (nothing dropped)', () => {
    expect(md('see $\\weirdcommand{q}$ here')).toBe('see $\\weirdcommand{q}$ here')
  })
  it('leaves currency literal ($5 and $6 is not math)', () => {
    expect(md('it cost $5 and $6 total')).toBe('it cost $5 and $6 total')
  })
  it('leaves an env-var-like $VAR literal', () => {
    expect(md('run with $PATH set')).toBe('run with $PATH set')
  })
  it('treats an escaped \\$ as a literal dollar, not a delimiter', () => {
    expect(md('price \\$5 today')).toBe('price $5 today')
  })
  it('never treats $…$ inside an inline code span as math', () => {
    expect(md('use `$x$` inline')).toBe('use $x$ inline')
  })
  it('never treats $…$ inside a fenced code block as math', () => {
    expect(md('```\n$y = z$\n```')).toBe('$y = z$')
  })
})
