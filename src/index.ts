import { spawn } from 'node:child_process'
import path from 'node:path'
import type { GwbContext } from '@godcreator02/gwb-plugin-api'
// 只为激活那几个件的 `declare module 'cordis'`——它们给 ctx 加上各自那个名字
import type {} from '@godcreator02/gwb-commands'
import type {} from '@godcreator02/gwb-shell'
import type {} from '@godcreator02/gwb-skills'
import { listDir, readFilePreview, resolveInside } from './browse.js'
import { takeInventory, type UnitEntry, type UnitInventory } from './scan.js'

export const name = 'gwb-unit-folder'

/**
 * 浏览器半与样式表的地址，注册窗格时报给外壳。产物 `dist/index.js`、`dist/client.js`、
 * `dist/style.css` 三个是邻居，从本模块的 `import.meta.url` 算成 `file://`——内核不再
 * 替件取货，也不认识任何包名与导出名。
 */
const CLIENT_URL = new URL('./client.js', import.meta.url).href
const STYLE_URL = new URL('./style.css', import.meta.url).href

/** 缺哪个都不挂——inject 是 cordis 的等待机制，不是建议 */
export const inject = ['gwbShell', 'gwbCommands']

/**
 * 缺配置时回的那句话。**界面不认这段文字**，认的是结果上的 `code: 'unconfigured'`
 * ——措辞随时会改，改一次就让界面漏判一次的判据不成其为判据。
 */
const MISSING_UNITS_ROOT = '未配置单元容器根——往 cordis.yml 里这条条目的 config.unitsRoot 写'

/**
 * 单元盘面数据源：现扫容器根、逐个读出生证（`src/scan.ts`），不 spawn 任何子进程。
 *
 * 「单元」是个纯目录约定——根下一层一个目录、里头一张 `unit.json`——所以这件事在
 * `node:fs` 上就是完整的。
 *
 * `unitsRoot` **只有条目 config 这一级**（cordis.yml 里这条条目的 `config:`），没有
 * 环境变量、没有应用级配置——后者是旧线的机制，新线没有。**每次调用现取**，不在
 * apply 时抓一个常量下来，改了 yml 热挂载完就是新值。
 */
export function apply(ctx: GwbContext, config?: { unitsRoot?: string; pinnedUnit?: string }) {
  const log = ctx.logger(name)
  log.info('挂载：单元盘面数据源就绪')

  // 注册在 apply 里，同步的，不用自己包 effect（服务内部挂在调用方的 effect 上了）。
  // 身份不用报——服务从 fiber 上认。两格各自报自己的浏览器半与样式表地址。
  // viewer 声明 duplicable：想并排看两个文件时开得起第二份
  ctx.gwbShell.registerPane({
    id: 'main',
    title: '单元',
    icon: 'folder-open',
    duplicable: true,
    client: CLIENT_URL,
    style: STYLE_URL,
  })
  ctx.gwbShell.registerPane({
    id: 'viewer',
    title: '文件原文',
    icon: 'file-text',
    duplicable: true,
    client: CLIENT_URL,
    style: STYLE_URL,
  })
  ctx.gwbShell.describeSelf({ title: '单元文件夹', icon: 'folders' })

  /**
   * 出口一律 `path.resolve`：条目 config 是人手填的，写个相对路径完全合理，而宿主的
   * 工作目录是应用起的时候定的、跟人心里那个「相对谁」多半不是一回事。绝对化只在
   * 这一处做，扫描那层因此只跟绝对路径打交道，回给界面的每条 `path` 也都是绝对的。
   */
  function resolveUnitsRoot(): string | undefined {
    const fromEntry = config?.unitsRoot
    return fromEntry !== undefined && fromEntry !== '' ? path.resolve(fromEntry) : undefined
  }

  /**
   * 「当前会话」置顶块的配置面：cordis.yml 里写 `config.pinnedUnit`（单元目录名），
   * list 回包里把它那条捞出来顶到最上。**新线还没有会话概念**，这一个置顶位先由
   * 配置担着；将来有了真的会话来源，换数据源不动版式。
   */
  function findPinned(inventory: UnitInventory): UnitEntry | null {
    const wanted = config?.pinnedUnit
    if (wanted === undefined || wanted === '') return null
    const all = [...inventory.byKind.flatMap((g) => g.units), ...inventory.unidentified]
    return all.find((u) => u.name === wanted) ?? null
  }

  const cli = ctx.gwbCommands
  // inject 保证了它在，这句只是把类型收窄
  if (cli !== undefined) {
    cli.register({ name: 'unit-folder.list', description: '现扫单元容器，回全部单元清单', plugin: name }, () => {
      const root = resolveUnitsRoot()
      if (root === undefined) return { ok: false, code: 'unconfigured', error: MISSING_UNITS_ROOT }
      const started = Date.now()
      const outcome = takeInventory(root)
      // 扫不动是真出岔子（根指到文件、没权限、盘掉了），如实报错；根不存在不走这条，
      // 它带着 rootExists: false 从成功那一支出去
      if (!outcome.ok) {
        log.warn(`unit-folder.list 扫不动：${outcome.error}`)
        return { ok: false, error: outcome.error }
      }
      const total = outcome.data.byKind.reduce((n, g) => n + g.units.length, 0) + outcome.data.unidentified.length
      log.info(`unit-folder.list 结束：${total} 个单元，耗时 ${Date.now() - started}ms`)
      return { ok: true, data: { ...outcome.data, pinned: findPinned(outcome.data) } }
    })

    /**
     * 单元内浏览的几条命令与 `list` 同一堵墙：**每条都先解 `unitsRoot`、再把参数
     * 路径验成根内的绝对路径**（见 browse.ts 的 resolveInside）。命令总线对外暴露，
     * 参数不能默认是界面自己递来的那份清单上的。
     */
    cli.register(
      { name: 'unit-folder.listDir', description: '列容器根内一个目录的一层：{path}', plugin: name },
      (args) => {
        const root = resolveUnitsRoot()
        if (root === undefined) return { ok: false, code: 'unconfigured', error: MISSING_UNITS_ROOT }
        const target = resolveInside(root, argsOf(args).path)
        if (target === null) return { ok: false, error: `路径不在容器根内：${String(argsOf(args).path)}` }
        // 信封形状归口 GwbResult：data 才是载荷的位置，outcome 原样出去客户端读不到
        const outcome = listDir(target)
        return outcome.ok ? { ok: true, data: { entries: outcome.entries } } : outcome
      },
    )

    cli.register(
      { name: 'unit-folder.readFile', description: '读容器根内一个文件的原文（截断预览）：{path}', plugin: name },
      (args) => {
        const root = resolveUnitsRoot()
        if (root === undefined) return { ok: false, code: 'unconfigured', error: MISSING_UNITS_ROOT }
        const target = resolveInside(root, argsOf(args).path)
        if (target === null) return { ok: false, error: `路径不在容器根内：${String(argsOf(args).path)}` }
        return readFilePreview(target)
      },
    )

    cli.register(
      { name: 'unit-folder.open', description: '在资源管理器里打开容器根内一个目录：{path}', plugin: name },
      (args) => {
        const root = resolveUnitsRoot()
        if (root === undefined) return { ok: false, code: 'unconfigured', error: MISSING_UNITS_ROOT }
        const target = resolveInside(root, argsOf(args).path)
        if (target === null) return { ok: false, error: `路径不在容器根内：${String(argsOf(args).path)}` }
        // explorer.exe 成功时退出码也可能是 1，不看成败——成败以「进程起没起得来」计
        const child = spawn('explorer.exe', [target], { detached: true, stdio: 'ignore' })
        child.on('error', (err) => log.warn(`资源管理器起不来：${err.message}`))
        child.unref()
        return { ok: true }
      },
    )

    cli.register(
      { name: 'unit-folder.code', description: '用 VSCode 新窗口打开容器根内一个目录：{path}', plugin: name },
      (args) => {
        const root = resolveUnitsRoot()
        if (root === undefined) return { ok: false, code: 'unconfigured', error: MISSING_UNITS_ROOT }
        const target = resolveInside(root, argsOf(args).path)
        if (target === null) return { ok: false, error: `路径不在容器根内：${String(argsOf(args).path)}` }
        // code 是 PATH 上的 .cmd，直接 spawn 会被 Node 挡（EINVAL），走 shell 转一道。
        // **命令拼成单条字符串**再交给 shell——args 数组 + shell:true 会吃 DEP0190 告警。
        // -n = 新窗口；同 explorer：成败以「进程起没起得来」计，code 不在 PATH 时
        // cmd 报「不是内部或外部命令」进不了 error 事件——那算环境没装，日志见不了
        const child = spawn(`code -n "${target}"`, { shell: true, detached: true, stdio: 'ignore' })
        child.on('error', (err) => log.warn(`VSCode 起不来：${err.message}`))
        child.unref()
        return { ok: true }
      },
    )
  }

  /**
   * 说明书那一格（包根的 `skills/`，随本件卸载回收）。**走局部注入，不写进顶层
   * `inject`**：顶层那个是硬依赖，写进去这个件在没装 skills 件的 home 里就整个挂
   * 不上——而说明书只是它的说明书，不是它能不能干活的前提。
   *
   * **`..` 相对的是产物所在的目录**：产物是 `dist/index.js`，所以包根那个 `skills/`
   * 写作 `'../skills/'`。那个目录还得进 `package.json` 的 `files`，少一处就是静默地
   * 少一份说明书。
   */
  ctx.inject(['gwbSkills'], (scoped) => {
    scoped.effect(() => scoped.gwbSkills.register(new URL('../skills/', import.meta.url)))
  })
}

/** 总线递来的参数是 `unknown`：按对象收下，字段各自再判 */
function argsOf(args: unknown): Record<string, unknown> {
  return typeof args === 'object' && args !== null ? (args as Record<string, unknown>) : {}
}
