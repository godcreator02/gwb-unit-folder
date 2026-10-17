/**
 * docfirst 配置：命令行 docfirst（check / confirm / render / trajectory）读它，项目根是站点目录。
 * 被钉的代码在插件包 `plugins/unit-folder/`，引用写 `../plugins/unit-folder/…`，按项目根拼路径，页面在哪个子目录都一样。
 *
 * content：内容根。下面的 future/ 是未来区、不进核对，其余目录都是现状区、都进 check；本站的现状区是 `content/docs/`。
 * outputs：生成物的正本都在 `content/docs/outputs/`：仓根 README.md / AGENTS.md / CLAUDE.md，外加随插件包发布的说明书
 * `plugins/unit-folder/skills/unit-folder/SKILL.md`（要保留 frontmatter 的 name 与 description，gwb-skills 登记时读它们）。
 * 改了正本运行 `pnpm doc:render`，两份放进同一个提交。生成正本按原文渲染，里面不能用 JSX 组件。
 * fumadocsRoster 与 components：组件名册。fumadocsRoster 放进 fumadocs 自带的 Note、Files、Folder、File 的机读规则，
 * components 再加站里的组件：首页的接缝图 UnitFolderSeams 在机读版里换成下面这段文字。
 * trajectory：轨迹卡放在站点根下的 trajectory/，站点的卡集合（app/features/trajectory/mdx.ts）读同一个目录。
 * 术语表不在这里：它是站点根的 glossary.json，由站点的 source.config.ts 交给术语标注插件。
 */
export default {
  content: 'content',
  outputs: {
    'content/docs/outputs/readme.mdx': ['../README.md'],
    'content/docs/outputs/agents.mdx': ['../AGENTS.md'],
    'content/docs/outputs/claude.mdx': ['../CLAUDE.md'],
    'content/docs/outputs/skills/unit-folder.mdx': [
      { to: '../plugins/unit-folder/skills/unit-folder/SKILL.md', frontmatter: ['name', 'description'] },
    ],
  },
  fumadocsRoster: true,
  components: {
    // 手写的术语标注：机读版里只留术语原词
    Term: 'children',
    // 首页接缝图在机读版里只剩这段文字；每条接缝的契约在首页正文「接缝逐条」里按同一套编号写出
    UnitFolderSeams: (node, h) =>
      h.paragraph(
        '[接缝图] 单元文件夹插件的三个模块：浏览器侧 src/client/（单元树窗格、原文窗格）、node 侧 src/index.ts（命令、服务、工具条登记表）、' +
          '判断与读盘 src/*.ts（scan、browse、current、create、vscode）。接缝：1 浏览器侧经命令总线调 node 侧；2 agent 经 MCP 入口调同一组命令；' +
          '3 node 侧调判断与读盘；4 判断与读盘读写容器根下的 unit.json；5 node 侧向外壳登记窗格；6 外壳挂载浏览器侧窗格、浏览器侧经外壳开原文窗格；' +
          '7 node 侧读设置 units-root；8 node 侧经数据插件读写置顶文档 pinned.json；9 node 侧向消费方插件提供服务与选中事件（此刻没有消费方）；' +
          '10 node 侧经内核事件通知浏览器侧重取按钮表；11 node 侧启动 explorer.exe 与 Code.exe；12 node 侧向说明书插件登记 skills/。',
      ),
  },
  trajectory: 'trajectory',
}
