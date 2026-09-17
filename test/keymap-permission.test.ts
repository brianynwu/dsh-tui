import { describe, expect, it } from 'vitest'
import type { Session } from '@deepseek-ai/dsh-session'
import { TuiKeymap, parseBinding, resolveKeymap } from '../src/chat/keymap.ts'
import { createPermissionModeController } from '../src/chat/permission-mode.ts'
import { createPalette } from '../src/components/theme.ts'

describe('composer keymap', () => {
  it('keeps the existing actions and adds Shift+Tab without stealing modal input', () => {
    const keys = new TuiKeymap()
    expect(keys.resolve('\x14')).toBe('cards')
    expect(keys.resolve('\x0f')).toBe('tools')
    expect(keys.resolve('\x12')).toBe('reasoning')
    expect(keys.resolve('\x0c')).toBe('redraw')
    expect(keys.resolve('\x1b')).toBe('cancel')
    expect(keys.resolve('\x03')).toBe('interruptOrExit')
    expect(keys.resolve('\x04')).toBe('exit')
    expect(keys.resolve('\x1b[Z')).toBe('cyclePermission')
    expect(keys.resolve('\x1b[Z', 'modal')).toBeUndefined()
    expect(keys.resolve('\x1b', 'modal')).toBeUndefined()
  })

  it('remaps atomically and retains the prior safety routes on invalid reload', () => {
    const keys = new TuiKeymap({ cards: 'ctrl+g' })
    expect(keys.resolve('\x07')).toBe('cards')
    expect(() => keys.replace({ cards: 'ctrl+g', exit: 'ctrl+g' })).toThrow(/Duplicate/)
    expect(keys.resolve('\x04')).toBe('exit')
    expect(keys.resolve('\x07')).toBe('cards')
    expect(() => keys.replace({ cancel: '' })).toThrow()
    expect(keys.resolve('\x1b')).toBe('cancel')
  })

  it('rejects malformed, duplicate, unsupported and unknown bindings', () => {
    expect(parseBinding('shift+tab')).toBe('shift+tab')
    expect(parseBinding('ctrl+shift+pageUp')).toBe('shift+ctrl+pageUp')
    for (const input of ['ctrl+bogus', 'ctrl+ctrl+d', 'shift+escape', 'ctrl+', 'ctrl++']) {
      expect(() => parseBinding(input)).toThrow()
    }
    expect(() => resolveKeymap({ nonexistent: 'ctrl+x' })).toThrow(/Unknown/)
    expect(() => resolveKeymap({ cancel: 'esc', exit: 'escape' })).toThrow(/Duplicate/)
  })
})

describe('permission mode controller', () => {
  const session = {} as Session
  const palette = createPalette(false)

  it('reads core state on each view and cycles through the core command path', async () => {
    const names = ['read-only', 'workspace-write', 'danger-full-access']
    let current = names[0] as string
    const commands: string[] = []
    const controller = createPermissionModeController(
      { names, current: () => current }, session, palette,
      async command => { commands.push(command); current = command.slice('/permission '.length) },
      () => {},
    )
    expect(controller.label()).toContain('read-only')
    await Promise.all([controller.cycle(), controller.cycle()])
    expect(commands).toEqual(['/permission workspace-write', '/permission danger-full-access'])
    expect(controller.current()).toBe('danger-full-access')
    current = 'read-only' // external change: no fork-local shadow state
    expect(controller.label()).toContain('read-only')
    await controller.cycle()
    expect(commands.at(-1)).toBe('/permission workspace-write')
  })

  it('displays custom but requires explicit command selection before changing it', async () => {
    const commands: string[] = []
    const notices: string[] = []
    const controller = createPermissionModeController(
      { names: ['read-only', 'danger-full-access'], current: () => 'custom' },
      session, palette,
      async command => { commands.push(command) },
      notice => { notices.push(notice) },
    )
    expect(controller.label()).toContain('custom')
    await controller.cycle()
    expect(commands).toEqual([])
    expect(notices[0]).toContain('/permission <name>')
  })
})
