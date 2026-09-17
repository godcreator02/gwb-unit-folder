import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { compile } from '@tailwindcss/node'
import { describe, expect, it } from 'vitest'

/**
 * **忘加前缀的守卫**（照件仓 hello 的那份抄，前缀换成 unitfolder）。
 *
 * 围栏是「类名自带 `unitfolder:` 前缀」，代价是**漏加前缀完全静默**：`flex` 写成这样，Tailwind
 * 在带前缀的编译下一个字节都不出，页面上就是那一处没样式——不报错、不告警、构建照样绿。
 *
 * 判法：把 `src/client` 下所有 tsx 里的字符串字面量抽出来，按空白切成 token；对每个
 * **不以 `unitfolder:` 开头**的 token，拿件自己那份 `styles.css`（**去掉 `prefix(unitfolder)`**）
 * 当输入，问 Tailwind「这个 token 编得出规则吗」。编得出来的，就是本该带前缀而没带的类。
 */

const here = path.dirname(fileURLToPath(import.meta.url))
const clientDir = path.resolve(here, '../src/client')

const PREFIX = 'unitfolder:'

/** 模板串里的插值段——静态段之外的部分，不是字面量文本 */
const INTERPOLATION = /\$\{[^{}]*\}/g

function tsxFiles(dir: string): string[] {
  const out: string[] = []
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) out.push(...tsxFiles(full))
    else if (e.name.endsWith('.tsx')) out.push(full)
  }
  return out
}

/**
 * 一份源码里所有字符串字面量的**内容**（引号剥掉、模板串的插值段挖掉）。
 * 必须认得注释——头注里全是反引号代码段，正则捞引号会把注释里的工具类名当成漏加前缀的类。
 */
function literals(source: string): string[] {
  const out: string[] = []
  let i = 0
  while (i < source.length) {
    const c = source[i]!
    if (c === '/' && source[i + 1] === '/') {
      while (i < source.length && source[i] !== '\n') i++
    } else if (c === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2)
      i = end === -1 ? source.length : end + 2
    } else if (c === "'" || c === '"' || c === '`') {
      const quote = c
      let text = ''
      i++
      while (i < source.length && source[i] !== quote) {
        if (source[i] === '\\') text += source[i++] ?? ''
        text += source[i++] ?? ''
      }
      i++
      out.push(quote === '`' ? text.replaceAll(INTERPOLATION, ' ') : text)
    } else {
      i++
    }
  }
  return out
}

describe('忘加前缀的守卫', () => {
  const files = tsxFiles(clientDir)

  it('src/client 下确实有 tsx——扫空了的话这条守卫等于没跑', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it(`字符串字面量里没有漏掉 ${PREFIX} 前缀的类名`, async () => {
    const input = fs.readFileSync(path.join(clientDir, 'styles.css'), 'utf8').replace(' prefix(unitfolder)', '')
    expect(input.replaceAll(/\/\*[\s\S]*?\*\//g, '')).not.toContain('prefix(')

    const compiler = await compile(input, { base: clientDir, onDependency: () => {} })

    const tokens = new Set<string>()
    for (const file of files) {
      for (const literal of literals(fs.readFileSync(file, 'utf8'))) {
        for (const token of literal.split(/\s+/)) {
          if (token === '' || token.startsWith(PREFIX)) continue
          tokens.add(token)
        }
      }
    }

    // build 是增量的：逐个喂进去看这一步有没有把产物撑大——撑大了才说明这个 token 自己编出了东西
    const missing: string[] = []
    let previous = compiler.build([])
    for (const token of tokens) {
      const next = compiler.build([token])
      if (next === previous) continue
      missing.push(token)
      previous = next
    }
    expect(missing.sort()).toEqual([])
  })
})
