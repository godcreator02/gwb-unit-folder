import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { findPinned, isUnitDir, parsePinnedDoc, resolveCurrent, samePath, selectionFor, type UnitSelection } from '../src/current.js'
import type { UnitEntry } from '../src/scan.js'

/**
 * 「当前看的是哪个单元」这一层是纯的：给一条根内路径推出所属单元、置顶文档验形状、
 * `current()` 怎么回落——全是「喂输入看输出」，所以全在这儿测；`index.ts` 只剩接线。
 *
 * 这几条判错的后果都直接进服务面：`unitPath` 算错，消费方（文档站件）就去读错的仓；
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

  it('正斜杠写法照认——浏览器半的树用正斜杠拼路径，落命令时不换', () => {
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
  it('{ path: 非空字符串 } 才算置顶', () => {
    expect(parsePinnedDoc({ path: unit })).toBe(unit)
  })

  it('取消置顶写的 { path: null }、缺字段、空串、不是对象，一律当没置顶', () => {
    for (const raw of [{ path: null }, {}, { path: '' }, { path: '  ' }, { path: 42 }, null, undefined, 'x', [], 7]) {
      expect(parsePinnedDoc(raw), JSON.stringify(raw)).toBeUndefined()
    }
  })
})

describe('resolveCurrent：current() 的回落规则', () => {
  const clicked: UnitSelection = { unitPath: unit, unitName: '26090520ntn', path: path.join(unit, 'console') }
  const other = path.join(root, '26090811jjr')

  it('点过就是最近那一次，置顶不插手', () => {
    expect(resolveCurrent(clicked, other)).toBe(clicked)
    expect(resolveCurrent(clicked, undefined)).toBe(clicked)
  })

  it('没点过回落到置顶：三个字段都指向单元目录本身', () => {
    expect(resolveCurrent(undefined, other)).toEqual<UnitSelection>({ unitPath: other, unitName: '26090811jjr', path: other })
  })

  it('都没有就是 undefined', () => {
    expect(resolveCurrent(undefined, undefined)).toBeUndefined()
  })
})

describe('findPinned：清单里置顶的那条', () => {
  const inventory = {
    byKind: [{ kind: '插件工位', units: [entry('26090811jjr')] }],
    unidentified: [entry('26090520ntn')],
  }

  it('认领过的与未认领的都找得到', () => {
    expect(findPinned(inventory, path.join(root, '26090811jjr'))?.name).toBe('26090811jjr')
    expect(findPinned(inventory, unit)?.name).toBe('26090520ntn')
  })

  it('没置顶、或置顶指的单元不在清单里（换了根、目录删了），回 null 不报错', () => {
    expect(findPinned(inventory, undefined)).toBeNull()
    expect(findPinned(inventory, path.join(root, 'gone'))).toBeNull()
  })

  it.runIf(process.platform === 'win32')('Windows 下盘符大小写不算差异——置顶那条是参数解出来的，清单那条是扫出来的', () => {
    expect(samePath(unit, unit.replace(/^D:/, 'd:'))).toBe(true)
    expect(findPinned(inventory, unit.replace(/^D:/, 'd:'))?.name).toBe('26090520ntn')
  })
})
