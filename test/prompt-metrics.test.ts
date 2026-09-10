/**
 * The single status line above the editor shows the worktree branch with the
 * session-level metrics (model, token meter, context%). CWD and Session ID live
 * in the dashboard pane's `meta` column, but the `cwd`/`session` prompt values
 * stay registered so a custom template can still reference them. These tests pin
 * the default left-prompt composition and the `${session}` value's still-supported
 * interpolation; live rendering/placement is covered by
 * attended live-verify, and `${context}`'s population depends on the model's
 * configured contextWindow reaching the llm adapter (set/verified separately).
 */
import { describe, it, expect } from 'vitest'
import { resolveTuiConfig } from '../src/config.ts'
import { parseTuiPromptTemplate, renderTuiPromptTemplate } from '../src/prompt.ts'
import { formatContextLabel } from '../src/chat/tokens.ts'

function valueNames(template: string): string[] {
  return parseTuiPromptTemplate(template)
    .filter((t): t is { kind: 'value'; name: string } => t.kind === 'value')
    .map(t => t.name)
}

describe('default status line composition', () => {
  it('shows worktree + session-level metrics in the left prompt (cwd/session moved to the pane)', () => {
    expect(valueNames(resolveTuiConfig(undefined).theme.leftPrompt)).toEqual([
      'git/worktree', 'model', 'token_meter/cache_hit_rate', 'context',
    ])
  })

  it('respects a user override through the resolver path (cwd/session still referenceable)', () => {
    const custom = '${cwd} ${session}'
    expect(resolveTuiConfig({ theme: { leftPrompt: custom } }).theme.leftPrompt).toBe(custom)
  })
})

describe('formatContextLabel — percentage + used/total breakdown', () => {
  it('shows the fill percent and the compact used/total tokens', () => {
    expect(formatContextLabel(59_000, 131_072)).toBe('45% context (59k/131k)')
  })

  it('reflects a larger (real) context window', () => {
    expect(formatContextLabel(420_000, 1_048_576)).toBe('40% context (420k/1.0m)')
  })

  it('clamps an over-window measurement to 100%', () => {
    expect(formatContextLabel(200_000, 131_072)).toBe('100% context (200k/131k)')
  })
})

describe('${session} template rendering', () => {
  it('interpolates the session value when available', () => {
    const tokens = parseTuiPromptTemplate('${session}')
    const rendered = renderTuiPromptTemplate(tokens, name => (name === 'session' ? '  main-session-abc' : undefined))
    expect(rendered).toBe('  main-session-abc')
  })

  it('drops the session token and its trailing separator when unavailable', () => {
    // renderTuiPromptTemplate strips whitespace FOLLOWING an unavailable value.
    const tokens = parseTuiPromptTemplate('${session} ${model}')
    const rendered = renderTuiPromptTemplate(tokens, name => (name === 'model' ? 'gpt' : undefined))
    expect(rendered).toBe('gpt')
  })
})
