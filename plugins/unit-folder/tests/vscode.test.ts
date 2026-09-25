import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { codeExeCandidates, locateCodeExe } from '../src/vscode.js'

/**
 * VSCode 定位的两条判据：候选位推导是纯字符串的事，钉死布局假设；真找一趟能
 * 拿回什么不强求（机器上没装 VSCode 是合法状态），但拿回了就必须真存在。
 */

describe('codeExeCandidates：code.cmd 推导 Code.exe 的候选位', () => {
  it('标准布局——bin 的上一级', () => {
    expect(codeExeCandidates(path.join('C:', 'Program Files', 'Microsoft VS Code', 'bin', 'code.cmd'))).toEqual([
      path.join('C:', 'Program Files', 'Microsoft VS Code', 'Code.exe'),
      path.join('C:', 'Program Files', 'Microsoft VS Code', 'bin', 'Code.exe'),
    ])
  })

  it('用户级安装同样只认布局，不看装在哪', () => {
    expect(codeExeCandidates(path.join('D:', 'tools', 'vscode', 'bin', 'code.cmd'))[0]).toBe(
      path.join('D:', 'tools', 'vscode', 'Code.exe'),
    )
  })
})

describe('locateCodeExe：真找一趟', () => {
  it('回 null（没装）或真身存在——两头都成立才算这个走法可靠', () => {
    const exe = locateCodeExe()
    if (exe === null) return
    expect(exe.toLowerCase().endsWith('code.exe')).toBe(true)
    expect(fs.existsSync(exe)).toBe(true)
  })
})
