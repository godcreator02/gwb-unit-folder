---
name: unit-folder
description: 用户提到「单元」「容器根」「unitfolders」「当前单元」，或者要你找某个项目住在哪个目录、这台机器上有哪些单元、某个单元里有什么文件、人现在在工作台里看的是哪个单元、想置顶或用 VSCode 打开某个目录时用。这个件把单元容器根现扫一遍读出生证，九条命令能列清单（带置顶条）、列目录、读文件原文、报/查当前选中、置顶/取消、在资源管理器或 VSCode 里打开；另给别的件一个服务面 ctx.gwbUnitFolder。
---

# 单元文件夹：这台机器的组织结构

「单元」是个纯目录约定：**容器根下一层一个目录，目录里有一张 `unit.json` 当出生证**
（`kind` 说它是什么、`purpose` 说它干什么）。没有出生证的目录不是故障，是**还没认领**。

容器根在哪由**设置**里的 `units-root` 说了算（`gwb-settings` 那份，值落 `<home>\settings.json`；
条目上没有 `config` 面，也没有环境变量、没有应用级配置）。没配时命令回 `code: 'unconfigured'`，
那不是出错，是还没配——让用户到「设置」里给单元文件夹填 `units-root`。**这是它唯一的设置项。**

## 九条命令

| 命令 | 干什么 |
| --- | --- |
| `unit-folder.list` | 现扫容器根，回全部单元：认领过的按 `kind` 分组，没出生证的落 `unidentified`；回包另带 `pinned`（置顶的那条，没置顶或不在清单里是 null）。无参数 |
| `unit-folder.listDir` | 列容器根内一个目录的一层：`{path}` |
| `unit-folder.readFile` | 读容器根内一个文件的原文（截断预览）：`{path}` |
| `unit-folder.open` | 在资源管理器里打开一个目录：`{path}` |
| `unit-folder.code` | 用 VSCode 新窗口打开一个目录（`code -n`）：`{path}` |
| `unit-folder.select` | 报一次选中：`{path}`（单元目录或单元内目录）。回 `{ unitPath, unitName, path }`。树里点一下就是这条，agent 想替人「切到某个单元」也调它 |
| `unit-folder.current` | 此刻的「当前单元」：最近一次点击，没点过回落到置顶，都没有是 null。无参数 |
| `unit-folder.pin` | 置顶一个单元：`{path}`，**必须是容器根下一层的单元目录**。落 data 文档 `pinned` |
| `unit-folder.unpin` | 取消置顶。无参数 |

窗格那边的交互约定：树里**单击**文件，内容进「焦点原文格」（最后一次鼠标点过的那格，
没有开着就自动开一格）；**Ctrl+单击**再开一份原文格显示，新格接管焦点。接力棒只住
内存、不跟随状态，重启即空。所以 agent 想看某个文件，直接调 `unit-folder.readFile`，
不必经过窗格。

**路径参数一律关在容器根内**——传一个根外的绝对路径会被回一句「路径不在容器根内」，
这不是 bug 是门。命令总线对外暴露，参数不能默认来自界面。

## 「当前单元」：给别的件的服务面

坐在工作台里看某个单元时，别的件（第一个消费方是文档站件 gwb-live-doc）要知道人现在看的是哪个。
本件把这件事**往外报**，不认识任何消费方——方向是特殊认识一般：

```ts
import type {} from '@godcreator02/gwb-unit-folder'   // 拿 Context / Events 上的名字

ctx.inject(['gwbUnitFolder'], (scoped) => {
  const now = scoped.gwbUnitFolder.current()          // { unitPath, unitName, path } | undefined
  scoped.on('unit-folder/selection', (selection) => { /* 同形；current() 变了才来 */ })
})
```

`unitPath` 是容器根下那一层的单元目录，`unitName` 是目录名，`path` 是人点的那个目录（点单元行时等于
`unitPath`，点单元内目录时是那个目录）。**多开的格以最后一次为准**；本会话没点过时回落到置顶单元；
置顶 / 取消置顶在没点过时也会让 `current()` 变、所以也广播。`pinned()` 另给置顶单元的绝对路径。

这面被别人 inject：**改它的方法签名、事件形状、命令名与参数形状之前先问人。**
判据与否掉的两条路（扩展点、共享上下文件）见文档站的轨迹卡「选中往外报」。

## 怎么用它回答问题

**「X 项目住哪儿」**：先 `unit-folder.list`，在回包里按 `purpose` 找——出生证那句话通常
写着这个单元是干什么的，比目录名好认。目录名是时间码加随机码（如 `26090811jjr`），
**不表意，别指望从名字猜出内容**。

**「我现在看的是哪个」**：`unit-folder.current`。null 就是人还没在树里点过、也没置顶。

**「这个单元里有什么」**：拿到 `path` 之后 `unit-folder.listDir`，一层一层来。它不递归——
容器根下面动辄几万个文件（每个单元自带 `node_modules`），一次性递归扫下去既慢又没用。

**「这份出生证写了什么」**：`unit-folder.readFile` 读那个单元的 `unit.json`。

## 三件要知道的

**清单是现扫的，不是缓存。** 每次 `list` 都真读一遍盘，所以刚建的单元立刻看得见，
删掉的立刻消失。代价是单元多的时候这条命令要几百毫秒。

**「根不存在」与「扫不动」是两回事。** 前者回一张空表加 `rootExists: false`——配置可以
先于目录写下（换机器、待挂载的盘都会这样），那是正常状态；后者才报错，说明配置指错了
地方或者权限不对。别把前者当成「这儿没有单元」报给用户。

**置顶是数据不是设置。** 人在树上点图钉，本件把它写进 `gwbData` 的文档 `pinned`（`{ path }`，
取消是 `{ path: null }`）。判据跟外壳的布局档一样：设置面里手填的是设置，件因人的操作自己写下的是数据。
没装 data 件置顶只活在内存，日志会 warn 一次。

## 装法（gwb-kernel 新线）

正路是 `plugins.install {"pkg":"@godcreator02/gwb-unit-folder"}`；手动路：

```powershell
cd $env:APPDATA\gwb-kernel\homes\<home 名>
pnpm add @godcreator02/gwb-unit-folder@<版本>
```

再往 `<home>\cordis.yml` 加一条（id 手写，**没有 config**）：

```yaml
- id: unit-folder
  name: "@godcreator02/gwb-unit-folder"
```

容器根装完到界面的「设置」里填 `units-root`（如 `D:\unitfolders`）。硬依赖 `gwb-shell` / `gwb-commands` / `cordis`
由 peer 自动带进 home；`gwb-skills`（说明书）、`gwb-settings`（设置面）、`gwb-data`（置顶落盘）都是局部注入，
缺哪个本件照挂、只少那一面。
