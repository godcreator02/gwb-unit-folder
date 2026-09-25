/**
 * 这个站的 docfirst 配置：用哪个格式包、生成文件写到哪、组件规则表是什么。命令行和站读的是同一份。
 *
 * 项目根是这个站目录，被钉的代码在插件包 `plugins/unit-folder/`——引用里写 `../plugins/unit-folder/…`，
 * 按项目根拼路径，页面在哪个子目录都一样。
 * 分区按约定：`content/` 下 `trajectory/` 与 `future/` 两个名字固定，其余目录都是现状区、都进 check；
 * 本站的现状区只有 `content/docs`。
 *
 * 生成文件的正本都在 `content/docs/outputs/`：仓根的 README.md、AGENTS.md、CLAUDE.md，外加随包发布的说明书
 * `plugins/unit-folder/skills/unit-folder/SKILL.md`。SKILL.md 要保留 frontmatter 的 `name` 与 `description`
 * （gwb-skills 登记说明书时读它们），所以目标写成对象形式。CLAUDE.md 第一行固定是 `@AGENTS.md`，
 * 只给 Claude 的指令写在它后面。生成正本按原文渲染，里面不能用 JSX 组件。
 */
import * as fumadocs from '@godcreator/docfirst-workflow/fumadocs'

export default {
  formats: [fumadocs],
  outputs: {
    'content/docs/outputs/readme.mdx': ['../README.md'],
    'content/docs/outputs/agents.mdx': ['../AGENTS.md'],
    'content/docs/outputs/claude.mdx': ['../CLAUDE.md'],
    'content/docs/outputs/skills/unit-folder.mdx': [
      { to: '../plugins/unit-folder/skills/unit-folder/SKILL.md', frontmatter: ['name', 'description'] },
    ],
  },
  components: {
    ...fumadocs.defaultRoster,
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
}
