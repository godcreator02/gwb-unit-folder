import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { registerSelfReportGuard } from '@godcreator/gwb-repo-kit'

/** 自述防漏——正本住 @godcreator/gwb-repo-kit，这儿只是挂号薄壳 */
const here = path.dirname(fileURLToPath(import.meta.url))
registerSelfReportGuard({ describe, it, expect }, { root: path.resolve(here, '..') })
