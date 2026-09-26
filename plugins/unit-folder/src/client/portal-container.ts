import { createContext, useContext } from 'react'

/**
 * 本窗格浮层（下拉菜单、悬停提示）的挂载点，值是外壳给的 `args.shell.portal`，由 `mountPane` 在窗格根上提供。
 * 浮层挂在 `body` 下不属于任何桌面，切桌面时不跟着隐藏，所以每个浮层的 Content 都要传它
 */
export const PortalContainerContext = createContext<HTMLElement | null>(null)

export function usePortalContainer(): HTMLElement {
  const container = useContext(PortalContainerContext)
  if (container === null) throw new Error('usePortalContainer 要在 mountPane 提供的 PortalContainerContext 里调')
  return container
}
