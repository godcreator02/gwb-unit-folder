import { useCallback, useEffect, useRef, useState } from 'react'
import { BookOpenIcon, CircleDotIcon, GlobeIcon, RocketIcon, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { IconButton } from '@/components/ui/icon-button'
import { clickArgsOf, isToolbarNudge, parseButtonState, type ButtonState, type RegisteredToolbarButton } from '../toolbar.js'
import type { HostBridge } from './types.js'

/**
 * 工具条上别的插件经 `ctx.gwbUnitFolder.registerToolbarButton` 登记进来的按钮，画在本插件自己那几个按钮后面。
 * 按钮表取 `unit-folder.toolbarButtons`；可不可用在选中单元或按钮表变化时逐个重新询问 state 命令，
 * 没选中单元一律不可用。点击参数带 `from`（单元树窗格的实例 id）
 */

/** 登记方给的图标名 → 图标。只认这张表里的名字，加一个图标就加一行 */
const ICONS: Record<string, LucideIcon> = {
  'book-open': BookOpenIcon,
  globe: GlobeIcon,
  rocket: RocketIcon,
}

/** 认不出的图标名画这个 */
const DEFAULT_ICON = CircleDotIcon

function iconFor(name: string): LucideIcon {
  return ICONS[name] ?? DEFAULT_ICON
}

/** 一个按钮在状态表上的键：条目 + 按钮 id，同一个包的两条条目也不会重复 */
const keyOf = (button: RegisteredToolbarButton): string => `${button.entryId}:${button.id}`

export function ToolbarButtons({ host, unitPath, from }: { host: HostBridge; unitPath: string | null; from: string }) {
  const [buttons, setButtons] = useState<RegisteredToolbarButton[]>([])
  /** 每个按钮此刻的状态（state 命令问来的）；没问过的不在表上，按不可用处理 */
  const [statesByButton, setStatesByButton] = useState<Map<string, ButtonState>>(() => new Map())
  /** 回执返回时核对问的还是不是当下选中的单元，迟到的回执不覆盖新一轮 */
  const currentUnitRef = useRef(unitPath)
  currentUnitRef.current = unitPath

  const loadButtons = useCallback(() => {
    void host.call('unit-folder.toolbarButtons').then(
      (res) => {
        const reply = res as { ok?: boolean; data?: { buttons?: RegisteredToolbarButton[] } }
        if (reply.ok === true && Array.isArray(reply.data?.buttons)) setButtons(reply.data.buttons)
      },
      (err: unknown) => console.warn(`[gwb-unit-folder] unit-folder.toolbarButtons 调不通：${String(err)}`),
    )
  }, [host])

  // 挂载时取一次；登记表一变 node 侧推一条内核事件，收到就重取
  useEffect(() => {
    loadButtons()
  }, [loadButtons])
  useEffect(() => {
    const stopListening = window.gwb.on((payload) => {
      if (isToolbarNudge(payload)) loadButtons()
    })
    return stopListening
  }, [loadButtons])

  /** 问一个按钮现在可不可用。没选中单元不问，按不可用处理 */
  const askState = useCallback(
    (button: RegisteredToolbarButton) => {
      if (button.state === undefined || unitPath === null) return
      const askedForUnit = unitPath
      void host.call(button.state, { unitPath, ...(button.args ?? {}) }).then(
        (res) => {
          if (currentUnitRef.current !== askedForUnit) return
          const reply = res as { ok?: boolean; data?: unknown }
          setStatesByButton((prev) => {
            const next = new Map(prev)
            next.set(keyOf(button), reply.ok === true ? parseButtonState(reply.data) : { enabled: false, items: [] })
            return next
          })
        },
        (err: unknown) => console.warn(`[gwb-unit-folder] 工具条按钮 ${button.id} 的状态问不来：${String(err)}`),
      )
    },
    [host, unitPath],
  )

  // 选中单元变了、按钮表变了，都重新问一轮
  useEffect(() => {
    for (const button of buttons) askState(button)
  }, [buttons, askState])

  const runButtonCommand = useCallback(
    (button: RegisteredToolbarButton, item?: string): void => {
      void host.call(button.command, clickArgsOf(button, { unitPath, item, from }))
    },
    [host, unitPath, from],
  )

  if (buttons.length === 0) return null

  return (
    <>
      {buttons.map((button) => {
        const state = statesByButton.get(keyOf(button))
        const enabled = button.state === undefined ? true : unitPath !== null && state?.enabled === true
        const items = state?.items ?? []
        const Icon = iconFor(button.icon)
        // 两项起是挑一个的按钮：弹菜单，菜单打开时重新问一次。菜单触发器不套 Tooltip：
        // TooltipTrigger 与 DropdownMenuTrigger 两层 asChild 会互相覆盖事件，菜单点不开
        if (button.state !== undefined && items.length >= 2) {
          return (
            <DropdownMenu key={keyOf(button)} onOpenChange={(open) => { if (open) askState(button) }}>
              <DropdownMenuTrigger asChild disabled={!enabled}>
                <Button size="icon" className="unitfolder:size-7" variant="ghost">
                  <Icon className="unitfolder:size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="unitfolder:max-h-72 unitfolder:overflow-y-auto">
                {items.map((item) => (
                  <DropdownMenuItem key={item.id} onClick={() => runButtonCommand(button, item.id)}>
                    {item.label}
                    {item.detail !== undefined && (
                      <span className="unitfolder:text-muted-foreground unitfolder:ml-auto unitfolder:font-mono unitfolder:text-xs">{item.detail}</span>
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )
        }
        return (
          <IconButton
            key={keyOf(button)}
            label={button.label}
            icon={<Icon className="unitfolder:size-4" />}
            disabled={!enabled}
            onClick={() => {
              const onlyItem = items.length === 1 ? items[0] : undefined
              runButtonCommand(button, onlyItem?.id)
            }}
          />
        )
      })}
    </>
  )
}
