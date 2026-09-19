/**
 * 外壳交给窗格件的那一层。**按形状收，不牵别处的类型**（件仓 shell 的同名文件就是
 * 这么做的，正本在那边：`plugins/shell/src/client/types.ts`）——外壳递来的实参天然
 * 兼容这几个结构，本件不 import 它的包， Tests 也好在纯 node 里造假的。
 */

/** 内核交出来的命令口。整条链路是：界面 → IPC → 主进程 → fd3 → 内核 dispatch → ctx.gwbCommands */
export interface HostBridge {
  call(command: string, args?: unknown): Promise<unknown>
}

/**
 * 外壳交给窗格件的那一层。件只操作得了**自己**那几格——`openPane` 的 entryId 由
 * `PluginPane` 造这个对象时闭包绑定，件报不出别人的。这儿只收本件用到的几支
 * （桥上还有 `setPaneContent` / `keepPane` / `bus` 等，本件不用）。
 */
export interface ShellBridge {
  /**
   * 开本件的一格。来源自动是调它的这一格，新窗格落在它旁边。`key` 是这一份装的内容（目标组里
   * 同 key 就激活已有那份）、`params` 原样落到那一份的 `pane.params`（随布局落盘）、
   * `preview: true` 放进目标组的预览格、`placement: 'side'` 开到旁边
   */
  openPane(
    paneId: string,
    options?: { key?: string; params?: Record<string, unknown>; preview?: boolean; placement?: 'auto' | 'side' },
  ): void
  /**
   * 改这一格标签上的标题。**可选**：shell 0.0.13 才开这个口，旧外壳上没有这个方法
   * （?. 调用优雅降级成静态标题）。原文格把标签改成当前文件名走这里。
   */
  setPaneTitle?(title: string): void
}

/** 外壳调件的 `mountPane` 时给的那几样 */
export interface PaneArgs {
  host: HostBridge
  shell: ShellBridge
  pane: {
    /** 这一格是本件的哪一格（注册时给的那个 id） */
    id: string
    /** 这**一份**的唯一键（dockview 的 panel id）。开两份时两份的这个值不一样，全页唯一 */
    instance: string
    /** 外壳把这一格当哪一类挂的（注册时说的 kind，不说就是 tool）。老外壳不给 */
    kind?: 'tool' | 'document'
    /** 开这一份时给的参数（`openPane` 的 `params`），跟着布局落盘。没给就没有这一项 */
    params?: Record<string, unknown>
  }
}

/** `mountPane` 回的句柄：`retarget` 给了，外壳换这一格的 params 时软换，不拆了重挂 */
export interface PaneHandle {
  dispose(): void
  retarget?(params: Record<string, unknown>): void
}

import type { GwbWindowApi } from '@godcreator/gwb-plugin-api'

// 页面的公共面。直接用词汇表的本体声明——本地另收窄一份会撞 TS2717（词汇表在 node 侧
// 编译里也全局声明了它，两份形状不同就红）
declare global {
  interface Window {
    gwb: GwbWindowApi
  }
}
