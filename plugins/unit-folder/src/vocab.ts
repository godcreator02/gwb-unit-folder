import type { GwbContext, GwbKernelApi } from '@godcreator/gwb-kernel-desktop'

/** 取内核服务。内核包根只导出类型，这个小函数由插件自带一份；内核服务不写进 `inject` */
export function requireKernel(ctx: Pick<GwbContext, 'gwbKernel'>): GwbKernelApi {
  const kernel = ctx.gwbKernel
  if (kernel === undefined) {
    throw new Error('ctx.gwbKernel 不在——这个插件跑在一个不是 gwb 内核的 cordis 宿主里')
  }
  return kernel
}
