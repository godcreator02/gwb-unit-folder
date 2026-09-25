import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * 产物检查。这个插件的产物分 node 侧与浏览器侧，两侧的规矩不一样：
 *
 * - **node 侧**（`dist/index.js` 等，tsc 编出的）：相对 import 带扩展名、包名 import 只许下面列出的那些
 * - **浏览器侧**（`dist/client.js`，esbuild 打包的）：包名 import **只许**留下 react 的四个——它们由
 *   页面 importmap 解析到内核包提供的 react。多留一个就是运行时一句
 *   `Failed to resolve module specifier`，而那要打开窗格才看得见
 *
 * 缺产物时整组跳过——门禁不依赖 build。
 */

const distDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist')
const built = fs.existsSync(distDir)

/** 页面 importmap 提供的那四个（内核包页面入口里写死的名字，build.ts 构建时从那里读） */
const SHARED = new Set(['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client'])

const CLIENT = 'client.js'

function read(file: string): string {
  return fs.readFileSync(path.join(distDir, file), 'utf8')
}

function specsIn(text: string, pattern: RegExp): string[] {
  return [...text.matchAll(pattern)].map((m) => m[1]!)
}

/** 锚在行首：产物里顶层 import 都顶格写，字符串字面量里那种总带着缩进 */
const RELATIVE = /^import\s+(?:[^'"]*from\s*)?['"](\.[^'"]*)['"]/gm
const BARE = /^import\s+(?:[^'"]*from\s*)?['"]([^'".][^'"]*)['"]/gm

const CSS_COMMENT = /\/\*[\s\S]*?\*\//g
const PRELUDE = /(?:^|[{};])([^{};]*)\{/g
const CLASS_SELECTOR = /\.(?:\\.|[A-Za-z0-9_-])+/g
/** `.dark` 是页面级的亮暗标志，只以祖先身份出现在 `unitfolder:dark:*` 编出的选择器里 */
const DARK_FLAG = new Set(['.dark'])

function classSelectors(css: string): string[] {
  const found = new Set<string>()
  for (const rule of css.replaceAll(CSS_COMMENT, '').matchAll(PRELUDE)) {
    const prelude = rule[1]!.trim()
    if (prelude.startsWith('@')) continue
    for (const cls of prelude.matchAll(CLASS_SELECTOR)) found.add(cls[0])
  }
  return [...found]
}

describe.skipIf(!built)('产物', () => {
  const all = built ? fs.readdirSync(distDir).filter((f) => f.endsWith('.js')) : []
  // `.d.ts` 那份是消费方 `import type {} from '@godcreator/gwb-unit-folder'` 拿到的类型声明，
  // 跟 index.js 一起查；不是 `.js` 所以不在 nodeHalf 里
  const nodeHalf = all.filter((f) => f !== CLIENT)

  it('两侧都有产物可查', () => {
    expect(nodeHalf.length).toBeGreaterThan(0)
    expect(all).toContain(CLIENT)
  })

  it('node 侧：相对 import 一律带扩展名', () => {
    const bad: string[] = []
    for (const file of nodeHalf) {
      for (const spec of specsIn(read(file), RELATIVE)) {
        if (!spec.endsWith('.js')) bad.push(`${file}: ${spec}`)
      }
    }
    expect(bad).toEqual([])
  })

  it('node 侧：包名 import 只许 cordis 与内核包——Service 基类必须是宿主那一份；其余只 import 类型的在编译后整句消失', () => {
    const allowed = new Set(['cordis', '@godcreator/gwb-kernel-desktop'])
    const bare: string[] = []
    for (const file of nodeHalf) {
      for (const spec of specsIn(read(file), BARE)) {
        if (!spec.startsWith('node:') && !allowed.has(spec)) bare.push(`${file}: ${spec}`)
      }
    }
    expect(bare).toEqual([])
  })

  it('node 侧：十条命令一个不少——命令名是命令总线上的公共接口，改名就是破坏约定', () => {
    const host = read('index.js')
    for (const command of [
      'unit-folder.create',
      'unit-folder.list',
      'unit-folder.listDir',
      'unit-folder.readFile',
      'unit-folder.open',
      'unit-folder.code',
      'unit-folder.select',
      'unit-folder.current',
      'unit-folder.pin',
      'unit-folder.unpin',
    ]) {
      expect(host).toContain(`'${command}'`)
    }
    // 原文窗格不跟随选中：存选中状态的命令已经删了，谁把它加回来谁就改变了约定
    expect(host).not.toContain('unit-folder.selection.')
    // 置顶是树上点出来的、存在 data 里；那项设置一旦回来（define 的 key 字面量）就是第二份真相。
    // 认带引号的字面量：注释里提它不算
    expect(host).not.toContain("'pinned-unit'")
  })

  it('node 侧：服务名与事件名在产物里——别人 inject 的是 gwbUnitFolder，听的是 unit-folder/selection', () => {
    const host = read('index.js')
    expect(host).toContain("'gwbUnitFolder'")
    expect(host).toContain("'unit-folder/selection'")
    const types = read('index.d.ts')
    expect(types).toContain('gwbUnitFolder: GwbUnitFolderApi')
    expect(types).toContain("'unit-folder/selection'(selection: UnitSelection | undefined): void")
  })

  it('浏览器侧：包名 import 只许 react 的四个', () => {
    const leaked = specsIn(read(CLIENT), BARE).filter((s) => !SHARED.has(s))
    expect(leaked).toEqual([])
  })

  it('style.css 里的类选择器一律 .unitfolder\\: 开头——样式隔离靠的就是前缀本身', () => {
    const bad = classSelectors(read('style.css'))
      .filter((s) => !s.startsWith('.unitfolder\\:') && !DARK_FLAG.has(s))
      .sort()
    expect(bad).toEqual([])
  })

  it('style.css 里没有 data-gwb-plugin——样式隔离不依赖任何祖先元素，布局文件里存的包名对不对都不影响', () => {
    expect(read('style.css')).not.toContain('data-gwb-plugin')
  })

  it('选中高亮进了样式表，而且带前缀——它是 styles.css 里的 @utility', () => {
    expect(read('style.css')).toContain('.unitfolder\\:urow-active')
  })

  it('两行 purpose 的 line-clamp-2 进了样式表', () => {
    expect(read('style.css')).toContain('.unitfolder\\:line-clamp-2')
  })

  it('radix 打包进了 client.js——外置成包名 import 就是运行时一句 Failed to resolve', () => {
    // Tooltip 走 radix，认它编译后产物里的字面量
    expect(read(CLIENT)).toContain('tooltip')
  })
})

describe('前缀三处对得上', () => {
  const root = path.resolve(distDir, '..')

  it('Tailwind 前缀是 unitfolder（不是 unit-folder：v4 的 prefix 只收 a-z）：styles.css、components.json、源码', () => {
    expect(fs.readFileSync(path.join(root, 'src', 'client', 'styles.css'), 'utf8')).toContain('prefix(unitfolder)')
    const components = JSON.parse(fs.readFileSync(path.join(root, 'components.json'), 'utf8')) as { tailwind?: { prefix?: string } }
    expect(components.tailwind?.prefix).toBe('unitfolder')
    expect(fs.readFileSync(path.join(root, 'src', 'client', 'index.tsx'), 'utf8')).toContain('unitfolder:')
  })
})
