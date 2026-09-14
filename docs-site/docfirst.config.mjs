/**
 * 这个站怎么挂 docfirst：格式包、哪几区进 check、卡目录在哪、产物摆放、组件名册。
 * 命令行和站读的是同一份。
 *
 * 项目根是这个站目录，钉的代码在仓根——引用里写 `../src/…`，读取器按项目根拼路径。
 * 比较器不写死会漂：仓里有 git，就用 git 比（只钉已提交内容，动了被引用的源码先 commit 再 confirm）。
 * 六区里只有 docs（现状）与 outputs（生成正本）进 check——只有这两区对代码说话；
 * 轨迹、交接、未来、反馈四区的草稿记号与卡天然不进门禁，卡不许钉活代码。
 *
 * trajectory：轨迹卡住站内 content/trajectory/（六区正典）。眼下卡还住仓根
 * 卡住站内 content/trajectory/（2026-09-12 已从仓根旧约定迁入，git mv 保历史）。
 *
 * outputs：仓根 README.md 与 AGENTS.md 都是生成物，正本是 content/outputs/readme.mdx
 * 与 agents.mdx。改 mdx 源，`pnpm docfirst render --target ai` 重摆，一起提交，
 * check 守着生成物跟源一致。
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
  },
  components: {
    ...fumadocs.defaultRoster,
  },
}
