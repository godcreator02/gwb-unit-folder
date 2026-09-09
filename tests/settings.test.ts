import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { rootFromSetting } from '../src/index.js'

/**
 * 「设置值 → 绝对根」这一步是纯的：进去一个 `unknown`（设置件交出来的东西没有类型
 * 保证——盘上那份是人手改得到的 JSON），出来要么是绝对路径，要么是「没配」。
 *
 * 值得单独测的理由是它同时管着两件事：**不是字符串就当没配**（设置件不在时 `get`
 * 回 undefined 走的也是这条），以及**空白不算配了**（界面上把框清空，留下的常是空串
 * 或者几个空格）。这两条判错的后果都是 `unconfigured` 该出没出、或者不该出却出了。
 */
describe('rootFromSetting：设置值 → 绝对根', () => {
  it('不是字符串就是没配——设置件不在（get 回 undefined）走的也是这一条', () => {
    for (const raw of [undefined, null, 0, 42, true, {}, [], ['D:\\unitfolders']]) {
      expect(rootFromSetting(raw), String(raw)).toBeUndefined()
    }
  })

  it('空串与纯空白都是没配——界面上把框清空，留下的就是这两样', () => {
    for (const raw of ['', ' ', '   ', '\t', '\n', ' \t\n ']) {
      expect(rootFromSetting(raw), JSON.stringify(raw)).toBeUndefined()
    }
  })

  it('相对路径当场绝对化——绝对化只在这一处做，扫描那层只跟绝对路径打交道', () => {
    const got = rootFromSetting('units')
    expect(got).toBe(path.resolve('units'))
    expect(path.isAbsolute(got!)).toBe(true)
  })

  it('绝对路径照 path.resolve 归一（分隔符、`..`、末尾斜杠都规整掉）', () => {
    const root = path.resolve(path.sep === '\\' ? 'D:\\unitfolders' : '/unitfolders')
    expect(rootFromSetting(root)).toBe(root)
    expect(rootFromSetting(path.join(root, 'x', '..'))).toBe(root)
  })

  it('首尾空白裁掉再解——粘贴路径最常带的就是它', () => {
    const root = path.resolve('units')
    expect(rootFromSetting('  units  ')).toBe(root)
    expect(rootFromSetting('\tunits\n')).toBe(root)
  })
})
