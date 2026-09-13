import fs from 'node:fs'
import path from 'node:path'

/**
 * 单元内浏览的纯机：路径校验、一层目录清单、单文件原文。
 *
 * 与 `scan.ts` 的分工：那边扫**容器根**（只读出生证，单元内部不看不摸），这边应
 * 界面的展开与点开把脚步迈进**单元内部**。迈进去的前提是界面上看得见的每一条
 * 路径都来自上一层的清单——但命令总线对外暴露，不能指望参数是界面自己递来的，
 * 所以每一处都从容器根重新验：`resolveInside` 拒掉一切走出容器根的路径，穿越
 * （`..`、绝对路径、盘符切换）在 `path.relative` 的结果上现形，正反斜杠两种写法都认。
 */

/** 一次列目录的回包：一层，目录在前、文件在后，各自按名字典序 */
export interface BrowseEntry {
  name: string
  type: 'dir' | 'file' | 'other'
  /** 文件的字节数；stat 不动就没有这一项 */
  size?: number
}

export type ListOutcome = { ok: true; entries: BrowseEntry[] } | { ok: false; error: string }

/** 单文件原文的上限。预览不是全文——超过就截断，界面上明说 */
export const READ_MAX_BYTES = 512 * 1024

/** 二进制嗅探的窗口：前 8KB 里出现 NUL 就当二进制（跟 git 的判据同一思路） */
const SNIFF_BYTES = 8 * 1024

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

/** 把捕获到的东西渲染成一句人话。`catch` 到的是 unknown，不保证是 Error */
function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * 把一条外界递来的路径验成「容器根内的绝对路径」，不合格回 null。
 *
 * 相对路径**按容器根解，不按宿主的工作目录解**：宿主的 CWD 是应用起的时候定的，
 * 拿它当基准只会让同一条参数在不同启动方式下指向不同地方。绝对路径原样生效，
 * 然后统一过合格线：目标在根**里面**（`relative` 非空、不越出、不绝对）。根自己
 * 不算——容器根的清单是 `unit-folder.list` 的事，这条路只管根内的东西。
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
  let rel: string
  try {
    rel = path.relative(rootResolved, target)
  } catch {
    return null
  }
  if (rel === '') return null
  if (rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) return null
  return target
}

/** 一层目录按界面要的顺序排：目录在前、文件在后，各自按名字典序 */
function compareEntries(a: BrowseEntry, b: BrowseEntry): number {
  if (a.type !== b.type) {
    if (a.type === 'dir') return -1
    if (b.type === 'dir') return 1
  }
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0
}

/**
 * 列一个目录的一层。**任何一处 stat 不动都照收**，只是那一项没有 size——一个
 * 读不出大小的文件不该从清单里消失，更不该让整层清单失败。
 */
export function listDir(dir: string): ListOutcome {
  let dirents: fs.Dirent[]
  try {
    dirents = fs.readdirSync(dir, { withFileTypes: true })
  } catch (error) {
    return { ok: false, error: `列不动 ${dir}：${describe(error)}` }
  }
  const entries: BrowseEntry[] = []
  for (const dirent of dirents) {
    const kind: BrowseEntry['type'] = dirent.isDirectory()
      ? 'dir'
      : dirent.isFile()
        ? 'file'
        : 'other'
    const entry: BrowseEntry = { name: dirent.name, type: kind }
    if (kind !== 'dir') {
      try {
        entry.size = fs.statSync(path.join(dir, dirent.name)).size
      } catch {
        // size 缺着就缺着：清单照收
      }
    }
    entries.push(entry)
  }
  entries.sort(compareEntries)
  return { ok: true, entries }
}

/**
 * 读一个文件的原文。超过上限截断（`truncated` 明说），前 8KB 含 NUL 判二进制
 * ——二进制回空串不回乱码。
 *
 * 截断落点可能切在 UTF-8 序列中间，解码端把它替换成一个 U+FFFD——预览末尾
 * 一个占位符，代价可以接受，不为它做逐字节回退。
 */
export function readFilePreview(file: string, maxBytes = READ_MAX_BYTES): ReadOutcome {
  let stat: fs.Stats
  try {
    stat = fs.statSync(file)
  } catch (error) {
    return { ok: false, error: `读不动 ${file}：${describe(error)}` }
  }
  if (!stat.isFile()) return { ok: false, error: `${file} 不是文件` }
  try {
    const fd = fs.openSync(file, 'r')
    try {
      const length = Math.min(stat.size, maxBytes)
      const buffer = Buffer.alloc(length)
      const read = fs.readSync(fd, buffer, 0, length, 0)
      const sniffLength = Math.min(read, SNIFF_BYTES)
      if (buffer.subarray(0, sniffLength).includes(0)) {
        return { ok: true, data: { text: '', size: stat.size, truncated: false, binary: true } }
      }
      const text = buffer.subarray(0, read).toString('utf8')
      return {
        ok: true,
        data: { text, size: stat.size, truncated: stat.size > read, binary: false },
      }
    } finally {
      fs.closeSync(fd)
    }
  } catch (error) {
    return { ok: false, error: `读不动 ${file}：${describe(error)}` }
  }
}
