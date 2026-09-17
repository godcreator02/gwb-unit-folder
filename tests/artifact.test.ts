import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * 产物守卫。这个件有两半，两半的规矩不一样：
 *
 * - **node 半**（`dist/index.js` 等，tsc 出的）：相对 import 带扩展名、不许有裸名
 * - **浏览器半**（`dist/client.js`，esbuild 打的）：**只许**那四个共享名漏出去——它们由
 *   页面 importmap 解析到共享包。多漏一个就是运行期一句
 *   `Failed to resolve module specifier`，而那要开到窗格才看得见
 *
 * 缺产物时整组跳过——门禁不依赖 build。
 */

const distDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist')
const built = fs.existsSync(distDir)

/** 页面 importmap 提供的那四个，跟 build.ts 的 SHARED 一一对应 */
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
  // `.d.ts` 那份是消费方 `import type {} from '@godcreator/gwb-unit-folder'` 拿到的契约面，
  // 跟 index.js 一起查；不是 `.js` 所以不在 nodeHalf 里
  const nodeHalf = all.filter((f) => f !== CLIENT)

  it('两半都有产物可查', () => {
    expect(nodeHalf.length).toBeGreaterThan(0)
    expect(all).toContain(CLIENT)
  })

  it('node 半：相对 import 一律带扩展名', () => {
    const bad: string[] = []
    for (const file of nodeHalf) {
      for (const spec of specsIn(read(file), RELATIVE)) {
        if (!spec.endsWith('.js')) bad.push(`${file}: ${spec}`)
      }
    }
    expect(bad).toEqual([])
  })

  it('node 半：裸名只许 cordis 与词汇表包——Service 基类必须是宿主那一份；其余类型面 import 全在编译期蒸发了', () => {
    const allowed = new Set(['cordis', '@godcreator/gwb-plugin-api'])
    const bare: string[] = []
    for (const file of nodeHalf) {
      for (const spec of specsIn(read(file), BARE)) {
        if (!spec.startsWith('node:') && !allowed.has(spec)) bare.push(`${file}: ${spec}`)
      }
    }
    expect(bare).toEqual([])
  })

  it('node 半：九条命令一个不少——命令名是总线上的公共面，改名就是破约', () => {
    const host = read('index.js')
    for (const command of [
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
    // 原文格不跟随状态：接力棒的落盘口已经拆了，谁把它加回来谁就改变了约定
    expect(host).not.toContain('unit-folder.selection.')
    // 0.3 起置顶是树上点出来的、落 data；那项设置一旦回来（define 的 key 字面量）就是第二份真相。
    // 认带引号的字面量：注释里提它是讲历史，不算
    expect(host).not.toContain("'pinned-unit'")
  })

  it('node 半：服务面与事件名在产物里——别人 inject 的是 gwbUnitFolder，听的是 unit-folder/selection', () => {
    const host = read('index.js')
    expect(host).toContain("'gwbUnitFolder'")
    expect(host).toContain("'unit-folder/selection'")
    const types = read('index.d.ts')
    expect(types).toContain('gwbUnitFolder: GwbUnitFolderApi')
    expect(types).toContain("'unit-folder/selection'(selection: UnitSelection | undefined): void")
  })

  it('浏览器半：裸名只许那四个共享的', () => {
    const leaked = specsIn(read(CLIENT), BARE).filter((s) => !SHARED.has(s))
    expect(leaked).toEqual([])
  })

  it('style.css 里的类选择器一律 .unitfolder\\: 开头——围栏就是前缀本身', () => {
    const bad = classSelectors(read('style.css'))
      .filter((s) => !s.startsWith('.unitfolder\\:') && !DARK_FLAG.has(s))
      .sort()
    expect(bad).toEqual([])
  })

  it('style.css 里没有 data-gwb-plugin——围栏不依赖任何祖先关系，存档里那格的包名对不对都不影响', () => {
    expect(read('style.css')).not.toContain('data-gwb-plugin')
  })

  it('图标块三态与选中高亮带进了表，而且带前缀——它们是 styles.css 里的 @utility', () => {
    const css = read('style.css')
    for (const cls of ['uico-live', 'uico-dead', 'uico-unknown', 'urow-active']) {
      expect(css).toContain(`.unitfolder\\:${cls}`)
    }
  })

  it('radix 打进了本束——外置成裸名就是运行期一句 Failed to resolve', () => {
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
