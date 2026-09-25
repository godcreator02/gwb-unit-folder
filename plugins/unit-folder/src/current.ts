import path from 'node:path'
import type { UnitEntry, UnitInventory } from './scan.js'

/**
 * 「当前看的是哪个单元」的判断：从一条根内路径推出所属单元、置顶文档的形状与增删、`current()` 怎么回落。
 * 不读写磁盘、不依赖 cordis，`index.ts` 只把这些函数接到命令与服务上
 */

/** 一次选中。事件 `unit-folder/selection` 的载荷与 `current()` 的回值同形 */
export interface UnitSelection {
  /** 容器根下那一层的单元目录，绝对路径 */
  unitPath: string
  /** 单元目录名（如 `igldu-gwbkernel`） */
  unitName: string
  /** 人点的那个目录，绝对路径：点单元行时等于 `unitPath`，点单元内目录时是那个目录 */
  path: string
}

/** 置顶存进的那份 data 文档的名字。形状是 `PinnedDoc` */
export const PINNED_DOC = 'pinned'

/** 置顶的单元，绝对路径，按置顶先后排 */
export interface PinnedDoc {
  paths: string[]
}

/** `path.relative` 的结果不在根里面：就是根本身、`..` 打头、或者回了个绝对路径（Windows 跨盘符） */
function isRootOrOutside(relativeToRoot: string): boolean {
  return relativeToRoot === '' || relativeToRoot === '..' || relativeToRoot.startsWith(`..${path.sep}`) || path.isAbsolute(relativeToRoot)
}

/**
 * 从「容器根 + 根内一条路径」推出选中，只按路径形状算：相对路径的第一段就是单元名。
 * 根本身、根外的路径回 null（导出的函数谁都调得到，不假定调用方先过了 `resolveInside`）
 */
export function selectionFor(root: string, target: string): UnitSelection | null {
  const rootResolved = path.resolve(root)
  const targetResolved = path.resolve(rootResolved, target)
  const relativeToRoot = path.relative(rootResolved, targetResolved)
  if (isRootOrOutside(relativeToRoot)) return null
  const unitName = relativeToRoot.split(path.sep)[0]
  if (unitName === undefined || unitName === '') return null
  return { unitPath: path.join(rootResolved, unitName), unitName, path: targetResolved }
}

/**
 * `unit-folder.select` 的判断：目录得还在，再推出所属单元；不在的直接报错，不记下一个不存在的选中。
 * 判存在由调用方传入（`isDirectory`）
 */
export function selectExistingDir(
  root: string,
  target: string,
  isDirectory: (dir: string) => boolean,
): { ok: true; data: UnitSelection } | { ok: false; error: string } {
  if (!isDirectory(target)) return { ok: false, error: `不是已存在的目录：${target}` }
  const selection = selectionFor(root, target)
  if (selection === null) return { ok: false, error: `算不出所属单元：${target}` }
  return { ok: true, data: selection }
}

/** 是不是单元目录本身（容器根下一层）。置顶只认这种 */
export function isUnitDir(root: string, target: string): boolean {
  const selection = selectionFor(root, target)
  return selection !== null && selection.path === selection.unitPath
}

/**
 * 读置顶文档：盘上那份是 JSON、人手改得到，形状要验。`paths` 不是数组就当没置顶；
 * 数组里不是非空字符串的项扔掉，同一处写了两遍的只留第一次
 */
export function parsePinnedDoc(raw: unknown): string[] {
  if (typeof raw !== 'object' || raw === null) return []
  const rawPaths = (raw as Record<string, unknown>).paths
  if (!Array.isArray(rawPaths)) return []
  const pinnedPaths: string[] = []
  for (const item of rawPaths) {
    if (typeof item !== 'string' || item.trim() === '') continue
    if (pinnedPaths.some((p) => samePath(p, item))) continue
    pinnedPaths.push(item)
  }
  return pinnedPaths
}

/** 追加一个置顶。已经在表里就原样回，不挪位置 */
export function addPinned(pinned: readonly string[], target: string): string[] {
  return pinned.some((p) => samePath(p, target)) ? [...pinned] : [...pinned, target]
}

/** 摘掉一个置顶。不在表里就原样回 */
export function removePinned(pinned: readonly string[], target: string): string[] {
  return pinned.filter((p) => !samePath(p, target))
}

/**
 * `current()` 的回落规则：本会话点过就是最近那一次；没点过回落到第一个置顶单元（那时 `path`
 * 就是单元目录本身）；都没有就是 undefined。置顶只在没点过时起作用
 */
export function resolveCurrent(clicked: UnitSelection | undefined, pinned: readonly string[]): UnitSelection | undefined {
  if (clicked !== undefined) return clicked
  const firstPinned = pinned[0]
  if (firstPinned === undefined) return undefined
  return { unitPath: firstPinned, unitName: path.basename(firstPinned), path: firstPinned }
}

/**
 * 两条绝对路径是不是同一处。Windows 上盘符大小写与分隔符都不算差异：置顶那条是命令参数解出来的，
 * 清单里那条是扫描拼出来的，两边的写法不保证一致
 */
export function samePath(a: string, b: string): boolean {
  const resolvedA = path.resolve(a)
  const resolvedB = path.resolve(b)
  return process.platform === 'win32' ? resolvedA.toLowerCase() === resolvedB.toLowerCase() : resolvedA === resolvedB
}

function allUnitsOf(inventory: Pick<UnitInventory, 'byKind' | 'unidentified'>): UnitEntry[] {
  return [...inventory.byKind.flatMap((group) => group.units), ...inventory.unidentified]
}

/**
 * 清单里置顶的那几条，按置顶先后。`gone` 是置顶了但清单里找不到的（目录删了、换了容器根），
 * 调用方据此把它们从置顶表里摘掉
 */
export function findPinned(
  inventory: Pick<UnitInventory, 'byKind' | 'unidentified'>,
  pinned: readonly string[],
): { entries: UnitEntry[]; gone: string[] } {
  const allUnits = allUnitsOf(inventory)
  const entries: UnitEntry[] = []
  const gone: string[] = []
  for (const pinnedPath of pinned) {
    const listedUnit = allUnits.find((unit) => samePath(unit.path, pinnedPath))
    if (listedUnit === undefined) gone.push(pinnedPath)
    else entries.push(listedUnit)
  }
  return { entries, gone }
}

/** 最近一次点击的那个单元还在不在清单里。不在（目录删了、换了容器根）调用方就清掉这次点击 */
export function isUnitListed(inventory: Pick<UnitInventory, 'byKind' | 'unidentified'>, unitPath: string): boolean {
  return allUnitsOf(inventory).some((unit) => samePath(unit.path, unitPath))
}
