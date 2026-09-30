/**
 * 组件名册的名单，站这一侧的正本。mdx.tsx 用它的类型要求 React 表一个不多一个不少；
 * scripts/verify-roster.mjs 拿它跟 docfirst.config.mjs 里的机读规则表逐项核对。
 *
 * 缺哪一边都直接报错：机读规则表里没有 → 生成机读版时报「名册外组件」；React 表里没有 → 站渲染时报 Expected component。
 *
 * Files / Folder / File 是 fumadocs 自己的文件树：目录树引用生成的就是它们；它们与 Note 的机读规则在
 * @godcreator/docfirst-workflow/fumadocs/roster 的 fumadocsRoster 里。
 * registry.ts 只有可擦除的类型，Node 能直接运行它。
 */
export const componentNames = ['Note', 'Files', 'Folder', 'File', 'UnitFolderSeams'] as const
export type ComponentName = (typeof componentNames)[number]
