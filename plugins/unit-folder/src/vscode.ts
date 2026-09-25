import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

/**
 * 定位 VSCode 的真身 `Code.exe`。
 *
 * 为什么非要真 exe：PATH 上的 `code` 是个 `.cmd`——Node 修 CVE-2024-27980 之后，
 * 不开 shell 直接 spawn `.cmd` 会抛 EINVAL；而开了 shell，路径参数就成了**命令
 * 文本**的一部分，目录名里的引号 / 百分号（都是合法文件名字符）就进了命令解释
 * 器。唯一两头都稳的走法是找到 `.cmd` 背后的真 exe，用独立 argv、不开 shell 地
 * 启动——那时路径只是路径。找不到就回 null，**不降级回 shell 拼接**：降级路径
 * 就是留着漏洞的路径，宁可明说「打不开」。
 */

/** 一条 `where` 候选能推出哪些 `Code.exe` 候选位（不碰盘，纯推导，好测） */
export function codeExeCandidates(cmdPath: string): string[] {
  // 标准布局：`<install>\bin\code.cmd` 与 `<install>\Code.exe` 隔一级；
  // 兜底再试 `.cmd` 同目录——布局挪了也不至于直接躺平
  const binDir = path.dirname(cmdPath)
  return [path.join(path.dirname(binDir), 'Code.exe'), path.join(binDir, 'Code.exe')]
}

/** `where.exe` 也是真 exe（System32 里），用它找人不需要 shell */
export function locateCodeExe(): string | null {
  const where = spawnSync('where.exe', ['code'], { encoding: 'utf8', windowsHide: true })
  if (where.error !== undefined || where.status !== 0 || typeof where.stdout !== 'string') return null
  for (const line of where.stdout.split(/\r?\n/)) {
    const cmdPath = line.trim()
    if (cmdPath === '') continue
    for (const candidate of codeExeCandidates(cmdPath)) {
      if (fs.existsSync(candidate)) return candidate
    }
  }
  return null
}
