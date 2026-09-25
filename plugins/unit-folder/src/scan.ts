import fs from 'node:fs'
import path from 'node:path'

/** 现扫单元容器根：列出单元目录、读各自的出生证、按种类分组。每次调用都读盘，不缓存 */

/** 出生证文件名（单元根下） */
export const IDENTITY_FILE = 'unit.json'

/** 容器根下名叫这个的子目录不算单元：临时产物区的约定名 */
const TEMP_OUTPUT_DIR = 'out'

/** 单元的状态，固定三档：在做 / 搁着 / 退役 */
export const UNIT_STATUSES = ['active', 'paused', 'retired'] as const
export type UnitStatus = (typeof UNIT_STATUSES)[number]

/** 出生证的六项，全部必给，多一项不认识的也不行 */
export interface UnitIdentity {
  /** 种类，一个中文短词（「插件仓」「论文」），树里按它分组 */
  kind: string
  /** 短名，树里第一行 */
  title: string
  /** 这个单元是什么、干什么——唯一的自述；不写历史与沿革 */
  purpose: string
  status: UnitStatus
  /** lucide 图标名，kebab-case（`folder-tree`）；界面认不出就画默认的文件夹图标 */
  icon: string
  /** 出生时刻，ISO 8601 带时区 */
  createdAt: string
}

const IDENTITY_KEYS: readonly (keyof UnitIdentity)[] = ['kind', 'title', 'purpose', 'status', 'icon', 'createdAt']

/** lucide 图标名的形状：小写字母数字，连字符分段 */
const ICON_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * 一个单元的身份读数，三档：
 *
 * - `unclaimed`：没有出生证。这是正常状态，不是故障——有人手建了个目录还没认领
 * - `unreadable`：有出生证但读不出可用的身份，`reason` 说是哪一步坏的
 * - `claimed`：读出来了
 */
export type UnitIdentityRead =
  | { status: 'unclaimed' }
  | { status: 'unreadable'; reason: string }
  | { status: 'claimed'; identity: UnitIdentity }

/** 清单里的一行 */
export interface UnitEntry {
  name: string
  path: string
  identity: UnitIdentityRead
}

/** 一次现扫的全部结果 */
export interface UnitInventory {
  container: string
  /** 容器根在不在。根不存在是正常状态（回空表），跟扫不动（报错）是两回事 */
  rootExists: boolean
  byKind: { kind: string; units: UnitEntry[] }[]
  unidentified: UnitEntry[]
}

/** 一次扫描的结果：扫得动（哪怕根不存在）或扫不动（带原因） */
export type ScanOutcome =
  | { ok: true; rootExists: boolean; entries: UnitEntry[] }
  | { ok: false; error: string }

/** 一次现扫加分组的结果 */
export type InventoryOutcome = { ok: true; data: UnitInventory } | { ok: false; error: string }

/** 非空字符串——空串与纯空白都不算数 */
function isFilledString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

/** `catch` 到的是 unknown，不保证是 Error */
function errorMessageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** 跟随符号链接判断是不是目录。断链、没权限一律当「不是」：一个坏条目不让整次扫描失败 */
function isDirectory(target: string): boolean {
  try {
    return fs.statSync(target).isDirectory()
  } catch {
    return false
  }
}

/**
 * 验一份出生证的形状。读盘（`readIdentity`）与建单元（`unit-folder.create`）共用这一处，字段表只有一份。
 * 六项缺一、类型不对、多出不认识的字段，都回不出身份
 */
export function validateIdentity(raw: unknown): { ok: true; identity: UnitIdentity } | { ok: false; reason: string } {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ok: false, reason: '顶层不是一个对象' }
  const record = raw as Record<string, unknown>
  const unknownKeys = Object.keys(record).filter((k) => !(IDENTITY_KEYS as readonly string[]).includes(k))
  if (unknownKeys.length > 0) return { ok: false, reason: `有不认识的字段：${unknownKeys.join('、')}` }
  for (const key of IDENTITY_KEYS) {
    if (!isFilledString(record[key])) return { ok: false, reason: `缺 ${key}，或它不是非空字符串` }
  }
  const status = record.status as string
  if (!(UNIT_STATUSES as readonly string[]).includes(status)) {
    return { ok: false, reason: `status 只认 ${UNIT_STATUSES.join(' / ')}，给的是 ${status}` }
  }
  const icon = record.icon as string
  if (!ICON_NAME.test(icon)) return { ok: false, reason: `icon 要写 lucide 的 kebab-case 名（如 folder-tree），给的是 ${icon}` }
  return {
    ok: true,
    identity: {
      kind: record.kind as string,
      title: record.title as string,
      purpose: record.purpose as string,
      status: status as UnitStatus,
      icon,
      createdAt: record.createdAt as string,
    },
  }
}

/** 读一个单元根下的出生证。任何失败都收成一档读数、不抛：一个坏文件不让整张清单失败 */
export function readIdentity(unitDir: string): UnitIdentityRead {
  let identityText: string
  try {
    identityText = fs.readFileSync(path.join(unitDir, IDENTITY_FILE), 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException | null)?.code === 'ENOENT') return { status: 'unclaimed' }
    return { status: 'unreadable', reason: `读不动：${errorMessageOf(error)}` }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(identityText)
  } catch (error) {
    return { status: 'unreadable', reason: `不是合法 JSON：${errorMessageOf(error)}` }
  }
  const checked = validateIdentity(parsed)
  return checked.ok ? { status: 'claimed', identity: checked.identity } : { status: 'unreadable', reason: checked.reason }
}

/**
 * 扫一个容器根，回出全部单元：只列子目录，跳过 `out`。根不存在（ENOENT）回空表加 `rootExists: false`，
 * 别的读不动如实报错。按目录名字典序排，两次扫描的结果能直接比对
 */
export function scanContainer(container: string): ScanOutcome {
  let childNames: string[]
  try {
    childNames = fs.readdirSync(container)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | null)?.code
    if (code === 'ENOENT') return { ok: true, rootExists: false, entries: [] }
    return { ok: false, error: `扫不动容器根 ${container}：${errorMessageOf(error)}` }
  }
  const entries: UnitEntry[] = []
  for (const name of [...childNames].sort()) {
    if (name === TEMP_OUTPUT_DIR) continue
    const unitPath = path.join(container, name)
    if (!isDirectory(unitPath)) continue
    entries.push({ name, path: unitPath, identity: readIdentity(unitPath) })
  }
  return { ok: true, rootExists: true, entries }
}

/**
 * 按种类分组，只出结构、不出文本。没有身份的单元单独一摞，不归进任何种类组；
 * 组按种类名字典序排，不给任何种类排前面
 */
export function groupByKind(entries: UnitEntry[]): Omit<UnitInventory, 'container' | 'rootExists'> {
  const unitsByKind = new Map<string, UnitEntry[]>()
  const unidentified: UnitEntry[] = []
  for (const entry of entries) {
    if (entry.identity.status !== 'claimed') {
      unidentified.push(entry)
      continue
    }
    const kind = entry.identity.identity.kind
    const unitsOfKind = unitsByKind.get(kind)
    if (unitsOfKind) unitsOfKind.push(entry)
    else unitsByKind.set(kind, [entry])
  }
  return {
    byKind: [...unitsByKind.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([kind, units]) => ({ kind, units })),
    unidentified,
  }
}

/** 扫描加分组 */
export function takeInventory(container: string): InventoryOutcome {
  const scan = scanContainer(container)
  if (!scan.ok) return scan
  return {
    ok: true,
    data: { container, rootExists: scan.rootExists, ...groupByKind(scan.entries) },
  }
}
