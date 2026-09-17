import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type * as React from 'react'
import { createRoot } from 'react-dom/client'
import {
  ArrowUpRightIcon,
  CheckIcon,
  ChevronRightIcon,
  ChevronsDownUpIcon,
  CodeXmlIcon,
  CopyIcon,
  FileIcon,
  FolderIcon,
  FolderOpenIcon,
  FolderXIcon,
  PinIcon,
  PinOffIcon,
  RefreshCwIcon,
  SearchIcon,
  WrapTextIcon,
  icons,
  type LucideIcon,
} from 'lucide-react'
import { cn } from 'cn'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { TooltipProvider } from '@/components/ui/tooltip'
import { IconButton } from '@/components/ui/icon-button'
import { ToolbarButtons } from './toolbar-buttons.js'
import { FILE_SELECTED, VIEWER_PANE, lastSelection, noteViewerFocus, openDuplicated, pickPayload, releaseViewerFocus, routeToFocused, viewerMounted, type SelectionPayload } from './selection.js'
import type { HostBridge, PaneArgs, ShellBridge } from './types.js'
import {
  DEFAULT_STATUSES,
  STATUS_LABEL,
  UNIT_STATUSES,
  filterGroups,
  kindsOf,
  lucideKey,
  toggled,
  type UnitEntry,
  type UnitInventory,
  type UnitStatus,
} from './units.js'

/**
 * 单元文件夹的浏览器半，**两格**（node 半 registerPane 的 main / viewer）：
 *
 * * **树格**（`main`）：单元条目是出生证里的 lucide 图标 + title + 两行 purpose；种类吸顶
 *   可折叠分组；筛选框加状态与种类两排过滤标签（默认藏起退役的）；置顶块可放多个；
 *   一键折叠三步；单元展开出文件树
 * * **原文格**（`viewer`）：行号、折行开关、点路径复制
 *
 * 两格靠 `shell.bus` 说话——树里**单击**一个文件，内容进「焦点原文格」（最后一次鼠标
 * 点过的那格）；**Ctrl+单击**再开一份原文格显示，新格接管焦点。这比塞在一格里左右
 * 分栏强的地方是：两格能各自拖到井里任何位置、能各自关掉，而**关掉一格不影响另一格**。
 *
 * 原文格**不跟随状态**：接力棒只住内存，重启之后原文格是空的，等第一次单击
 * （见 selection.ts）。
 *
 * 数据命令全在宿主半现扫现读：`unit-folder.list`（容器清单，带 data 里置顶的那几条）、
 * `listDir`（单元内一层）、`readFile`（单文件原文）、`open`（资源管理器）。
 *
 * **选中往外报**：点单元行、点单元内目录，除了展开之外还 fire-and-forget 一条
 * `unit-folder.select`——宿主半据此记「当前单元」、经服务面 `ctx.gwbUnitFolder` 与事件
 * `unit-folder/selection` 交给别的件（第一个消费方是文档站件）。收起同一行不发。
 * 置顶是单元行右侧那颗图钉：`unit-folder.pin` / `unpin`，落 data，然后重取清单。
 *
 * 目录清单与展开状态留在树格的 state 里——关上再开不重读，刷新才重读。
 */

// ── 数据形状（与宿主半的回包对应） ──────────────────────────────────────────────

interface BrowseEntry {
  name: string
  type: 'dir' | 'file' | 'other'
  size?: number
}

interface FilePreview {
  text: string
  size: number
  truncated: boolean
  binary: boolean
}

type InventoryState =
  | { status: 'loading' }
  | { status: 'loaded'; data: UnitInventory }
  | { status: 'error'; message: string; unconfigured: boolean }

type ListingState = { status: 'loading' } | { status: 'loaded'; entries: BrowseEntry[] } | { status: 'error'; message: string }

type PreviewState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; data: FilePreview }
  | { status: 'error'; message: string }

/** 命令总线的回包信封。带 `code` 的失败（unconfigured）原样透传，见宿主半 */
interface Reply<T> {
  ok?: boolean
  data?: T
  error?: string
  code?: string
}

// ── 单元行的面孔 ──────────────────────────────────────────────────────────────

/** 出生证 icon 认不出的名字画这枚；没出生证与读不出各有一枚，一眼分得出「要去补证」 */
const FALLBACK_ICON = FolderIcon

function iconOf(name: string): LucideIcon {
  return (icons as Record<string, LucideIcon | undefined>)[lucideKey(name)] ?? FALLBACK_ICON
}

/** 一个单元的面孔：图标、两行文案、悬停说明、状态 */
function unitFaceOf(unit: UnitEntry): {
  Icon: LucideIcon
  head: string
  subtitle: string
  title: string
  status: UnitStatus | null
  /** 读不出的出生证：第二行用错误色 */
  broken: boolean
} {
  if (unit.identity.status === 'claimed') {
    const identity = unit.identity.identity
    return {
      Icon: iconOf(identity.icon),
      head: identity.title,
      subtitle: identity.purpose,
      title: `${identity.title}（${identity.kind} · ${STATUS_LABEL[identity.status]}）\n${identity.purpose}\n\n${unit.name}  ·  ${unit.path}`,
      status: identity.status,
      broken: false,
    }
  }
  const unreadable = unit.identity.status === 'unreadable'
  return {
    Icon: unreadable ? FolderXIcon : FolderIcon,
    head: unit.name,
    subtitle: unit.identity.status === 'unreadable' ? `出生证读不出：${unit.identity.reason}` : '没有出生证 unit.json',
    title: `${unit.name}  ·  ${unit.path}`,
    status: null,
    broken: unreadable,
  }
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

// ── 文件树（单元展开后的附页） ────────────────────────────────────────────────

/**
 * 一层附页行：目录可再展开，文件点了进查看器。DSH 把树摊平成行自己管缩进；
 * React 里直接递归，效果相同、账更好算。
 */
function PageRows({
  dir,
  depth,
  expanded,
  listings,
  onToggle,
  onOpenFile,
  selected,
}: {
  dir: string
  depth: number
  expanded: ReadonlySet<string>
  listings: ReadonlyMap<string, ListingState>
  onToggle(path: string): void
  /** 单击：内容进焦点原文格；Ctrl+单击：再开一份 */
  onOpenFile(path: string, name: string, newPane: boolean): void
  selected: string | null
}) {
  const listing = listings.get(dir)
  if (listing === undefined || listing.status === 'loading') {
    return (
      <div className="unitfolder:flex unitfolder:items-center unitfolder:gap-2 unitfolder:py-1" style={{ paddingLeft: depth * 16 + 8 }}>
        <Skeleton className="unitfolder:h-3.5 unitfolder:w-40" />
      </div>
    )
  }
  if (listing.status === 'error') {
    return (
      <p className="unitfolder:text-destructive unitfolder:m-0 unitfolder:py-1 unitfolder:text-xs" style={{ paddingLeft: depth * 16 + 8 }}>
        {listing.message}
      </p>
    )
  }
  return (
    <>
      {listing.entries.map((entry) => {
        const abs = joinPath(dir, entry.name)
        const open = expanded.has(abs)
        if (entry.type === 'dir') {
          return (
            <div key={abs}>
              <div
                role="treeitem"
                aria-expanded={open}
                className="unitfolder:hover:bg-accent/40 unitfolder:flex unitfolder:min-w-0 unitfolder:cursor-default unitfolder:items-center unitfolder:gap-1.5 unitfolder:rounded-sm unitfolder:py-1 unitfolder:pr-2 unitfolder:text-sm"
                style={{ paddingLeft: depth * 16 + 8 }}
                onClick={() => onToggle(abs)}
              >
                <span className={cn('unitfolder:shrink-0', open && 'unitfolder:rotate-90')}>
                  <ChevronRightIcon className="unitfolder:size-3.5 unitfolder:text-muted-foreground" />
                </span>
                <span className="unitfolder:text-muted-foreground unitfolder:shrink-0">
                  {open ? <FolderOpenIcon className="unitfolder:size-4" /> : <FolderIcon className="unitfolder:size-4" />}
                </span>
                <span className="unitfolder:truncate">{entry.name}</span>
              </div>
              {open && (
                <PageRows
                  dir={abs}
                  depth={depth + 1}
                  expanded={expanded}
                  listings={listings}
                  onToggle={onToggle}
                  onOpenFile={onOpenFile}
                  selected={selected}
                />
              )}
            </div>
          )
        }
        const isSelected = selected === abs
        return (
          <div
            key={abs}
            role="treeitem"
            aria-selected={isSelected}
            className={cn(
              'unitfolder:hover:bg-accent/40 unitfolder:flex unitfolder:min-w-0 unitfolder:cursor-default unitfolder:items-center unitfolder:gap-1.5 unitfolder:rounded-sm unitfolder:py-1 unitfolder:pr-2 unitfolder:text-sm',
              isSelected && 'unitfolder:bg-accent/60',
            )}
            style={{ paddingLeft: depth * 16 + 8 + 18 }}
            onClick={(e) => onOpenFile(abs, entry.name, e.ctrlKey || e.metaKey)}
          >
            <span className="unitfolder:text-muted-foreground unitfolder:shrink-0">
              <FileIcon className="unitfolder:size-4" />
            </span>
            <span className="unitfolder:truncate">{entry.name}</span>
            {entry.size !== undefined && (
              <span className="unitfolder:text-muted-foreground unitfolder:ml-auto unitfolder:shrink-0 unitfolder:font-mono unitfolder:text-[10.5px]">{fmtSize(entry.size)}</span>
            )}
          </div>
        )
      })}
    </>
  )
}

/** 树里用的路径拼接。展示与展开集统一走正斜杠，落命令时再换成系统形态 */
function joinPath(dir: string, name: string): string {
  return `${dir.replace(/[\\/]+$/, '')}/${name}`
}

/** 展开容器的浅底与缩进参考线（定稿效果图里那圈 twrapper） */
function TreePage(props: Omit<Parameters<typeof PageRows>[0], 'depth'>): React.ReactNode {
  return (
    <div className="unitfolder:bg-accent/20 unitfolder:mx-2 unitfolder:mb-1.5 unitfolder:rounded-sm unitfolder:border-l-2 unitfolder:py-1 unitfolder:pl-1">
      <PageRows {...props} depth={0} />
    </div>
  )
}

// ── 原文查看器 ────────────────────────────────────────────────────────────────

/**
 * 原文带行号：**一行一个 flex 行**（行号 | 文本），行号永远跟自己那行文本的头上对齐——
 * 折行时文本在自己的格子里流，行号不动。
 *
 * 折行用 `break-words` 不用 `break-all`：前者只在单词放不下时才切，CJK 照常逐字换行，
 * 不会出现「registry 被切成 reg istry」那种碎法。
 */
function renderCode(text: string, wrap: boolean): React.ReactNode {
  const lines = text.split('\n')
  return (
    <div className="unitfolder:flex unitfolder:flex-col">
      {lines.map((line, i) => (
        <div key={i} className="unitfolder:flex unitfolder:items-baseline">
          <span className="unitfolder:w-9 unitfolder:shrink-0 unitfolder:select-none unitfolder:pr-3 unitfolder:text-right unitfolder:font-mono unitfolder:text-xs unitfolder:leading-relaxed unitfolder:text-muted-foreground/60">
            {i + 1}
          </span>
          <span
            className={cn(
              'unitfolder:min-w-0 unitfolder:flex-1 unitfolder:font-mono unitfolder:text-xs unitfolder:leading-relaxed',
              wrap ? 'unitfolder:whitespace-pre-wrap unitfolder:break-words' : 'unitfolder:whitespace-pre',
            )}
          >
            {line === '' ? '\u200b' : line}
          </span>
        </div>
      ))}
    </div>
  )
}

function UnitsViewer({
  host,
  selected,
  containerRoot,
}: {
  host: HostBridge
  selected: { path: string; name: string } | null
  containerRoot: string
}) {
  const [preview, setPreview] = useState<PreviewState>({ status: 'idle' })
  const [wrap, setWrap] = useState(true)
  const [copied, setCopied] = useState(false)
  const tokenRef = useRef(0)

  const displayPath = useMemo(() => {
    if (selected === null || containerRoot === '') return null
    const normRoot = containerRoot.replace(/[\\/]+$/, '')
    const normPath = selected.path.replace(/[\\/]+$/, '')
    return normPath.startsWith(normRoot) ? normPath.slice(normRoot.length).replace(/^[\\/]/, '') : selected.path
  }, [selected, containerRoot])

  const load = useCallback(
    (path: string | null) => {
      const token = ++tokenRef.current
      if (path === null) {
        setPreview({ status: 'idle' })
        return
      }
      setPreview({ status: 'loading' })
      void host
        .call('unit-folder.readFile', { path })
        .then((res) => {
          if (token !== tokenRef.current) return
          const reply = res as Reply<FilePreview>
          if (reply.ok && reply.data !== undefined) setPreview({ status: 'loaded', data: reply.data })
          else setPreview({ status: 'error', message: reply.error ?? '读取失败' })
        })
    },
    [host],
  )

  useEffect(() => {
    load(selected?.path ?? null)
  }, [selected, load])

  const copyPath = (): void => {
    if (selected === null || typeof navigator === 'undefined' || !navigator.clipboard) return
    void navigator.clipboard.writeText(selected.path).then(
      () => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      },
      () => {},
    )
  }

  if (selected === null) {
    return (
      <div className="unitfolder:flex unitfolder:h-full unitfolder:flex-col">
        <div className="unitfolder:text-muted-foreground unitfolder:flex unitfolder:h-full unitfolder:items-center unitfolder:justify-center unitfolder:px-4 unitfolder:text-center unitfolder:text-sm">
          在左边树里点一个文件看原文；Ctrl+单击另开一份。
        </div>
      </div>
    )
  }

  return (
    <div className="unitfolder:flex unitfolder:h-full unitfolder:min-w-0 unitfolder:flex-col">
      <div className="unitfolder:flex unitfolder:flex-none unitfolder:items-center unitfolder:gap-2 unitfolder:border-b unitfolder:px-3 unitfolder:py-2">
        {/* 点路径复制绝对路径：DSH 的老交互，贴进终端或别处都顺手 */}
        <button
          type="button"
          className="unitfolder:text-foreground unitfolder:hover:text-primary unitfolder:m-0 unitfolder:min-w-0 unitfolder:flex-1 unitfolder:cursor-pointer unitfolder:truncate unitfolder:border-0 unitfolder:bg-transparent unitfolder:p-0 unitfolder:text-left unitfolder:font-mono unitfolder:text-xs"
          title={copied ? '已复制' : `点一下复制\n${selected.path}`}
          onClick={copyPath}
        >
          {copied ? '已复制' : (displayPath ?? selected.path)}
        </button>
        {preview.status === 'loaded' && (
          <span className="unitfolder:text-muted-foreground unitfolder:shrink-0 unitfolder:font-mono unitfolder:text-xs">
            {fmtSize(preview.data.size)}
            {preview.data.truncated ? ' · 超长截断' : ''}
          </span>
        )}
        <IconButton
          label={wrap ? '不折行' : '折行'}
          icon={<WrapTextIcon className={cn('unitfolder:size-4', wrap ? 'unitfolder:text-foreground' : 'unitfolder:text-muted-foreground')} />}
          onClick={() => setWrap((v) => !v)}
        />
        <IconButton
          label="重读"
          icon={<RefreshCwIcon className="unitfolder:size-4" />}
          disabled={preview.status === 'loading'}
          onClick={() => load(selected.path)}
        />
      </div>
      <div className="unitfolder:min-h-0 unitfolder:flex-1 unitfolder:overflow-auto">
        {preview.status === 'loading' ? (
          <div className="unitfolder:flex unitfolder:flex-col unitfolder:gap-2 unitfolder:p-3">
            <Skeleton className="unitfolder:h-4 unitfolder:w-2/5" />
            <Skeleton className="unitfolder:h-4 unitfolder:w-4/5" />
            <Skeleton className="unitfolder:h-4 unitfolder:w-3/5" />
            <Skeleton className="unitfolder:h-4 unitfolder:w-2/3" />
          </div>
        ) : preview.status === 'error' ? (
          <p className="unitfolder:text-destructive unitfolder:m-0 unitfolder:p-3 unitfolder:text-sm" role="status">
            {preview.message}
          </p>
        ) : preview.status === 'loaded' && preview.data.binary ? (
          <p className="unitfolder:text-muted-foreground unitfolder:m-0 unitfolder:p-3 unitfolder:text-sm">二进制文件——预览不了，也不该硬看。</p>
        ) : preview.status === 'loaded' ? (
          <div className="unitfolder:p-3">{renderCode(preview.data.text, wrap)}</div>
        ) : null}
      </div>
    </div>
  )
}

// ── 窗格本体 ──────────────────────────────────────────────────────────────────

function UnitFolderPane({ host, shell }: { host: HostBridge; shell: ShellBridge }) {
  const [inventory, setInventory] = useState<InventoryState>({ status: 'loading' })
  const [listings, setListings] = useState<Map<string, ListingState>>(() => new Map())
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const [collapsedKinds, setCollapsedKinds] = useState<Set<string>>(() => new Set())
  const [query, setQuery] = useState('')
  /** 过滤只住内存：关掉窗格再开回到默认（退役的藏起来、种类不限） */
  const [statuses, setStatuses] = useState<ReadonlySet<UnitStatus>>(DEFAULT_STATUSES)
  const [kinds, setKinds] = useState<ReadonlySet<string>>(() => new Set())
  const [selected, setSelected] = useState<{ path: string; name: string } | null>(null)
  /** 「选中」的那个单元（蓝底高亮带的落点）：点谁谁选中并展开，再点一下收起并取消 */
  const [activeUnit, setActiveUnit] = useState<string | null>(null)
  const inventoryToken = useRef(0)

  const data = inventory.status === 'loaded' ? inventory.data : null
  const containerRoot = data?.container ?? ''

  const loadInventory = useCallback(() => {
    const token = ++inventoryToken.current
    setInventory({ status: 'loading' })
    void host.call('unit-folder.list').then((res) => {
      if (token !== inventoryToken.current) return
      const reply = res as Reply<UnitInventory>
      if (reply.ok && reply.data !== undefined) setInventory({ status: 'loaded', data: reply.data })
      else setInventory({ status: 'error', message: reply.error ?? '扫描失败', unconfigured: reply.code === 'unconfigured' })
    })
  }, [host])

  useEffect(() => {
    loadInventory()
  }, [loadInventory])

  const loadListing = useCallback(
    (dir: string) => {
      setListings((prev) => {
        if (prev.get(dir)?.status === 'loading') return prev
        const next = new Map(prev)
        next.set(dir, { status: 'loading' })
        return next
      })
      void host.call('unit-folder.listDir', { path: dir }).then((res) => {
        setListings((prev) => {
          if (prev.get(dir)?.status !== 'loading') return prev
          const next = new Map(prev)
          const reply = res as Reply<{ entries: BrowseEntry[] }>
          next.set(
            dir,
            reply.ok && reply.data !== undefined
              ? { status: 'loaded', entries: reply.data.entries }
              : { status: 'error', message: reply.error ?? '读取失败' },
          )
          return next
        })
      })
    },
    [host],
  )

  const togglePath = useCallback(
    (dir: string) => {
      const opening = !expanded.has(dir)
      if (opening && !listings.has(dir)) loadListing(dir)
      setExpanded((prev) => {
        const next = new Set(prev)
        if (opening) next.add(dir)
        else next.delete(dir)
        return next
      })
    },
    [expanded, listings, loadListing],
  )

  /**
   * 往宿主半报一次选中。**fire-and-forget**：展开不等它，它失败只在控制台说一声——
   * 「当前单元」是给别的件看的，报不上去不该让树本身卡住
   */
  const select = useCallback(
    (path: string) => {
      host.call('unit-folder.select', { path }).then(
        (res) => {
          const reply = res as Reply<unknown>
          if (!reply.ok) console.warn(`[gwb-unit-folder] 选中没报上去：${reply.error ?? '未知原因'}`)
        },
        (err: unknown) => console.warn(`[gwb-unit-folder] unit-folder.select 调不通：${String(err)}`),
      )
    },
    [host],
  )

  /** 单元内的目录：展开时顺带报选中，收起不报 */
  const toggleDir = useCallback(
    (dir: string) => {
      if (!expanded.has(dir)) select(dir)
      togglePath(dir)
    },
    [expanded, select, togglePath],
  )

  /** 刷新 = 重拉清单 + 所有展开着的目录重读；展开与选中都保住 */
  const refresh = useCallback(() => {
    loadInventory()
    for (const dir of expanded) loadListing(dir)
  }, [expanded, loadInventory, loadListing])

  /** 一键折叠三步（DSH 的分寸）：有展开的先全收；然后收组；最后全开 */
  const collapseStep = useCallback(() => {
    if (data === null) return
    if (expanded.size > 0) {
      setExpanded(new Set())
      return
    }
    const kindKeys = kindsOf(data).map((k) => k.key)
    const allCollapsed = kindKeys.every((key) => collapsedKinds.has(key))
    setCollapsedKinds(allCollapsed ? new Set() : new Set(kindKeys))
  }, [expanded, collapsedKinds, data])

  const openInExplorer = useCallback(
    (path: string) => {
      void host.call('unit-folder.open', { path })
    },
    [host],
  )

  const openInCode = useCallback(
    (path: string) => {
      void host.call('unit-folder.code', { path })
    },
    [host],
  )

  /** 置顶 / 取消置顶，落在宿主半的 data 里；成不成都重取清单，置顶块跟着盘上那份走 */
  const togglePin = useCallback(
    (path: string, pinnedNow: boolean) => {
      const call = host.call(pinnedNow ? 'unit-folder.unpin' : 'unit-folder.pin', { path })
      call.then(
        (res) => {
          const reply = res as Reply<unknown>
          if (!reply.ok) console.warn(`[gwb-unit-folder] 置顶没落：${reply.error ?? '未知原因'}`)
          loadInventory()
        },
        (err: unknown) => console.warn(`[gwb-unit-folder] 置顶调不通：${String(err)}`),
      )
    },
    [host, loadInventory],
  )

  /** 选中单元的第一级子目录清单（下拉框用）；没拉过就回 null，由 onEnsureDirs 现场拉 */
  const activeDirEntries = useMemo(() => {
    if (activeUnit === null) return null
    const listing = listings.get(activeUnit)
    if (listing?.status !== 'loaded') return null
    return listing.entries.filter((e) => e.type === 'dir')
  }, [activeUnit, listings])

  const ensureDirs = useCallback(() => {
    if (activeUnit !== null && !listings.has(activeUnit)) loadListing(activeUnit)
  }, [activeUnit, listings, loadListing])

  /**
   * 单击一个文件：选中高亮留在树里，内容由 `routeToFocused` / `openDuplicated` 递给
   * 原文格（见 selection.ts）。Ctrl/Cmd+单击 = 再开一份。
   */
  const openFile = useCallback(
    (path: string, name: string, newPane: boolean) => {
      setSelected({ path, name })
      const payload = { path, name, containerRoot }
      if (newPane) openDuplicated(shell, payload)
      else routeToFocused(shell, payload)
    },
    [shell, containerRoot],
  )

  /** 文字筛选时分组全部摊开——收着找东西等于把结果藏起来 */
  const filtered = query.trim() !== ''

  const groups = useMemo(
    () => (data === null ? [] : filterGroups(data, { statuses, kinds, query })),
    [data, statuses, kinds, query],
  )

  const total = groups.reduce((n, g) => n + g.units.length, 0)

  const pinnedPaths = useMemo(() => new Set((data?.pinned ?? []).map((u) => u.path)), [data])

  const renderUnitRow = (unit: UnitEntry, keyPrefix = ''): React.ReactNode => {
    const face = unitFaceOf(unit)
    const open = expanded.has(unit.path)
    const active = activeUnit === unit.path
    const pinnedHere = pinnedPaths.has(unit.path)
    const retired = face.status === 'retired'
    const quiet = face.status === 'paused' || retired
    return (
      <div key={`${keyPrefix}${unit.path}`}>
        <div
          className={cn(
            'unitfolder:flex unitfolder:min-w-0 unitfolder:items-start unitfolder:gap-2.5 unitfolder:rounded-md unitfolder:py-1.5 unitfolder:pl-2 unitfolder:pr-1 unitfolder:hover:bg-accent/40',
            active && open && 'unitfolder:urow-active',
          )}
        >
          <button
            type="button"
            title={face.title}
            className="unitfolder:flex unitfolder:min-w-0 unitfolder:flex-1 unitfolder:cursor-pointer unitfolder:items-start unitfolder:gap-2.5 unitfolder:border-0 unitfolder:bg-transparent unitfolder:p-0 unitfolder:text-left unitfolder:text-foreground"
            onClick={() => {
              if (active) {
                // 再点一下选中的那行：收起并取消选中
                if (open) togglePath(unit.path)
                setActiveUnit(null)
                return
              }
              setActiveUnit(unit.path)
              if (!open) togglePath(unit.path)
              // 选中往外报：点谁谁是「当前单元」。收起（上面那支）不报
              select(unit.path)
            }}
          >
            {/* 图标对齐第一行文字：行高 13px×1.5 ≈ 20px，16px 的图标下移 2px 居中 */}
            <face.Icon
              className={cn(
                'unitfolder:mt-0.5 unitfolder:size-4 unitfolder:shrink-0',
                quiet || face.status === null ? 'unitfolder:text-muted-foreground' : 'unitfolder:text-foreground',
                face.broken && 'unitfolder:text-destructive',
              )}
            />
            <span className="unitfolder:flex unitfolder:min-w-0 unitfolder:flex-1 unitfolder:flex-col unitfolder:gap-0.5">
              <span className="unitfolder:flex unitfolder:min-w-0 unitfolder:items-center unitfolder:gap-1.5">
                <span
                  className={cn(
                    'unitfolder:truncate unitfolder:text-[13px] unitfolder:leading-normal unitfolder:font-medium',
                    quiet && 'unitfolder:text-muted-foreground',
                    retired && 'unitfolder:line-through unitfolder:decoration-1',
                  )}
                >
                  {face.head}
                </span>
                {quiet && face.status !== null && (
                  <span className="unitfolder:text-muted-foreground unitfolder:shrink-0 unitfolder:rounded-sm unitfolder:border unitfolder:px-1 unitfolder:text-[10px] unitfolder:leading-4">
                    {STATUS_LABEL[face.status]}
                  </span>
                )}
              </span>
              {/* purpose 摆两行，再长省略；全文在悬停说明里 */}
              <span
                className={cn(
                  'unitfolder:line-clamp-2 unitfolder:text-xs unitfolder:leading-relaxed unitfolder:break-words',
                  face.broken ? 'unitfolder:text-destructive' : active ? 'unitfolder:text-foreground/85' : 'unitfolder:text-muted-foreground',
                )}
              >
                {face.subtitle}
              </span>
            </span>
          </button>
          {/* 置顶：人在树上点出来的、落 data——不是设置。置顶块里那条同样带这颗，点它就是取消 */}
          <IconButton
            label={pinnedHere ? '取消置顶' : '置顶'}
            icon={
              pinnedHere ? (
                <PinOffIcon className="unitfolder:size-3.5" />
              ) : (
                <PinIcon className="unitfolder:text-muted-foreground unitfolder:size-3.5" />
              )
            }
            onClick={() => togglePin(unit.path, pinnedHere)}
          />
        </div>
        {open && (
          <TreePage
            dir={unit.path}
            expanded={expanded}
            listings={listings}
            onToggle={toggleDir}
            onOpenFile={openFile}
            selected={selected?.path ?? null}
          />
        )}
      </div>
    )
  }

  const renderGroup = (group: (typeof groups)[number]): React.ReactNode => {
    const collapsed = !filtered && collapsedKinds.has(group.kindKey)
    return (
      <div key={group.kindKey} className="unitfolder:mb-1">
        {/* 种类分组头：吸顶。筛选时全部摊开（收着找东西等于把结果藏起来） */}
        <div
          className="unitfolder:bg-background/95 unitfolder:sticky unitfolder:top-0 unitfolder:z-10 unitfolder:flex unitfolder:cursor-pointer unitfolder:items-center unitfolder:gap-2 unitfolder:px-2 unitfolder:py-1.5 unitfolder:backdrop-blur-sm"
          onClick={() => {
            if (filtered) return
            setCollapsedKinds((prev) => {
              const next = new Set(prev)
              if (next.has(group.kindKey)) next.delete(group.kindKey)
              else next.add(group.kindKey)
              return next
            })
          }}
        >
          <span className={cn('unitfolder:transition-transform', !collapsed && 'unitfolder:rotate-90')}>
            <ChevronRightIcon className="unitfolder:text-muted-foreground unitfolder:size-3.5" />
          </span>
          <span className="unitfolder:text-muted-foreground unitfolder:text-xs unitfolder:font-semibold unitfolder:tracking-wider">{group.label}</span>
          <span className="unitfolder:text-muted-foreground/70 unitfolder:ml-auto unitfolder:font-mono unitfolder:text-xs">{group.units.length}</span>
        </div>
        {!collapsed && group.units.map((u) => renderUnitRow(u))}
      </div>
    )
  }

  return (
    <div className="unitfolder:flex unitfolder:h-full unitfolder:flex-col">
      <PaneHeader
        host={host}
        total={total}
        containerRoot={containerRoot}
        rootExists={data?.rootExists}
        error={inventory.status === 'error' ? inventory : null}
        loading={inventory.status === 'loading'}
        query={query}
        onQuery={setQuery}
        statuses={statuses}
        onToggleStatus={(s) => setStatuses((prev) => toggled(prev, s))}
        kindOptions={data === null ? [] : kindsOf(data)}
        kinds={kinds}
        onToggleKind={(k) => setKinds((prev) => toggled(prev, k))}
        onCollapse={collapseStep}
        onOpenRoot={openInExplorer}
        onRefresh={refresh}
        activeUnitPath={activeUnit}
        activeDirs={activeDirEntries}
        onEnsureDirs={ensureDirs}
        onOpenInCode={openInCode}
      />
      {/* 滚动走**原生滚动条**（外壳全局的 ::-webkit-scrollbar 细条胶囊），容器直接
          贴窗格边——原生条画在自己盒子里、占布局空间，贴边也不会被 dockview 的
          边框裁掉；radix 的浮动条才会越界 */}
      <div className="unitfolder:min-h-0 unitfolder:flex-1 unitfolder:overflow-y-auto unitfolder:overflow-x-hidden">
        <div className="unitfolder:px-2 unitfolder:py-1">
          {/* 置顶块：图钉点出来的，按置顶先后，不受过滤影响——置顶就是「不管筛成什么样都要看得见」 */}
          {(data?.pinned ?? []).length > 0 && (
            <div className="unitfolder:mx-1 unitfolder:mb-2.5 unitfolder:border-b unitfolder:pb-2">
              <div className="unitfolder:text-muted-foreground unitfolder:flex unitfolder:items-center unitfolder:gap-1.5 unitfolder:px-1.5 unitfolder:pb-1 unitfolder:pt-0.5 unitfolder:text-[11px] unitfolder:tracking-widest">
                <PinIcon className="unitfolder:size-3" />
                置顶
              </div>
              {(data?.pinned ?? []).map((u) => renderUnitRow(u, 'pinned:'))}
            </div>
          )}
          {groups.map(renderGroup)}
          {inventory.status === 'loaded' && groups.length === 0 && (
            <p className="unitfolder:text-muted-foreground unitfolder:m-0 unitfolder:px-2 unitfolder:py-4 unitfolder:text-sm">
              {kindsOf(data ?? {}).length === 0 ? '容器根里还没有单元。' : '没有筛中的单元。'}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * 原文格：只有一件事——把树格里单击的那个文件的原文摆出来（多份实例各显各的）。
 *
 * **初值与后续，两条渠道各管一种局面**：挂载时从 `lastSelection()` 拿最近一次递来的
 * 文件（树格刚 `openPane` 把它叫出来的那一刻，emit 已经过去了，只能自己去问——接力棒
 * 住在本模块内存里，见 selection.ts）；之后听总线上的 `file-selected`，**detail 带
 * `target`，只有 target 对上自己这份才响应**——多份原文格各显各的，单击改不到别格。
 *
 * **它一条定时器都不起**：账不会自己变，变了树格会喊。自己再轮询一遍只会把「总线断了」
 * 这件事盖住——症状从「原文不跟着换」降成「换得慢半拍」，而后者跟盘慢分不开。
 */
function ViewerPane({
  host,
  shell,
  instance,
}: {
  host: HostBridge
  shell: ShellBridge
  instance: string
}) {
  const [selection, setSelection] = useState<SelectionPayload | null>(() => lastSelection())
  const alive = useRef(true)

  // 标签直接显示当前文件名（空态回「文件原文」）。setPaneTitle 是 0.0.13 外壳才开的
  // 口——可选调用，旧外壳上优雅降级成静态标题
  useEffect(() => {
    if (!alive.current) return
    shell.setPaneTitle?.(selection === null ? '文件原文' : selection.name)
  }, [shell, selection])

  useEffect(() => {
    alive.current = true
    const off = shell.bus.on(FILE_SELECTED, (detail) => {
      if (!alive.current) return
      const d = detail as { target?: unknown; payload?: unknown } | null
      // detail 带 target = 定向投递，只有目标这份响应（多份各显各的）；
      // 不带 target = 广播（无焦点时的兜底），开着的都换
      if (d === null || typeof d !== 'object') return
      if (d.target !== undefined && d.target !== instance) return
      const next = pickPayload(d.payload)
      if (next !== null) setSelection(next)
    })
    return () => {
      alive.current = false
      off()
    }
  }, [shell, instance])

  return (
    <UnitsViewer
      host={host}
      selected={selection === null ? null : { path: selection.path, name: selection.name }}
      containerRoot={selection?.containerRoot ?? ''}
    />
  )
}

/** 过滤标签：开着是实底，关着是描边 */
function FilterChip({ label, on, onToggle }: { label: string; on: boolean; onToggle(): void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onToggle}
      className={cn(
        'unitfolder:cursor-pointer unitfolder:rounded-full unitfolder:border unitfolder:px-2 unitfolder:py-0.5 unitfolder:text-[11px] unitfolder:leading-4',
        on
          ? 'unitfolder:border-transparent unitfolder:bg-secondary unitfolder:text-secondary-foreground'
          : 'unitfolder:bg-transparent unitfolder:text-muted-foreground unitfolder:hover:text-foreground',
      )}
    >
      {label}
    </button>
  )
}

/**
 * 对选中单元的一个目录做一件事的下拉：首项是单元文件夹本身，后面是它的第一级子目录（仓多半住
 * 在那一层）。目录清单在下拉打开时现拉，复用树格的缓存；没选中单元时整颗灰掉。
 *
 * 这颗按钮不套 Tooltip——TooltipTrigger 与 DropdownMenuTrigger 两层 asChild 会互相覆盖事件，
 * 菜单点不开；下拉里的标题就是说明
 */
function DirMenu({
  label,
  icon,
  activeUnitPath,
  activeDirs,
  onEnsureDirs,
  onPick,
}: {
  label: string
  icon: React.ReactNode
  activeUnitPath: string | null
  activeDirs: BrowseEntry[] | null
  onEnsureDirs(): void
  onPick(path: string): void
}) {
  return (
    <DropdownMenu onOpenChange={(open) => { if (open) onEnsureDirs() }}>
      <DropdownMenuTrigger asChild disabled={activeUnitPath === null}>
        <Button size="icon" className="unitfolder:size-7" variant="ghost" aria-label={label}>
          {icon}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="unitfolder:max-h-72 unitfolder:overflow-y-auto">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        {activeUnitPath !== null && <DropdownMenuItem onClick={() => onPick(activeUnitPath)}>单元文件夹</DropdownMenuItem>}
        {activeDirs === null ? (
          <DropdownMenuItem disabled>目录清单读取中…</DropdownMenuItem>
        ) : (
          activeDirs.map((d) => (
            <DropdownMenuItem key={d.name} onClick={() => onPick(joinPath(activeUnitPath ?? '', d.name))}>
              {d.name}
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** 工具条：标题 + 总数、根路径、筛选框、一键折叠、VSCode 与复制路径两个下拉、打开根、刷新、扩展按钮排、过滤标签；未配置与报错的两句话也归这层 */
function PaneHeader({
  host,
  total,
  containerRoot,
  rootExists,
  error,
  loading,
  query,
  onQuery,
  statuses,
  onToggleStatus,
  kindOptions,
  kinds,
  onToggleKind,
  onCollapse,
  onOpenRoot,
  onRefresh,
  activeUnitPath,
  activeDirs,
  onEnsureDirs,
  onOpenInCode,
}: {
  host: HostBridge
  total: number
  containerRoot: string
  rootExists?: boolean | undefined
  error: { status: 'error'; message: string; unconfigured: boolean } | null
  loading: boolean
  query: string
  onQuery(value: string): void
  statuses: ReadonlySet<UnitStatus>
  onToggleStatus(status: UnitStatus): void
  kindOptions: Array<{ key: string; label: string }>
  kinds: ReadonlySet<string>
  onToggleKind(kind: string): void
  onCollapse(): void
  onOpenRoot(path: string): void
  onRefresh(): void
  /** 选中单元的路径（蓝底那行）；null = 没选中，VSCode 下拉置灰 */
  activeUnitPath: string | null
  /** 选中单元的第一级子目录；null = 清单还没拉到 */
  activeDirs: BrowseEntry[] | null
  onEnsureDirs(): void
  onOpenInCode(path: string): void
}) {
  const [copied, setCopied] = useState(false)
  const copyPath = useCallback((path: string) => {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return
    void navigator.clipboard.writeText(path).then(
      () => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      },
      (err: unknown) => console.warn(`[gwb-unit-folder] 复制路径没成：${String(err)}`),
    )
  }, [])

  return (
    <div className="unitfolder:flex unitfolder:flex-none unitfolder:flex-col unitfolder:gap-2 unitfolder:px-3 unitfolder:py-2.5">
      <div className="unitfolder:flex unitfolder:flex-wrap unitfolder:items-center unitfolder:gap-2">
        <span className="unitfolder:text-sm unitfolder:font-semibold">
          单元
          {total > 0 && <b className="unitfolder:text-muted-foreground unitfolder:ml-1.5 unitfolder:font-mono unitfolder:text-xs unitfolder:font-normal">{total}</b>}
        </span>
        {containerRoot !== '' && (
          <span className="unitfolder:text-muted-foreground unitfolder:max-w-44 unitfolder:truncate unitfolder:font-mono unitfolder:text-xs" title={containerRoot}>
            {containerRoot}
          </span>
        )}
        <span className="unitfolder:min-w-40 unitfolder:flex-1" />
        <div className="unitfolder:relative unitfolder:flex unitfolder:items-center">
          <SearchIcon className="unitfolder:text-muted-foreground/80 unitfolder:pointer-events-none unitfolder:absolute unitfolder:left-2.5 unitfolder:size-3.5" />
          <Input
            value={query}
            spellCheck={false}
            placeholder="筛选单元…"
            className="unitfolder:h-8 unitfolder:w-44 unitfolder:pl-8"
            autoComplete="off"
            onChange={(e) => onQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && query !== '') {
                e.stopPropagation()
                onQuery('')
              }
            }}
          />
        </div>
        <IconButton label="一键折叠" icon={<ChevronsDownUpIcon className="unitfolder:size-4" />} onClick={onCollapse} />
        <DirMenu
          label="从 VSCode 新窗口打开"
          icon={<CodeXmlIcon className="unitfolder:size-4" />}
          activeUnitPath={activeUnitPath}
          activeDirs={activeDirs}
          onEnsureDirs={onEnsureDirs}
          onPick={onOpenInCode}
        />
        <DirMenu
          label={copied ? '已复制' : '复制文件夹路径'}
          icon={copied ? <CheckIcon className="unitfolder:size-4" /> : <CopyIcon className="unitfolder:size-4" />}
          activeUnitPath={activeUnitPath}
          activeDirs={activeDirs}
          onEnsureDirs={onEnsureDirs}
          onPick={copyPath}
        />
        <IconButton
          label="在资源管理器打开容器根"
          icon={<ArrowUpRightIcon className="unitfolder:size-4" />}
          disabled={containerRoot === ''}
          onClick={() => onOpenRoot(containerRoot)}
        />
        <IconButton label="现扫一次" icon={<RefreshCwIcon className="unitfolder:size-4" />} disabled={loading} onClick={onRefresh} />
        {/* 扩展按钮排：别的件经 ctx.gwbUnitFolder.registerToolbarButton 登记进来的，
            亮不亮跟着选中单元走（问登记方给的 state 命令），画在自家这几颗后面 */}
        <ToolbarButtons host={host} unitPath={activeUnitPath} />
      </div>
      {/* 过滤标签：状态三档 + 种类若干，都是多选。种类一个不选 = 不按种类筛 */}
      <div className="unitfolder:flex unitfolder:flex-wrap unitfolder:items-center unitfolder:gap-1">
        {UNIT_STATUSES.map((s) => (
          <FilterChip key={s} label={STATUS_LABEL[s]} on={statuses.has(s)} onToggle={() => onToggleStatus(s)} />
        ))}
        {kindOptions.length > 0 && <span className="unitfolder:bg-border unitfolder:mx-1 unitfolder:h-4 unitfolder:w-px" />}
        {kindOptions.map((k) => (
          <FilterChip key={k.key} label={k.label} on={kinds.has(k.key)} onToggle={() => onToggleKind(k.key)} />
        ))}
      </div>
      {error !== null &&
        (error.unconfigured ? (
          <p className="unitfolder:text-muted-foreground unitfolder:m-0 unitfolder:text-sm">{error.message}</p>
        ) : (
          <p className="unitfolder:text-destructive unitfolder:m-0 unitfolder:text-sm" role="status">
            出错：{error.message}
          </p>
        ))}
      {error === null && rootExists === false && (
        <p className="unitfolder:text-muted-foreground unitfolder:m-0 unitfolder:text-sm">容器根不存在：{containerRoot}——路径可以先于目录写下。</p>
      )}
    </div>
  )
}

/**
 * 挂载：**两格共用这一个 `mountPane`**，按 `pane.id` 分派——一个 client 束是一份模块
 * 实例，两格共用它，React 根各自建各自的。契约要求**同步**返回 `{ dispose }`：
 * async/回函数都算违约。
 *
 * 原文格这边多两件事：**挂载即登记焦点**、容器上挂 `mousedown` 记焦点（焦点 =
 * 最后一次鼠标点过的原文格，单击路由的落点，见 selection.ts）；`dispose` 摘监听并
 * 释放焦点。
 */
export function mountPane({ host, shell, pane }: PaneArgs, container: HTMLElement): { dispose(): void } {
  const isViewer = pane.id === VIEWER_PANE
  const onDown = (): void => noteViewerFocus(pane.instance)
  if (isViewer) {
    viewerMounted(pane.instance)
    container.addEventListener('mousedown', onDown)
  }
  const root = createRoot(container)
  root.render(
    // 新版 shadcn 的 Tooltip.Root 要求外层有 Provider——窗格顶层给一把，IconButton 里各归各
    <TooltipProvider delayDuration={200}>
      {pane.id === VIEWER_PANE ? (
        <ViewerPane host={host} shell={shell} instance={pane.instance} />
      ) : (
        <UnitFolderPane host={host} shell={shell} />
      )}
    </TooltipProvider>,
  )
  return {
    dispose() {
      root.unmount()
      if (isViewer) {
        container.removeEventListener('mousedown', onDown)
        releaseViewerFocus(pane.instance)
      }
    },
  }
}
