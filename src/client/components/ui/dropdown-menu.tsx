import * as React from "react"
import { cn } from "cn"
import { CheckIcon, ChevronRightIcon, CircleIcon } from "lucide-react"
import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui"

function DropdownMenu({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Root>) {
  return <DropdownMenuPrimitive.Root data-slot="dropdown-menu" {...props} />
}

function DropdownMenuPortal({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Portal>) {
  return (
    <DropdownMenuPrimitive.Portal data-slot="dropdown-menu-portal" {...props} />
  )
}

function DropdownMenuTrigger({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Trigger>) {
  return (
    <DropdownMenuPrimitive.Trigger
      data-slot="dropdown-menu-trigger"
      {...props}
    />
  )
}

function DropdownMenuContent({
  className,
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        data-slot="dropdown-menu-content"
        sideOffset={sideOffset}
        className={cn(
          "unitfolder:z-50 unitfolder:max-h-(--radix-dropdown-menu-content-available-height) unitfolder:min-w-[8rem] unitfolder:origin-(--radix-dropdown-menu-content-transform-origin) unitfolder:overflow-x-hidden unitfolder:overflow-y-auto unitfolder:rounded-md unitfolder:border unitfolder:bg-popover unitfolder:p-1 unitfolder:text-popover-foreground unitfolder:shadow-md unitfolder:data-[side=bottom]:slide-in-from-top-2 unitfolder:data-[side=left]:slide-in-from-right-2 unitfolder:data-[side=right]:slide-in-from-left-2 unitfolder:data-[side=top]:slide-in-from-bottom-2 unitfolder:data-[state=closed]:animate-out unitfolder:data-[state=closed]:fade-out-0 unitfolder:data-[state=closed]:zoom-out-95 unitfolder:data-[state=open]:animate-in unitfolder:data-[state=open]:fade-in-0 unitfolder:data-[state=open]:zoom-in-95",
          className
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  )
}

function DropdownMenuGroup({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Group>) {
  return (
    <DropdownMenuPrimitive.Group data-slot="dropdown-menu-group" {...props} />
  )
}

function DropdownMenuItem({
  className,
  inset,
  variant = "default",
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Item> & {
  inset?: boolean
  variant?: "default" | "destructive"
}) {
  return (
    <DropdownMenuPrimitive.Item
      data-slot="dropdown-menu-item"
      data-inset={inset}
      data-variant={variant}
      className={cn(
        "unitfolder:relative unitfolder:flex unitfolder:cursor-default unitfolder:items-center unitfolder:gap-2 unitfolder:rounded-sm unitfolder:px-2 unitfolder:py-1.5 unitfolder:text-sm unitfolder:outline-hidden unitfolder:select-none unitfolder:focus:bg-accent unitfolder:focus:text-accent-foreground unitfolder:data-[disabled]:pointer-events-none unitfolder:data-[disabled]:opacity-50 unitfolder:data-[inset]:pl-8 unitfolder:data-[variant=destructive]:text-destructive unitfolder:data-[variant=destructive]:focus:bg-destructive/10 unitfolder:data-[variant=destructive]:focus:text-destructive unitfolder:dark:data-[variant=destructive]:focus:bg-destructive/20 unitfolder:[&_svg]:pointer-events-none unitfolder:[&_svg]:shrink-0 unitfolder:[&_svg:not([class*='size-'])]:size-4 unitfolder:[&_svg:not([class*='text-'])]:text-muted-foreground unitfolder:data-[variant=destructive]:*:[svg]:text-destructive!",
        className
      )}
      {...props}
    />
  )
}

function DropdownMenuCheckboxItem({
  className,
  children,
  checked,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.CheckboxItem>) {
  return (
    <DropdownMenuPrimitive.CheckboxItem
      data-slot="dropdown-menu-checkbox-item"
      className={cn(
        "unitfolder:relative unitfolder:flex unitfolder:cursor-default unitfolder:items-center unitfolder:gap-2 unitfolder:rounded-sm unitfolder:py-1.5 unitfolder:pr-2 unitfolder:pl-8 unitfolder:text-sm unitfolder:outline-hidden unitfolder:select-none unitfolder:focus:bg-accent unitfolder:focus:text-accent-foreground unitfolder:data-[disabled]:pointer-events-none unitfolder:data-[disabled]:opacity-50 unitfolder:[&_svg]:pointer-events-none unitfolder:[&_svg]:shrink-0 unitfolder:[&_svg:not([class*='size-'])]:size-4",
        className
      )}
      checked={checked}
      {...props}
    >
      <span className="unitfolder:pointer-events-none unitfolder:absolute unitfolder:left-2 unitfolder:flex unitfolder:size-3.5 unitfolder:items-center unitfolder:justify-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <CheckIcon className="unitfolder:size-4" />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.CheckboxItem>
  )
}

function DropdownMenuRadioGroup({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.RadioGroup>) {
  return (
    <DropdownMenuPrimitive.RadioGroup
      data-slot="dropdown-menu-radio-group"
      {...props}
    />
  )
}

function DropdownMenuRadioItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.RadioItem>) {
  return (
    <DropdownMenuPrimitive.RadioItem
      data-slot="dropdown-menu-radio-item"
      className={cn(
        "unitfolder:relative unitfolder:flex unitfolder:cursor-default unitfolder:items-center unitfolder:gap-2 unitfolder:rounded-sm unitfolder:py-1.5 unitfolder:pr-2 unitfolder:pl-8 unitfolder:text-sm unitfolder:outline-hidden unitfolder:select-none unitfolder:focus:bg-accent unitfolder:focus:text-accent-foreground unitfolder:data-[disabled]:pointer-events-none unitfolder:data-[disabled]:opacity-50 unitfolder:[&_svg]:pointer-events-none unitfolder:[&_svg]:shrink-0 unitfolder:[&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      <span className="unitfolder:pointer-events-none unitfolder:absolute unitfolder:left-2 unitfolder:flex unitfolder:size-3.5 unitfolder:items-center unitfolder:justify-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <CircleIcon className="unitfolder:size-2 unitfolder:fill-current" />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.RadioItem>
  )
}

function DropdownMenuLabel({
  className,
  inset,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Label> & {
  inset?: boolean
}) {
  return (
    <DropdownMenuPrimitive.Label
      data-slot="dropdown-menu-label"
      data-inset={inset}
      className={cn(
        "unitfolder:px-2 unitfolder:py-1.5 unitfolder:text-sm unitfolder:font-medium unitfolder:data-[inset]:pl-8",
        className
      )}
      {...props}
    />
  )
}

function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return (
    <DropdownMenuPrimitive.Separator
      data-slot="dropdown-menu-separator"
      className={cn("unitfolder:-mx-1 unitfolder:my-1 unitfolder:h-px unitfolder:bg-border", className)}
      {...props}
    />
  )
}

function DropdownMenuShortcut({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="dropdown-menu-shortcut"
      className={cn(
        "unitfolder:ml-auto unitfolder:text-xs unitfolder:tracking-widest unitfolder:text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}

function DropdownMenuSub({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Sub>) {
  return <DropdownMenuPrimitive.Sub data-slot="dropdown-menu-sub" {...props} />
}

function DropdownMenuSubTrigger({
  className,
  inset,
  children,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.SubTrigger> & {
  inset?: boolean
}) {
  return (
    <DropdownMenuPrimitive.SubTrigger
      data-slot="dropdown-menu-sub-trigger"
      data-inset={inset}
      className={cn(
        "unitfolder:flex unitfolder:cursor-default unitfolder:items-center unitfolder:gap-2 unitfolder:rounded-sm unitfolder:px-2 unitfolder:py-1.5 unitfolder:text-sm unitfolder:outline-hidden unitfolder:select-none unitfolder:focus:bg-accent unitfolder:focus:text-accent-foreground unitfolder:data-[inset]:pl-8 unitfolder:data-[state=open]:bg-accent unitfolder:data-[state=open]:text-accent-foreground unitfolder:[&_svg]:pointer-events-none unitfolder:[&_svg]:shrink-0 unitfolder:[&_svg:not([class*='size-'])]:size-4 unitfolder:[&_svg:not([class*='text-'])]:text-muted-foreground",
        className
      )}
      {...props}
    >
      {children}
      <ChevronRightIcon className="unitfolder:ml-auto unitfolder:size-4" />
    </DropdownMenuPrimitive.SubTrigger>
  )
}

function DropdownMenuSubContent({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.SubContent>) {
  return (
    <DropdownMenuPrimitive.SubContent
      data-slot="dropdown-menu-sub-content"
      className={cn(
        "unitfolder:z-50 unitfolder:min-w-[8rem] unitfolder:origin-(--radix-dropdown-menu-content-transform-origin) unitfolder:overflow-hidden unitfolder:rounded-md unitfolder:border unitfolder:bg-popover unitfolder:p-1 unitfolder:text-popover-foreground unitfolder:shadow-lg unitfolder:data-[side=bottom]:slide-in-from-top-2 unitfolder:data-[side=left]:slide-in-from-right-2 unitfolder:data-[side=right]:slide-in-from-left-2 unitfolder:data-[side=top]:slide-in-from-bottom-2 unitfolder:data-[state=closed]:animate-out unitfolder:data-[state=closed]:fade-out-0 unitfolder:data-[state=closed]:zoom-out-95 unitfolder:data-[state=open]:animate-in unitfolder:data-[state=open]:fade-in-0 unitfolder:data-[state=open]:zoom-in-95",
        className
      )}
      {...props}
    />
  )
}

export {
  DropdownMenu,
  DropdownMenuPortal,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
}
