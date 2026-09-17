import fs from 'node:fs'
import path from 'node:path'
import { IDENTITY_FILE, validateIdentity, type UnitIdentity } from './scan.js'

/**
 * 建单元：算目录名、建目录、写出生证，到 `unit.json` 为止。仓怎么建、要不要文档站，
 * 交给目标线自己的工具。
 *
 * 目录名 = `yyMMddHH` + 三个小写字母，按本机时区算；撞名重摇。字段表与读盘共用
 * `validateIdentity`，写出去的出生证读回来一定认得。
 */

/** 建单元时调用方给的那几项。`status` 可省，省了是 `active`；`createdAt` 由本件填 */
export interface CreateUnitInput {
  kind: unknown
  title: unknown
  purpose: unknown
  icon: unknown
  status?: unknown
}

export interface CreatedUnit {
  name: string
  path: string
  identity: UnitIdentity
}

/** 撞名重摇的上限。一个小时里建五十个单元不是正常用法，到了就停下来报 */
const MAX_ATTEMPTS = 50

const LETTERS = 'abcdefghijklmnopqrstuvwxyz'

const pad = (n: number): string => String(n).padStart(2, '0')

/** 目录名的时间码：`yyMMddHH`，本机时区 */
export function stampOf(now: Date): string {
  return `${pad(now.getFullYear() % 100)}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}`
}

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

/** 三个小写字母。`random` 回 [0, 1)，测试里换成确定的序列 */
export function suffixOf(random: () => number): string {
  let out = ''
  for (let i = 0; i < 3; i++) out += LETTERS[Math.floor(random() * LETTERS.length)]
  return out
}

/**
 * 在容器根下建一个单元。参数先整份验过（验不过一个目录都不建），再建目录、写出生证。
 *
 * 建目录用非递归的 `mkdirSync`：目录已经在就抛 EEXIST，那就是撞名，重摇。容器根本身
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

  try {
    if (!fs.statSync(root).isDirectory()) return { ok: false, error: `容器根不是目录：${root}` }
  } catch {
    return { ok: false, error: `容器根不在：${root}` }
  }

  const stamp = stampOf(now)
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const name = `${stamp}${suffixOf(random)}`
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
  return { ok: false, error: `重摇 ${MAX_ATTEMPTS} 次都撞名——${stamp} 这个时辰的单元太多了` }
}
