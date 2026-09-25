import type { GwbContext, GwbKernelApi } from '@godcreator/gwb-kernel-desktop'

/** 内核包根只导出类型，这两个无状态小函数由插件自带一份。不加副作用 */

/** 取内核服务。不要写进 `export const inject` */
export function requireKernel(ctx: Pick<GwbContext, 'gwbKernel'>): GwbKernelApi {
  const kernel = ctx.gwbKernel
  if (kernel === undefined) {
    throw new Error('ctx.gwbKernel 不在——这个插件跑在一个不是 gwb 内核的 cordis 宿主里')
  }
  return kernel
}

/** 把 unknown 收窄成对象 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
