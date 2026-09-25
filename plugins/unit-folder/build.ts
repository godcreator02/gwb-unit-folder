import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

/** 浏览器侧用 esbuild 打成一个文件；node 侧由 tsc 逐个文件输出（build 脚本里紧接着的那一步），类型声明随它一起出 */
const here = path.dirname(fileURLToPath(import.meta.url))

/**
 * 浏览器侧外置名单只从提供方读：react 的四个包名由内核包提供，写死在它页面入口 dist/index.html 的 importmap 里，
 * 构建时从装好的内核包里读（peer 写了它，pnpm 装在本包的 node_modules 里）。外置了 importmap 里没有的名字，
 * 运行时就是「Failed to resolve module specifier」；radix、cva 这些不在 importmap 里的依赖一律打包进来
 */
function importmapNamesOfKernel(): string[] {
  const manifestPath = fileURLToPath(import.meta.resolve('@godcreator/gwb-kernel-desktop/package.json'))
  const pageEntry = path.join(path.dirname(manifestPath), 'dist', 'index.html')
  const importmapScript = /<script type="importmap">([\s\S]*?)<\/script>/.exec(fs.readFileSync(pageEntry, 'utf8'))
  if (importmapScript === null) {
    throw new Error(`${pageEntry} 里没有 <script type="importmap">：外置名单只从内核包页面入口的这段 importmap 读，读不到就不构建`)
  }
  const importmap: unknown = JSON.parse(importmapScript[1]!)
  const imports = isRecord(importmap) ? importmap['imports'] : undefined
  if (!isRecord(imports)) throw new Error(`${pageEntry} 的 importmap 里没有 imports`)
  return Object.keys(imports)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// 上一次构建留下的文件会随 files 白名单一起发出去，先清空
fs.rmSync(path.join(here, 'dist'), { recursive: true, force: true })

await build({
  entryPoints: ['src/client/index.tsx'],
  outfile: 'dist/client.js',
  external: importmapNamesOfKernel(),
  // shadcn 添加的组件写的是 @/… 别名，跟 components.json 与两份 tsconfig 的 paths 是同一条约定（都指 src/client）
  alias: { '@': path.join(here, 'src', 'client') },
  absWorkingDir: here,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  bundle: true,
  minify: false,
  legalComments: 'none',
  jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'warning',
})

console.log('[gwb-unit-folder] dist/client.js ← src/client/index.tsx')
