import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, symlinkSync, writeFileSync, chmodSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import type { TUI, SelectListTheme } from '@earendil-works/pi-tui'
import { HistoryStore, HISTORY_MAX_ENTRIES, HISTORY_MAX_RECORD_BYTES } from '../src/chat/history-store.ts'
import { Editor, type EditorTheme } from '../src/vendor/editor.ts'

const roots: string[] = []
const tempRoot = (): string => {
  const path = mkdtempSync(join(tmpdir(), 'dsh-history-'))
  roots.push(path)
  return path
}
afterEach(async () => {
  const { rmSync } = await import('node:fs')
  for (const path of roots.splice(0)) rmSync(path, { recursive: true, force: true })
})

describe('prompt history store', () => {
  it('publishes the original text in private immutable records and ignores unfinished/corrupt files', () => {
    const directory = join(tempRoot(), 'history')
    const store = new HistoryStore(directory)
    expect(store.append('  original prompt  ')).toBe(true)
    const names = readdirSync(directory)
    expect(names).toHaveLength(1)
    expect(JSON.parse(readFileSync(join(directory, names[0]!), 'utf8')).text).toBe('  original prompt  ')
    writeFileSync(join(directory, '.tmp-aborted'), '{"v":1,')
    writeFileSync(join(directory, '0000000000001-00000000000000000000000000000000.json'), '{"v":1,')
    expect(store.load()).toEqual(['  original prompt  '])
    expect(store.append('x'.repeat(HISTORY_MAX_RECORD_BYTES))).toBe(false)
    expect(store.load()).toEqual(['  original prompt  '])
  })

  it('bounds retention and refuses a symlinked history directory', () => {
    const root = tempRoot()
    const directory = join(root, 'history')
    mkdirSync(directory)
    for (let index = 0; index < HISTORY_MAX_ENTRIES + 3; index += 1) {
      const name = `${String(index).padStart(13, '0')}-${String(index).padStart(32, '0')}.json`
      writeFileSync(join(directory, name), JSON.stringify({ v: 1, text: `prompt ${index}` }), { mode: 0o600 })
    }
    const store = new HistoryStore(directory)
    expect(store.load()).toHaveLength(HISTORY_MAX_ENTRIES)
    expect(store.load()[0]).toBe(`prompt ${HISTORY_MAX_ENTRIES + 2}`)
    expect(readdirSync(directory).filter(name => name.endsWith('.json'))).toHaveLength(HISTORY_MAX_ENTRIES)
    symlinkSync(directory, join(root, 'linked'))
    expect(() => new HistoryStore(join(root, 'linked')).load()).toThrow(/Unsafe/)
  })

  it('keeps concurrent writers without a shared-file lost update', async () => {
    const directory = join(tempRoot(), 'history')
    const moduleUrl = pathToFileURL(resolve('src/chat/history-store.ts')).href
    const script = `import { HistoryStore } from ${JSON.stringify(moduleUrl)}; const store = new HistoryStore(process.argv[1]); for (let i = 0; i < 20; i++) store.append(process.argv[2] + i);`
    const run = (prefix: string): Promise<void> => new Promise((done, fail) => {
      const child = spawn(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', script, directory, prefix], { stdio: 'ignore' })
      child.once('error', fail)
      child.once('exit', code => code === 0 ? done() : fail(new Error(`writer exited ${code}`)))
    })
    await Promise.all([run('A'), run('B')])
    const entries = new HistoryStore(directory).load()
    expect(entries).toHaveLength(40)
    for (let index = 0; index < 20; index += 1) {
      expect(entries).toContain(`A${index}`)
      expect(entries).toContain(`B${index}`)
    }
  })

  it('honors DSH_HOME and reports inaccessible storage to the caller', () => {
    const root = tempRoot()
    const previous = process.env.DSH_HOME
    process.env.DSH_HOME = root
    try {
      expect(new HistoryStore().directory).toBe(join(root, 'tui', 'prompt-history'))
    } finally {
      if (previous === undefined) delete process.env.DSH_HOME
      else process.env.DSH_HOME = previous
    }
    const file = join(root, 'file')
    writeFileSync(file, '')
    expect(() => new HistoryStore(join(file, 'history')).load()).toThrow()
    chmodSync(root, 0o700)
  })
})

describe('vendored editor history adapter', () => {
  it('refreshes once before an Up sequence and restores the unsent draft', () => {
    const tui = { terminal: { rows: 24, columns: 80 }, requestRender() {} } as unknown as TUI
    const theme: EditorTheme = { borderColor: value => value, selectList: {} as SelectListTheme }
    const editor = new Editor(tui, theme)
    editor.setText('unsent draft')
    let calls = 0
    editor.onHistoryNavigationStart = () => {
      calls += 1
      return calls === 1 ? ['new external', 'older'] : ['later external']
    }
    editor.navigateHistory(-1)
    expect(editor.getText()).toBe('new external')
    editor.navigateHistory(-1)
    expect(editor.getText()).toBe('older')
    expect(calls).toBe(1)
    editor.navigateHistory(1)
    editor.navigateHistory(1)
    expect(editor.getText()).toBe('unsent draft')
    editor.navigateHistory(-1)
    expect(editor.getText()).toBe('later external')
    expect(calls).toBe(2)
  })
})
