import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { listDir, readFilePreview, resolveInside, READ_MAX_BYTES } from '../src/browse.js'

/**
 * 单元内浏览的三条判据：走出容器根的路径一律拒收；清单缺一 size 不缺一项；
 * 原文截断与二进制各按各的旗子说。路径这一组是安全边界，用例钉死比什么都重。
 */

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'gwb-browse-'))
}

describe('resolveInside：根内的路才放行', () => {
  const root = path.resolve('/fake-root')

  it('根内的绝对路径、相对路径、正反斜杠混写都放行', () => {
    expect(resolveInside(root, path.join(root, '26090412vav'))).toBe(path.resolve(root, '26090412vav'))
    expect(resolveInside(root, '26090412vav/unit.json')).toBe(path.resolve(root, '26090412vav/unit.json'))
    expect(resolveInside(root, root + '\\a/b')).toBe(path.resolve(root, 'a/b'))
  })

  it('根自己不算「根内」——容器根的清单归 unit-folder.list 管', () => {
    expect(resolveInside(root, root)).toBeNull()
    expect(resolveInside(root, '')).toBeNull()
  })

  it('穿越（..、兄弟目录、换盘符、绝对外路径）一律拒收', () => {
    expect(resolveInside(root, '../outside')).toBeNull()
    expect(resolveInside(root, path.join(root, 'a', '..', '..', 'b'))).toBeNull()
    expect(resolveInside(root, path.resolve(path.dirname(root), 'sibling'))).toBeNull()
    const otherDrive = root === path.resolve(root) ? 'C:\\elsewhere' : path.resolve('/elsewhere')
    if (/^[a-zA-Z]:/.test(root)) expect(resolveInside(root, otherDrive)).toBeNull()
  })

  it('不是非空字符串的都拒收', () => {
    expect(resolveInside(root, undefined)).toBeNull()
    expect(resolveInside(root, null)).toBeNull()
    expect(resolveInside(root, 42)).toBeNull()
    expect(resolveInside(root, '   ')).toBeNull()
  })
})

describe('listDir：一层清单', () => {
  it('目录在前、文件在后，文件带 size', () => {
    const dir = tmpDir()
    fs.writeFileSync(path.join(dir, 'b.txt'), 'hello')
    fs.writeFileSync(path.join(dir, 'a.txt'), 'x')
    fs.mkdirSync(path.join(dir, 'zz-dir'))
    fs.mkdirSync(path.join(dir, 'aa-dir'))

    const outcome = listDir(dir)
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.entries.map((e) => e.name)).toEqual(['aa-dir', 'zz-dir', 'a.txt', 'b.txt'])
    const file = outcome.entries.find((e) => e.name === 'a.txt')
    expect(file?.size).toBe(1)
    const dirEntry = outcome.entries.find((e) => e.name === 'aa-dir')
    expect(dirEntry?.type).toBe('dir')
    expect(dirEntry?.size).toBeUndefined()
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('列不动如实报错', () => {
    const outcome = listDir(path.join(tmpDir(), 'no-such-dir'))
    expect(outcome.ok).toBe(false)
    if (outcome.ok) return
    expect(outcome.error).toContain('no-such-dir')
  })
})

describe('readFilePreview：原文预览', () => {
  it('读全文，size 与 truncated 如实', () => {
    const dir = tmpDir()
    const file = path.join(dir, 'a.txt')
    fs.writeFileSync(file, '第一行\n第二行\n')
    const outcome = readFilePreview(file)
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.data.text).toBe('第一行\n第二行\n')
    expect(outcome.data.truncated).toBe(false)
    expect(outcome.data.binary).toBe(false)
    expect(outcome.data.size).toBe(Buffer.byteLength('第一行\n第二行\n'))
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('超过上限截断，truncated 明说', () => {
    const dir = tmpDir()
    const file = path.join(dir, 'big.txt')
    fs.writeFileSync(file, 'x'.repeat(READ_MAX_BYTES + 100))
    const outcome = readFilePreview(file)
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.data.truncated).toBe(true)
    expect(outcome.data.size).toBe(READ_MAX_BYTES + 100)
    expect(Buffer.byteLength(outcome.data.text)).toBeLessThanOrEqual(READ_MAX_BYTES)
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('前 8KB 含 NUL 判二进制，回空串不回乱码', () => {
    const dir = tmpDir()
    const file = path.join(dir, 'bin.dat')
    fs.writeFileSync(file, Buffer.concat([Buffer.from([0x01, 0x00, 0x02]), Buffer.alloc(100, 0x41)]))
    const outcome = readFilePreview(file)
    expect(outcome.ok).toBe(true)
    if (!outcome.ok) return
    expect(outcome.data.binary).toBe(true)
    expect(outcome.data.text).toBe('')
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('不是文件与不存在各回各的错', () => {
    const dir = tmpDir()
    expect(readFilePreview(dir).ok).toBe(false)
    expect(readFilePreview(path.join(dir, 'missing.txt')).ok).toBe(false)
    fs.rmSync(dir, { recursive: true, force: true })
  })
})
