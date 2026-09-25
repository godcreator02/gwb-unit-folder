/**
 * 工具条按钮：别的插件往单元树窗格的工具条里登记的动作按钮。登记表在 node 侧，按钮画在浏览器侧，
 * 按钮表经 `unit-folder.toolbarButtons` 交给浏览器侧；点击与「可不可用」都按登记里给的命令名经命令总线调回登记方。
 * 这一层不依赖 cordis
 */

/** 登记一个按钮时要给的那几样。id 在本条目内唯一；身份（entryId / pkg）由服务层填 */
export interface ToolbarButtonSpec {
  id: string
  /** lucide 图标名（kebab-case）。浏览器侧只认一张固定的图标表，认不出的画默认图标 */
  icon: string
  /** 悬停说明；无障碍标签也用它 */
  label: string
  /**
   * 点击调的命令名。参数 `{ unitPath?, item?, from?, …args }`——`from` 是单元树窗格的实例 id
   * （`pane.instance`），命令要开窗格就原样传给 `shell.openPane`，新窗格开在单元树旁边
   */
  command: string
  /**
   * 问「现在可不可用」的命令名：参数 `{ unitPath, …args }`，回的 data 是 `ButtonState` 的形状——
   * `enabled: false` 就是不可用；`items` 两项起点击弹菜单挑、一项直接点（带那一项的 id）。
   * 没选中单元时不问、一律不可用；不给 `state` 的按钮一直可用、点击不带 item
   */
  state?: string
  /** 合并进点击与询问参数里的附加键 */
  args?: Record<string, unknown>
}

/** 表里一条：登记方给的那几样 + 服务填的身份 */
export type RegisteredToolbarButton = ToolbarButtonSpec & { entryId: string; pkg: string }

export interface ToolbarButtonRegistry {
  /** 登记一个，回注销函数（只注销自己那份，调两次不出错） */
  register(owner: { entryId: string; pkg: string }, spec: ToolbarButtonSpec): () => void
  /** 此刻表里有哪些，按登记先后 */
  list(): RegisteredToolbarButton[]
}

/**
 * `warn` 由调用方给，运行时是 cordis logger。空 id / 空 icon / 空 label / 空 command 抛错；
 * 同一条目重复登记同一个 id 时后来者生效，并 warn 一句——跟窗格注册表、命令总线同一个规矩
 */
export function createToolbarButtonRegistry(warn: (message: string) => void): ToolbarButtonRegistry {
  const buttonsByKey = new Map<string, RegisteredToolbarButton>()

  return {
    register(owner, spec) {
      if (spec.id === '') throw new Error(`${owner.pkg} 登记的工具条按钮没有 id`)
      if (spec.icon === '') throw new Error(`${owner.pkg} 的工具条按钮 ${spec.id} 没给 icon`)
      if (spec.label === '') throw new Error(`${owner.pkg} 的工具条按钮 ${spec.id} 没给 label`)
      if (spec.command === '') throw new Error(`${owner.pkg} 的工具条按钮 ${spec.id} 没给 command`)
      const key = `${owner.entryId}:${spec.id}`
      const registered: RegisteredToolbarButton = { ...spec, entryId: owner.entryId, pkg: owner.pkg }
      const replaced = buttonsByKey.get(key)
      if (replaced !== undefined) {
        warn(`条目 ${owner.entryId} 的工具条按钮 ${spec.id} 被重复登记，后来者生效：${replaced.label} → ${registered.label}`)
      }
      buttonsByKey.set(key, registered)
      // 被后来者替换之后再注销，删的不能是后来者那条
      return () => {
        if (buttonsByKey.get(key) === registered) buttonsByKey.delete(key)
      }
    },

    list() {
      return [...buttonsByKey.values()]
    },
  }
}

/**
 * 点一个按钮时传给它那条命令的参数。没选中单元不带 `unitPath`、没挑菜单项不带 `item`；
 * `from`（单元树窗格的实例 id）总带。登记方的 `args` 最后展开，同名的覆盖前面几样
 */
export function clickArgsOf(
  button: Pick<ToolbarButtonSpec, 'args'>,
  at: { unitPath: string | null; item?: string | undefined; from: string },
): Record<string, unknown> {
  return {
    ...(at.unitPath === null ? {} : { unitPath: at.unitPath }),
    ...(at.item === undefined ? {} : { item: at.item }),
    from: at.from,
    ...(button.args ?? {}),
  }
}

/** state 命令回执里 data 的形状，登记方照着它写 */
export interface ButtonState {
  /** false = 不可用 */
  enabled: boolean
  /** 两项起点击弹菜单挑；一项直接点。一行 `{ id, label, detail? }` */
  items: Array<{ id: string; label: string; detail?: string }>
}

/**
 * state 命令的回执 → `ButtonState`。回执来自别的插件，写错了不让工具条画不出来：
 * `enabled` 只认 true，`items` 里缺 id / 缺 label 的行整行丢，其余字段不看
 */
export function parseButtonState(data: unknown): ButtonState {
  if (data === null || typeof data !== 'object') return { enabled: false, items: [] }
  const reply = data as { enabled?: unknown; items?: unknown }
  const items: ButtonState['items'] = []
  if (Array.isArray(reply.items)) {
    for (const row of reply.items) {
      if (row === null || typeof row !== 'object') continue
      const item = row as { id?: unknown; label?: unknown; detail?: unknown }
      if (typeof item.id !== 'string' || item.id === '' || typeof item.label !== 'string' || item.label === '') continue
      items.push(
        typeof item.detail === 'string' && item.detail !== ''
          ? { id: item.id, label: item.label, detail: item.detail }
          : { id: item.id, label: item.label },
      )
    }
  }
  return { enabled: reply.enabled === true, items }
}

/** 登记表一变（登记、注销、被替换），node 侧经内核事件推这一条；页面收到后重取按钮表 */
export const TOOLBAR_EVENT = 'gwb-unit-folder-toolbar'

/** 是不是本插件那条事件。内核事件通道上所有插件的事件都有，认了 `t` 再处理 */
export function isToolbarNudge(payload: unknown): boolean {
  if (payload === null || typeof payload !== 'object') return false
  return (payload as { t?: unknown }).t === TOOLBAR_EVENT
}
