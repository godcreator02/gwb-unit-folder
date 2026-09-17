import fs from 'node:fs'
import path from 'node:path'

/**
 * 单元容器的现扫：目录名、出生证读出来是什么、按种类分组。**纯机、不缓存**。
 *
 * 不缓存是有意的：一次现扫的代价是「列一个目录 + 每个子目录读一个小文件」，规模是
 * 几十个；而缓存要回答「谁负责失效、手工建的目录什么时候进表」，那笔账比这点开销贵
 * 得多。正因为每次都现读，才敢说盘上就是真相。
 *
 * 「单元」是个纯粹的目录约定：容器根下一层一个目录，目录里放一张出生证 `unit.json`
 * 说清它是哪一类、干嘛的。没有服务、没有索引、没有注册表——所以这一层只要 `node:fs`。
 */

/** 出生证文件名（单元根下） */
export const IDENTITY_FILE = 'unit.json'

/** 单元的状态，固定三档：在做 / 搁着 / 退役 */
export const UNIT_STATUSES = ['active', 'paused', 'retired'] as const
export type UnitStatus = (typeof UNIT_STATUSES)[number]

/** 出生证的六项，全部必给，多一项不认识的也不行 */
export interface UnitIdentity {
  /** 种类，一个中文短词（「插件仓」「论文」），树里按它分组 */
  kind: string
  /** 短名，树里第一行 */
  title: string
  /** 这个单元是什么、为什么存在、跟谁什么关系——唯一的自述 */
  purpose: string
  status: UnitStatus
  /** lucide 图标名，kebab-case（`folder-tree`）；界面认不出就画兜底 */
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
 * - `unclaimed`：没有出生证。这是**正常状态**，不是故障——有人手建了个目录还没认领
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
  /**
   * 容器根在不在。**「还没有这个目录」与「扫不动」是两回事**：前者是正常状态（配置可以
   * 先于目录写下，换机器、待挂载的盘都会这样），空表加这一面旗就够；后者说明配置指错了
   * 地方或者权限不对，得让人看见原因，不能拿一张空表冒充「这儿没有单元」。
   */
  rootExists: boolean
  byKind: { kind: string; units: UnitEntry[] }[]
  unidentified: UnitEntry[]
}

/** 一次扫描的下场：扫得动（哪怕根不存在）或扫不动（带原因） */
export type ScanOutcome =
  | { ok: true; rootExists: boolean; entries: UnitEntry[] }
  | { ok: false; error: string }

/** 一次现扫的下场 */
export type InventoryOutcome = { ok: true; data: UnitInventory } | { ok: false; error: string }

/** 非空字符串——空串与纯空白都不算数 */
function isFilledString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

/** 把捕获到的东西渲染成一句人话。`catch` 到的是 unknown，不保证是 Error */
function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** 跟随符号链接判断是不是目录。断链、没权限一律当「不是」——一个坏条目不该让整次扫描失败 */
function isDirectory(target: string): boolean {
  try {
    return fs.statSync(target).isDirectory()
  } catch {
    return false
  }
}

/**
 * 验一份出生证的形状。读盘（`readIdentity`）与建单元（`unit-folder.create`）共用这一处，
 * 字段表只有一份。
 *
 * **严格**：六项缺一、类型不对、多出不认识的字段，都回不出身份。多出的字段也拒，是因为
 * 出生证是人与 agent 手写的，拼错一个键名（`tittle`）或留着旧写法，宽松读法会把它静默吞掉。
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

/**
 * 读一个单元根下的出生证。**任何失败都收敛成一档读数，不抛**——调用方是一张清单，
 * 它要的是「这一行显示什么」，一个坏文件不该让整张表崩掉。
 */
export function readIdentity(unitDir: string): UnitIdentityRead {
  let raw: string
  try {
    raw = fs.readFileSync(path.join(unitDir, IDENTITY_FILE), 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException | null)?.code === 'ENOENT') return { status: 'unclaimed' }
    return { status: 'unreadable', reason: `读不动：${describe(error)}` }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    return { status: 'unreadable', reason: `不是合法 JSON：${describe(error)}` }
  }
  const checked = validateIdentity(parsed)
  return checked.ok ? { status: 'claimed', identity: checked.identity } : { status: 'unreadable', reason: checked.reason }
}

/**
 * 扫一个容器根，回出全部单元。
 *
 * **只认目录，不认文件**：容器根下散落的文件（临时脚本、日志）一概不进表——它们不是
 * 单元，列出来只会让人以为漏了什么。直接子目录里名叫 `out` 的同样豁免：那是临时产物区
 * 的约定名。
 *
 * **只有「根不存在」这一种失败算正常**（ENOENT）：那说明这台机器上还没有单元，回空表
 * 加 `rootExists: false`。别的失败一概如实报——根指到了一个文件（ENOTDIR）、没权限
 * 读（EACCES）、盘掉了，这些都是「配置指错地方或环境不对」，拿一张空表冒充「这儿没有
 * 单元」等于把人往错的方向支。这两档在界面上长得也不一样。
 *
 * 顺序是目录名的字典序。单元名以时间段打头，所以字典序天然就是出生顺序；用固定顺序而
 * 不是 `localeCompare`，是为了让两次扫描的结果能直接比对。
 */
export function scanContainer(container: string): ScanOutcome {
  let names: string[]
  try {
    names = fs.readdirSync(container)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | null)?.code
    if (code === 'ENOENT') return { ok: true, rootExists: false, entries: [] }
    return { ok: false, error: `扫不动容器根 ${container}：${describe(error)}` }
  }
  const entries: UnitEntry[] = []
  for (const name of [...names].sort()) {
    if (name === 'out') continue
    const unitPath = path.join(container, name)
    if (!isDirectory(unitPath)) continue
    entries.push({ name, path: unitPath, identity: readIdentity(unitPath) })
  }
  return { ok: true, rootExists: true, entries }
}

/**
 * 按种类分组。**出结构、不出文本**：怎么排版是消费方的事。
 *
 * 没有身份的单元不归进任何种类组，单独一摞：`kind` 是个软约定的自由字段，硬塞一个叫
 * 「未认领」的组进去，真有人写这个词就撞上了；而且「还没有种类」本来就不是一个种类。
 *
 * 组间按种类名字典序，不给任何种类开后门排前面——一旦在代码里认某个具体的词，那个词
 * 就从约定变成了机制。要突出哪一类是界面的事。
 */
export function groupByKind(entries: UnitEntry[]): Omit<UnitInventory, 'container' | 'rootExists'> {
  const buckets = new Map<string, UnitEntry[]>()
  const unidentified: UnitEntry[] = []
  for (const entry of entries) {
    if (entry.identity.status !== 'claimed') {
      unidentified.push(entry)
      continue
    }
    const kind = entry.identity.identity.kind
    const bucket = buckets.get(kind)
    if (bucket) bucket.push(entry)
    else buckets.set(kind, [entry])
  }
  return {
    byKind: [...buckets.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([kind, units]) => ({ kind, units })),
    unidentified,
  }
}

/** 扫 + 分组一次给全。这两步没有第二种搭配方式，摆成两步只会让调用方各拼一遍 */
export function takeInventory(container: string): InventoryOutcome {
  const scan = scanContainer(container)
  if (!scan.ok) return scan
  return {
    ok: true,
    data: { container, rootExists: scan.rootExists, ...groupByKind(scan.entries) },
  }
}
