import { describe, expect, it } from 'vitest'
import { VIEWER_PANE, fileOfParams, openModeOf, openViewer, viewerContentOf } from '../src/client/open-file.js'
import type { ShellBridge } from '../src/client/types.js'

/**
 * 树里点一个文件开成什么样的原文格。**在 node 里跑，不起 jsdom**——这几件事是纯的，给它
 * shell 就照做，跟 DOM 一个字都不沾。
 *
 * 交互约定照外壳的手势约定：树格不是原文格，单击 = 预览；Ctrl / ⌘ + 单击或中键 = 正式打开
 * （新标签）；Ctrl / ⌘ + Alt + 单击 = 开到旁边。原文格装哪个文件住在它自己的参数里。
 */

const FILE = {
  path: 'D:\\unitfolders\\26090412vav\\unit.json',
  name: 'unit.json',
  containerRoot: 'D:\\unitfolders',
}

const click = { ctrlKey: false, metaKey: false, altKey: false, button: 0 }

function fakeShell() {
  const opened: Array<{ id: string; options: unknown }> = []
  const shell: ShellBridge = { openPane: (id, options) => opened.push({ id, options }) }
  return { shell, opened }
}

describe('openModeOf：树格里的手势', () => {
  it('单击 = 预览（树格不是原文格，落「从别处单击」那一行）', () => {
    expect(openModeOf(click)).toBe('preview')
  })

  it('Ctrl / ⌘ + 单击、中键 = 正式打开', () => {
    expect(openModeOf({ ...click, ctrlKey: true })).toBe('new')
    expect(openModeOf({ ...click, metaKey: true })).toBe('new')
    expect(openModeOf({ ...click, button: 1 })).toBe('new')
  })

  it('Ctrl / ⌘ + Alt + 单击 = 开到旁边；光按 Alt 还是预览', () => {
    expect(openModeOf({ ...click, ctrlKey: true, altKey: true })).toBe('side')
    expect(openModeOf({ ...click, metaKey: true, altKey: true })).toBe('side')
    expect(openModeOf({ ...click, altKey: true })).toBe('preview')
  })
})

describe('openViewer：三种开法落成三种 openPane', () => {
  const content = { key: FILE.path, params: FILE }

  it('预览：带 preview，不带 placement', () => {
    const { shell, opened } = fakeShell()
    openViewer(shell, FILE, 'preview')
    expect(opened).toEqual([{ id: VIEWER_PANE, options: { ...content, preview: true } }])
  })

  it('正式打开：不带 preview、放法缺省——就是目标组里一个新的正式标签', () => {
    const { shell, opened } = fakeShell()
    openViewer(shell, FILE, 'new')
    expect(opened).toEqual([{ id: VIEWER_PANE, options: content }])
  })

  it('开到旁边：placement side', () => {
    const { shell, opened } = fakeShell()
    openViewer(shell, FILE, 'side')
    expect(opened).toEqual([{ id: VIEWER_PANE, options: { ...content, placement: 'side' } }])
  })

  it('没有 duplicate 这种外壳早就不认的键', () => {
    const { shell, opened } = fakeShell()
    for (const mode of ['preview', 'new', 'side'] as const) openViewer(shell, FILE, mode)
    for (const o of opened) expect(o.options).not.toHaveProperty('duplicate')
  })
})

describe('viewerContentOf：文件在外壳眼里的内容', () => {
  it('key 是绝对路径，参数原样带三样', () => {
    expect(viewerContentOf(FILE)).toEqual({ key: FILE.path, params: FILE })
  })
})

describe('fileOfParams：参数来自落盘的布局，是 unknown，收的这头自己收窄', () => {
  it('形状对就原样收下；viewerContentOf 的参数读得回同一个文件', () => {
    expect(fileOfParams(FILE)).toEqual(FILE)
    expect(fileOfParams(viewerContentOf(FILE).params)).toEqual(FILE)
  })

  it('没有 path 的一律不收（空态）——老版本留下的原文格没带参数', () => {
    expect(fileOfParams(undefined)).toBeNull()
    expect(fileOfParams({})).toBeNull()
    expect(fileOfParams({ name: 'unit.json', containerRoot: 'D:\\x' })).toBeNull()
    expect(fileOfParams({ path: '' })).toBeNull()
    expect(fileOfParams({ path: 42 })).toBeNull()
    expect(fileOfParams(null)).toBeNull()
    expect(fileOfParams('unit.json')).toBeNull()
  })

  it('name 缺就落 path、containerRoot 缺就空串——少一样不该整条丢掉', () => {
    expect(fileOfParams({ path: 'D:\\x\\y.json' })).toEqual({ path: 'D:\\x\\y.json', name: 'D:\\x\\y.json', containerRoot: '' })
  })
})
