import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { registerSelfReportGuard } from '@godcreator/gwb-repo-kit'

/** 自述守卫：检查 description、gwb.provides 与文档站现状区对得上。正本在 @godcreator/gwb-repo-kit，这里只调用它 */
const here = path.dirname(fileURLToPath(import.meta.url))
registerSelfReportGuard({ describe, it, expect }, { root: path.resolve(here, '..'), docsDir: '../../docs-site/content/docs' })
