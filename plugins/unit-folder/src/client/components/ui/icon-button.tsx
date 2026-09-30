import type * as React from 'react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { usePortalContainer } from '@/portal-container'

/** 一个图标按钮加悬停说明，由官方的 Button 与 Tooltip 组成；单元树工具条上的按钮与登记进来的扩展按钮共用 */
export function IconButton({
  label,
  icon,
  onClick,
  disabled,
}: {
  label: string
  icon: React.ReactNode
  onClick(): void
  disabled?: boolean
}) {
  const portalContainer = usePortalContainer()
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button size="icon-sm" variant="ghost" disabled={disabled} onClick={onClick}>
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent container={portalContainer}>{label}</TooltipContent>
    </Tooltip>
  )
}
