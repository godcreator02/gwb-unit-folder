/**
 * 组件名册里给页面渲染用的那一半：docfirst.config.mjs 声明每个组件在机读版里变成什么文字，这里给出 React 组件表。
 * 表的类型由 registry.ts 的名单限定：少一个编译不过，多一个也编译不过。
 * 两边的组件名是否一致，由 scripts/verify-roster.mjs 核对。
 * 先放 fumadocs 的默认组件表，再把 pre 换成 @godcreator/docfirst-workflow/fumadocs/pre 里会画状态点的 DocfirstPre。
 */
import defaultMdxComponents from 'fumadocs-ui/mdx'
import { File, Files, Folder } from 'fumadocs-ui/components/files'
import type { MDXComponents } from 'mdx/types'
import type { ReactNode } from 'react'
import { DocfirstPre } from '@godcreator/docfirst-workflow/fumadocs/pre'
import type { ComponentName } from './registry'
import { UnitFolderSeams } from './unit-folder-seams'

type Loose = MDXComponents[string]

export function Note({ children }: { children?: ReactNode }) {
  return <div className="note">{children}</div>
}

const table: Record<ComponentName, Loose> = {
  Note: Note as Loose,
  Files: Files as Loose,
  Folder: Folder as Loose,
  File: File as Loose,
  UnitFolderSeams: UnitFolderSeams as Loose,
}

export function getMDXComponents(components: MDXComponents = {}): MDXComponents {
  return {
    ...defaultMdxComponents,
    ...components,
    ...table,
    pre: DocfirstPre as unknown as NonNullable<MDXComponents['pre']>,
  }
}
