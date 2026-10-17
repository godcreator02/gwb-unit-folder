---
born-at: 2026-09-20T10:20
type: choice
parent: [2026-09-08-gwb-unit-folder]
label: 路径墙补第二道（物理）与 code 命令去 shell
domain: 纯机与命令
---

## 背景

外部全系统审查（2026-09-19，经总控台 feedback 转来）在本件钉了两条 P0：

- **GWB-29**：`resolveInside` 只做词法校验（`path.resolve` + `path.relative`），后续 `stat` / `open`
  跟随重解析点——根内一条 junction 指向容器外，`unit-folder.readFile` 就能把外部内容读出来。
  审查以真实 junction 复现：`lexicalAccepted:true, readOutsideRoot:true`。仓 AGENTS 承诺的
  「越出根一律拒绝」只兑现了字符串那一半
- **GWB-28**：`unit-folder.code` 把 target 原样拼进 `spawn('code -n "<target>"', { shell: true })`。
  拼串不是无知——Node 修 CVE-2024-27980 后无 shell 直 spawn `.cmd` 抛 EINVAL，args 数组 +
  shell:true 又吃 DEP0190，作者是被逼的——但代价是路径参数成了**命令文本**：审查用
  `x" & echo AUDIT_MARKER & rem "` 闭合引号把 `&` 带进引号外，且目标不必存在、回执恒 `{ok:true}`

## 结论与边界

定：墙补成两道，code 不再过 shell。

- `resolveInside` 词法过关后加**物理墙**：根与目标双端 `realpath` 解到实际位置再比一次边界；
  目标（或根）不存在时放行——「不存在」的报错归下游（「列不动 / 读不动 / 不是目录」），语义不抢。
  七条带路径命令（listDir / readFile / open / code / select / pin / unpin）全走这一处，全体受益
- 新增 `src/vscode.ts`：`where.exe`（真 exe，无需 shell）找 `code.cmd`，按标准布局推导同级父目录的
  `Code.exe`，一次解析挂载期内缓存。`unit-folder.code` 改 `spawn(codeExe, ['-n', target], { shell: false })`
  ——路径只是路径，不再是命令文本。找不到 Code.exe **不降级**回 shell 拼接：回 `{ok:false}` 明说
  打不开（顺带修掉旧实现「code 不在 PATH 时日志见不了」的已知缺陷）
- `unit-folder.code` / `unit-folder.open` 加「存在且是目录」校验；两命令的回执从恒 `{ok:true}` 收紧为
  可能失败。命令名、参数形状、事件、服务面一个字没动

边界：物理墙验的是**校验时刻**的实际位置，校验后毫秒级替换目录的竞态不防——纯 Node 拿不到句柄级
final-path，本机桌面威胁模型下不值当，已在源码注释与现状页写明。根内指根内的链接（pnpm 布局就是）
照常放行；指根外的从「能逛」变「拒」，这正是承诺的本意。版本 0.7.6 → 0.7.7，peer 不动。

## 依据

- `tests/browse.test.ts` 新增物理墙组（win32 真跑）：根内 junction 指根外拒、指根内放行、绕回根本身
  拒、不存在放行——`pnpm test:all` 12 文件 116 用例全过
- `probes/26092010_gwb28-29路径墙/` 重放审查复现：junction 判定 `lexicalAccepted:false`（审查时 true）、
  `directReadReachesOutside:false`；引号串走产物断言——`dist/index.js` 无 `shell: true`、argv 为
  `['-n', target]`；`locateCodeExe` 找到本机用户级安装的 `Code.exe`，`--version` 退出 0（CLI 开关被
  GUI 真身接受；本机 `~/.vscode/argv.json` 语法坏导致版本号没打出来属环境问题，`code.cmd` 对照正常）
- 隔离 home 实测 `unit-folder.code` 待发版后补（照 gwb-devkit 手册）

## 代价与遗留

每次路径命令多两趟 `realpathSync`（存在的路径才跑），本机桌面量级无感。`Code.exe` 布局假设若遇非标准
发行（scoop 重排等）定位会失败——失败可见（回执明说），好过静默漏。遗留：审查报告其余 42 条在
总控台 feedback 暂存待分发，与本仓无关；本机 argv.json 损坏需用户自己修（影响所有直启 Code.exe 的
调用方，与本改动无关）。
