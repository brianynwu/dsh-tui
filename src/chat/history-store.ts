/** Bounded, cross-process prompt history under the core's DSH_HOME root. */
import { randomBytes } from 'node:crypto'
import {
  chmodSync, closeSync, constants, fstatSync, lstatSync, mkdirSync,
  openSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'

export const HISTORY_MAX_ENTRIES = 500
export const HISTORY_MAX_BYTES = 1024 * 1024
export const HISTORY_MAX_RECORD_BYTES = 64 * 1024

const FILE_NAME = /^(\d{13})-([0-9a-f]{32})\.json$/u

interface HistoryRecord {
  name: string
  text: string
  bytes: number
}

/** Files are immutable; each writer publishes its own uniquely named record. */
export class HistoryStore {
  readonly directory: string

  constructor(directory = dshHomePath('tui', 'prompt-history')) {
    this.directory = directory
  }

  private ensureDirectory(): void {
    mkdirSync(this.directory, { recursive: true, mode: 0o700 })
    const stat = lstatSync(this.directory)
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Unsafe history directory')
    if (process.getuid !== undefined && stat.uid !== process.getuid()) throw new Error('History directory owner mismatch')
    if ((stat.mode & 0o077) !== 0) chmodSync(this.directory, 0o700)
  }

  private readRecord(name: string): HistoryRecord | undefined {
    if (!FILE_NAME.test(name)) return undefined
    let fd: number | undefined
    try {
      fd = openSync(join(this.directory, name), constants.O_RDONLY | constants.O_NOFOLLOW)
      const stat = fstatSync(fd)
      if (!stat.isFile() || stat.size > HISTORY_MAX_RECORD_BYTES || (stat.mode & 0o077) !== 0) return undefined
      if (process.getuid !== undefined && stat.uid !== process.getuid()) return undefined
      const raw = readFileSync(fd, 'utf8')
      if (Buffer.byteLength(raw) > HISTORY_MAX_RECORD_BYTES) return undefined
      const parsed: unknown = JSON.parse(raw)
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return undefined
      const record = parsed as { v?: unknown; text?: unknown }
      if (record.v !== 1 || typeof record.text !== 'string' || record.text.trim() === '') return undefined
      if (Object.keys(record).length !== 2) return undefined
      return { name, text: record.text, bytes: Buffer.byteLength(raw) }
    } catch (error) {
      // A concurrent prune may remove a file between readdir and open;
      // malformed or truncated JSON is ignored. Permission and disk failures
      // reach the caller, which emits a bounded notice without the raw path.
      if (error instanceof SyntaxError) return undefined
      if (error instanceof Error && 'code' in error && (error.code === 'ENOENT' || error.code === 'ELOOP')) return undefined
      throw error
    } finally {
      if (fd !== undefined) closeSync(fd)
    }
  }

  /** Newest first. Prune the oldest complete records under both ceilings. */
  load(): string[] {
    this.ensureDirectory()
    const records = readdirSync(this.directory)
      .filter(name => FILE_NAME.test(name))
      .sort()
      .flatMap(name => {
        const record = this.readRecord(name)
        return record === undefined ? [] : [record]
      })
    let bytes = records.reduce((sum, record) => sum + record.bytes, 0)
    while (records.length > HISTORY_MAX_ENTRIES || bytes > HISTORY_MAX_BYTES) {
      const oldest = records.shift()
      if (oldest === undefined) break
      bytes -= oldest.bytes
      try { unlinkSync(join(this.directory, oldest.name)) } catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
      }
    }
    return records.reverse().map(record => record.text)
  }

  /** Publish the submitted text atomically; oversized prompts remain sendable in memory. */
  append(text: string): boolean {
    if (text.trim() === '') return false
    const body = JSON.stringify({ v: 1, text })
    if (Buffer.byteLength(body) > HISTORY_MAX_RECORD_BYTES) return false
    this.ensureDirectory()
    const stamp = String(Date.now()).padStart(13, '0')
    const suffix = randomBytes(16).toString('hex')
    const name = `${stamp}-${suffix}.json`
    const temporary = join(this.directory, `.tmp-${suffix}`)
    try {
      writeFileSync(temporary, body, { flag: 'wx', mode: 0o600 })
      renameSync(temporary, join(this.directory, name))
    } catch (error) {
      try { unlinkSync(temporary) } catch { /* absent after failed create or rename */ }
      throw error
    }
    this.load() // bounded, eventually consistent pruning under concurrent writers
    return true
  }
}
