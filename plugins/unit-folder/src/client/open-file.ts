import type { ShellBridge } from './types.js'

/**
 * 树里点一个文件，开成什么样的原文窗格。原文窗格是文档窗格：一份装一个文件，key 是文件的绝对路径，
 * 装哪个文件存在这一份的参数里、随布局保存。开在哪、查不查重、预览替不替换都归外壳，这里只按外壳的手势约定
 * 说出这一下是哪种开法。不依赖 React，测试在 node 里直接跑
 */

/** 原文窗格的 pane id（registerPane 的第二个），`mountPane` 按它分派 */
export const VIEWER_PANE = 'viewer'

/** 原文窗格装的那个文件：参数里存的就是这三样 */
export interface ViewerFile {
  path: string
  name: string
  containerRoot: string
}

/**
 * 单元树里一次点击的开法。单元树是工具窗格、不是原文窗格，所以单击是「从别处单击 = 预览」：
 *
 * | 手势 | 开法 |
 * | --- | --- |
 * | 单击 | `preview`：放进目标组的预览窗格，下一次单击替换它 |
 * | Ctrl / ⌘ + 单击、中键 | `new`：不要预览的普通打开，原文窗格那一组的新标签 |
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

export function openModeOf(gesture: Gesture): OpenMode {
  const withModifier = gesture.ctrlKey || gesture.metaKey
  if (withModifier && gesture.altKey) return 'side'
  if (withModifier || gesture.button === 1) return 'new'
  return 'preview'
}

/** 一个文件在外壳眼里的内容：key 是绝对路径，参数原样带着那三样 */
export function viewerContentOf(file: ViewerFile): { key: string; params: Record<string, unknown> } {
  return { key: file.path, params: { path: file.path, name: file.name, containerRoot: file.containerRoot } }
}

/**
 * 参数 → 文件。参数来自保存的布局（整页重载、旧版本留下的空窗格都会走到这里），收下时才能判形状。
 * 没有 path 的一律不收（空态）；name 缺就用 path、containerRoot 缺就是空串
 */
export function fileOfParams(raw: unknown): ViewerFile | null {
  if (typeof raw !== 'object' || raw === null) return null
  const params = raw as Record<string, unknown>
  const filePath = params.path
  if (typeof filePath !== 'string' || filePath === '') return null
  return {
    path: filePath,
    name: typeof params.name === 'string' ? params.name : filePath,
    containerRoot: typeof params.containerRoot === 'string' ? params.containerRoot : '',
  }
}

/** 按开法开一个原文窗格。来源自动是调它的这个窗格（单元树），外壳据此把原文窗格开在它旁边 */
export function openViewer(shell: ShellBridge, file: ViewerFile, mode: OpenMode): void {
  const { key, params } = viewerContentOf(file)
  if (mode === 'preview') shell.openPane(VIEWER_PANE, { key, params, preview: true })
  else if (mode === 'side') shell.openPane(VIEWER_PANE, { key, params, placement: 'side' })
  else shell.openPane(VIEWER_PANE, { key, params })
}
