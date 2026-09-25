import fs from 'node:fs'
import path from 'node:path'

/**
 * 单元内浏览：把命令参数里的路径验成容器根内的绝对路径、列一层目录、读单个文件的原文。
 * 命令总线对外开放，每条带路径的命令都先经 `resolveInside` 从容器根重新验一遍
 */

/** 一层目录里的一项。清单的顺序是目录在前、文件在后，各自按名字典序 */
export interface BrowseEntry {
  name: string
  type: 'dir' | 'file' | 'other'
  /** 文件的字节数；stat 失败就没有这一项 */
  size?: number
}

export type ListOutcome = { ok: true; entries: BrowseEntry[] } | { ok: false; error: string }

/** 单文件原文的上限。预览不是全文，超过就截断，界面上明说 */
export const READ_MAX_BYTES = 512 * 1024

/** 二进制嗅探的窗口：前 8KB 里出现 NUL 就当二进制（跟 git 的判据同一思路） */
const BINARY_SNIFF_BYTES = 8 * 1024

export interface FilePreview {
  /** 原文文本；binary 时为空串 */
  text: string
  /** 文件完整字节数（截断时大于 text 的字节数） */
  size: number
  truncated: boolean
  binary: boolean
}

export type ReadOutcome = { ok: true; data: FilePreview } | { ok: false; error: string }

/** 非空字符串——空串与纯空白都不算数 */
function isFilledString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

/** `catch` 到的是 unknown，不保证是 Error */
function errorMessageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** `path.relative` 的结果是否走出了起点：`..` 打头，或者回了个绝对路径（Windows 跨盘符） */
function leavesBase(relativePath: string): boolean {
  return relativePath === '..' || relativePath.startsWith(`..${path.sep}`) || path.isAbsolute(relativePath)
}

/** 解实际路径；不存在或读不动都回 undefined——「不存在」由下游的列目录、读文件报 */
function realPathOrUndefined(target: string): string | undefined {
  try {
    return fs.realpathSync(target)
  } catch {
    return undefined
  }
}

/**
 * 路径上有 junction / symlink 时，词法在根内的路径实际可能落在根外。两端都存在时比实际位置，
 * 任一端不存在就不拦（没有实际位置可比）。只验校验这一刻的实际位置
 */
function pointsOutsideRootOnDisk(rootResolved: string, target: string): boolean {
  const realRoot = realPathOrUndefined(rootResolved)
  if (realRoot === undefined) return false
  const realTarget = realPathOrUndefined(target)
  if (realTarget === undefined) return false
  const realRelative = path.relative(realRoot, realTarget)
  return realRelative === '' || leavesBase(realRelative)
}

/**
 * 把一条外界递来的路径验成容器根内的绝对路径，不合格回 null。相对路径按容器根解，不按宿主的工作目录解。
 * 目标必须在根里面，根自己不算；词法在根内之后，已存在的路径还要按实际位置再验一次（`pointsOutsideRootOnDisk`）
 */
export function resolveInside(root: string, requested: unknown): string | null {
  if (!isFilledString(requested)) return null
  const rootResolved = path.resolve(root)
  let target: string
  try {
    target = path.resolve(rootResolved, requested)
  } catch {
    return null
  }
  let relativeToRoot: string
  try {
    relativeToRoot = path.relative(rootResolved, target)
  } catch {
    return null
  }
  if (relativeToRoot === '' || leavesBase(relativeToRoot)) return null
  if (pointsOutsideRootOnDisk(rootResolved, target)) return null
  return target
}

/** 目录在前、文件在后，各自按名字典序 */
function compareEntries(a: BrowseEntry, b: BrowseEntry): number {
  if (a.type !== b.type) {
    if (a.type === 'dir') return -1
    if (b.type === 'dir') return 1
  }
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0
}

function entryTypeOf(dirent: fs.Dirent): BrowseEntry['type'] {
  if (dirent.isDirectory()) return 'dir'
  if (dirent.isFile()) return 'file'
  return 'other'
}

/** 列一个目录的一层。某一项 stat 失败照样列出，只是没有 size */
export function listDir(dir: string): ListOutcome {
  let dirents: fs.Dirent[]
  try {
    dirents = fs.readdirSync(dir, { withFileTypes: true })
  } catch (error) {
    return { ok: false, error: `列不动 ${dir}：${errorMessageOf(error)}` }
  }
  const entries: BrowseEntry[] = []
  for (const dirent of dirents) {
    const type = entryTypeOf(dirent)
    const entry: BrowseEntry = { name: dirent.name, type }
    if (type !== 'dir') {
      try {
        entry.size = fs.statSync(path.join(dir, dirent.name)).size
      } catch {
        // 读不出大小的文件照样列出
      }
    }
    entries.push(entry)
  }
  entries.sort(compareEntries)
  return { ok: true, entries }
}

/**
 * 读一个文件的原文。超过上限截断（`truncated` 明说），前 8KB 含 NUL 判二进制，二进制回空串。
 * 截断点切在 UTF-8 序列中间时，末尾会解出一个 U+FFFD
 */
export function readFilePreview(file: string, maxBytes = READ_MAX_BYTES): ReadOutcome {
  let stat: fs.Stats
  try {
    stat = fs.statSync(file)
  } catch (error) {
    return { ok: false, error: `读不动 ${file}：${errorMessageOf(error)}` }
  }
  if (!stat.isFile()) return { ok: false, error: `${file} 不是文件` }
  try {
    const fd = fs.openSync(file, 'r')
    try {
      const length = Math.min(stat.size, maxBytes)
      const buffer = Buffer.alloc(length)
      const bytesRead = fs.readSync(fd, buffer, 0, length, 0)
      const sniffLength = Math.min(bytesRead, BINARY_SNIFF_BYTES)
      if (buffer.subarray(0, sniffLength).includes(0)) {
        return { ok: true, data: { text: '', size: stat.size, truncated: false, binary: true } }
      }
      const text = buffer.subarray(0, bytesRead).toString('utf8')
      return {
        ok: true,
        data: { text, size: stat.size, truncated: stat.size > bytesRead, binary: false },
      }
    } finally {
      fs.closeSync(fd)
    }
  } catch (error) {
    return { ok: false, error: `读不动 ${file}：${errorMessageOf(error)}` }
  }
}
