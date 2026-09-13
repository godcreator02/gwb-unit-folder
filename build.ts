import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

/**
 * 浏览器半打包。react 系**外置**——它们由页面 importmap 解析到共享包，件之间拿同一份实例；
 * 其余依赖一律**打进本束**：radix / cva / clsx / tailwind-merge 不在 importmap 里，
 * 外置成裸名就是运行期「Failed to resolve module specifier」。
 */

const here = path.dirname(fileURLToPath(import.meta.url))

/** 这四个名字由 gwb-shared-react 提供，跟它 package.json 里的 gwb.shared 一一对应 */
const SHARED = ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client']

await build({
  entryPoints: ['src/client/index.tsx'],
  outfile: 'dist/client.js',
  external: SHARED,
  // shadcn 拉下来的组件写的是 @/… 这种别名，跟 components.json 与两份 tsconfig 的
  // paths 是同一条约定（都指 src/client）
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
