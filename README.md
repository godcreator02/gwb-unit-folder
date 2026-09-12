# gwb-unit-folder

单元文件夹插件（gwb-kernel 正线）：现扫单元容器根读出生证、树里展开单元看文件、点文件在第二格看原文；
**0.3 起往外报「人现在看的是哪个单元」**——提供服务 `ctx.gwbUnitFolder` 与事件 `unit-folder/selection`，
别的件（第一个消费方是文档站件）局部注入它就知道当前单元。自 [26090620ufd 的旧线件](../../../26090620ufd/gwb-plugin-unit-folder)
按新线契约重做，版式正本是旧仓 `design/units-pane.html` 的定稿效果图。

设计、依赖方向、服务面与命令面的论断在文档站 `docs-site/`（论断钉在源码上，`docfirst check` 守着）；
方向了断在 `docs-god-flow/trajectory/` 的轨迹卡。这份 README 只讲怎么装、怎么跑。

## 装

正路是经工作台 `plugins.install {"pkg":"@godcreator02/gwb-unit-folder"}`；手动路：

```powershell
cd $env:APPDATA\gwb-kernel\homes\<home 名>
pnpm add @godcreator02/gwb-unit-folder@<版本>
```

`<home>\cordis.yml` 加条目（id 手写，**没有 config**——件不吃 `cordis.yml` 的 `config`）：

```yaml
- id: unit-folder
  name: "@godcreator02/gwb-unit-folder"
```

装完到「设置」里给单元文件夹填 **`units-root`**（容器根的绝对路径，如 `D:\unitfolders`）——这是它唯一的设置项，
不填九条命令全回 `code: 'unconfigured'`。

**置顶不是设置**：单元行右侧那颗图钉点出来，落 `gwbData` 的文档 `pinned`（`<home>/data/unit-folder/pinned.json`）。
判据跟外壳的布局档一样：人在设置面里手填的是设置，件因人的操作自己写下的是数据。没装 data 件置顶只活在内存。

硬依赖 `gwb-shell` / `gwb-commands` 与 `cordis` 由 peer 自动带进 home；`gwb-settings` / `gwb-data` / `gwb-skills`
都是局部注入，缺哪个本件照挂、只少那一面。

## 服务面（给写件的人）

```ts
import type {} from '@godcreator02/gwb-unit-folder'

ctx.inject(['gwbUnitFolder'], (scoped) => {
  scoped.gwbUnitFolder.current()   // { unitPath, unitName, path } | undefined
  scoped.gwbUnitFolder.pinned()    // 置顶单元的绝对路径 | undefined
  scoped.on('unit-folder/selection', (selection) => { /* 同一个形状，变了就来 */ })
})
```

方向是**特殊认识一般**：消费方认识本件，本件不认识任何消费方。`current()` 是最近一次点击（多开的格以最后一次为准），
本会话没点过时回落到置顶单元，都没有是 undefined。**这面被别人 inject，改它先问人。**

## 命令

| 命令                                                   | 参数                                      |
| ---------------------------------------------------- | --------------------------------------- |
| `unit-folder.list`                                   | 无参数。回包 `pinned` 是置顶的那条（没置顶或不在清单里是 null） |
| `unit-folder.listDir` / `readFile` / `open` / `code` | `{ path }`，容器根内的绝对路径                    |
| `unit-folder.select`                                 | `{ path }`——报一次选中，浏览器半点树时调；agent 也能调    |
| `unit-folder.current`                                | 无参数，回 `current()`（null = 没有）            |
| `unit-folder.pin`                                    | `{ path }`，必须是单元目录（容器根下一层）              |
| `unit-folder.unpin`                                  | 无参数                                     |

原文格的接力棒**不跟随状态**：树里单击文件进「焦点原文格」，Ctrl+单击再开一份，接力棒只住内存，重启即空。

## 开发循环

```powershell
pnpm check        # typecheck + lint + 纯逻辑测试
pnpm build        # tsc（node 半）+ esbuild（浏览器半）+ 样式 scope
pnpm test:all     # 全量测试（含产物守卫，要先 build）
pnpm publish --registry http://127.0.0.1:4873/ --no-git-checks   # 先抬版本号
```

实机验证按 devkit 手册（skill `gwb-devkit`）：开隔离 home、装包、给 `units-root`、看日志与命令回执。

文档站：`cd docs-site && pnpm doc`（docfirst check）、`pnpm dev`（[http://localhost:4319）。](http://localhost:4319）。)

## 结构

* `src/scan.ts` / `src/browse.ts` —— 纯机：容器现扫 + 出生证 + 路径校验/列目录/读原文
* `src/current.ts` —— 纯逻辑：从路径推所属单元、置顶文档形状、`current()` 回落规则
* `src/index.ts` —— cordis Service：两格窗格注册 + 九条命令 + 服务面 `gwbUnitFolder` + 事件
* `src/client/` —— 浏览器半：树格 / 原文格，`mountPane` 契约，shadcn 组件自 vendor
* `skills/unit-folder/` —— agent 说明书（gwb-skills 挂载）
* `docs-site/` —— fumadocs 站 + docfirst 六区（现状 / 轨迹 / 交接 / 未来 / 生成正本 / 反馈）

这份 README 是生成物，正本是 `docs-site/content/outputs/readme.mdx`；仓根 `AGENTS.md` 同理出自
`agents.mdx`。改完正本在 `docs-site` 跑 `pnpm docfirst render --target ai` 重摆，一起提交。
