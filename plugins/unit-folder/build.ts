import { browserImports } from '@godcreator/gwb-shell/browser-imports'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

/** 浏览器侧用 esbuild 打成一个文件；node 侧由 tsc 逐个文件输出（build 脚本里紧接着的那一步），类型声明随它一起出 */
const here = path.dirname(fileURLToPath(import.meta.url))

// 浏览器模块名与 shell 运行时登记复用同一个代码出口。


// 上一次构建留下的文件会随 files 白名单一起发出去，先清空
fs.rmSync(path.join(here, 'dist'), { recursive: true, force: true })

await build({
  entryPoints: ['src/client/index.tsx'],
  outfile: 'dist/client.js',
  external: Object.keys(browserImports()),
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
