import fs from 'node:fs'
import path from 'node:path'
import { IDENTITY_FILE, validateIdentity, type UnitIdentity } from './scan.js'

/**
 * 建单元：算目录名、建目录、写出生证，到 `unit.json` 为止。目录名是五位随机小写字母数字，给了功能名就拼成
 * `<随机>-<功能名>`（如 `igldu-gwbkernel`），重名就重新生成随机段。出生证与扫描共用 `validateIdentity`
 */

/** 建单元时调用方给的那几项。`status` / `slug` 可省，省了是 `active` / 无功能名；`createdAt` 由本插件填 */
export interface CreateUnitInput {
  kind: unknown
  title: unknown
  purpose: unknown
  icon: unknown
  status?: unknown
  slug?: unknown
}

export interface CreatedUnit {
  name: string
  path: string
  identity: UnitIdentity
}

/** 重名后重新生成的次数上限：连续重名这么多次只可能是调用方给的 random 坏了 */
const MAX_ATTEMPTS = 50

/** 随机段只用小写字母与数字：Windows 文件系统大小写不敏感，收了大写会把两个不同的名字算成同一个 */
const ID_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz'

const ID_LENGTH = 5

/**
 * 功能名：小写字母数字，段间单个连字符（`gwb-test`）。它要拼进目录名，
 * 放 `..` 或路径分隔符进来就能指到容器根外面
 */
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const SLUG_MAX_LENGTH = 32

const twoDigits = (n: number): string => String(n).padStart(2, '0')

/** 出生时刻：ISO 8601，本机时区带偏移（`2026-09-17T15:30:00+08:00`） */
export function createdAtOf(now: Date): string {
  const offsetMinutes = -now.getTimezoneOffset()
  const sign = offsetMinutes >= 0 ? '+' : '-'
  const absOffsetMinutes = Math.abs(offsetMinutes)
  return (
    `${now.getFullYear()}-${twoDigits(now.getMonth() + 1)}-${twoDigits(now.getDate())}` +
    `T${twoDigits(now.getHours())}:${twoDigits(now.getMinutes())}:${twoDigits(now.getSeconds())}` +
    `${sign}${twoDigits(Math.floor(absOffsetMinutes / 60))}:${twoDigits(absOffsetMinutes % 60)}`
  )
}

/** 五位随机段。`random` 回 [0, 1)，测试里换成确定的序列 */
export function idOf(random: () => number): string {
  let id = ''
  for (let i = 0; i < ID_LENGTH; i++) id += ID_ALPHABET[Math.floor(random() * ID_ALPHABET.length)]
  return id
}

/** 验功能名。省了或空串回空串（只有随机段），不合规回一句为什么 */
function checkSlug(raw: unknown): { ok: true; slug: string } | { ok: false; error: string } {
  if (raw === undefined || raw === '') return { ok: true, slug: '' }
  if (typeof raw !== 'string') return { ok: false, error: `slug 要是字符串，收到 ${typeof raw}` }
  if (raw.length > SLUG_MAX_LENGTH) return { ok: false, error: `slug 超过 ${SLUG_MAX_LENGTH} 个字符：${raw}` }
  if (!SLUG_PATTERN.test(raw)) {
    return { ok: false, error: `slug 只能是小写字母数字、段间用单个连字符（如 gwb-test）：${raw}` }
  }
  return { ok: true, slug: raw }
}

/** 容器根有问题时回一句为什么；根不在也不替人建 */
function containerRootProblemOf(root: string): string | undefined {
  try {
    return fs.statSync(root).isDirectory() ? undefined : `容器根不是目录：${root}`
  } catch {
    return `容器根不在：${root}`
  }
}

/** 建一个还没人用的单元目录。非递归 `mkdirSync` 遇到已存在的目录抛 EEXIST，那就是重名，重新生成随机段 */
function makeFreshUnitDir(
  root: string,
  slug: string,
  random: () => number,
): { ok: true; name: string; dir: string } | { ok: false; error: string } {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const id = idOf(random)
    const name = slug === '' ? id : `${id}-${slug}`
    const dir = path.join(root, name)
    try {
      fs.mkdirSync(dir)
    } catch (error) {
      if ((error as NodeJS.ErrnoException | null)?.code === 'EEXIST') continue
      return { ok: false, error: `建目录失败：${error instanceof Error ? error.message : String(error)}` }
    }
    return { ok: true, name, dir }
  }
  return { ok: false, error: `重新生成随机段 ${MAX_ATTEMPTS} 次都撞名——随机源是不是坏了` }
}

/** 在容器根下建一个单元。参数先整份验过（验不过一个目录都不建），再建目录、写出生证 */
export function createUnit(
  root: string,
  input: CreateUnitInput,
  deps: { now?: Date; random?: () => number } = {},
): { ok: true; data: CreatedUnit } | { ok: false; error: string } {
  const now = deps.now ?? new Date()
  const random = deps.random ?? Math.random
  const checked = validateIdentity({
    kind: input.kind,
    title: input.title,
    purpose: input.purpose,
    icon: input.icon,
    status: input.status ?? 'active',
    createdAt: createdAtOf(now),
  })
  if (!checked.ok) return { ok: false, error: `出生证不成立：${checked.reason}` }

  const slug = checkSlug(input.slug)
  if (!slug.ok) return { ok: false, error: `目录名不成立：${slug.error}` }

  const rootProblem = containerRootProblemOf(root)
  if (rootProblem !== undefined) return { ok: false, error: rootProblem }

  const made = makeFreshUnitDir(root, slug.slug, random)
  if (!made.ok) return made
  fs.writeFileSync(path.join(made.dir, IDENTITY_FILE), `${JSON.stringify(checked.identity, null, 2)}\n`, 'utf8')
  return { ok: true, data: { name: made.name, path: made.dir, identity: checked.identity } }
}
