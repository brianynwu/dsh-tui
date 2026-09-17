import { describe, expect, it } from 'vitest'
import { ContextCardComponent } from '../src/components/transcript.ts'
import { createPalette } from '../src/components/theme.ts'

describe('injected context visibility', () => {
  it('collapses by default, expands in full, and hides without leaving a spacer', () => {
    const card = new ContextCardComponent(
      'agent-instructions',
      '<system-reminder>\nline one\nline two\nline three\nline four\n</system-reminder>',
      2,
      createPalette(false),
    )
    const collapsed = card.render(50)
    expect(collapsed[0]).toBe('')
    expect(collapsed.join('\n')).toContain('Context · agent-instructions')
    expect(collapsed.join('\n')).toContain('Alt+C to expand')
    expect(collapsed.join('\n')).not.toContain('<system-reminder>')
    card.setVisibility('hidden')
    expect(card.render(50)).toEqual([])
    card.setVisibility('expanded')
    const expanded = card.render(50).join('\n')
    expect(expanded).toContain('line four')
    expect(expanded).not.toContain('Alt+C to expand')
    card.setVisibility('collapsed')
    expect(card.render(50)).toEqual(collapsed)
  })

  it('hides an empty framed body without an orphaned gap', () => {
    const card = new ContextCardComponent('skill-catalog', '', 2, createPalette(false))
    expect(card.render(50)).toEqual(['', 'Context · skill-catalog'])
    card.setVisibility('hidden')
    expect(card.render(50)).toEqual([])
  })
})
