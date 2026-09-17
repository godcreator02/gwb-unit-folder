import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { Slot } from "radix-ui"

const buttonVariants = cva(
  "unitfolder:inline-flex unitfolder:shrink-0 unitfolder:items-center unitfolder:justify-center unitfolder:gap-2 unitfolder:rounded-md unitfolder:text-sm unitfolder:font-medium unitfolder:whitespace-nowrap unitfolder:transition-all unitfolder:outline-none unitfolder:focus-visible:border-ring unitfolder:focus-visible:ring-[3px] unitfolder:focus-visible:ring-ring/50 unitfolder:disabled:pointer-events-none unitfolder:disabled:opacity-50 unitfolder:aria-invalid:border-destructive unitfolder:aria-invalid:ring-destructive/20 unitfolder:dark:aria-invalid:ring-destructive/40 unitfolder:[&_svg]:pointer-events-none unitfolder:[&_svg]:shrink-0 unitfolder:[&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "unitfolder:bg-primary unitfolder:text-primary-foreground unitfolder:hover:bg-primary/90",
        destructive:
          "unitfolder:bg-destructive unitfolder:text-white unitfolder:hover:bg-destructive/90 unitfolder:focus-visible:ring-destructive/20 unitfolder:dark:bg-destructive/60 unitfolder:dark:focus-visible:ring-destructive/40",
        outline:
          "unitfolder:border unitfolder:bg-background unitfolder:shadow-xs unitfolder:hover:bg-accent unitfolder:hover:text-accent-foreground unitfolder:dark:border-input unitfolder:dark:bg-input/30 unitfolder:dark:hover:bg-input/50",
        secondary:
          "unitfolder:bg-secondary unitfolder:text-secondary-foreground unitfolder:hover:bg-secondary/80",
        ghost:
          "unitfolder:hover:bg-accent unitfolder:hover:text-accent-foreground unitfolder:dark:hover:bg-accent/50",
        link: "unitfolder:text-primary unitfolder:underline-offset-4 unitfolder:hover:underline",
      },
      size: {
        default: "unitfolder:h-9 unitfolder:px-4 unitfolder:py-2 unitfolder:has-[>svg]:px-3",
        xs: "unitfolder:h-6 unitfolder:gap-1 unitfolder:rounded-md unitfolder:px-2 unitfolder:text-xs unitfolder:has-[>svg]:px-1.5 unitfolder:[&_svg:not([class*='size-'])]:size-3",
        sm: "unitfolder:h-8 unitfolder:gap-1.5 unitfolder:rounded-md unitfolder:px-3 unitfolder:has-[>svg]:px-2.5",
        lg: "unitfolder:h-10 unitfolder:rounded-md unitfolder:px-6 unitfolder:has-[>svg]:px-4",
        icon: "unitfolder:size-9",
        "icon-xs": "unitfolder:size-6 unitfolder:rounded-md unitfolder:[&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "unitfolder:size-8",
        "icon-lg": "unitfolder:size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
