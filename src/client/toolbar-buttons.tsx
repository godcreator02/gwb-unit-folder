import { useCallback, useEffect, useRef, useState } from 'react'
import { BookOpenIcon, CircleDotIcon, GlobeIcon, RocketIcon, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { IconButton } from '@/components/ui/icon-button'
import { clickArgsOf, isToolbarNudge, parseButtonState, type ButtonState, type RegisteredToolbarButton } from '../toolbar.js'
import type { HostBridge } from './types.js'

/**
 * 工具条的扩展按钮排：别的件经 `ctx.gwbUnitFolder.registerToolbarButton` 登记进来的
 * 按钮，画在自家那几颗后面。这一层不认识任何登记方——按钮表取
 * `unit-folder.toolbarButtons`，点击与「亮不亮」都按登记里给的命令名走总线。
 *
 * 亮不亮是**拉式**的：选中单元一变（或按钮表一变）逐颗重问 state 命令，回什么画什么
 * ——数据永远现算，不存不推，没有陈旧问题；没选中单元一律灰（跟 VSCode 那颗同款）。
 *
 * 点击参数带 `from`（树格的实例 id）：登记方要开窗格就递给外壳，新窗格落在单元树旁边。
 */

/** 登记方给的图标裸名 → 图标。白名单，跟外壳标签那张 ICONS 同一个判据：加一枚添一行 */
const ICONS: Record<string, LucideIcon> = {
  'book-open': BookOpenIcon,
  globe: GlobeIcon,
  rocket: RocketIcon,
}

/** 认不出的图标名画这枚——登记方写错名不该让按钮空一块 */
const FALLBACK_ICON = CircleDotIcon

function iconFor(name: string): LucideIcon {
  return ICONS[name] ?? FALLBACK_ICON
}

/** 一颗按钮在 states 表上的键：条目 + 按钮 id，同一个包挂两条条目也撞不着 */
const keyOf = (b: RegisteredToolbarButton): string => `${b.entryId}:${b.id}`

export function ToolbarButtons({ host, unitPath, from }: { host: HostBridge; unitPath: string | null; from: string }) {
  const [buttons, setButtons] = useState<RegisteredToolbarButton[]>([])
  /** 每颗按钮此刻的状态（state 命令问来的）；没问过的不在表上，按灰处理 */
  const [states, setStates] = useState<Map<string, ButtonState>>(() => new Map())
  /** 迟到的回包不该盖掉新一轮：问的时候记下问的是谁，答的时候对着当下核一遍 */
  const unitRef = useRef(unitPath)
  unitRef.current = unitPath

  const load = useCallback(() => {
    void host.call('unit-folder.toolbarButtons').then(
      (res) => {
        const reply = res as { ok?: boolean; data?: { buttons?: RegisteredToolbarButton[] } }
        if (reply.ok === true && Array.isArray(reply.data?.buttons)) setButtons(reply.data.buttons)
      },
      (err: unknown) => console.warn(`[gwb-unit-folder] unit-folder.toolbarButtons 调不通：${String(err)}`),
    )
  }, [host])

  // 挂载取一次；登记表一变（件挂 / 卸 / 顶掉）node 半推一声，重取
  useEffect(() => {
    load()
  }, [load])
  useEffect(() => {
    const off = window.gwb.on((payload) => {
      if (isToolbarNudge(payload)) load()
    })
    return off
  }, [load])

  /** 问一颗按钮「现在亮不亮」。没选中单元不问——问了也没上下文，按钮按灰处理 */
  const query = useCallback(
    (b: RegisteredToolbarButton) => {
      if (b.state === undefined || unitPath === null) return
      const askedFor = unitPath
      void host.call(b.state, { unitPath, ...(b.args ?? {}) }).then(
        (res) => {
          if (unitRef.current !== askedFor) return
          const reply = res as { ok?: boolean; data?: unknown }
          setStates((prev) => {
            const next = new Map(prev)
            next.set(keyOf(b), reply.ok === true ? parseButtonState(reply.data) : { enabled: false, items: [] })
            return next
          })
        },
        (err: unknown) => console.warn(`[gwb-unit-folder] 工具条按钮 ${b.id} 的状态问不来：${String(err)}`),
      )
    },
    [host, unitPath],
  )

  // 选中一变、按钮表一变，都重问一轮
  useEffect(() => {
    for (const b of buttons) query(b)
  }, [buttons, query])

  const fire = useCallback(
    (b: RegisteredToolbarButton, item?: string): void => {
      void host.call(b.command, clickArgsOf(b, { unitPath, item, from }))
    },
    [host, unitPath, from],
  )

  if (buttons.length === 0) return null

  return (
    <>
      {buttons.map((b) => {
        const st = states.get(keyOf(b))
        const enabled = b.state === undefined ? true : unitPath !== null && st?.enabled === true
        const items = st?.items ?? []
        const Icon = iconFor(b.icon)
        // 两项起是「挑一个」的按钮：弹菜单，菜单打开时重问一轮、摆的是新鲜的。
        // 菜单触发不套 Tooltip——TooltipTrigger 与 DropdownMenuTrigger 两层 asChild
        // 会互相覆盖事件（VSCode 那颗同款，见树格工具条）
        if (b.state !== undefined && items.length >= 2) {
          return (
            <DropdownMenu key={keyOf(b)} onOpenChange={(open) => { if (open) query(b) }}>
              <DropdownMenuTrigger asChild disabled={!enabled}>
                <Button size="icon" className="unitfolder:size-7" variant="ghost">
                  <Icon className="unitfolder:size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="unitfolder:max-h-72 unitfolder:overflow-y-auto">
                {items.map((it) => (
                  <DropdownMenuItem key={it.id} onClick={() => fire(b, it.id)}>
                    {it.label}
                    {it.detail !== undefined && (
                      <span className="unitfolder:text-muted-foreground unitfolder:ml-auto unitfolder:font-mono unitfolder:text-xs">{it.detail}</span>
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )
        }
        return (
          <IconButton
            key={keyOf(b)}
            label={b.label}
            icon={<Icon className="unitfolder:size-4" />}
            disabled={!enabled}
            onClick={() => {
              const only = items.length === 1 ? items[0] : undefined
              fire(b, only?.id)
            }}
          />
        )
      })}
    </>
  )
}
