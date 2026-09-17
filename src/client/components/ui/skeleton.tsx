import { cn } from "cn"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("unitfolder:animate-pulse unitfolder:rounded-md unitfolder:bg-accent", className)}
      {...props}
    />
  )
}

export { Skeleton }
