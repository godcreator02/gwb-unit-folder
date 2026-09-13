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
 * `PluginPane` 造这个对象时闭包绑定，件报不出别人的。
 */
export interface ShellBridge {
  openPane(paneId: string, options?: { duplicate?: boolean }): void
  /**
   * 改这一格标签上的标题。**可选**：shell 0.0.13 才开这个口，旧外壳上没有这个方法
   * （?. 调用优雅降级成静态标题）。原文格把标签改成当前文件名走这里。
   */
  setPaneTitle?(title: string): void
  /** 格间小总线。桶按条目分，所以同一条条目的几格（含重复实例）在同一个桶里 */
  bus: {
    emit(type: string, detail?: unknown): void
    /** 挂一个听众，回注销函数 */
    on(type: string, listener: (detail: unknown) => void): () => void
  }
}

/** 外壳调件的 `mountPane` 时给的那几样 */
export interface PaneArgs {
  host: HostBridge
  shell: ShellBridge
  pane: {
    /** 这一格是本件的哪一格（注册时给的那个 id） */
    id: string
    /** 这**一份**的唯一键（dockview 的 panel id）。开两份时两份的这个值不一样 */
    instance: string
  }
}

/** 页面的公共面里本件用得着的一条。按形状收，正本在内核的词汇表包 */
declare global {
  interface Window {
    gwb: {
      /** 内核事件口的页面那半：node 半 gwbKernel.emit 推的载荷全从这儿出（工具条按钮表那一声） */
      on(listener: (payload: unknown) => void): () => void
    }
  }
}
