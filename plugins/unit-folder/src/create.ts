import fs from 'node:fs'
import path from 'node:path'
import { IDENTITY_FILE, validateIdentity, type UnitIdentity } from './scan.js'

/**
 * 建单元：算目录名、建目录、写出生证，到 `unit.json` 为止。仓怎么建、要不要文档站，
 * 交给建仓、建站各自的工具。
 *
 * 目录名 = 五位随机小写字母数字 + `-` + 功能名（如 `igldu-gwbkernel`）；功能名可省，
 * 省了就只有随机段。重名就重新生成随机段。写出生证与扫描时读出生证共用 `validateIdentity`，
 * 写出去的出生证读回来一定认得。时间不进目录名——`createdAt` 比它准，而目录名要经得住内容变。
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

/** 重名后重新生成的次数上限。五位随机重名一次已是万一，连续重名五十次只可能是调用方的 random 坏了 */
const MAX_ATTEMPTS = 50

/**
 * 随机段的字符集，只用小写字母与数字。Windows 文件系统大小写不敏感——收了大写等于没写，
 * 还会把两个不同的名字算成同一个，白白多生成一次。
 */
const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz'

/** 随机段长度 */
const ID_LENGTH = 5

/**
 * 功能名：小写字母数字，段间单个连字符（`gwb-test`）。开头结尾不许是连字符，也不许出现
 * 路径分隔——这个名字要拼进目录名，放 `..` 或 `/` 进来就能指到容器根外面。
 */
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const SLUG_MAX = 32

const pad = (n: number): string => String(n).padStart(2, '0')

/** 出生时刻：ISO 8601，本机时区带偏移（`2026-09-17T15:30:00+08:00`） */
export function createdAtOf(now: Date): string {
  const offset = -now.getTimezoneOffset()
  const sign = offset >= 0 ? '+' : '-'
  const abs = Math.abs(offset)
  return (
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
    `T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  )
}

/** 五位随机段。`random` 回 [0, 1)，测试里换成确定的序列 */
export function idOf(random: () => number): string {
  let out = ''
  for (let i = 0; i < ID_LENGTH; i++) out += ALPHABET[Math.floor(random() * ALPHABET.length)]
  return out
}

/** 功能名验过没有。省了或空串回空串（只有随机段），不合规回一句为什么 */
function normalizeSlug(raw: unknown): { ok: true; slug: string } | { ok: false; error: string } {
  if (raw === undefined || raw === '') return { ok: true, slug: '' }
  if (typeof raw !== 'string') return { ok: false, error: `slug 要是字符串，收到 ${typeof raw}` }
  if (raw.length > SLUG_MAX) return { ok: false, error: `slug 超过 ${SLUG_MAX} 个字符：${raw}` }
  if (!SLUG_PATTERN.test(raw)) {
    return { ok: false, error: `slug 只能是小写字母数字、段间用单个连字符（如 gwb-test）：${raw}` }
  }
  return { ok: true, slug: raw }
}

/**
 * 在容器根下建一个单元。参数先整份验过（验不过一个目录都不建），再建目录、写出生证。
 *
 * 建目录用非递归的 `mkdirSync`：目录已经在就抛 EEXIST，那就是重名，重新生成随机段。容器根本身
 * 不在也不替人建——根是设置里的事实，建出来只会掩盖「设置指错了地方」。
 */
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

  const slug = normalizeSlug(input.slug)
  if (!slug.ok) return { ok: false, error: `目录名不成立：${slug.error}` }

  try {
    if (!fs.statSync(root).isDirectory()) return { ok: false, error: `容器根不是目录：${root}` }
  } catch {
    return { ok: false, error: `容器根不在：${root}` }
  }

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const id = idOf(random)
    const name = slug.slug === '' ? id : `${id}-${slug.slug}`
    const dir = path.join(root, name)
    try {
      fs.mkdirSync(dir)
    } catch (error) {
      if ((error as NodeJS.ErrnoException | null)?.code === 'EEXIST') continue
      return { ok: false, error: `建目录失败：${error instanceof Error ? error.message : String(error)}` }
    }
    fs.writeFileSync(path.join(dir, IDENTITY_FILE), `${JSON.stringify(checked.identity, null, 2)}\n`, 'utf8')
    return { ok: true, data: { name, path: dir, identity: checked.identity } }
  }
  return { ok: false, error: `重摇 ${MAX_ATTEMPTS} 次都撞名——随机源是不是坏了` }
}
