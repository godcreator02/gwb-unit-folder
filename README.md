# gwb-unit-folder

单元文件夹插件 `@godcreator/gwb-unit-folder`：把「容器根下一层一个目录、目录里一张 `unit.json` 出生证」这个约定变成工作台里的一棵树——
现扫容器根读出生证、建单元、展开单元看文件、点文件在原文窗格看原文；人在树上点了哪个单元、置顶了哪几个，经服务 `ctx.gwbUnitFolder`
与事件 `unit-folder/selection` 往外报。

这份 README 只讲怎么装、怎么跑。插件怎么和工作台、磁盘、别的插件连（接缝图）、十一条命令与服务的契约、取舍的来历都在文档站 `docs-site/`；
agent 怎么用这些命令写在随包说明书 `unit-folder` 里。

## 装

在工作台里调 `plugin-manager.install {"pkg":"@godcreator/gwb-unit-folder"}`，它装包并在 `cordis.yml` 里新建一条条目（回执里的 `entryId`）。
条目上不写 `config`，本插件不读它。

装完到「设置」里给单元文件夹填 **`units-root`**（容器根的绝对路径，如 `D:\unitfolders`）——这是它唯一的设置项，
不填时用到容器根的命令全回 `code: 'unconfigured'`。

外壳 `gwb-shell` 与命令总线 `gwb-commands` 是必需的 peer，home 里要先装着（home 不自动补装 peer，缺了由 `plugin-manager.list` 的
`unmetPeers` 报出来）；设置 `gwb-settings`、数据 `gwb-data`（置顶存盘）、说明书 `gwb-skills` 是可选 peer，缺哪个本插件照常加载，只少那一部分功能。

## 本地命令

仓是 pnpm workspace，插件包在 `plugins/unit-folder/`。在仓根：

```powershell
pnpm install
pnpm check        # typecheck + lint + 纯逻辑测试
pnpm build        # esbuild（浏览器侧）+ tsc（node 侧）+ tailwindcss（样式表，类名前缀 unitfolder）
pnpm test:all     # 全量测试（含产物测试，要先 build）
```

在隔离 home 里看改动用 `devkit.dev {"home":"<home 名>","dir":"<仓根>","packages":["plugins/unit-folder"]}`，发版用
`devkit.release {"dir":"<仓根>","packages":["plugins/unit-folder"]}`。

文档站：`cd docs-site && pnpm install && pnpm doc`（核对文档与代码），`pnpm dev` 在 http://localhost:4319 看。

## 结构

- `plugins/unit-folder/` —— 插件包：`src/index.ts`（cordis 服务）、`src/*.ts`（出生证、现扫、路径验证、当前单元与置顶、建单元）、
  `src/client/`（两个窗格）、`skills/unit-folder/`（说明书）、`tests/`
- `docs-site/` —— 文档站
- `probes/` —— 实验材料

这份 README 是生成物，正本是 `docs-site/content/docs/outputs/readme.mdx`。
