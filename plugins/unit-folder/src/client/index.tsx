import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type * as React from 'react'
import { createRoot } from 'react-dom/client'
import {
  CheckIcon,
  ChevronRightIcon,
  ChevronsDownUpIcon,
  CodeXmlIcon,
  CopyIcon,
  FileIcon,
  FolderIcon,
  FolderOpenIcon,
  FolderXIcon,
  ListFilterIcon,
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
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { TooltipProvider } from '@/components/ui/tooltip'
import { IconButton } from '@/components/ui/icon-button'
import { ToolbarButtons } from './toolbar-buttons.js'
import { PortalContainerContext, usePortalContainer } from './portal-container.js'
import { VIEWER_PANE, fileOfParams, openModeOf, openViewer, type OpenMode, type ViewerFile } from './open-file.js'
import type { HostBridge, PaneArgs, PaneHandle, ShellBridge } from './types.js'
import {
  DEFAULT_STATUSES,
  QUIET_STATUSES,
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
 * 单元文件夹的浏览器侧，两个窗格（node 侧 registerPane 的 main / viewer）：
 *
 * * 单元树（`main`，工具窗格）：单元行是出生证里的图标、title 与两行 purpose；按种类分组；筛选下拉管状态与种类；
 *   置顶块；单元展开出文件树。点单元行、展开单元内目录时向 node 侧报一次选中（`unit-folder.select`），收起不报
 * * 原文（`viewer`，文档窗格）：一份装一个文件，行号、折行开关、点路径复制
 *
 * 两个窗格之间不经命令总线：树里点文件就是 `openPane('viewer', …)`，装哪个文件存在那一份的参数里，见 open-file.ts。
 * 目录清单与展开状态只存在单元树窗格的 state 里，刷新才重读
 */

// ── 数据形状（与 node 侧的回执对应） ──────────────────────────────────────────────

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

/** 命令总线的回执。带 `code` 的失败（unconfigured）原样传过来，见 node 侧 */
interface Reply<T> {
  ok?: boolean
  data?: T
  error?: string
  code?: string
}

// ── 单元行显示什么 ──────────────────────────────────────────────────────────────

/** 出生证 icon 认不出时画这个；没出生证与读不出各用一个图标，看得出要去补出生证 */
const DEFAULT_UNIT_ICON = FolderIcon

function iconOf(name: string): LucideIcon {
  return (icons as Record<string, LucideIcon | undefined>)[lucideKey(name)] ?? DEFAULT_UNIT_ICON
}

/** 一个单元行显示什么：图标、两行文字、悬停说明、状态 */
function unitRowContentOf(unit: UnitEntry): {
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

function formatByteSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

// ── 文件树（单元展开后的目录层） ────────────────────────────────────────────────

/** 一层目录的行：目录可再展开（按层递归渲染），文件点了开原文窗格 */
function DirectoryRows({
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
  /** 点了一个文件：开法按手势定（单击预览、Ctrl / 中键新标签、Ctrl+Alt 开到旁边） */
  onOpenFile(path: string, name: string, mode: OpenMode): void
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
                <DirectoryRows
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
            onClick={(e) => onOpenFile(abs, entry.name, openModeOf(e))}
            // 中键不触发 onClick，走 auxclick；按下时拦掉浏览器的中键自动滚动。右键（button 2）不算打开
            onMouseDown={(e) => {
              if (e.button === 1) e.preventDefault()
            }}
            onAuxClick={(e) => {
              if (e.button === 1) onOpenFile(abs, entry.name, openModeOf(e))
            }}
          >
            <span className="unitfolder:text-muted-foreground unitfolder:shrink-0">
              <FileIcon className="unitfolder:size-4" />
            </span>
            <span className="unitfolder:truncate">{entry.name}</span>
            {entry.size !== undefined && (
              <span className="unitfolder:text-muted-foreground unitfolder:ml-auto unitfolder:shrink-0 unitfolder:font-mono unitfolder:text-[10.5px]">{formatByteSize(entry.size)}</span>
            )}
          </div>
        )
      })}
    </>
  )
}

/** 树里用的路径拼接，统一用正斜杠；node 侧 path.resolve 时换成系统写法 */
function joinPath(dir: string, name: string): string {
  return `${dir.replace(/[\\/]+$/, '')}/${name}`
}

/** 单元展开后那一块：浅底加左侧参考线 */
function ExpandedUnitTree(props: Omit<Parameters<typeof DirectoryRows>[0], 'depth'>): React.ReactNode {
  return (
    <div className="unitfolder:bg-accent/20 unitfolder:mx-2 unitfolder:mb-1.5 unitfolder:rounded-sm unitfolder:border-l-2 unitfolder:py-1 unitfolder:pl-1">
      <DirectoryRows {...props} depth={0} />
    </div>
  )
}

// ── 原文 ────────────────────────────────────────────────────────────────

/**
 * 原文带行号：一行一个 flex 行（行号 | 文本），折行时行号仍对齐自己那行文本的开头。
 * 折行用 `break-words` 不用 `break-all`：只在单词放不下时才切，英文单词不会被切成两半，CJK 照常逐字换行
 */
function renderCode(text: string, wrap: boolean): React.ReactNode {
  const lines = text.split('\n')
  return (
    <div className="unitfolder:flex unitfolder:flex-col">
      {lines.map((line, i) => (
        <div key={i} className="unitfolder:flex unitfolder:items-baseline">
          <span className="unitfolder:w-9 unitfolder:shrink-0 unitfolder:select-none unitfolder:pr-3 unitfolder:text-right unitfolder:font-mono unitfolder:text-xs unitfolder:leading-[1.625] unitfolder:text-muted-foreground/60">
            {i + 1}
          </span>
          <span
            className={cn(
              'unitfolder:min-w-0 unitfolder:flex-1 unitfolder:font-mono unitfolder:text-xs unitfolder:leading-[1.625]',
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
  const latestLoadRef = useRef(0)

  const displayPath = useMemo(() => {
    if (selected === null || containerRoot === '') return null
    const normRoot = containerRoot.replace(/[\\/]+$/, '')
    const normPath = selected.path.replace(/[\\/]+$/, '')
    return normPath.startsWith(normRoot) ? normPath.slice(normRoot.length).replace(/^[\\/]/, '') : selected.path
  }, [selected, containerRoot])

  const load = useCallback(
    (path: string | null) => {
      const token = ++latestLoadRef.current
      if (path === null) {
        setPreview({ status: 'idle' })
        return
      }
      setPreview({ status: 'loading' })
      void host
        .call('unit-folder.readFile', { path })
        .then((res) => {
          if (token !== latestLoadRef.current) return
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
          在单元树里点一个文件看原文：单击预览，Ctrl+单击另开一个标签，Ctrl+Alt+单击开到旁边。
        </div>
      </div>
    )
  }

  return (
    <div className="unitfolder:flex unitfolder:h-full unitfolder:min-w-0 unitfolder:flex-col">
      <div className="unitfolder:flex unitfolder:flex-none unitfolder:items-center unitfolder:gap-2 unitfolder:border-b unitfolder:px-3 unitfolder:py-2">
        {/* 点路径复制绝对路径 */}
        <Button
          variant="link"
          size="xs"
          className="unitfolder:min-w-0 unitfolder:flex-1 unitfolder:shrink unitfolder:justify-start unitfolder:px-0 unitfolder:text-left"
          title={copied ? '已复制' : `点一下复制\n${selected.path}`}
          onClick={copyPath}
        >
          <span className="unitfolder:truncate unitfolder:font-mono">{copied ? '已复制' : (displayPath ?? selected.path)}</span>
        </Button>
        {preview.status === 'loaded' && (
          <span className="unitfolder:text-muted-foreground unitfolder:shrink-0 unitfolder:font-mono unitfolder:text-xs">
            {formatByteSize(preview.data.size)}
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

function UnitFolderPane({ host, shell, instance }: { host: HostBridge; shell: ShellBridge; instance: string }) {
  const [inventory, setInventory] = useState<InventoryState>({ status: 'loading' })
  const [listings, setListings] = useState<Map<string, ListingState>>(() => new Map())
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const [collapsedKinds, setCollapsedKinds] = useState<Set<string>>(() => new Set())
  const [query, setQuery] = useState('')
  /** 过滤只存在内存里：关掉窗格再开回到默认（藏起退役的、种类不限） */
  const [statuses, setStatuses] = useState<ReadonlySet<UnitStatus>>(DEFAULT_STATUSES)
  const [kinds, setKinds] = useState<ReadonlySet<string>>(() => new Set())
  const [selected, setSelected] = useState<{ path: string; name: string } | null>(null)
  /** 选中的单元（高亮的那一行）：点谁谁选中并展开，再点一下收起并取消选中 */
  const [activeUnit, setActiveUnit] = useState<string | null>(null)
  const latestInventoryRequestRef = useRef(0)

  const data = inventory.status === 'loaded' ? inventory.data : null
  const containerRoot = data?.container ?? ''

  const loadInventory = useCallback(() => {
    const token = ++latestInventoryRequestRef.current
    setInventory({ status: 'loading' })
    void host.call('unit-folder.list').then((res) => {
      if (token !== latestInventoryRequestRef.current) return
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
   * 往 node 侧报一次选中，展开不等回执；失败只在控制台 warn——「当前单元」是给别的插件看的，
   * 报不上去不让树卡住
   */
  const reportSelection = useCallback(
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
      if (!expanded.has(dir)) reportSelection(dir)
      togglePath(dir)
    },
    [expanded, reportSelection, togglePath],
  )

  /** 刷新：重取清单，所有展开着的目录重读；展开与选中都保留 */
  const refresh = useCallback(() => {
    loadInventory()
    for (const dir of expanded) loadListing(dir)
  }, [expanded, loadInventory, loadListing])

  /** 一键折叠：有展开的单元先全部收起；没有就在「收起全部种类分组」与「全部展开」之间切换 */
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

  /** 置顶 / 取消置顶，存进 node 侧的 data 文档；成不成都重取清单，置顶块以存下的那份为准 */
  const togglePin = useCallback(
    (path: string, pinnedNow: boolean) => {
      const call = host.call(pinnedNow ? 'unit-folder.unpin' : 'unit-folder.pin', { path })
      call.then(
        (res) => {
          const reply = res as Reply<unknown>
          if (!reply.ok) console.warn(`[gwb-unit-folder] 置顶没存上：${reply.error ?? '未知原因'}`)
          loadInventory()
        },
        (err: unknown) => console.warn(`[gwb-unit-folder] 置顶调不通：${String(err)}`),
      )
    },
    [host, loadInventory],
  )

  /** 选中单元的第一级子目录清单（目录下拉用）；还没读过就回 null，由 onEnsureDirs 去读 */
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
   * 点了一个文件：树里高亮它，按开法经外壳开原文窗格（见 open-file.ts）；外壳把它开在最近用过的
   * 那组原文窗格里，没有就开到单元树旁边
   */
  const openFile = useCallback(
    (path: string, name: string, mode: OpenMode) => {
      setSelected({ path, name })
      openViewer(shell, { path, name, containerRoot }, mode)
    },
    [shell, containerRoot],
  )

  /** 有文字筛选时分组全部展开：收着的分组会藏住筛中的结果 */
  const filtered = query.trim() !== ''

  const groups = useMemo(
    () => (data === null ? [] : filterGroups(data, { statuses, kinds, query })),
    [data, statuses, kinds, query],
  )

  const total = groups.reduce((n, g) => n + g.units.length, 0)

  const pinnedPaths = useMemo(() => new Set((data?.pinned ?? []).map((u) => u.path)), [data])

  const renderUnitRow = (unit: UnitEntry, keyPrefix = ''): React.ReactNode => {
    const rowContent = unitRowContentOf(unit)
    const open = expanded.has(unit.path)
    const active = activeUnit === unit.path
    const pinnedHere = pinnedPaths.has(unit.path)
    const retired = rowContent.status === 'retired'
    const quiet = rowContent.status !== null && QUIET_STATUSES.has(rowContent.status)
    return (
      <div key={`${keyPrefix}${unit.path}`}>
        <div
          className={cn(
            'unitfolder:flex unitfolder:min-w-0 unitfolder:items-start unitfolder:gap-1 unitfolder:rounded-md unitfolder:pr-1',
            active && open && 'unitfolder:urow-active',
          )}
        >
          <Button
            variant="ghost"
            size="sm"
            title={rowContent.title}
            className="unitfolder:h-auto unitfolder:min-w-0 unitfolder:flex-1 unitfolder:shrink unitfolder:items-start unitfolder:justify-start unitfolder:gap-2.5 unitfolder:py-1.5 unitfolder:text-left unitfolder:whitespace-normal"
            onClick={() => {
              if (active) {
                // 再点一下选中的那行：收起并取消选中
                if (open) togglePath(unit.path)
                setActiveUnit(null)
                return
              }
              setActiveUnit(unit.path)
              if (!open) togglePath(unit.path)
              // 点中的单元报成「当前单元」；上面收起那一支不报
              reportSelection(unit.path)
            }}
          >
            {/* 图标对齐第一行文字：行高 13px×1.5 ≈ 20px，16px 的图标下移 2px 居中 */}
            <rowContent.Icon
              className={cn(
                'unitfolder:mt-0.5 unitfolder:size-4 unitfolder:shrink-0',
                quiet || rowContent.status === null ? 'unitfolder:text-muted-foreground' : 'unitfolder:text-foreground',
                rowContent.broken && 'unitfolder:text-destructive',
              )}
            />
            <span className="unitfolder:flex unitfolder:min-w-0 unitfolder:flex-1 unitfolder:flex-col unitfolder:gap-0.5">
              <span className="unitfolder:flex unitfolder:min-w-0 unitfolder:items-center unitfolder:gap-1.5">
                <span
                  className={cn(
                    'unitfolder:truncate unitfolder:text-[13px] unitfolder:leading-[1.5] unitfolder:font-medium',
                    quiet && 'unitfolder:text-muted-foreground',
                    retired && 'unitfolder:line-through unitfolder:decoration-1',
                  )}
                >
                  {rowContent.head}
                </span>
                {quiet && rowContent.status !== null && (
                  <span className="unitfolder:text-muted-foreground unitfolder:shrink-0 unitfolder:rounded-sm unitfolder:border unitfolder:px-1 unitfolder:text-[10px] unitfolder:leading-4 unitfolder:font-normal">
                    {STATUS_LABEL[rowContent.status]}
                  </span>
                )}
              </span>
              {/* purpose 显示两行，再长省略；全文在悬停说明里 */}
              <span
                className={cn(
                  'unitfolder:line-clamp-2 unitfolder:text-xs unitfolder:leading-[1.625] unitfolder:font-normal unitfolder:break-words',
                  rowContent.broken ? 'unitfolder:text-destructive' : active ? 'unitfolder:text-foreground/85' : 'unitfolder:text-muted-foreground',
                )}
              >
                {rowContent.subtitle}
              </span>
            </span>
          </Button>
          {/* 置顶按钮：置顶块里那一行同样有它，点了就是取消置顶 */}
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
          <ExpandedUnitTree
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
        {/* 种类分组头：滚动时停在顶部；有文字筛选时不能收起 */}
        <div
          className="unitfolder:bg-background/95 unitfolder:sticky unitfolder:top-0 unitfolder:z-10 unitfolder:flex unitfolder:cursor-pointer unitfolder:items-center unitfolder:gap-2 unitfolder:px-2 unitfolder:py-1.5 unitfolder:backdrop-blur-[8px]"
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
          <span className="unitfolder:text-muted-foreground unitfolder:text-xs unitfolder:font-semibold unitfolder:tracking-[0.05em]">{group.label}</span>
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
        from={instance}
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
        onResetFilter={() => {
          setStatuses(DEFAULT_STATUSES)
          setKinds(new Set())
        }}
        onCollapse={collapseStep}
        onOpenRoot={openInExplorer}
        onRefresh={refresh}
        activeUnitPath={activeUnit}
        activeDirs={activeDirEntries}
        onEnsureDirs={ensureDirs}
        onOpenInCode={openInCode}
      />
      {/* 用原生滚动条（外壳全局的 ::-webkit-scrollbar 样式）：它画在自己盒子里、占布局空间，
          容器贴窗格边也不会被 dockview 的边框裁掉；radix 的浮动滚动条会越界 */}
      <div className="unitfolder:min-h-0 unitfolder:flex-1 unitfolder:overflow-y-auto unitfolder:overflow-x-hidden">
        <div className="unitfolder:px-2 unitfolder:py-1">
          {/* 置顶块：按置顶先后，不受过滤影响 */}
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
 * 原文窗格：显示这一份参数里那个文件的原文。装哪个文件只来自外壳给的参数：挂载时读 `pane.params`；
 * 外壳替换预览窗格的内容时经 `retarget`（`onSwap` 接进来）原地换文件，折行开关保留。
 * 窗格里没有原地换文件的入口，所以不调 `setPaneContent`。不起定时器，文件变了点「重读」
 */
function ViewerPane({
  host,
  shell,
  initial,
  onSwap,
}: {
  host: HostBridge
  shell: ShellBridge
  initial: ViewerFile | null
  onSwap(swap: (params: Record<string, unknown>) => void): void
}) {
  const [selection, setSelection] = useState<ViewerFile | null>(initial)

  // 外壳换这一份的参数时换文件（认不出的参数回空态）；mountPane 把这个函数交给 retarget
  useEffect(() => {
    onSwap((params) => setSelection(fileOfParams(params)))
  }, [onSwap])

  // 标签显示当前文件名，空态显示「文件原文」
  useEffect(() => {
    shell.setPaneTitle?.(selection === null ? '文件原文' : selection.name)
  }, [shell, selection])

  return (
    <UnitsViewer
      host={host}
      selected={selection === null ? null : { path: selection.path, name: selection.name }}
      containerRoot={selection?.containerRoot ?? ''}
    />
  )
}

/**
 * 过滤下拉：状态三档加种类若干，都是多选；种类一个不勾 = 不按种类筛。勾选时菜单不收起，
 * 过滤不是默认值时按钮上显示一个点
 */
function FilterMenu({
  statuses,
  onToggleStatus,
  kindOptions,
  kinds,
  onToggleKind,
  onReset,
}: {
  statuses: ReadonlySet<UnitStatus>
  onToggleStatus(status: UnitStatus): void
  kindOptions: Array<{ key: string; label: string }>
  kinds: ReadonlySet<string>
  onToggleKind(kind: string): void
  onReset(): void
}) {
  const customized =
    kinds.size > 0 || statuses.size !== DEFAULT_STATUSES.size || [...statuses].some((s) => !DEFAULT_STATUSES.has(s))
  const keepOpen = (e: Event): void => e.preventDefault()
  const portalContainer = usePortalContainer()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon" className="unitfolder:relative unitfolder:size-8 unitfolder:shrink-0" variant="ghost" aria-label="筛选">
          <ListFilterIcon className="unitfolder:size-4" />
          {customized && (
            <span className="unitfolder:bg-primary unitfolder:absolute unitfolder:top-1.5 unitfolder:right-1.5 unitfolder:size-1.5 unitfolder:rounded-full" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent container={portalContainer} align="end" className="unitfolder:max-h-96 unitfolder:w-44 unitfolder:overflow-y-auto">
        <DropdownMenuLabel className="unitfolder:text-muted-foreground unitfolder:text-xs">状态</DropdownMenuLabel>
        {UNIT_STATUSES.map((s) => (
          <DropdownMenuCheckboxItem key={s} checked={statuses.has(s)} onSelect={keepOpen} onCheckedChange={() => onToggleStatus(s)}>
            {STATUS_LABEL[s]}
          </DropdownMenuCheckboxItem>
        ))}
        {kindOptions.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="unitfolder:text-muted-foreground unitfolder:text-xs">种类（不勾 = 全部）</DropdownMenuLabel>
            {kindOptions.map((k) => (
              <DropdownMenuCheckboxItem key={k.key} checked={kinds.has(k.key)} onSelect={keepOpen} onCheckedChange={() => onToggleKind(k.key)}>
                {k.label}
              </DropdownMenuCheckboxItem>
            ))}
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={!customized} onClick={onReset}>
          恢复默认
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * 对选中单元的一个目录做一件事的下拉：首项是单元目录本身，后面是它的第一级子目录（仓通常在那一层）。
 * 目录清单在下拉打开时读，复用单元树已读过的清单；没选中单元时不可用。
 * 触发按钮不套 Tooltip：TooltipTrigger 与 DropdownMenuTrigger 两层 asChild 会互相覆盖事件，菜单点不开
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
  const portalContainer = usePortalContainer()
  return (
    <DropdownMenu onOpenChange={(open) => { if (open) onEnsureDirs() }}>
      <DropdownMenuTrigger asChild disabled={activeUnitPath === null}>
        <Button size="icon" className="unitfolder:size-7" variant="ghost" aria-label={label} title={label}>
          {icon}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent container={portalContainer} align="end" className="unitfolder:max-h-72 unitfolder:overflow-y-auto">
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

/**
 * 工具条，固定两行、行内不折行：
 * - 第一行：标题与总数、容器根（放不下就截断）、动作按钮——先是对选中单元的（VSCode、复制路径、
 *   别的插件登记的按钮），竖线隔开，再是对整棵树的（打开容器根、一键折叠、现扫）
 * - 第二行：文字筛选框占满，右边是筛选下拉（状态与种类）
 *
 * 未配置与出错的提示也在这里
 */
function PaneHeader({
  host,
  from,
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
  onResetFilter,
  onCollapse,
  onOpenRoot,
  onRefresh,
  activeUnitPath,
  activeDirs,
  onEnsureDirs,
  onOpenInCode,
}: {
  host: HostBridge
  /** 单元树窗格的实例 id：登记进来的按钮点击时作为 `from` 传给登记方 */
  from: string
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
  onResetFilter(): void
  onCollapse(): void
  onOpenRoot(path: string): void
  onRefresh(): void
  /** 选中单元的路径（高亮那一行）；null = 没选中，目录下拉不可用 */
  activeUnitPath: string | null
  /** 选中单元的第一级子目录；null = 清单还没读到 */
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
      <div className="unitfolder:flex unitfolder:min-w-0 unitfolder:items-center unitfolder:gap-2">
        <span className="unitfolder:shrink-0 unitfolder:text-sm unitfolder:font-semibold">
          单元
          {total > 0 && <b className="unitfolder:text-muted-foreground unitfolder:ml-1.5 unitfolder:font-mono unitfolder:text-xs unitfolder:font-[400]">{total}</b>}
        </span>
        <span className="unitfolder:text-muted-foreground unitfolder:min-w-0 unitfolder:flex-1 unitfolder:truncate unitfolder:font-mono unitfolder:text-xs" title={containerRoot}>
          {containerRoot}
        </span>
        <div className="unitfolder:flex unitfolder:shrink-0 unitfolder:items-center unitfolder:gap-0.5">
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
          {/* 别的插件经 ctx.gwbUnitFolder.registerToolbarButton 登记进来的按钮，
              可不可用跟着选中单元走（问登记方给的 state 命令），画在本插件的按钮后面 */}
          <ToolbarButtons host={host} unitPath={activeUnitPath} from={from} />
          <span className="unitfolder:bg-border unitfolder:mx-1 unitfolder:h-4 unitfolder:w-px" />
          <IconButton
            label="在资源管理器打开容器根"
            icon={<FolderOpenIcon className="unitfolder:size-4" />}
            disabled={containerRoot === ''}
            onClick={() => onOpenRoot(containerRoot)}
          />
          <IconButton label="一键折叠" icon={<ChevronsDownUpIcon className="unitfolder:size-4" />} onClick={onCollapse} />
          <IconButton label="现扫一次" icon={<RefreshCwIcon className="unitfolder:size-4" />} disabled={loading} onClick={onRefresh} />
        </div>
      </div>
      <div className="unitfolder:flex unitfolder:items-center unitfolder:gap-1">
        <div className="unitfolder:relative unitfolder:flex unitfolder:min-w-0 unitfolder:flex-1 unitfolder:items-center">
          <SearchIcon className="unitfolder:text-muted-foreground/80 unitfolder:pointer-events-none unitfolder:absolute unitfolder:left-2.5 unitfolder:size-3.5" />
          <Input
            value={query}
            spellCheck={false}
            placeholder="筛选单元…"
            className="unitfolder:h-8 unitfolder:w-full unitfolder:pl-8"
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
        <FilterMenu
          statuses={statuses}
          onToggleStatus={onToggleStatus}
          kindOptions={kindOptions}
          kinds={kinds}
          onToggleKind={onToggleKind}
          onReset={onResetFilter}
        />
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
 * 两个窗格共用这一个 `mountPane`，按 `pane.id` 分派，各建各的 React 根。句柄必须同步返回；
 * 原文窗格的句柄多一个 `retarget`：外壳替换预览窗格的内容时原地换文件，不卸载这棵树
 */
export function mountPane({ host, shell, pane }: PaneArgs, container: HTMLElement): PaneHandle {
  const isViewer = pane.id === VIEWER_PANE
  /** 原文窗格换文件的函数：ViewerPane 挂载后填进来 */
  let swap: ((params: Record<string, unknown>) => void) | undefined
  const root = createRoot(container)
  root.render(
    // shadcn 的 Tooltip 要求外层有 Provider，窗格顶层放一个
    <PortalContainerContext.Provider value={shell.portal}>
      <TooltipProvider delayDuration={200}>
        {isViewer ? (
          <ViewerPane host={host} shell={shell} initial={fileOfParams(pane.params)} onSwap={(fn) => (swap = fn)} />
        ) : (
          <UnitFolderPane host={host} shell={shell} instance={pane.instance} />
        )}
      </TooltipProvider>
    </PortalContainerContext.Provider>,
  )
  return {
    dispose() {
      root.unmount()
    },
    ...(isViewer
      ? {
          retarget(params: Record<string, unknown>) {
            swap?.(params)
          },
        }
      : {}),
  }
}
