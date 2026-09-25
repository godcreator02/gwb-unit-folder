import { defineConfig } from 'vitest/config'

/**
 * 一仓一包一插件：测试只认仓根的 `tests/`，`src/` 里不放用例。
 *
 * 「slow」标签（vitest 4.1+）：**凡真起子进程的用例必打标**。眼下产物守卫只读盘上
 * 的 dist，不跑 build——哪天加了要真构建的用例，给它打上 slow，日常 `pnpm test`
 * 用 `--tags-filter=!slow` 跳过。
 */
export default defineConfig({
  test: {
    include: ['tests/**/*.{spec,test}.{ts,tsx}'],
    testTimeout: 20_000,
    fileParallelism: false,
    tags: [
      {
        name: 'slow',
        description: '真起子进程的用例（pnpm build / pnpm pack）',
        timeout: 300_000,
      },
    ],
  },
})
