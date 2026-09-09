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

describe.skipIf(!built)('产物', () => {
  const all = built ? fs.readdirSync(distDir).filter((f) => f.endsWith('.js')) : []
  // `.d.ts` 那份是消费方 `import type {} from '@godcreator02/gwb-unit-folder'` 拿到的契约面，
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
    const allowed = new Set(['cordis', '@godcreator02/gwb-plugin-api'])
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

  it('样式表整张 scope 过，scope 名是完整包名', () => {
    const css = fs.readFileSync(path.join(distDir, 'style.css'), 'utf8')
    expect(css).toContain(':where([data-gwb-plugin="@godcreator02/gwb-unit-folder"])')
  })

  it('图标块三态的样式进了表——它们住在 styles.css，不在这份就说明样式线断了', () => {
    const css = fs.readFileSync(path.join(distDir, 'style.css'), 'utf8')
    expect(css).toContain('uico-live')
  })

  it('radix 打进了本束——外置成裸名就是运行期一句 Failed to resolve', () => {
    // Tooltip 走 radix，认它编译后产物里的字面量
    expect(read(CLIENT)).toContain('tooltip')
  })

  it('**弹层挂回本件容器**，不挂 body——挂出去样式一条都匹配不上', () => {
    expect(read(CLIENT)).toContain('PortalContainer')
  })
})
