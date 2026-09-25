import { describe, expect, it } from 'vitest'
import {
  DEFAULT_STATUSES,
  UNIDENTIFIED_KIND,
  filterGroups,
  kindsOf,
  lucideKey,
  matchesUnit,
  toggled,
  type UnitEntry,
  type UnitFilter,
  type UnitInventory,
  type UnitStatus,
} from '../src/client/units.js'

/** 树格的过滤与图标名换算：喂清单看分组 */

function claimed(name: string, kind: string, status: UnitStatus, title = name, purpose = ''): UnitEntry {
  return {
    name,
    path: `D:/u/${name}`,
    identity: { status: 'claimed', identity: { kind, title, purpose, status, icon: 'folder', createdAt: '2026-09-17T00:00:00+08:00' } },
  }
}

const bare: UnitEntry = { name: 'bare', path: 'D:/u/bare', identity: { status: 'unclaimed' } }

const filter = (over: Partial<UnitFilter> = {}): UnitFilter => ({ statuses: DEFAULT_STATUSES, kinds: new Set(), query: '', ...over })

const inventory: UnitInventory = {
  byKind: [
    { kind: '插件仓', units: [claimed('a', '插件仓', 'active', 'gwb-foo'), claimed('b', '插件仓', 'retired')] },
    { kind: '论文', units: [claimed('c', '论文', 'paused', 'PERAS', '会议论文终稿')] },
  ],
  unidentified: [bare],
}

describe('matchesUnit', () => {
  it('默认藏起退役的，在做与搁着都显示', () => {
    expect(matchesUnit(claimed('x', 'k', 'active'), filter())).toBe(true)
    expect(matchesUnit(claimed('x', 'k', 'paused'), filter())).toBe(true)
    expect(matchesUnit(claimed('x', 'k', 'retired'), filter())).toBe(false)
  })

  it('没出生证的不受状态筛——藏起来就没人去补证了', () => {
    expect(matchesUnit(bare, filter({ statuses: new Set() }))).toBe(true)
  })

  it('种类非空时只留选中的种类，没出生证的按 UNIDENTIFIED_KIND 算', () => {
    expect(matchesUnit(claimed('x', '论文', 'active'), filter({ kinds: new Set(['插件仓']) }))).toBe(false)
    expect(matchesUnit(bare, filter({ kinds: new Set(['插件仓']) }))).toBe(false)
    expect(matchesUnit(bare, filter({ kinds: new Set([UNIDENTIFIED_KIND]) }))).toBe(true)
  })

  it('文字不分大小写，匹配目录名、title、purpose、kind', () => {
    const u = claimed('26091122arl', '论文', 'active', 'PERAS', '会议论文终稿')
    for (const q of ['arl', 'peras', '终稿', '论文']) expect(matchesUnit(u, filter({ query: q })), q).toBe(true)
    expect(matchesUnit(u, filter({ query: '插件' }))).toBe(false)
  })
})

describe('filterGroups / kindsOf', () => {
  it('筛空的组整个不要，未认领那一摞排最后', () => {
    const groups = filterGroups(inventory, filter())
    expect(groups.map((g) => [g.kindKey, g.units.map((u) => u.name)])).toEqual([
      ['插件仓', ['a']],
      ['论文', ['c']],
      [UNIDENTIFIED_KIND, ['bare']],
    ])
    expect(filterGroups(inventory, filter({ statuses: new Set(['retired']), kinds: new Set(['论文']) }))).toEqual([])
  })

  it('种类标签：认领过的种类 + 有未认领时追一个', () => {
    expect(kindsOf(inventory)).toEqual([
      { key: '插件仓', label: '插件仓' },
      { key: '论文', label: '论文' },
      { key: UNIDENTIFIED_KIND, label: '未认领' },
    ])
    expect(kindsOf({ byKind: [] })).toEqual([])
  })
})

describe('toggled', () => {
  it('有就拿掉、没有就加上，回新集合', () => {
    const a = new Set(['x'])
    const b = toggled(a, 'y')
    expect([...b]).toEqual(['x', 'y'])
    expect([...toggled(b, 'x')]).toEqual(['y'])
    expect([...a]).toEqual(['x'])
  })
})

describe('lucideKey', () => {
  it('kebab-case → PascalCase，数字段照接', () => {
    expect(lucideKey('folder-tree')).toBe('FolderTree')
    expect(lucideKey('book-open-2')).toBe('BookOpen2')
    expect(lucideKey('puzzle')).toBe('Puzzle')
  })
})
