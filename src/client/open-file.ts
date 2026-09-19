import type { ShellBridge } from './types.js'

/**
 * 树里点一个文件，开成什么样的原文格（浏览器半，纯机：给它 shell 就照做，node 里直接测）。
 *
 * 原文格是**文档窗格**：一份装一个文件，身份（key）是文件的绝对路径，装的是哪个文件住在
 * 这一份的参数里，跟着布局落盘。开在哪、查不查重、预览顶不顶掉，全归外壳——本件只按外壳的
 * 手势约定说「这一下是哪种开法」。
 */

/** 原文格的 pane id（registerPane 的第二条），`mountPane` 按它分派 */
export const VIEWER_PANE = 'viewer'

/** 原文格装的那个文件：参数里存的就是这三样 */
export interface ViewerFile {
  path: string
  name: string
  containerRoot: string
}

/**
 * 树格里一次点击的开法。照外壳窗格模型第二版「给文档窗格插件的手势约定」——树格是工具窗格，
 * 不是原文格，所以单击落「从别处单击 = 预览」那一行：
 *
 * | 手势 | 开法 |
 * | --- | --- |
 * | 单击 | `preview`：放进目标组的预览格，下一次单击顶掉它 |
 * | Ctrl / ⌘ + 单击、中键 | `new`：不要预览的普通打开，原文格那一组的新标签 |
 * | Ctrl / ⌘ + Alt / ⌥ + 单击 | `side`：开到旁边 |
 */
export type OpenMode = 'preview' | 'new' | 'side'

/** 鼠标事件里用得着的那几样，按形状收（react 的合成事件与 DOM 事件都满足） */
export interface Gesture {
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  /** 0 左键，1 中键 */
  button: number
}

export function openModeOf(e: Gesture): OpenMode {
  const mod = e.ctrlKey || e.metaKey
  if (mod && e.altKey) return 'side'
  if (mod || e.button === 1) return 'new'
  return 'preview'
}

/** 一个文件在外壳眼里的内容：key 是绝对路径，参数原样带着那三样 */
export function viewerContentOf(file: ViewerFile): { key: string; params: Record<string, unknown> } {
  return { key: file.path, params: { path: file.path, name: file.name, containerRoot: file.containerRoot } }
}

/**
 * 参数 → 文件。参数来自落盘的布局（整页重载、老版本留下的空格子都会走到这儿），是 `unknown`
 * 的实话——收窄只能在收的这一头做。没有 path 的一律不收（空态）；name 缺就落 path、
 * containerRoot 缺就空串，少一样不该整条丢掉。
 */
export function fileOfParams(raw: unknown): ViewerFile | null {
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

/** 按开法开一格原文。来源自动是调它的这一格（树格），外壳据此把原文格摆在它旁边 */
export function openViewer(shell: ShellBridge, file: ViewerFile, mode: OpenMode): void {
  const { key, params } = viewerContentOf(file)
  if (mode === 'preview') shell.openPane(VIEWER_PANE, { key, params, preview: true })
  else if (mode === 'side') shell.openPane(VIEWER_PANE, { key, params, placement: 'side' })
  else shell.openPane(VIEWER_PANE, { key, params })
}
