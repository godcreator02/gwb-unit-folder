/**
 * 外壳交给窗格插件的参数，按形状收下本插件用到的那几样（正本是界面插件仓 `plugins/shell/src/client/types.ts`）。
 * 测试里用它造假的外壳对象
 */

/** 命令接口。一次调用经页面 → 主进程 → 内核 → `ctx.gwbCommands` */
export interface HostBridge {
  call(command: string, args?: unknown): Promise<unknown>
}

/**
 * 外壳交给窗格插件的那组方法。插件只操作得了自己的窗格：`openPane` 的 entryId 由外壳造这个对象时绑定。
 * 这里只收本插件用到的几个方法
 */
export interface ShellBridge {
  /**
   * 开本插件的一个窗格。来源自动是调它的这个窗格，新窗格开在它旁边。`key` 是这一份装的内容（目标组里
   * 同 key 就激活已有那份）、`params` 原样存进那一份的 `pane.params`（随布局保存）、
   * `preview: true` 放进目标组的预览窗格、`placement: 'side'` 开到旁边
   */
  openPane(
    paneId: string,
    options?: { key?: string; params?: Record<string, unknown>; preview?: boolean; placement?: 'auto' | 'side' },
  ): void
  /** 改这个窗格标签上的标题。原文窗格把标签改成当前文件名 */
  setPaneTitle?(title: string): void
}

/** 外壳调插件的 `mountPane` 时给的参数 */
export interface PaneArgs {
  host: HostBridge
  shell: ShellBridge
  pane: {
    /** 这个窗格是本插件注册的哪一个（注册时给的那个 id） */
    id: string
    /** 这一份的唯一键（dockview 的 panel id）。开两份时两份的这个值不一样，全页唯一 */
    instance: string
    /** 外壳把这个窗格当哪一类打开的（注册时说的 kind，不说就是 tool） */
    kind?: 'tool' | 'document'
    /** 开这一份时给的参数（`openPane` 的 `params`），随布局保存。没给就没有这一项 */
    params?: Record<string, unknown>
  }
}

/** `mountPane` 回的句柄：给了 `retarget`，外壳换这个窗格的 params 时就原地换内容，不卸载重新挂载 */
export interface PaneHandle {
  dispose(): void
  retarget?(params: Record<string, unknown>): void
}

import type { GwbWindowApi } from '@godcreator/gwb-kernel-desktop'

// 页面的全局接口直接用内核包的声明：本地另写一份收窄的会撞 TS2717（内核包在 node 侧编译里也全局声明了它）
declare global {
  interface Window {
    gwb: GwbWindowApi
  }
}
