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
  },
}
