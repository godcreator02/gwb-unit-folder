import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createUnit, createdAtOf, idOf } from '../src/create.js'
import { IDENTITY_FILE, readIdentity } from '../src/scan.js'

/** 建单元落真临时目录：这一层做的就是「盘上多了什么」 */
let container: string

beforeEach(() => {
  container = fs.mkdtempSync(path.join(os.tmpdir(), 'gwb-create-'))
})
afterEach(() => {
  fs.rmSync(container, { recursive: true, force: true })
})

const input = { kind: '插件仓', title: 'gwb-foo', purpose: '一句话说清它做什么', icon: 'puzzle' }
const now = new Date(2026, 8, 17, 9, 5, 7)

/** 依次吐出给定的数；吐完从头再来 */
function sequence(...values: number[]): () => number {
  let i = 0
  return () => values[i++ % values.length]!
}

describe('目录名与时间的格式', () => {
  it('随机段五位，取自 0-9a-z', () => {
    // 0 → '0'；0.5×36=18 → 'i'；0.999×36→35 → 'z'
    expect(idOf(sequence(0, 0.5, 0.999, 0, 0.5))).toBe('0iz0i')
  })

  it('createdAt 是 ISO 8601 带本机偏移', () => {
    expect(createdAtOf(now)).toMatch(/^2026-09-17T09:05:07[+-]\d{2}:\d{2}$/)
  })
})

describe('createUnit：建目录、写出生证', () => {
  it('不给 slug 就只有随机段', () => {
    const outcome = createUnit(container, input, { now, random: sequence(0, 0, 0, 0, 0) })
    if (!outcome.ok) throw new Error(outcome.error)
    expect(outcome.data.name).toBe('00000')
    expect(outcome.data.path).toBe(path.join(container, '00000'))
    const read = readIdentity(outcome.data.path)
    expect(read).toEqual({ status: 'claimed', identity: outcome.data.identity })
    expect(outcome.data.identity).toMatchObject({ ...input, status: 'active' })
  })

  it('给了 slug 就拼成 <id>-<slug>', () => {
    const outcome = createUnit(container, { ...input, slug: 'gwb-test' }, { now, random: sequence(0, 0, 0, 0, 0) })
    expect(outcome.ok && outcome.data.name).toBe('00000-gwb-test')
  })

  it('status 给了就用给的', () => {
    const outcome = createUnit(container, { ...input, status: 'paused' }, { now })
    expect(outcome.ok && outcome.data.identity.status).toBe('paused')
  })

  it('slug 不合规一个目录都不建，说得出为什么', () => {
    for (const [label, slug] of [
      ['带路径分隔', 'a/b'],
      ['想往上走', '..'],
      ['大写', 'GWB'],
      ['空格', 'gwb test'],
      ['开头连字符', '-gwb'],
      ['结尾连字符', 'gwb-'],
      ['连着两个连字符', 'gwb--test'],
      ['超长', 'a'.repeat(33)],
      ['不是字符串', 42],
    ] as const) {
      const outcome = createUnit(container, { ...input, slug }, { now })
      expect(outcome.ok, label).toBe(false)
      expect((outcome as { error: string }).error, label).toContain('slug')
    }
    expect(fs.readdirSync(container)).toEqual([])
  })

  it('slug 省了与给空串等价：都只有随机段', () => {
    const a = createUnit(container, { ...input, slug: '' }, { now, random: sequence(0, 0, 0, 0, 0) })
    const b = createUnit(container, { ...input, slug: undefined }, { now, random: sequence(0.1, 0, 0, 0, 0) })
    expect(a.ok && a.data.name).toBe('00000')
    expect(b.ok && b.data.name).toBe('30000')
  })

  it('撞名重摇', () => {
    fs.mkdirSync(path.join(container, '00000'))
    const outcome = createUnit(container, input, { now, random: sequence(0, 0, 0, 0, 0, 0, 0, 0, 0, 1 / 36) })
    expect(outcome.ok && outcome.data.name).toBe('00001')
  })

  it('一直撞名到上限就停下来报，不无限循环', () => {
    fs.mkdirSync(path.join(container, '00000'))
    const outcome = createUnit(container, input, { now, random: sequence(0) })
    expect(outcome.ok).toBe(false)
    expect((outcome as { error: string }).error).toContain('撞名')
  })

  it('字段不成立一个目录都不建，说得出是哪一项', () => {
    for (const [label, bad, hint] of [
      ['缺 title', { ...input, title: undefined }, 'title'],
      ['status 不在三档', { ...input, status: 'done' }, 'status'],
      ['icon 不是 kebab-case', { ...input, icon: 'Puzzle' }, 'icon'],
    ] as const) {
      const outcome = createUnit(container, bad, { now })
      expect(outcome.ok, label).toBe(false)
      expect((outcome as { error: string }).error, label).toContain(hint)
    }
    expect(fs.readdirSync(container)).toEqual([])
  })

  it('容器根不在不替人建', () => {
    const missing = path.join(container, '没有这个根')
    const outcome = createUnit(missing, input, { now })
    expect(outcome.ok).toBe(false)
    expect(fs.existsSync(missing)).toBe(false)
  })

  it('出生证是两空格缩进的 JSON，末尾换行', () => {
    const outcome = createUnit(container, input, { now })
    if (!outcome.ok) throw new Error(outcome.error)
    const text = fs.readFileSync(path.join(outcome.data.path, IDENTITY_FILE), 'utf8')
    expect(text).toBe(`${JSON.stringify(outcome.data.identity, null, 2)}\n`)
  })
})
