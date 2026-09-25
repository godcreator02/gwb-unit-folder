import * as React from "react"
import { cn } from "cn"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "unitfolder:h-9 unitfolder:w-full unitfolder:min-w-0 unitfolder:rounded-md unitfolder:border unitfolder:border-input unitfolder:bg-transparent unitfolder:px-3 unitfolder:py-1 unitfolder:text-base unitfolder:shadow-xs unitfolder:transition-[color,box-shadow] unitfolder:outline-none unitfolder:selection:bg-primary unitfolder:selection:text-primary-foreground unitfolder:file:inline-flex unitfolder:file:h-7 unitfolder:file:border-0 unitfolder:file:bg-transparent unitfolder:file:text-sm unitfolder:file:font-medium unitfolder:file:text-foreground unitfolder:placeholder:text-muted-foreground unitfolder:disabled:pointer-events-none unitfolder:disabled:cursor-not-allowed unitfolder:disabled:opacity-50 unitfolder:md:text-sm unitfolder:dark:bg-input/30",
        "unitfolder:focus-visible:border-ring unitfolder:focus-visible:ring-[3px] unitfolder:focus-visible:ring-ring/50",
        "unitfolder:aria-invalid:border-destructive unitfolder:aria-invalid:ring-destructive/20 unitfolder:dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Input }
