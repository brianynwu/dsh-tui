import { describe, expect, it } from 'vitest'
import { Config, TuiConfigSchema, resolveTuiConfig } from '../src/config.ts'
import { StepTimingTracker } from '../src/chat/timing.ts'
import { StreamingAssistantComponent } from '../src/components/transcript.ts'
import { createPalette, markdownTheme } from '../src/components/theme.ts'

describe('tool-card startup visibility', () => {
  it('keeps the stock collapsed default through both schemas and direct resolution', () => {
    expect(TuiConfigSchema({}).toolCardVisibility).toBe('collapsed')
    expect(Config({}).toolCardVisibility).toBe('collapsed')
    expect(resolveTuiConfig(undefined).toolCardVisibility).toBe('collapsed')
    expect(resolveTuiConfig(Config({})).toolCardVisibility).toBe('collapsed')
  })

  it.each(['hidden', 'collapsed', 'expanded'] as const)('accepts %s through the loader and resolver', visibility => {
    const parsed = Config({ toolCardVisibility: visibility })
    expect(parsed.toolCardVisibility).toBe(visibility)
    expect(resolveTuiConfig(parsed).toolCardVisibility).toBe(visibility)
  })

  it('rejects an invalid visibility at the loader boundary', () => {
    expect(() => Config({ toolCardVisibility: 'visible' })).toThrow()
    expect(() => TuiConfigSchema({ toolCardVisibility: 'visible' })).toThrow()
  })

  it('keeps the existing showReasoning false setting intact', () => {
    const parsed = Config({ showReasoning: false })
    expect(resolveTuiConfig(parsed).reasoningFold).toBe('off')
  })
})

describe('context-card startup visibility', () => {
  it('defaults to collapsed independently of tool cards', () => {
    expect(TuiConfigSchema({}).contextVisibility).toBe('collapsed')
    expect(Config({}).contextVisibility).toBe('collapsed')
    expect(resolveTuiConfig({ toolCardVisibility: 'expanded' }).contextVisibility).toBe('collapsed')
  })

  it.each(['hidden', 'collapsed', 'expanded'] as const)('accepts %s through both schemas', visibility => {
    expect(TuiConfigSchema({ contextVisibility: visibility }).contextVisibility).toBe(visibility)
    expect(resolveTuiConfig(Config({ contextVisibility: visibility })).contextVisibility).toBe(visibility)
  })

  it('rejects an invalid mode', () => {
    expect(() => Config({ contextVisibility: 'off' })).toThrow()
  })
})

describe('reasoning fold configuration', () => {
  it('keeps the optional schema field unset while resolving stock to full', () => {
    expect(TuiConfigSchema({}).reasoningFold).toBeUndefined()
    expect(Config({}).reasoningFold).toBeUndefined()
    expect(resolveTuiConfig(undefined).reasoningFold).toBe('full')
    expect(resolveTuiConfig(Config({})).reasoningFold).toBe('full')
  })

  it.each(['off', 'preview', 'full'] as const)('accepts explicit %s over the legacy alias', fold => {
    const parsed = Config({ reasoningFold: fold, showReasoning: fold === 'off' })
    expect(resolveTuiConfig(parsed).reasoningFold).toBe(fold)
  })

  it('rejects an invalid fold at both schema boundaries', () => {
    expect(() => TuiConfigSchema({ reasoningFold: 'collapsed' })).toThrow()
    expect(() => Config({ reasoningFold: 'collapsed' })).toThrow()
  })

  it('preserves the legacy true and false meanings for direct callers', () => {
    expect(resolveTuiConfig({ showReasoning: true }).reasoningFold).toBe('full')
    expect(resolveTuiConfig({ showReasoning: false }).reasoningFold).toBe('off')
  })
})

describe('stock reasoning render baseline captured at C1', () => {
  it('renders the settled assistant message exactly as before C2', () => {
    const palette = createPalette(false)
    const component = new StreamingAssistantComponent(
      { turn: 0, step: 0 },
      () => [],
      new StepTimingTracker(),
      () => 0,
      resolveTuiConfig(undefined).reasoningFold,
      palette,
      markdownTheme(palette),
    )
    component.settle([
      { type: 'reasoning', text: 'First premise.\nSecond premise.' },
      { type: 'text', text: 'Answer.' },
    ])

    expect(component.render(80)).toEqual([
      '',
      'Assistant'.padEnd(80),
      'Reasoning'.padEnd(80),
      'First premise.'.padEnd(80),
      'Second premise.'.padEnd(80),
      'Answer.'.padEnd(80),
    ])
  })
})
