/**
 * 外壳交给窗格插件的参数。**按形状收，不引用外壳包的类型**（外壳的同名文件是正本：界面插件仓
 * `plugins/shell/src/client/types.ts`）——外壳传来的实参天然兼容这几个结构，本插件不 import 外壳的包，
 * 测试也方便在纯 node 里造假的。
 */

/** 内核交出来的命令接口。整条链路是：界面 → IPC → 主进程 → fd3 → 内核 dispatch → ctx.gwbCommands */
export interface HostBridge {
  call(command: string, args?: unknown): Promise<unknown>
}

/**
 * 外壳交给窗格插件的那组方法。插件只操作得了**自己**的窗格——`openPane` 的 entryId 由
 * `PluginPane` 造这个对象时闭包绑定，插件报不出别人的。这儿只收本插件用到的几个方法
 * （外壳还给了 `setPaneContent` / `keepPane` / `bus` 等，本插件不用）。
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
  /**
   * 改这个窗格标签上的标题。**可选**：shell 0.0.13 起才有这个方法，旧外壳上没有
   * （用 ?. 调用，没有就保持静态标题）。原文窗格把标签改成当前文件名用的是它。
   */
  setPaneTitle?(title: string): void
}

/** 外壳调插件的 `mountPane` 时给的参数 */
export interface PaneArgs {
  host: HostBridge
  shell: ShellBridge
  pane: {
    /** 这个窗格是本插件注册的哪一个（注册时给的那个 id） */
    id: string
    /** 这**一份**的唯一键（dockview 的 panel id）。开两份时两份的这个值不一样，全页唯一 */
    instance: string
    /** 外壳把这个窗格当哪一类打开的（注册时说的 kind，不说就是 tool）。旧外壳不给 */
    kind?: 'tool' | 'document'
    /** 开这一份时给的参数（`openPane` 的 `params`），随布局保存。没给就没有这一项 */
    params?: Record<string, unknown>
  }
}

/** `mountPane` 回的句柄：给了 `retarget`，外壳换这个窗格的 params 时就原地换内容，不卸载重挂 */
export interface PaneHandle {
  dispose(): void
  retarget?(params: Record<string, unknown>): void
}

import type { GwbWindowApi } from '@godcreator/gwb-kernel-desktop'

// 页面的公共接口。直接用内核包的声明——本地另写一份收窄的会撞 TS2717（内核包在 node 侧
// 编译里也全局声明了它，两份形状不同就报错）
declare global {
  interface Window {
    gwb: GwbWindowApi
  }
}
