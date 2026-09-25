import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

/**
 * 定位 VSCode 的可执行文件 `Code.exe`，以便用独立参数、不开 shell 启动它。
 * 找不到就回 null，不改用 shell 拼接 `code` 命令
 */

/** 一条 `where` 找到的 `code.cmd` 能推出哪些 `Code.exe` 位置：标准布局在上一级，再试同一级 */
export function codeExeCandidates(cmdPath: string): string[] {
  const binDir = path.dirname(cmdPath)
  return [path.join(path.dirname(binDir), 'Code.exe'), path.join(binDir, 'Code.exe')]
}

/** 用 `where.exe`（System32 里的可执行文件，不需要 shell）找 PATH 上的 `code`，再推出旁边的 `Code.exe` */
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
