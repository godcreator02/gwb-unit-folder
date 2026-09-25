import { describe, expect, it } from 'vitest'
import { TOOLBAR_EVENT, clickArgsOf, createToolbarButtonRegistry, isToolbarNudge, parseButtonState } from '../src/toolbar.js'

/**
 * 工具条按钮的纯机：登记表的三条规矩（跟窗格注册表同一套）、state 回包的宽松收、
 * 登记表一变那一声的认法。
 */

const owner = { entryId: 'home:docs-site', pkg: '@godcreator/gwb-docs-site' }

function spec(over: Partial<Parameters<ReturnType<typeof createToolbarButtonRegistry>['register']>[1]> = {}) {
  return { id: 'sites', icon: 'book-open', label: '启动站点', command: 'docs-site.viewUnit', ...over }
}

describe('createToolbarButtonRegistry', () => {
  it('登记进表、按先后列出，身份由表填', () => {
    const reg = createToolbarButtonRegistry(() => {})
    reg.register(owner, spec())
    reg.register({ entryId: 'home:other', pkg: '@godcreator/gwb-other' }, spec({ id: 'x', command: 'other.go' }))
    expect(reg.list()).toEqual([
      { ...spec(), ...owner },
      { ...spec({ id: 'x', command: 'other.go' }), entryId: 'home:other', pkg: '@godcreator/gwb-other' },
    ])
  })

  it('空 id / 空 icon / 空 label / 空 command 抛错——没说自己是谁的按钮不该进表', () => {
    const reg = createToolbarButtonRegistry(() => {})
    expect(() => reg.register(owner, spec({ id: '' }))).toThrow('没有 id')
    expect(() => reg.register(owner, spec({ icon: '' }))).toThrow('没给 icon')
    expect(() => reg.register(owner, spec({ label: '' }))).toThrow('没给 label')
    expect(() => reg.register(owner, spec({ command: '' }))).toThrow('没给 command')
  })

  it('撞名后来者赢但出声——跟窗格注册表、命令总线同一个规矩', () => {
    const warnings: string[] = []
    const reg = createToolbarButtonRegistry((m) => warnings.push(m))
    reg.register(owner, spec({ label: '站点' }))
    reg.register(owner, spec({ label: '文档站' }))
    expect(reg.list()).toHaveLength(1)
    expect(reg.list()[0]?.label).toBe('文档站')
    expect(warnings).toHaveLength(1)
  })

  it('注销只收自己那份：被顶掉之后再摘，摘的不该是别人那条', () => {
    const reg = createToolbarButtonRegistry(() => {})
    reg.register(owner, spec({ label: '旧' }))
    const offSecond = reg.register(owner, spec({ label: '新' }))
    offSecond()
    // 第二份摘了，表里也该是空的——第一份早被顶掉，不能复活
    expect(reg.list()).toHaveLength(0)
  })

  it('同包两条条目各登记一颗同名的，两条都在——键是 (entryId, 按钮 id)', () => {
    const reg = createToolbarButtonRegistry(() => {})
    reg.register({ entryId: 'home:a', pkg: 'p' }, spec())
    reg.register({ entryId: 'home:b', pkg: 'p' }, spec())
    expect(reg.list()).toHaveLength(2)
  })
})

describe('parseButtonState：回包来自别的件，宽松收', () => {
  it('enabled 只认真值', () => {
    expect(parseButtonState({ enabled: true }).enabled).toBe(true)
    expect(parseButtonState({ enabled: false }).enabled).toBe(false)
    expect(parseButtonState({ enabled: 1 }).enabled).toBe(false)
    expect(parseButtonState({}).enabled).toBe(false)
  })

  it('items 里缺 id / 缺 label 的行整行丢，detail 可有可无', () => {
    const out = parseButtonState({
      enabled: true,
      items: [
        { id: 'D:\\a\\docs-site', label: 'a 站', detail: 'fresh' },
        { id: '', label: '坏行' },
        { label: '没 id' },
        { id: 'D:\\b\\docs-site', label: 'b 站', detail: '' },
        '不是对象',
      ],
    })
    expect(out).toEqual({
      enabled: true,
      items: [
        { id: 'D:\\a\\docs-site', label: 'a 站', detail: 'fresh' },
        { id: 'D:\\b\\docs-site', label: 'b 站' },
      ],
    })
  })

  it('null / 原始值回一份灰的空态，不炸', () => {
    expect(parseButtonState(null)).toEqual({ enabled: false, items: [] })
    expect(parseButtonState('ok')).toEqual({ enabled: false, items: [] })
  })
})

describe('isToolbarNudge', () => {
  it('记号对得上才认，别件的载荷不认', () => {
    expect(isToolbarNudge({ t: TOOLBAR_EVENT })).toBe(true)
    expect(isToolbarNudge({ t: 'gwb-docs-site', kind: 'view' })).toBe(false)
    expect(isToolbarNudge(null)).toBe(false)
    expect(isToolbarNudge('nudge')).toBe(false)
  })
})

describe('clickArgsOf：点一颗按钮递给命令的参数', () => {
  it('选中单元、菜单项、树格实例都在；from 就是树格的 pane.instance', () => {
    expect(clickArgsOf({}, { unitPath: 'D:\\u\\a', item: 'D:\\u\\a\\site', from: 'plugin:home:unit-folder:main' })).toEqual({
      unitPath: 'D:\\u\\a',
      item: 'D:\\u\\a\\site',
      from: 'plugin:home:unit-folder:main',
    })
  })

  it('没选中不带 unitPath、没挑菜单不带 item，from 照带', () => {
    expect(clickArgsOf({}, { unitPath: null, from: 'i' })).toEqual({ from: 'i' })
  })

  it('登记方的 args 最后铺，同名盖过前面几样', () => {
    expect(clickArgsOf({ args: { mode: 'x', from: 'mine' } }, { unitPath: 'D:\\u\\a', from: 'i' })).toEqual({
      unitPath: 'D:\\u\\a',
      from: 'mine',
      mode: 'x',
    })
  })
})
