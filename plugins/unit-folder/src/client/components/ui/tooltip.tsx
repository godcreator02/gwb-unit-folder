"use client"

import * as React from "react"
import { cn } from "cn"
import { Tooltip as TooltipPrimitive } from "radix-ui"

function TooltipProvider({
  delayDuration = 0,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delayDuration={delayDuration}
      {...props}
    />
  )
}

function Tooltip({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />
}

function TooltipTrigger({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />
}

function TooltipContent({
  className,
  sideOffset = 0,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        className={cn(
          "unitfolder:z-50 unitfolder:w-fit unitfolder:origin-(--radix-tooltip-content-transform-origin) unitfolder:animate-in unitfolder:rounded-md unitfolder:bg-foreground unitfolder:px-3 unitfolder:py-1.5 unitfolder:text-xs unitfolder:[text-wrap:balance] unitfolder:text-background unitfolder:fade-in-0 unitfolder:zoom-in-95 unitfolder:data-[side=bottom]:slide-in-from-top-2 unitfolder:data-[side=left]:slide-in-from-right-2 unitfolder:data-[side=right]:slide-in-from-left-2 unitfolder:data-[side=top]:slide-in-from-bottom-2 unitfolder:data-[state=closed]:animate-out unitfolder:data-[state=closed]:fade-out-0 unitfolder:data-[state=closed]:zoom-out-95",
          className
        )}
        {...props}
      >
        {children}
        <TooltipPrimitive.Arrow className="unitfolder:z-50 unitfolder:size-2.5 unitfolder:translate-y-[calc(-50%_-_2px)] unitfolder:rotate-45 unitfolder:rounded-[2px] unitfolder:bg-foreground unitfolder:fill-foreground" />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  )
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
