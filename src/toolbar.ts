/**
 * 工具条按钮：别的件往单元树格的工具条里登记的动作按钮。
 *
 * 皮在浏览器半、登记在 node 半——按钮表经 `unit-folder.toolbarButtons` 过桥，点击与
 * 「亮不亮」的问询都走命令总线，皮不认识任何登记方（跟窗格注册那张表同一个方向：
 * 特殊认识一般）。纯机、无 cordis，测试在 node 里直接跑。
 */

/** 登记一颗按钮时要给的那几样。id 在本条目内唯一；身份（entryId / pkg）由服务层填 */
export interface ToolbarButtonSpec {
  id: string
  /** lucide 图标裸名（kebab-case）。皮那边是白名单，认不出的画兜底图标 */
  icon: string
  /** 悬停说明；无障碍标签也用它 */
  label: string
  /** 点击调的命令（总线名）。参数 `{ unitPath?, item?, …args }` */
  command: string
  /**
   * 问「现在亮不亮」的命令（总线名）：参数 `{ unitPath, …args }`，回的 data 是
   * `ButtonState` 那个形状——`enabled: false` 就是灰的；`items` 两项起点击弹菜单挑、
   * 一项直接点（带那一项的 id）。**没选中单元时不问、一律灰**；不给 `state` 的按钮
   * 常亮、点击不带 item
   */
  state?: string
  /** 并进点击与问询参数里的附加键 */
  args?: Record<string, unknown>
}

/** 表里一条：登记方给的那几样 + 服务填的身份 */
export type RegisteredToolbarButton = ToolbarButtonSpec & { entryId: string; pkg: string }

export interface ToolbarButtonRegistry {
  /** 登记一颗，回注销函数（只收自己那份，摘两遍不炸） */
  register(owner: { entryId: string; pkg: string }, spec: ToolbarButtonSpec): () => void
  /** 此刻表里有哪些，按登记先后 */
  list(): RegisteredToolbarButton[]
}

/**
 * `warn` 由调用方给，真跑时是 cordis logger。空 id / 空 icon / 空 label / 空 command
 * 抛错（这一条根本没说自己是谁，让它进表只会在工具条上多出一颗点不开的灰点）；
 * 撞名后来者赢但出声——跟窗格注册表、命令总线同一个规矩。
 */
export function createToolbarButtonRegistry(warn: (message: string) => void): ToolbarButtonRegistry {
  const table = new Map<string, RegisteredToolbarButton>()

  return {
    register(owner, spec) {
      if (spec.id === '') throw new Error(`${owner.pkg} 登记的工具条按钮没有 id`)
      if (spec.icon === '') throw new Error(`${owner.pkg} 的工具条按钮 ${spec.id} 没给 icon`)
      if (spec.label === '') throw new Error(`${owner.pkg} 的工具条按钮 ${spec.id} 没给 label`)
      if (spec.command === '') throw new Error(`${owner.pkg} 的工具条按钮 ${spec.id} 没给 command`)
      const key = `${owner.entryId}:${spec.id}`
      const record: RegisteredToolbarButton = { ...spec, entryId: owner.entryId, pkg: owner.pkg }
      const prev = table.get(key)
      if (prev !== undefined) {
        warn(`条目 ${owner.entryId} 的工具条按钮 ${spec.id} 被重复登记，后来者生效：${prev.label} → ${record.label}`)
      }
      table.set(key, record)
      // 只收自己那份：被后来者顶掉之后再摘，摘的就不该是别人那条
      return () => {
        if (table.get(key) === record) table.delete(key)
      }
    },

    list() {
      return [...table.values()]
    },
  }
}

/** state 命令回的 data 里那半。皮那边宽松收，这里的类型是登记方照着写的契约 */
export interface ButtonState {
  /** false = 灰的、点不动 */
  enabled: boolean
  /** 两项起点击弹菜单挑；一项直接点。一行 `{ id, label, detail? }` */
  items: Array<{ id: string; label: string; detail?: string }>
}

/**
 * state 命令的回包 → `ButtonState`。**宽松收**：回包来自别的件，写错不该把工具条画炸
 * ——`enabled` 只认真值，`items` 里缺 id / 缺 label 的行整行丢，其它字段全都不看。
 */
export function parseButtonState(data: unknown): ButtonState {
  if (data === null || typeof data !== 'object') return { enabled: false, items: [] }
  const d = data as { enabled?: unknown; items?: unknown }
  const items: ButtonState['items'] = []
  if (Array.isArray(d.items)) {
    for (const row of d.items) {
      if (row === null || typeof row !== 'object') continue
      const r = row as { id?: unknown; label?: unknown; detail?: unknown }
      if (typeof r.id !== 'string' || r.id === '' || typeof r.label !== 'string' || r.label === '') continue
      items.push(
        typeof r.detail === 'string' && r.detail !== '' ? { id: r.id, label: r.label, detail: r.detail } : { id: r.id, label: r.label },
      )
    }
  }
  return { enabled: d.enabled === true, items }
}

/** 登记表一变（挂 / 卸 / 顶掉），node 半经内核事件口推这一声；页面听见重取按钮表 */
export const TOOLBAR_EVENT = 'gwb-unit-folder-toolbar'

/** 是不是那一声。事件口上什么件的事件都有，认了自己那记号再动手 */
export function isToolbarNudge(payload: unknown): boolean {
  if (payload === null || typeof payload !== 'object') return false
  return (payload as { t?: unknown }).t === TOOLBAR_EVENT
}
