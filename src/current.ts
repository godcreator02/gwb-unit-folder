import path from 'node:path'
import type { UnitEntry, UnitInventory } from './scan.js'

/**
 * 「当前看的是哪个单元」的纯逻辑：从一条根内路径推出它属于哪个单元、置顶文档长什么样、
 * `current()` 怎么回落。**不碰盘、不碰 cordis**——`index.ts` 只是把这几个函数接到命令与
 * 服务上，判断都在这儿，测试也只测这儿。
 *
 * 这个概念为什么从本件往外报、而不是别处来问：树里点一下就是「选中」，那是本件本来就
 * 有的动作；把它交出去只是把一个已有的事实说出来，不为别人发明契约。判据与否掉的两条
 * 路见文档站轨迹卡「选中往外报」。
 */

/** 一次选中。事件 `unit-folder/selection` 的载荷与 `current()` 的回值同形 */
export interface UnitSelection {
  /** 容器根下那一层的单元目录，绝对路径 */
  unitPath: string
  /** 单元目录名（如 `26090520ntn`） */
  unitName: string
  /** 人点的那个目录，绝对路径：点单元行时等于 `unitPath`，点单元内目录时是那个目录 */
  path: string
}

/** 置顶落的那份 data 文档的名字。形状是 `PinnedDoc`；取消置顶写 `{ path: null }` */
export const PINNED_DOC = 'pinned'

export interface PinnedDoc {
  path: string | null
}

/** 越出根的三种形状：空、`..` 打头、或 relative 回了个绝对路径（Windows 跨盘符） */
function escapes(rel: string): boolean {
  return rel === '' || rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)
}

/**
 * 从「容器根 + 根内一条路径」推出选中。**只按路径形状算，不碰盘**：单元是「根下一层」
 * 这个纯目录约定，所以 relative 的第一段就是单元名。根本身、根外的路径回 null——
 * 调用方本该先过 `resolveInside`，这儿再判一遍是因为这个函数是导出的纯函数，谁都调得到。
 */
export function selectionFor(root: string, target: string): UnitSelection | null {
  const rootResolved = path.resolve(root)
  const targetResolved = path.resolve(rootResolved, target)
  const rel = path.relative(rootResolved, targetResolved)
  if (escapes(rel)) return null
  const unitName = rel.split(path.sep)[0]
  if (unitName === undefined || unitName === '') return null
  return { unitPath: path.join(rootResolved, unitName), unitName, path: targetResolved }
}

/** 是不是单元目录本身（容器根下一层）。置顶只认这种——单元内的目录不是单元 */
export function isUnitDir(root: string, target: string): boolean {
  const selection = selectionFor(root, target)
  return selection !== null && selection.path === selection.unitPath
}

/**
 * 读置顶文档：盘上那份是 JSON、人手改得到，形状要验。`path` 不是非空字符串就当没置顶
 * ——取消置顶写的 `{ path: null }` 也走这条。
 */
export function parsePinnedDoc(raw: unknown): string | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const value = (raw as Record<string, unknown>).path
  return typeof value === 'string' && value.trim() !== '' ? value : undefined
}

/**
 * `current()` 的回落规则：本会话点过就是最近那一次；没点过回落到置顶单元（那时 `path`
 * 就是单元目录本身）；都没有就是 undefined。**置顶只在没点过时起作用**——点过之后
 * 置顶只是清单最上那一块，不再是「当前」。
 */
export function resolveCurrent(clicked: UnitSelection | undefined, pinned: string | undefined): UnitSelection | undefined {
  if (clicked !== undefined) return clicked
  if (pinned === undefined) return undefined
  return { unitPath: pinned, unitName: path.basename(pinned), path: pinned }
}

/**
 * 两条绝对路径是不是同一处。Windows 的盘符大小写与分隔符都不算差异——置顶那条是
 * 命令参数解出来的，清单里那条是扫描拼出来的，两边的写法不保证一致。
 */
export function samePath(a: string, b: string): boolean {
  const na = path.resolve(a)
  const nb = path.resolve(b)
  return process.platform === 'win32' ? na.toLowerCase() === nb.toLowerCase() : na === nb
}

/** 清单里置顶的那条。置顶指的单元不在清单里（换了容器根、目录删了）就回 null，不报错 */
export function findPinned(inventory: Pick<UnitInventory, 'byKind' | 'unidentified'>, pinned: string | undefined): UnitEntry | null {
  if (pinned === undefined) return null
  const all = [...inventory.byKind.flatMap((g) => g.units), ...inventory.unidentified]
  return all.find((u) => samePath(u.path, pinned)) ?? null
}
