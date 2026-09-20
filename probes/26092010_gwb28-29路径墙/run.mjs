// 重放外部审查 GWB-28 / GWB-29 的复现，钉住修复后的判定（2026-09-20）。
// 跑法：node probes/26092010_gwb28-29路径墙/run.mjs   （在仓库任意位置可跑，自包含）
// 三段判定：
//   junction —— 根内 junction 指向根外：resolveInside 应拒，readFilePreview 不该被够到
//   quote    —— 引号注入串：resolveInside 的放行是**预期**（不存在路径的报错归下游），
//               防线在命令层：产物里 code 命令不再过 shell、且目标必须是存在的目录
//   vscode   —— locateCodeExe 找到真身且真身吃 CLI 开关（--version 出版本号，即 -n 通道成立）
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
// Windows 上动态 import 绝对路径必须是 file:// URL（裸的 D:\ 会被当协议名）
const fromDist = (name) => import(pathToFileURL(path.join(repoRoot, 'dist', name)).href)
const { resolveInside } = await fromDist('browse.js')
const { locateCodeExe } = await fromDist('vscode.js')

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'gwb-unitfolder-probe-'))
const results = { when: new Date().toISOString(), platform: process.platform }

// ── GWB-29：junction 逃逸 ─────────────────────────────────────────────────────
{
  const root = tmp()
  const outside = tmp()
  fs.writeFileSync(path.join(outside, 'marker.txt'), 'AUDIT_MARKER')
  const escape = path.join(root, 'leak')
  fs.symlinkSync(outside, escape, 'junction')
  const target = path.join(escape, 'marker.txt')
  const accepted = resolveInside(root, target)
  results.junction = {
    // 审查复现的原始判定是 lexicalAccepted:true + readOutsideRoot:true（修复前）
    lexicalAccepted: accepted !== null, // 修复后应为 false：词法过了、物理墙拒
    resolvedTo: accepted,
    // 双保险：即便有人绕回旧的放行，读到的也不该是根外内容
    directReadReachesOutside:
      accepted !== null && (await fromDist('browse.js')).readFilePreview(accepted).ok === true,
  }
  fs.rmSync(root, { recursive: true, force: true })
  fs.rmSync(outside, { recursive: true, force: true })
}

// ── GWB-28：引号注入串 + 产物不再过 shell ────────────────────────────────────
{
  const payload = 'x" & echo AUDIT_MARKER & rem "'
  const root = tmp()
  const requested = path.join(root, payload)
  const distSource = fs.readFileSync(path.join(repoRoot, 'dist', 'index.js'), 'utf8')
  results.quote = {
    payload: requested,
    // 路径不存在：物理墙不拦、词法在根内——放行是预期行为，错误语义归下游（「列不动/不是目录」）
    resolveAcceptedForNonexistent: resolveInside(root, requested) !== null,
    // 命令层两道证据：产物里已无 shell:true；code 的 argv 是独立数组
    distHasShellTrue: distSource.includes('shell: true'),
    distHasCodeArgv: distSource.includes("['-n', target]") || distSource.includes('["-n", target]'),
  }
  fs.rmSync(root, { recursive: true, force: true })
}

// ── GWB-28：Code.exe 真身与 CLI 通道 ─────────────────────────────────────────
{
  const exe = locateCodeExe()
  const version = exe === null ? null : spawnSync(exe, ['--version'], { encoding: 'utf8', windowsHide: true })
  results.vscode = {
    codeExe: exe,
    exists: exe === null ? null : fs.existsSync(exe),
    // GUI 真身吃 CLI 开关：--version 退出 0 即「开关被接受」（未知开关会被拒）。
    // 版本号是否打出来受环境干扰——本机 ~/.vscode/argv.json 语法坏了，直启只打
    // WARNING 并 fallback（code.cmd 对照正常打出 1.138.0，通道无恙），所以判 exit 码
    versionExitOk: version === null ? null : version.status === 0,
    versionStdout: version === null ? null : (version.stdout ?? '').trim(),
    note: 'argv.json 损坏是本机环境问题，非本改动引入；GUI 进程读它的警告在旧 code.cmd 通道同样存在',
  }
}

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), 'results.json')
fs.writeFileSync(out, JSON.stringify(results, null, 2) + '\n')
console.log(JSON.stringify(results, null, 2))
