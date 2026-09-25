import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  addPinned,
  findPinned,
  isUnitDir,
  isUnitListed,
  parsePinnedDoc,
  removePinned,
  resolveCurrent,
  samePath,
  selectExistingDir,
  selectionFor,
  type UnitSelection,
} from '../src/current.js'
import type { UnitEntry } from '../src/scan.js'

/**
 * 「当前看的是哪个单元」这一层是纯的：给一条根内路径推出所属单元、置顶文档验形状、
 * `current()` 怎么回落——全是「传入输入、比对输出」，所以全在这儿测；`index.ts` 只负责接到命令与服务上。
 *
 * 这几条判错的后果都直接进服务接口：`unitPath` 算错，消费方就拿到错的单元；
 * 回落规则错，人没点过树时「当前」不是置顶而是空，或者点过之后置顶反过来盖住点击。
 */

const root = path.resolve(path.sep === '\\' ? 'D:\\unitfolders' : '/unitfolders')
const unit = path.join(root, '26090520ntn')

function entry(name: string): UnitEntry {
  return { name, path: path.join(root, name), identity: { status: 'unclaimed' } }
}

describe('selectionFor：根内一条路径 → 所属单元', () => {
  it('点单元行：path 就是 unitPath，unitName 是目录名', () => {
    expect(selectionFor(root, unit)).toEqual<UnitSelection>({ unitPath: unit, unitName: '26090520ntn', path: unit })
  })

  it('点单元内的目录：unitPath 仍是根下那一层，path 是点的那个目录', () => {
    const inner = path.join(unit, 'console', 'docs-god-flow')
    expect(selectionFor(root, inner)).toEqual<UnitSelection>({ unitPath: unit, unitName: '26090520ntn', path: inner })
  })

  it('正斜杠写法照认——浏览器侧的树用正斜杠拼路径，调命令时不换', () => {
    const slashed = `${root.replaceAll('\\', '/')}/26090520ntn/console`
    expect(selectionFor(root, slashed)).toEqual<UnitSelection>({
      unitPath: unit,
      unitName: '26090520ntn',
      path: path.join(unit, 'console'),
    })
  })

  it('根本身、根外、穿越出去的都回 null——这不是 resolveInside 的替代，是导出的纯函数自己守住', () => {
    expect(selectionFor(root, root)).toBeNull()
    expect(selectionFor(root, path.join(root, '..'))).toBeNull()
    expect(selectionFor(root, path.join(root, 'x', '..', '..', 'y'))).toBeNull()
    expect(selectionFor(root, path.resolve(root, '..', 'elsewhere', 'a'))).toBeNull()
  })
})

describe('selectExistingDir：选中之前确认目录还在', () => {
  const inner = path.join(unit, 'console')

  it('目录在：回所属单元，与 selectionFor 同形', () => {
    expect(selectExistingDir(root, inner, () => true)).toEqual({
      ok: true,
      data: { unitPath: unit, unitName: '26090520ntn', path: inner },
    })
  })

  it('目录不在（单元已删）：直接报错，不记下选中', () => {
    const asked: string[] = []
    const outcome = selectExistingDir(root, inner, (dir) => {
      asked.push(dir)
      return false
    })
    expect(outcome).toEqual({ ok: false, error: `不是已存在的目录：${inner}` })
    expect(asked).toEqual([inner])
  })

  it('根本身在也不算选中——推不出所属单元', () => {
    expect(selectExistingDir(root, root, () => true)).toEqual({ ok: false, error: `算不出所属单元：${root}` })
  })
})

describe('isUnitDir：置顶只认容器根下一层', () => {
  it('单元目录本身是', () => {
    expect(isUnitDir(root, unit)).toBe(true)
    expect(isUnitDir(root, `${unit}${path.sep}`)).toBe(true)
  })

  it('单元里的目录、根本身、根外都不是', () => {
    expect(isUnitDir(root, path.join(unit, 'console'))).toBe(false)
    expect(isUnitDir(root, root)).toBe(false)
    expect(isUnitDir(root, path.resolve(root, '..'))).toBe(false)
  })
})

describe('parsePinnedDoc：盘上那份是人手改得到的 JSON', () => {
  const other = path.join(root, '26090811jjr')

  it('{ paths: [...] } 按原顺序读出', () => {
    expect(parsePinnedDoc({ paths: [unit, other] })).toEqual([unit, other])
  })

  it('不是数组、缺字段、不是对象，一律当没置顶；旧形态 { path } 同样不认', () => {
    for (const raw of [{ path: unit }, {}, { paths: unit }, { paths: null }, null, undefined, 'x', [], 7]) {
      expect(parsePinnedDoc(raw), JSON.stringify(raw)).toEqual([])
    }
  })

  it('数组里空串与非字符串扔掉，重复的只留第一次', () => {
    expect(parsePinnedDoc({ paths: ['', '  ', 42, unit, other, unit] })).toEqual([unit, other])
  })
})

describe('addPinned / removePinned：置顶表按先后', () => {
  const a = path.join(root, 'a')
  const b = path.join(root, 'b')

  it('追加到末尾；已经在的不挪位置、不重复', () => {
    expect(addPinned([a], b)).toEqual([a, b])
    expect(addPinned([a, b], a)).toEqual([a, b])
  })

  it('摘掉一个，不在表里原样回', () => {
    expect(removePinned([a, b], a)).toEqual([b])
    expect(removePinned([a], b)).toEqual([a])
  })
})

describe('resolveCurrent：current() 的回落规则', () => {
  const clicked: UnitSelection = { unitPath: unit, unitName: '26090520ntn', path: path.join(unit, 'console') }
  const other = path.join(root, '26090811jjr')

  it('点过就是最近那一次，置顶不插手', () => {
    expect(resolveCurrent(clicked, [other])).toBe(clicked)
    expect(resolveCurrent(clicked, [])).toBe(clicked)
  })

  it('没点过回落到第一个置顶：三个字段都指向单元目录本身', () => {
    expect(resolveCurrent(undefined, [other, unit])).toEqual<UnitSelection>({ unitPath: other, unitName: '26090811jjr', path: other })
  })

  it('都没有就是 undefined', () => {
    expect(resolveCurrent(undefined, [])).toBeUndefined()
  })
})

describe('findPinned：清单里置顶的那几条', () => {
  const inventory = {
    byKind: [{ kind: '插件工位', units: [entry('26090811jjr')] }],
    unidentified: [entry('26090520ntn')],
  }

  it('认领过的与未认领的都找得到，按置顶先后', () => {
    const found = findPinned(inventory, [unit, path.join(root, '26090811jjr')])
    expect(found.entries.map((e) => e.name)).toEqual(['26090520ntn', '26090811jjr'])
    expect(found.gone).toEqual([])
  })

  it('置顶指的单元不在清单里（换了根、目录删了），落进 gone 交给调用方摘掉', () => {
    const gone = path.join(root, 'gone')
    expect(findPinned(inventory, [gone, unit])).toEqual({ entries: [entry('26090520ntn')], gone: [gone] })
    expect(findPinned(inventory, [])).toEqual({ entries: [], gone: [] })
  })

  it.runIf(process.platform === 'win32')('Windows 下盘符大小写不算差异——置顶那条是参数解出来的，清单那条是扫出来的', () => {
    expect(samePath(unit, unit.replace(/^D:/, 'd:'))).toBe(true)
    expect(findPinned(inventory, [unit.replace(/^D:/, 'd:')]).entries.map((e) => e.name)).toEqual(['26090520ntn'])
  })
})

describe('isUnitListed：最近一次点击的单元还在不在', () => {
  const inventory = {
    byKind: [{ kind: '插件工位', units: [entry('26090811jjr')] }],
    unidentified: [entry('26090520ntn')],
  }

  it('认领过的与未认领的都算在', () => {
    expect(isUnitListed(inventory, path.join(root, '26090811jjr'))).toBe(true)
    expect(isUnitListed(inventory, unit)).toBe(true)
  })

  it('清单里没有（目录删了、换了容器根）就是不在，调用方据此清掉点击', () => {
    expect(isUnitListed(inventory, path.join(root, '26090914exf'))).toBe(false)
    expect(isUnitListed({ byKind: [], unidentified: [] }, unit)).toBe(false)
  })
})
