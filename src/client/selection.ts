import type { ShellBridge } from './types.js'

/**
 * 树格与原文格之间的接力棒（浏览器半）。
 *
 * **交互约定**：树里**单击**一个文件，内容显示进「焦点原文格」；**Ctrl+单击**（兼容
 * Cmd）再开一份原文格显示，新格接管焦点。焦点 = 最后一次鼠标点过的原文格（格内按下
 * 鼠标即接管，新开的格自动接管，格关掉释放）。多份原文格各显各的：单击只改焦点格。
 *
 * **不跟随状态**：接力棒只住本模块的内存里，不落盘。重启之后原文格是空的，
 * 等第一次单击。
 *
 * 单开出来是被测试逼出来的：这几件事是纯的（给它 shell 就照做），窗格交互本来就靠
 * 实机看，抠出来之后在 node 里直接验得了，组件那边只剩接线。
 */

/** 原文格的 pane id（registerPane 的第二条），`mountPane` 按它分派 */
export const VIEWER_PANE = 'viewer'

/** 树格与原文格之间那条线的事件名。detail 是 `{ target, payload }`，只有 target 对上
 * 的那份实例响应——多份原文格因此各显各的 */
export const FILE_SELECTED = 'file-selected'

/** 总线上那条事件的载荷，也是树里单击时递来的形状 */
export interface SelectionPayload {
  path: string
  name: string
  containerRoot: string
}

/**
 * 总线递来的载荷是 `unknown`——契约这么写是实话：桶不替谁校验形状，发的人爱发什么发什么。
 * 收窄只能在收的这一头自己做。
 */
export function pickPayload(raw: unknown): SelectionPayload | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  const p = r.path
  if (typeof p !== 'string' || p === '') return null
  return {
    path: p,
    name: typeof r.name === 'string' ? r.name : p,
    containerRoot: typeof r.containerRoot === 'string' ? r.containerRoot : '',
  }
}

/** 最近一次递去的文件。原文格挂载时拿它当初值；一次都没单击过就是 null（空态） */
let last: SelectionPayload | null = null

/** 焦点原文格的实例键（dockview 的 panel id）。null = 没有开着（或没有聚焦）的原文格 */
let focusedViewer: string | null = null

/** 见过的实例键。dockview 重排布局会把**已开着的格**拆了重挂（同一个实例键）——
 * 重挂不算「新开的一份」，不该抢焦点；Ctrl+单击开出的是全新实例键，才接管 */
const seenInstances = new Set<string>()

export function lastSelection(): SelectionPayload | null {
  return last
}

/** 原文格挂载时调用：新实例接管焦点；重挂的旧实例只在当前无焦点时接管 */
export function viewerMounted(instance: string): void {
  if (!seenInstances.has(instance) || focusedViewer === null) focusedViewer = instance
  seenInstances.add(instance)
}

/** 原文格内按下鼠标时调用：焦点移到这一份 */
export function noteViewerFocus(instance: string): void {
  focusedViewer = instance
}

/** 原文格关掉时调用：焦点只在它身上时才释放（别的格可能已经接管了） */
export function releaseViewerFocus(instance: string): void {
  if (focusedViewer === instance) focusedViewer = null
}

/**
 * 单击一个文件：内容进焦点原文格。
 *
 * **有焦点格** → 总线上喊一声，detail 带 `target`——只有那份实例响应，别的格固定不动。
 * **没有** → **广播**（detail 不带 target，所有开着的原文格都响应——重挂之后焦点为空
 * 但格还开着的局面靠它兜住）+ `openPane`（一格都没开时叫出第一份；新挂载的从 `last`
 * 拿初值）。所以先记 `last` 再开格，时序缺口才补得上。
 */
export function routeToFocused(shell: ShellBridge, payload: SelectionPayload): void {
  last = payload
  if (focusedViewer !== null) {
    shell.bus.emit(FILE_SELECTED, { target: focusedViewer, payload })
    return
  }
  shell.bus.emit(FILE_SELECTED, { payload })
  shell.openPane(VIEWER_PANE)
}

/**
 * Ctrl+单击一个文件：**再开一份**原文格显示它，新格接管焦点。
 *
 * 外壳的语义（`planOpen`，已核实）：`duplicate: true` 且这一格声明过 `duplicable`
 * 时**无论开没开过都开一份新的**、摆在右边；没声明过才退回聚焦。本件的 viewer
 * 声明了 `duplicable`，所以一处调用覆盖全部局面。
 */
export function openDuplicated(shell: ShellBridge, payload: SelectionPayload): void {
  last = payload
  shell.openPane(VIEWER_PANE, { duplicate: true })
}
