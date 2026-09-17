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
    expect(resolveTuiConfig(parsed).showReasoning).toBe(false)
  })
})

describe('stock reasoning render baseline for the next change', () => {
  it('renders the settled assistant message exactly as before C1', () => {
    const palette = createPalette(false)
    const component = new StreamingAssistantComponent(
      { turn: 0, step: 0 },
      () => [],
      new StepTimingTracker(),
      () => 0,
      resolveTuiConfig(undefined).showReasoning,
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
