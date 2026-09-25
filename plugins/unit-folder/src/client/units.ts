/**
 * 单元树窗格的数据形状与判断：`unit-folder.list` 的回执长什么样、过滤怎么判、图标名怎么换成 lucide 的导出名。
 * 不依赖 React 与命令总线，测试在 node 里直接跑
 */

// ── 数据形状（与 node 侧 unit-folder.list 的回执对应） ─────────────────────────────

export const UNIT_STATUSES = ['active', 'paused', 'retired'] as const
export type UnitStatus = (typeof UNIT_STATUSES)[number]

export interface UnitIdentity {
  kind: string
  title: string
  purpose: string
  status: UnitStatus
  icon: string
  createdAt: string
}

export type IdentityRead =
  | { status: 'unclaimed' }
  | { status: 'unreadable'; reason: string }
  | { status: 'claimed'; identity: UnitIdentity }

export interface UnitEntry {
  name: string
  path: string
  identity: IdentityRead
}

export interface UnitInventory {
  container?: string
  rootExists?: boolean
  byKind?: Array<{ kind: string; units: UnitEntry[] }>
  unidentified?: UnitEntry[]
  /** 置顶的单元，按置顶先后 */
  pinned?: UnitEntry[]
}

/** 状态标签上的字 */
export const STATUS_LABEL: Record<UnitStatus, string> = {
  active: '在做',
  paused: '搁着',
  retired: '退役',
}

/** 树里文字压暗显示的状态：搁着的与退役的 */
export const QUIET_STATUSES: ReadonlySet<UnitStatus> = new Set<UnitStatus>(['paused', 'retired'])

/** 「没出生证 / 读不出」那一摞在种类过滤里的键。带下划线打头，真种类名撞不上 */
export const UNIDENTIFIED_KIND = '__unidentified'

/** 打开窗格时的过滤：退役的藏起来，种类不限，没有文字 */
export const DEFAULT_STATUSES: ReadonlySet<UnitStatus> = new Set<UnitStatus>(['active', 'paused'])

export interface UnitFilter {
  statuses: ReadonlySet<UnitStatus>
  /** 空集 = 不按种类筛 */
  kinds: ReadonlySet<string>
  query: string
}

// ── 过滤 ──────────────────────────────────────────────────────────────────────

/**
 * 一个单元过不过得了筛。
 *
 * - **状态**只筛认领过的；没出生证、读不出的没有状态，状态筛不掉它们，一直显示着等人补出生证
 * - **种类**空集不筛；非空时认领过的按 `kind`，其余按 `UNIDENTIFIED_KIND`
 * - **文字**不分大小写，匹配目录名、title、purpose、kind 任一
 */
export function matchesUnit(unit: UnitEntry, filter: UnitFilter): boolean {
  const identity = unit.identity.status === 'claimed' ? unit.identity.identity : null
  if (identity !== null && !filter.statuses.has(identity.status)) return false
  if (filter.kinds.size > 0 && !filter.kinds.has(identity?.kind ?? UNIDENTIFIED_KIND)) return false
  const normalizedQuery = filter.query.trim().toLowerCase()
  if (normalizedQuery === '') return true
  const searchableTexts = [unit.name, identity?.title, identity?.purpose, identity?.kind]
  return searchableTexts.some((text) => text !== undefined && text.toLowerCase().includes(normalizedQuery))
}

export interface UnitGroup {
  kindKey: string
  label: string
  units: UnitEntry[]
}

/** 清单里有哪些种类（给种类标签排用），认领过的按字典序，有没出生证的再追一个 */
export function kindsOf(inventory: UnitInventory): Array<{ key: string; label: string }> {
  const kindOptions = (inventory.byKind ?? []).map((group) => ({ key: group.kind, label: group.kind }))
  if ((inventory.unidentified ?? []).length > 0) kindOptions.push({ key: UNIDENTIFIED_KIND, label: '未认领' })
  return kindOptions
}

/** 按过滤摘出要画的分组，筛空了的组整个不要 */
export function filterGroups(inventory: UnitInventory, filter: UnitFilter): UnitGroup[] {
  const groups: UnitGroup[] = (inventory.byKind ?? []).map((g) => ({ kindKey: g.kind, label: g.kind, units: g.units }))
  if ((inventory.unidentified ?? []).length > 0) {
    groups.push({ kindKey: UNIDENTIFIED_KIND, label: '未认领', units: inventory.unidentified ?? [] })
  }
  return groups
    .map((g) => ({ ...g, units: g.units.filter((u) => matchesUnit(u, filter)) }))
    .filter((g) => g.units.length > 0)
}

/** 集合里有就拿掉、没有就加上。回新集合，原集合不动（React state 要新引用） */
export function toggled<T>(set: ReadonlySet<T>, item: T): Set<T> {
  const next = new Set(set)
  if (next.has(item)) next.delete(item)
  else next.add(item)
  return next
}

// ── 图标 ──────────────────────────────────────────────────────────────────────

/** lucide 的 kebab-case 名 → 它在 `icons` 表里的键（`folder-tree` → `FolderTree`，`book-open-2` → `BookOpen2`） */
export function lucideKey(name: string): string {
  return name
    .split('-')
    .filter((part) => part !== '')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
}
