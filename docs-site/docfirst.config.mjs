/**
 * 这个站怎么挂机制：用哪个格式包、文档在哪、组件名册是什么。命令行和站读的是同一份。
 *
 * 项目根是这个站目录，钉的代码在仓根——引用里写 `../src/…`，读取器按项目根拼路径。
 * 比较器不写死：仓里有 git 就用 git 比，没有就退回按内容摘要比。
 *
 * 想让仓根 README.md 变成生成物，加一条 outputs 映射，正本写成站里的一篇 mdx：
 *   outputs: { 'content/docs/readme.mdx': ['../README.md'] }
 * 加了之后改 mdx 源要跑 `pnpm docfirst render --target ai` 重摆，两份一起提交，
 * check 会守着生成物跟源一致。模板里不预置——没重摆过的映射一上来就是红的。
 *
 * trajectory：轨迹卡住仓根的 docs-god-flow/trajectory/（跟 docfirst 自己那个仓同一条约定），
 * check 顺带跑卡校验。卡不许钉代码——要说现状去 content/docs 里写、在那儿钉。
 */
import * as fumadocs from '@godcreator02/docfirst-workflow/fumadocs'

export default {
  formats: [fumadocs],
  docs: 'content/docs',
  out: 'out',
  trajectory: '../docs-god-flow/trajectory',
  components: {
    ...fumadocs.defaultRoster,
  },
}
