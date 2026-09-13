import { describe, expect, it } from 'vitest'
import {
  FILE_SELECTED,
  VIEWER_PANE,
  lastSelection,
  noteViewerFocus,
  openDuplicated,
  pickPayload,
  releaseViewerFocus,
  routeToFocused,
  viewerMounted,
} from '../src/client/selection.js'
import type { ShellBridge } from '../src/client/types.js'

/**
 * 树格与原文格之间的接力棒。**在 node 里跑，不起 jsdom**——这几件事是纯的，给它 shell
 * 就照做，跟 DOM 一个字都不沾。
 *
 * 交互约定：单击进焦点原文格，Ctrl+单击再开一份；接力棒**只住内存不落盘**——原文格
 * 不跟随上次的状态。焦点 = 最后一次鼠标点过的原文格。
 *
 * **重挂不抢焦点**：dockview 重排布局会把开着的格拆了重挂（同一个实例键）——那不是
 * 「新开的一份」，不该接管焦点；Ctrl+单击开出的是全新实例键，才接管。
 */

const PAYLOAD = {
  path: 'D:\\unitfolders\\26090412vav\\unit.json',
  name: 'unit.json',
  containerRoot: 'D:\\unitfolders',
}

function fakeShell() {
  const opened: Array<{ id: string; options?: { duplicate?: boolean } }> = []
  const emitted: Array<{ type: string; detail: unknown }> = []
  const shell: ShellBridge = {
    openPane: (id, options) => opened.push({ id, options }),
    bus: {
      emit: (type, detail) => emitted.push({ type, detail }),
      on: () => () => undefined,
    },
  }
  return { shell, opened, emitted }
}

describe('routeToFocused：单击进焦点原文格', () => {
  it('新实例挂载接管焦点 → 定向投递，别的格不动', () => {
    const { shell, opened, emitted } = fakeShell()
    viewerMounted('instance-A')
    routeToFocused(shell, PAYLOAD)
    expect(opened).toEqual([])
    expect(emitted).toEqual([{ type: FILE_SELECTED, detail: { target: 'instance-A', payload: PAYLOAD } }])
    expect(lastSelection()).toEqual(PAYLOAD)
    releaseViewerFocus('instance-A')
  })

  it('焦点跟手：点了另一格，路由跟着换目标', () => {
    const { shell, emitted } = fakeShell()
    viewerMounted('instance-A')
    noteViewerFocus('instance-B')
    routeToFocused(shell, PAYLOAD)
    expect(emitted[0]).toEqual({ type: FILE_SELECTED, detail: { target: 'instance-B', payload: PAYLOAD } })
    releaseViewerFocus('instance-B')
  })

  it('重挂的旧实例不抢焦点——dockview 重排布局重挂时，路由目标不变', () => {
    const { shell, emitted } = fakeShell()
    viewerMounted('instance-A')
    viewerMounted('instance-B')
    viewerMounted('instance-A') // 重挂：同一个实例键，焦点仍归 B
    routeToFocused(shell, PAYLOAD)
    expect(emitted.at(-1)).toEqual({ type: FILE_SELECTED, detail: { target: 'instance-B', payload: PAYLOAD } })
    releaseViewerFocus('instance-B')
  })

  it('无焦点（格全关了或重挂后没人接管）→ 广播 + 开格兜底', () => {
    const { shell, opened, emitted } = fakeShell()
    viewerMounted('instance-A')
    releaseViewerFocus('instance-A')
    routeToFocused(shell, PAYLOAD)
    // 广播：detail 不带 target，所有开着的原文格都响应
    expect(emitted).toEqual([{ type: FILE_SELECTED, detail: { payload: PAYLOAD } }])
    expect(opened).toEqual([{ id: VIEWER_PANE, options: undefined }])
    // 重挂（焦点为空）时接管
    viewerMounted('instance-A')
    routeToFocused(shell, PAYLOAD)
    expect(emitted.at(-1)).toEqual({ type: FILE_SELECTED, detail: { target: 'instance-A', payload: PAYLOAD } })
    releaseViewerFocus('instance-A')
  })

  it('焦点格关掉就释放；焦点在别格头上时关这一格不影响路由目标', () => {
    const { shell, opened, emitted } = fakeShell()
    viewerMounted('instance-A')
    releaseViewerFocus('instance-A')
    routeToFocused(shell, PAYLOAD)
    expect(opened).toHaveLength(1)
    noteViewerFocus('instance-B')
    noteViewerFocus('instance-A')
    releaseViewerFocus('instance-B')
    noteViewerFocus('instance-C')
    routeToFocused(shell, PAYLOAD)
    expect(opened).toHaveLength(1)
    expect(emitted.at(-1)).toEqual({ type: FILE_SELECTED, detail: { target: 'instance-C', payload: PAYLOAD } })
    releaseViewerFocus('instance-C')
  })
})

describe('openDuplicated：Ctrl+单击再开一份', () => {
  it('duplicate: true——外壳的语义是无论开没开过都开一份新的，摆在右边', () => {
    const { shell, opened, emitted } = fakeShell()
    openDuplicated(shell, PAYLOAD)
    expect(opened).toEqual([{ id: VIEWER_PANE, options: { duplicate: true } }])
    expect(emitted).toEqual([])
    expect(lastSelection()).toEqual(PAYLOAD)
  })

  it('新份挂载时接管焦点（全新实例键）——之后的单击跟它走', () => {
    const { shell, emitted } = fakeShell()
    viewerMounted('instance-A')
    openDuplicated(shell, PAYLOAD)
    viewerMounted('viewer~2')
    routeToFocused(shell, PAYLOAD)
    expect(emitted.at(-1)).toEqual({ type: FILE_SELECTED, detail: { target: 'viewer~2', payload: PAYLOAD } })
    releaseViewerFocus('viewer~2')
  })
})

describe('lastSelection：内存里的接力棒', () => {
  it('最新一次递的顶掉上一次；本模块状态只住内存，重启即空', () => {
    const { shell } = fakeShell()
    const next = { ...PAYLOAD, path: 'D:\\unitfolders\\26090705ymz\\unit.json' }
    routeToFocused(shell, next)
    expect(lastSelection()).toEqual(next)
  })
})

describe('pickPayload：总线递来的是 unknown，收的这头自己收窄', () => {
  it('形状对就原样收下', () => {
    expect(pickPayload(PAYLOAD)).toEqual(PAYLOAD)
  })

  it('没有 path 的一律不收——那条是这件事的主语', () => {
    expect(pickPayload({ name: 'unit.json', containerRoot: 'D:\\x' })).toBeNull()
    expect(pickPayload({ path: '' })).toBeNull()
    expect(pickPayload({ path: 42 })).toBeNull()
    expect(pickPayload(null)).toBeNull()
    expect(pickPayload('unit.json')).toBeNull()
    expect(pickPayload(undefined)).toBeNull()
  })

  it('name 缺就落 path、containerRoot 缺就空串——少一样不该整条丢掉', () => {
    expect(pickPayload({ path: 'D:\\x\\y.json' })).toEqual({
      path: 'D:\\x\\y.json',
      name: 'D:\\x\\y.json',
      containerRoot: '',
    })
  })
})
