/**
 * The exit resume-hint is a launcher-owned config seam (`Config.resumeHint`),
 * NOT a hard-coded line: stock deployments print the default
 * `dsh --profile tui --resume=<id>` command, while a custom launcher whose
 * DSH_HOME/session-root differs overrides the wording (or suppresses it). These
 * tests pin the two halves that production wiring (index.ts `apply`, v8-ignored)
 * composes: the schema default that keeps stock output byte-identical, and the
 * pure `formatResumeHint` interpolation/suppression branches.
 */
import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { Config, DEFAULT_RESUME_HINT, formatResumeHint } from '../src/config.ts'

describe('Config.resumeHint default', () => {
  it('applies the stock command when resumeHint is unset', () => {
    expect(Config({}).resumeHint).toBe(DEFAULT_RESUME_HINT)
    expect(DEFAULT_RESUME_HINT).toBe('To resume this session: dsh --profile tui --resume={session}')
  })

  it('keeps an explicit override (including an empty string)', () => {
    expect(Config({ resumeHint: 'custom {session}' }).resumeHint).toBe('custom {session}')
    expect(Config({ resumeHint: '' }).resumeHint).toBe('')
  })
})

describe('formatResumeHint', () => {
  const id = 'main-session-abc'

  it('interpolates the default template into the stock command', () => {
    expect(formatResumeHint(DEFAULT_RESUME_HINT, id))
      .toBe('To resume this session: dsh --profile tui --resume=main-session-abc')
  })

  it('replaces every {session} occurrence', () => {
    expect(formatResumeHint('{session} then {session}', id)).toBe('main-session-abc then main-session-abc')
  })

  it('passes a custom template without {session} through verbatim', () => {
    expect(formatResumeHint('see the capture log', id)).toBe('see the capture log')
  })

  it('suppresses on an empty or whitespace template', () => {
    expect(formatResumeHint('', id)).toBeUndefined()
    expect(formatResumeHint('   ', id)).toBeUndefined()
  })

  it('suppresses when no template is set', () => {
    expect(formatResumeHint(undefined, id)).toBeUndefined()
  })

  it('suppresses when no session was minted (e.g. --help)', () => {
    expect(formatResumeHint(DEFAULT_RESUME_HINT, undefined)).toBeUndefined()
  })
})

describe('cordis.patch.yml resumeHint env seam', () => {
  // The bundled `tui` row wires resumeHint from DSH_TUI_RESUME_HINT with a literal fallback (a launcher
  // overriding via a tui --patch would replace the whole config block, so an env seam is used). That literal
  // must stay identical to DEFAULT_RESUME_HINT — this guards the two homes of the string from drifting apart.
  it('falls back to exactly DEFAULT_RESUME_HINT when the env var is unset', () => {
    const patch = readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
    const match = patch.match(/resumeHint:\s*!!js "process\.env\.DSH_TUI_RESUME_HINT \?\? '([^']*)'"/)
    expect(match, 'resumeHint env-seam line present in cordis.patch.yml').not.toBeNull()
    expect(match?.[1]).toBe(DEFAULT_RESUME_HINT)
  })
})
