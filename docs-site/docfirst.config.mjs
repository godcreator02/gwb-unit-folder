/**
 * 这个站的 docfirst 配置：用哪个格式包、哪几区进 check、轨迹卡目录在哪、生成物写到哪、组件名册是什么。
 * 命令行和站读的是同一份。
 *
 * 项目根是这个站目录，钉的代码在仓根——引用里写 `../src/…`，读取器按项目根拼路径。
 * 比较器明确写成 git：仓里有 git，就用 git 比（只钉已提交内容，改了被引用的源码先 commit 再 confirm）。
 * 六区里只有 docs（现状）与 outputs（生成正本）进 check——只有这两区的论断跟代码对应；
 * 轨迹、交接、未来、反馈四区的草稿记号与轨迹卡本来就不进 check，轨迹卡不许钉码。
 *
 * trajectory：轨迹卡存放在站内 content/trajectory/，这是六区规定的位置
 * （2026-09-12 从仓根的旧位置迁入，用 git mv 保留历史）。
 *
 * outputs：仓根 README.md、AGENTS.md 与 CLAUDE.md 都是生成物，正本是 content/outputs/ 下的
 * readme.mdx、agents.mdx 与 claude.mdx。改 mdx 源后跑 `pnpm docfirst render` 重新生成，一起提交，
 * check 检查生成物跟源是否一致。
 * CLAUDE.md 第一行固定是 `@AGENTS.md`，只给 Claude 的指令写在它后面。
 */
import * as fumadocs from '@godcreator/docfirst-workflow/fumadocs'

export default {
  formats: [fumadocs],
  docs: ['content/docs', 'content/outputs'],
  out: 'out',
  comparator: 'git',
  trajectory: 'content/trajectory',
  outputs: {
    'content/outputs/readme.mdx': ['../README.md'],
    'content/outputs/agents.mdx': ['../AGENTS.md'],
    'content/outputs/claude.mdx': ['../CLAUDE.md'],
  },
  components: {
    ...fumadocs.defaultRoster,
  },
}
