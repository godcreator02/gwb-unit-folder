---
name: unit-folder
description: 用户提到「单元」「容器根」「unitfolders」「当前单元」「出生证 unit.json」，或者要你新开一个单元（新项目还没有落点）、找某个项目住在哪个目录、这台机器上有哪些单元、某个单元里有什么文件、人现在在工作台里看的是哪个单元、想置顶或用 VSCode 打开某个目录时用。这个件把单元容器根现扫一遍读出生证，十一条命令能建单元、列清单（带置顶的几条）、列目录、读文件原文、报/查当前选中、置顶/取消、在资源管理器或 VSCode 里打开；另给别的件一个服务面 ctx.gwbUnitFolder（读选中与置顶之外，还有往树格工具条登记动作按钮的口）。
---

# 单元文件夹：这台机器的组织结构

「单元」是个纯目录约定：**容器根下一层一个目录，目录里有一张 `unit.json` 当出生证**。
没有出生证的目录不是故障，是**还没认领**。

## 出生证 `unit.json`

六项，**全部必给，多一项不认识的也不行**（拼错的键、旧写法都会让这个单元整行变成「读不出」）：

```json
{
  "kind": "插件仓",
  "title": "gwb-unit-folder",
  "purpose": "这个单元是什么、干什么；容易跟谁混就点一句",
  "status": "active",
  "icon": "folder-tree",
  "createdAt": "2026-09-08T11:47:30+08:00"
}
```

| 字段 | 写什么 |
| --- | --- |
| `kind` | 中文种类短词，树里按它分组。先 `unit-folder.list` 看已有的种类，能归进去就别造新词 |
| `title` | 短名，树里第一行 |
| `purpose` | 唯一的自述，**一句话说清「是什么、干什么」**——容易跟谁混就点一句；不写历史、版本沿革、已完成的任务清单。树里显示两行，全文在悬停说明里 |
| `status` | `active`（在做）/ `paused`（搁着）/ `retired`（退役）。退役的树里默认藏起来，站件也不扫它里面的站 |
| `icon` | [lucide](https://lucide.dev/icons) 图标名，kebab-case（`puzzle`、`book-open`、`server`）。认不出的名字画兜底文件夹 |
| `createdAt` | ISO 8601 带时区。建单元时本件自动填 |

**新开单元走 `unit-folder.create`**，别手建目录：它算目录名（五位随机小写字母数字；给了 `slug`
就拼成 `<随机>-<slug>`，如 `a1b2c-gwbbase`。撞名重摇）、建目录、写出生证，到 `unit.json` 为止。
仓怎么建、要不要文档站，交给目标线自己的工具
（插件仓走 `devkit.scaffold`，站走 `docs-site.create`）。改已有单元的状态、标题、图标，直接改那份 `unit.json`。

容器根在哪由**设置**里的 `units-root` 说了算（`gwb-settings` 那份，值落 `<home>\settings.json`；
条目上没有 `config` 面，也没有环境变量、没有应用级配置）。没配时命令回 `code: 'unconfigured'`，
那不是出错，是还没配——让用户到「设置」里给单元文件夹填 `units-root`。**这是它唯一的设置项。**

## 十一条命令

| 命令 | 干什么 |
| --- | --- |
| `unit-folder.create` | 建一个新单元：`{kind, title, purpose, icon, status?, slug?}`，`status` 省了是 `active`，`slug` 省了目录名只有随机段。回 `{ name, path, identity }` |
| `unit-folder.list` | 现扫容器根，回全部单元：认领过的按 `kind` 分组，没出生证或读不出的落 `unidentified`（读不出的带 `reason`）；回包另带 `pinned`（置顶的单元条目数组，按置顶先后；目录已不在的这一趟顺手摘掉）。无参数 |
| `unit-folder.toolbarButtons` | 此刻有哪些件往树格工具条登记了按钮（浏览器半取表用）。无参数 |
| `unit-folder.listDir` | 列容器根内一个目录的一层：`{path}` |
| `unit-folder.readFile` | 读容器根内一个文件的原文（截断预览）：`{path}` |
| `unit-folder.open` | 在资源管理器里打开一个目录：`{path}`，目录必须已存在 |
| `unit-folder.code` | 用 VSCode 新窗口打开一个目录（`code -n`）：`{path}`，目录必须已存在；找不到 VSCode（PATH 上没有 `code`）回失败，不降级 |
| `unit-folder.select` | 报一次选中：`{path}`（单元目录或单元内目录）。回 `{ unitPath, unitName, path }`。树里点一下就是这条，agent 想替人「切到某个单元」也调它 |
| `unit-folder.current` | 此刻的「当前单元」：最近一次点击，没点过回落到第一个置顶，都没有是 null。无参数 |
| `unit-folder.pin` | 把一个单元加进置顶（可以有多个，追加到末尾）：`{path}`，**必须是容器根下一层的单元目录**。落 data 文档 `pinned`。回 `{ paths }` |
| `unit-folder.unpin` | 把一个单元从置顶里摘掉：`{path}`。回 `{ paths }` |

窗格那边的交互约定（外壳的手势约定）：原文格是文档窗格，一份装一个文件。树里**单击**文件是预览
（下一次单击顶掉它），**Ctrl+单击**或中键正式开一个新标签，**Ctrl+Alt+单击**开到旁边；原文格落在
单元树旁边或最近用过的那组原文格里，装哪个文件跟着布局落盘。agent 想看某个文件，直接调
`unit-folder.readFile`，不必经过窗格。

**路径参数一律关在容器根内**——传一个根外的绝对路径会被回一句「路径不在容器根内」，
这不是 bug 是门。命令总线对外暴露，参数不能默认来自界面。墙有两道：词法（`..`、根外
绝对路径、换盘符）之外，**已存在的**路径还要过重解析点这道——根内 junction / 链接指到
根外的，落脚点算根外，一样拒；路径不存在时不拦（报错归下游的「列不动 / 读不动 / 不是
目录」）。

## 「当前单元」：给别的件的服务面

坐在工作台里看某个单元时，别的件（第一个消费方是文档站件 gwb-docs-site）要知道人现在看的是哪个。
本件把这件事**往外报**，不认识任何消费方——方向是特殊认识一般：

```ts
import type {} from '@godcreator/gwb-unit-folder'   // 拿 Context / Events 上的名字

ctx.inject(['gwbUnitFolder'], (scoped) => {
  const now = scoped.gwbUnitFolder.current()          // { unitPath, unitName, path } | undefined
  scoped.on('unit-folder/selection', (selection) => { /* 同形；current() 变了才来 */ })
})
```

`unitPath` 是容器根下那一层的单元目录，`unitName` 是目录名，`path` 是人点的那个目录（点单元行时等于
`unitPath`，点单元内目录时是那个目录）。**多开的格以最后一次为准**；本会话没点过时回落到第一个置顶单元；
置顶 / 取消置顶在没点过时也会让 `current()` 变、所以也广播。`pinned()` 另给全部置顶单元的绝对路径（`string[]`，按置顶先后）。

这面被别人 inject：**改它的方法签名、事件形状、命令名与参数形状之前先问人。**
判据与否掉的两条路见文档站的轨迹卡「选中往外报」；其中「注册按钮」那条 0.4 起翻案——
第二个消费者（站件）到货了，判据的前提变了，见轨迹卡「工具条按钮登记口」。登记的形状
（`ToolbarButtonSpec`：id / icon / label / command / state? / args?）也在契约里：

```ts
const off = ctx.gwbUnitFolder.registerToolbarButton({
  id: 'sites',
  icon: 'book-open',
  label: '启动站点',
  command: 'docs-site.viewUnit',   // 点击调，参数 { unitPath, item?, from }——from 是树格的实例 id，开窗格时递给 shell.openPane
  state: 'docs-site.unitSites',    // 问亮不亮（可省=常亮），参数 { unitPath }，回 { enabled, items? }
})
```

## 怎么用它回答问题

**「X 项目住哪儿」**：先 `unit-folder.list`，在回包里按 `title` 与 `purpose` 找——出生证那句话
通常写着这个单元是干什么的，比目录名准。目录名是随机段加功能名（如 `a1b2c-gwbbase`）：
**功能名故意只写大类**——内容会变、名字不会，所以它只能当路标，不能当清单。

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

**置顶是数据不是设置。** 人在树上点图钉，本件把它写进 `gwbData` 的文档 `pinned`（`{ paths: [...] }`，
按置顶先后）。判据跟外壳的布局档一样：设置面里手填的是设置，件因人的操作自己写下的是数据。
没装 data 件置顶只活在内存，日志会 warn 一次。

## 装法（gwb-kernel 新线）

正路是 `plugin-manager.install {"pkg":"@godcreator/gwb-unit-folder"}`；手动路：

```powershell
cd $env:APPDATA\gwb-kernel\homes\<home 名>
pnpm add @godcreator/gwb-unit-folder@<版本>
```

再往 `<home>\cordis.yml` 加一条（id 手写，**没有 config**）：

```yaml
- id: unit-folder
  name: "@godcreator/gwb-unit-folder"
```

容器根装完到界面的「设置」里填 `units-root`（如 `D:\unitfolders`）。硬依赖 `gwb-shell` / `gwb-commands` / `cordis`
由 peer 自动带进 home；`gwb-skills`（说明书）、`gwb-settings`（设置面）、`gwb-data`（置顶落盘）都是局部注入，
缺哪个本件照挂、只少那一面。
