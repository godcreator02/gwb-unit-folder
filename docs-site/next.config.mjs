import { createMDX } from 'fumadocs-mdx/next'

const withMDX = createMDX()

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  // 必须空着：`@godcreator/docfirst-workflow` 里既有服务端代码（读盘、调 git、remark 插件）也有带 'use client' 的组件，
  // `serverExternalPackages` 只能按包名整包外置，外置后 Next 用 Node 单独加载它，跟站里打包的 React 不是同一份
  serverExternalPackages: [],
  // 站根跳到文档首页；生成正本在现状区的 /docs/outputs 下
  redirects: async () => [
    { source: '/', destination: '/docs', permanent: true },
    { source: '/outputs/:path*', destination: '/docs/outputs/:path*', permanent: false },
  ],
}

export default withMDX(config)
