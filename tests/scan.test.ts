import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { IDENTITY_FILE, groupByKind, readIdentity, scanContainer, takeInventory } from '../src/scan.js'

/**
 * 用一个真临时目录造容器，不打桩 `node:fs`：这一层做的全部事情就是「盘上有什么」，
 * 把文件系统换成假的，测的就只剩这几行代码自己跟自己对话了。
 */
let container: string

/** 造一个单元；`identity` 给字符串就原样写文件，给对象就序列化，`undefined` 是不写出生证 */
function unit(name: string, identity?: Record<string, unknown> | string): string {
  const dir = path.join(container, name)
  fs.mkdirSync(dir, { recursive: true })
  if (identity !== undefined) {
    fs.writeFileSync(
      path.join(dir, IDENTITY_FILE),
      typeof identity === 'string' ? identity : JSON.stringify(identity, null, 2),
      'utf8',
    )
  }
  return dir
}

/** 一份合格的出生证，六项齐全；`extra` 覆盖或追加字段 */
function ident(kind: string, purpose: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { kind, title: `${kind}的单元`, purpose, status: 'active', icon: 'folder', createdAt: '2026-09-04T12:00:00+08:00', ...extra }
}

beforeEach(() => {
  container = fs.mkdtempSync(path.join(os.tmpdir(), 'gwb-units-'))
})
afterEach(() => {
  fs.rmSync(container, { recursive: true, force: true })
})

describe('readIdentity：三档读数，任何失败都不抛', () => {
  it('六项齐全才读得出，原样带出去', () => {
    const body = {
      kind: '仓库',
      title: 'god-workbench',
      purpose: 'god 工作台',
      status: 'paused',
      icon: 'book-open-2',
      createdAt: '2026-09-04T12:00:00.000+08:00',
    }
    expect(readIdentity(unit('26090412vav', body))).toEqual({ status: 'claimed', identity: body })
  })

  it('status 三档都认', () => {
    for (const status of ['active', 'paused', 'retired']) {
      expect(readIdentity(unit(`s-${status}`, ident('仓库', '干点什么', { status }))).status, status).toBe('claimed')
    }
  })

  it('没有出生证是 unclaimed——正常状态，不是故障', () => {
    expect(readIdentity(unit('26090412zzz'))).toEqual({ status: 'unclaimed' })
  })

  it('坏 JSON、顶层不是对象、缺项、类型不对、值不在表里、多出字段，一律 unreadable 且说得出是哪一步坏的', () => {
    const without = (key: string): Record<string, unknown> => {
      const body = ident('仓库', '干点什么')
      delete body[key]
      return body
    }
    const cases: [string, Record<string, unknown> | string, string][] = [
      ['半截 JSON', '{ 半截', 'JSON'],
      ['顶层是数组', '[1,2]', '对象'],
      ['顶层是 null', 'null', '对象'],
      ...['kind', 'title', 'purpose', 'status', 'icon', 'createdAt'].map(
        (key): [string, Record<string, unknown>, string] => [`缺 ${key}`, without(key), key],
      ),
      ['kind 是空白', ident('   ', '干点什么'), 'kind'],
      ['createdAt 类型不对', ident('仓库', '干点什么', { createdAt: 1 }), 'createdAt'],
      ['status 不在三档里', ident('仓库', '干点什么', { status: '已废' }), 'status'],
      ['icon 不是 kebab-case', ident('仓库', '干点什么', { icon: 'FolderTree' }), 'icon'],
      ['旧写法 retired 字段', ident('仓库', '干点什么', { retired: true }), 'retired'],
      ['拼错的键', ident('仓库', '干点什么', { tittle: 'x' }), 'tittle'],
    ]
    for (const [label, body, hint] of cases) {
      const read = readIdentity(unit(`坏-${label}`, body))
      expect(read.status, label).toBe('unreadable')
      expect((read as { reason: string }).reason, label).toContain(hint)
    }
  })
})

/** 扫成功时把条目取出来；扫不动就当场炸，免得每条用例都写一遍窄化 */
function entriesOf(outcome: ReturnType<typeof scanContainer>) {
  if (!outcome.ok) throw new Error(`本该扫得动，却回了：${outcome.error}`)
  return outcome.entries
}

describe('scanContainer：只认目录、跳过 out、字典序', () => {
  it('容器根不存在是「扫得动、只是没有」——回空表加 rootExists: false，不算失败', () => {
    expect(scanContainer(path.join(container, '压根没有这个目录'))).toEqual({
      ok: true,
      rootExists: false,
      entries: [],
    })
  })

  it('空容器回空表，rootExists 是 true——跟「根不存在」分得开', () => {
    expect(scanContainer(container)).toEqual({ ok: true, rootExists: true, entries: [] })
  })

  it('根指到一个文件是真出岔子（ENOTDIR），回 ok:false 并说得出是哪个根', () => {
    const file = path.join(container, '这是个文件.txt')
    fs.writeFileSync(file, '不是目录', 'utf8')
    const outcome = scanContainer(file)
    expect(outcome.ok).toBe(false)
    expect((outcome as { error: string }).error).toContain(file)
  })

  it('相对根照扫，条目路径就跟着是相对的——绝对化归调用方（插件的 resolveUnitsRoot）', () => {
    unit('26090412vav', ident('仓库', 'god 工作台'))
    // 临时目录跟仓可能不在一个盘上（那时 path.relative 回的是绝对路径），所以先站到
    // 容器的上一层去，让「相对根」这件事在任何盘布局下都成立。cwd 用完立刻还回去
    const saved = process.cwd()
    try {
      process.chdir(path.dirname(container))
      const entries = entriesOf(scanContainer(path.basename(container)))
      expect(entries.map((e) => e.name)).toEqual(['26090412vav'])
      expect(path.isAbsolute(entries[0]!.path)).toBe(false)
      expect(path.resolve(entries[0]!.path)).toBe(path.join(container, '26090412vav'))
    } finally {
      process.chdir(saved)
    }
  })

  it('符号链接指过来的目录跟真目录一个待遇（根与单元两处都是）', () => {
    unit('26090412vav', ident('仓库', 'god 工作台'))
    const realUnit = path.join(container, '26090601real')
    fs.mkdirSync(realUnit)
    fs.writeFileSync(
      path.join(realUnit, IDENTITY_FILE),
      JSON.stringify(ident('入口', '链接过来的')),
      'utf8',
    )
    // 造链接要权限（Windows 无开发者模式时 EPERM），造不出来就跳过这条而不是假装通过
    let linkedRoot: string
    try {
      linkedRoot = path.join(path.dirname(container), `${path.basename(container)}-link`)
      fs.symlinkSync(container, linkedRoot, 'junction')
      fs.symlinkSync(realUnit, path.join(container, '26090602link'), 'junction')
    } catch {
      return
    }
    try {
      // 单元那一层：链接进来的子目录照样算单元
      expect(entriesOf(scanContainer(container)).map((e) => e.name)).toEqual([
        '26090412vav',
        '26090601real',
        '26090602link',
      ])
      // 根那一层：从链接根扫，看到的是同一批
      expect(entriesOf(scanContainer(linkedRoot)).map((e) => e.name)).toEqual([
        '26090412vav',
        '26090601real',
        '26090602link',
      ])
    } finally {
      fs.rmSync(linkedRoot, { recursive: true, force: true })
    }
  })

  it('散落文件不进表，名叫 out 的目录也不进', () => {
    unit('26090412vav', ident('仓库', 'god 工作台'))
    unit('out')
    fs.writeFileSync(path.join(container, '随手记.txt'), '不是单元', 'utf8')
    expect(entriesOf(scanContainer(container)).map((e) => e.name)).toEqual(['26090412vav'])
  })

  it('按目录名字典序，路径跟着根走', () => {
    unit('26090520ntn', ident('入口', '总控台'))
    unit('26090315xby', ident('仓库', '文档工位'))
    fs.mkdirSync(path.join(container, '26090315xby', '子目录'), { recursive: true })
    const entries = entriesOf(scanContainer(container))
    expect(entries.map((e) => e.name)).toEqual(['26090315xby', '26090520ntn'])
    expect(entries[0]!.path).toBe(path.join(container, '26090315xby'))
  })
})

/** 现扫成功时把那份清单取出来 */
function dataOf(outcome: ReturnType<typeof takeInventory>) {
  if (!outcome.ok) throw new Error(`本该扫得动，却回了：${outcome.error}`)
  return outcome.data
}

describe('takeInventory：分组形状就是界面吃的那一份', () => {
  it('按种类分组、组间字典序；没身份的单独一摞不混进种类里', () => {
    unit('26090412vav', ident('仓库', 'god 工作台'))
    unit('26090520ntn', ident('入口', '总控台'))
    unit('26090601aaa', ident('仓库', '另一个仓'))
    unit('26090602bbb')
    unit('26090603ccc', '{ 半截')
    const inv = dataOf(takeInventory(container))
    expect(inv.container).toBe(container)
    expect(inv.rootExists).toBe(true)
    // 组序是码位序（仓 U+4ED3 在 入 U+5165 之前），不是拼音序——两次扫描的结果因此能直接比对
    expect(inv.byKind.map((g) => g.kind)).toEqual(['仓库', '入口'])
    expect(inv.byKind[0]!.units.map((u) => u.name)).toEqual(['26090412vav', '26090601aaa'])
    expect(inv.unidentified.map((u) => u.name)).toEqual(['26090602bbb', '26090603ccc'])
  })

  it('退役那条照样进它的种类组，状态原样带出去（要不要显示归界面）', () => {
    unit('26090412vav', ident('仓库', '退役的仓', { status: 'retired' }))
    const units = dataOf(takeInventory(container)).byKind[0]!.units
    expect(units[0]!.identity).toEqual({ status: 'claimed', identity: ident('仓库', '退役的仓', { status: 'retired' }) })
  })

  it('容器根不存在：形状齐全、都是空的，rootExists 报 false（界面据此多一行灰字）', () => {
    const missing = path.join(container, '没有这个根')
    expect(takeInventory(missing)).toEqual({
      ok: true,
      data: { container: missing, rootExists: false, byKind: [], unidentified: [] },
    })
  })

  it('扫不动就整份失败，不拿一张空表冒充「这儿没有单元」', () => {
    const file = path.join(container, '这是个文件.txt')
    fs.writeFileSync(file, '不是目录', 'utf8')
    expect(takeInventory(file).ok).toBe(false)
  })
})

describe('groupByKind：纯函数，不碰盘', () => {
  it('空表进、空分组出', () => {
    expect(groupByKind([])).toEqual({ byKind: [], unidentified: [] })
  })

  it('unreadable 跟 unclaimed 一个待遇——都归「还没有种类」那一摞', () => {
    const entries = [
      { name: 'a', path: 'D:/a', identity: { status: 'unclaimed' as const } },
      { name: 'b', path: 'D:/b', identity: { status: 'unreadable' as const, reason: '坏' } },
    ]
    expect(groupByKind(entries).unidentified.map((u) => u.name)).toEqual(['a', 'b'])
    expect(groupByKind(entries).byKind).toEqual([])
  })
})
