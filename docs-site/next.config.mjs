import { createMDX } from 'fumadocs-mdx/next'

const withMDX = createMDX()

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  // **空着，这一行就是那条「不许外置」的账。**
  // 塌包之后 `@godcreator/docfirst-workflow` 里同时住着服务端那半（读盘、调 git、remark 插件）
  // 与客户端组件（`/fumadocs/pre` 状态点），而 `serverExternalPackages` 按包名匹配、没有子路径
  // 粒度，所以它整包不能外置：外置之后 Next 走 Node 单独加载、跟站打包的 React 分了家。
  // 不外置的代价只是多打一遍服务端那半——那半只在构建期跑，进不了客户端束。
  serverExternalPackages: [],
  // 站根落到文档首页；生成正本挪进了现状区
  redirects: async () => [
    { source: '/', destination: '/docs', permanent: true },
    { source: '/outputs/:path*', destination: '/docs/outputs/:path*', permanent: false },
  ],
}

export default withMDX(config)
