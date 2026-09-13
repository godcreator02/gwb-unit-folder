import { createContext, useContext } from 'react'

/**
 * 门户组件（Tooltip 的弹层那类）该挂到哪个元素下面。
 *
 * **默认挂 `body` 是不行的**：件的样式表整张 scope 在 `[data-gwb-plugin="<包名>"]` 之下，
 * 弹层挂出去就一条规则都匹配不上——**症状是「弹层是一片没样式的白板」**，不报错。
 *
 * 所以窗格在顶层把 `mountPane` 给的那个容器供出来（它身上正好带着 `data-gwb-plugin`），
 * 组件自己去读。**做成 context 而不是让调用方逐个传**：传漏了同样是静默白板，
 * 而这种忘了传的错没有任何现象。
 */
export const PortalContainer = createContext<HTMLElement | null>(null)

export function usePortalContainer(): HTMLElement | undefined {
  return useContext(PortalContainer) ?? undefined
}
