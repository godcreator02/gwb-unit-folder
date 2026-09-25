# gwb-unit-folder

单元文件夹插件：现扫单元容器根读出生证、树里展开单元看文件、点文件在第二个窗格看原文；
往外报「人现在看的是哪个单元」——提供服务 `ctx.gwbUnitFolder` 与事件 `unit-folder/selection`，
别的插件局部注入它就知道当前单元，也能往单元树工具条上登记按钮（文档站插件的「启动站点」就是这么登记的）。

设计、依赖方向、服务与命令的论断在文档站 `docs-site/`（论断钉在源码上，`pnpm doc` 检查）；
取舍的理由在文档站轨迹区的轨迹卡。这份 README 只讲怎么装、怎么跑。

## 装

在工作台里调 `plugin-manager.install {"pkg":"@godcreator/gwb-unit-folder"}`；手动装：

```powershell
cd $env:APPDATA\gwb-kernel\homes\<home 名>
pnpm add @godcreator/gwb-unit-folder@<版本>
```

`<home>\cordis.yml` 加条目（id 手写，**没有 config**——本插件不读 `cordis.yml` 的 `config`）：

```yaml
- id: unit-folder
  name: "@godcreator/gwb-unit-folder"
```

装完到「设置」里给单元文件夹填 **`units-root`**（容器根的绝对路径，如 `D:\unitfolders`）——这是它唯一的设置项，
不填时用到容器根的命令全回 `code: 'unconfigured'`。

**出生证 `unit.json` 六项全部必给**（`kind` / `title` / `purpose` / `status` / `icon` / `createdAt`），多一项不认识的也不行；
字段表见文档站「服务与命令」页或随包说明书。新开单元用 `unit-folder.create`。

**置顶不是设置**：单元行右侧的图钉点下去就置顶（可以有多个），存进 `gwbData` 的文档 `pinned`
（`<home>/data/unit-folder/pinned.json`，`{ paths }`）。判据跟外壳的布局文件一样：人在设置界面里手填的是设置，
插件因人的操作自己写下的是数据。没装数据插件时，置顶只存在内存里。

内核包 `gwb-kernel-desktop`、必需依赖 `gwb-shell` / `gwb-commands` 与 `cordis` 写在 peer 里；home 里的 pnpm 不自动补装 peer，
peer 里的插件没装时由 `plugin-manager.list` 的 `unmetPeers` 报出来。`gwb-settings` / `gwb-data` / `gwb-skills` 是可选 peer、局部注入，
缺哪个本插件照常加载，只少那一部分功能。

## 服务（给写插件的人）

```ts
import type {} from '@godcreator/gwb-unit-folder'

ctx.inject(['gwbUnitFolder'], (scoped) => {
  scoped.gwbUnitFolder.current()   // { unitPath, unitName, path } | undefined
  scoped.gwbUnitFolder.pinned()    // 全部置顶单元的绝对路径，按置顶先后：string[]
  scoped.on('unit-folder/selection', (selection) => { /* 同一个形状，选中变了就触发 */ })
})
```

方向是**特殊认识一般**：消费方认识本插件，本插件不认识任何消费方。`current()` 是最近一次点击（多开的窗格以最后一次为准），
本会话没点过时回落到第一个置顶单元，都没有是 undefined。**这个服务被别的插件 inject，改它先问人。**

## 命令

| 命令                                                   | 参数                                                                 |
| ---------------------------------------------------- | ------------------------------------------------------------------ |
| `unit-folder.create`                                 | `{ kind, title, purpose, icon, status? }`——建单元：算目录名、建目录、写出生证       |
| `unit-folder.list`                                   | 无参数。回执里 `pinned` 是置顶单元条目的数组（按置顶先后，目录已不在的一并去掉）；最近一次点击的单元已不在的，清掉那次点击 |
| `unit-folder.listDir` / `readFile` / `open` / `code` | `{ path }`，容器根内的绝对路径                                               |
| `unit-folder.select`                                 | `{ path }`——报一次选中，浏览器侧点树时调；agent 也能调。目录必须已存在                       |
| `unit-folder.current`                                | 无参数，回 `current()`（null = 没有）                                       |
| `unit-folder.pin`                                    | `{ path }`，必须是单元目录（容器根下一层）；追加进置顶                                   |
| `unit-folder.unpin`                                  | `{ path }`，从置顶里去掉这一个                                               |

原文窗格是**文档窗格**，一份装一个文件（装哪个文件记在它自己的参数里，随布局保存）。树里点文件照外壳的操作约定：
单击预览（下一次单击替换它），Ctrl+单击或中键正式开一个新标签，Ctrl+Alt+单击开到旁边。

## 本地命令

仓是 pnpm workspace，插件包在 `plugins/unit-folder/`。在仓根：

```powershell
pnpm check        # typecheck + lint + 纯逻辑测试
pnpm build        # esbuild（浏览器侧）+ tsc（node 侧）+ tailwindcss（样式表，类名前缀 unitfolder）
pnpm test:all     # 全量测试（含产物测试，要先 build）
```

文档站：`cd docs-site && pnpm doc`（docfirst check）、`pnpm dev`（[http://localhost:4319）。](http://localhost:4319）。)

## 结构

插件包 `plugins/unit-folder/` 里：

* `src/scan.ts` / `src/browse.ts` —— 容器现扫 + 出生证字段表与校验 + 路径校验、列目录、读原文
* `src/create.ts` —— 建单元：目录名、写出生证
* `src/current.ts` —— 纯逻辑：从路径推所属单元、置顶表的形状与增删、`current()` 回落规则
* `src/index.ts` —— cordis Service：两个窗格的注册 + 十一条命令 + 服务 `gwbUnitFolder` + 事件
* `src/client/` —— 浏览器侧：树窗格 / 原文窗格，`mountPane` 契约，过滤的纯逻辑在 `units.ts`、点文件开成什么样的原文窗格在 `open-file.ts`，shadcn 组件复制在本仓
* `skills/unit-folder/` —— agent 说明书（经 gwb-skills 登记）

仓根的 `docs-site/` 是文档站，`probes/` 放实验材料。

这份 README 是生成物，正本是 `docs-site/content/outputs/readme.mdx`。
