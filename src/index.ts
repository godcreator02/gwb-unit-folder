import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { Service } from 'cordis'
import { requireKernel, type GwbContext, type GwbKernelApi } from '@godcreator/gwb-plugin-api'
// 只为激活那几个件的 `declare module 'cordis'`——它们给 ctx 加上各自那个名字
import type { GwbCommandDef } from '@godcreator/gwb-commands'
import type {} from '@godcreator/gwb-data'
import type {} from '@godcreator/gwb-shell'
import type {} from '@godcreator/gwb-skills'
import type {} from '@godcreator/gwb-settings'
import { listDir, readFilePreview, resolveInside } from './browse.js'
import { takeInventory } from './scan.js'
import { createUnit } from './create.js'
import { addPinned, findPinned, isUnitDir, parsePinnedDoc, PINNED_DOC, removePinned, resolveCurrent, selectionFor, type UnitSelection } from './current.js'
import { TOOLBAR_EVENT, createToolbarButtonRegistry, type ToolbarButtonRegistry, type ToolbarButtonSpec } from './toolbar.js'

export const name = 'gwb-unit-folder'

export type { UnitSelection, PinnedDoc } from './current.js'
export type { UnitIdentity, UnitStatus } from './scan.js'
export type { ToolbarButtonSpec } from './toolbar.js'

/**
 * 浏览器半与样式表的地址，注册窗格时报给外壳。产物 `dist/index.js`、`dist/client.js`、
 * `dist/style.css` 三个是邻居，从本模块的 `import.meta.url` 算成 `file://`——内核不再
 * 替件取货，也不认识任何包名与导出名。
 */
const CLIENT_URL = new URL('./client.js', import.meta.url).href
const STYLE_URL = new URL('./style.css', import.meta.url).href

/**
 * 缺配置时回的那句话。**界面不认这段文字**，认的是结果上的 `code: 'unconfigured'`
 * ——措辞随时会改，改一次就让界面漏判一次的判据不成其为判据。
 */
const MISSING_UNITS_ROOT = '未配置单元容器根——到「设置」给单元文件夹填 units-root'

/** 选中变化时喊的那一声。载荷与 `current()` 同形；清空（眼下没有清空的口）就是 undefined */
export const SELECTION_EVENT = 'unit-folder/selection'

/**
 * 设置值 → 绝对根。**出口一律 `path.resolve`**：设置是人手填的，写个相对路径完全合理，
 * 而宿主的工作目录是应用起的时候定的、跟人心里那个「相对谁」多半不是一回事。绝对化只
 * 在这一处做，扫描那层因此只跟绝对路径打交道，回给界面的每条 `path` 也都是绝对的。
 *
 * 不是字符串、或者去掉空白之后是空的，都算**没配**（`undefined`）——**不给默认值**：
 * 容器根是这台机器的事实，编一个只会是「配置了但不在」的假象。
 */
export function rootFromSetting(raw: unknown): string | undefined {
  const dir = typeof raw === 'string' ? raw.trim() : ''
  return dir === '' ? undefined : path.resolve(dir)
}

/**
 * 消费方拿到的那一格。写 `inject: ['gwbUnitFolder']`（或局部 `ctx.inject`）才有。
 *
 * 方向是**特殊认识一般**：要知道「人现在看的是哪个单元」的件来注入本件，本件不认识
 * 任何一个消费方。要跟着选中走，`current()` 取初值、`ctx.on('unit-folder/selection', …)`
 * 听后续——两样的形状是同一个 `UnitSelection`。
 */
export interface GwbUnitFolderApi {
  /**
   * 最近一次点击（多开的格以最后一次为准）；本会话还没点过时回落到第一个置顶单元；
   * 都没有回 undefined。规则本体在 `current.ts` 的 resolveCurrent
   */
  current(): UnitSelection | undefined
  /** 置顶单元的绝对路径，按置顶先后。落在 data 文档 `pinned` 里，没装 data 件时只活在内存 */
  pinned(): string[]
  /**
   * 往单元树格的工具条里登记一颗按钮，排在自家那几颗的后面。皮在浏览器半，点击与
   * 「亮不亮」的问询都经命令总线回到登记方——形状与判据见 `toolbar.ts` 的
   * `ToolbarButtonSpec`。回注销函数；件卸载时自动摘
   */
  registerToolbarButton(spec: ToolbarButtonSpec): () => void
}

/** 总线递来的参数是 `unknown`：按对象收下，字段各自再判 */
function argsOf(args: unknown): Record<string, unknown> {
  return typeof args === 'object' && args !== null ? (args as Record<string, unknown>) : {}
}

function isDirectory(target: string): boolean {
  try {
    return fs.statSync(target).isDirectory()
  } catch {
    return false
  }
}

/** 本件用到的 data 那两面；只 import type，运行期没装 data 件这个字段就是 undefined */
type DataDocs = Pick<GwbContext['gwbData'], 'readDoc' | 'writeDoc'>

/**
 * 单元盘面数据源 + 「当前选中」服务。
 *
 * **数据源那半**：现扫容器根、逐个读出生证（`src/scan.ts`），不 spawn 任何子进程。
 * 「单元」是个纯目录约定——根下一层一个目录、里头一张 `unit.json`——所以这件事在
 * `node:fs` 上就是完整的。容器根在**设置**里（`gwbSettings.define` 声明的 `units-root`，
 * 值落 `<home>/settings.json`），条目上没有配置面：cordis.yml 的 `config`、环境变量、
 * 应用级配置，三样都没有。设置件是**局部注入**的——没装它这个件照常挂，只是读不到根，
 * 命令一律回 `unconfigured`。**每次调用现读**，不在挂载时抓一个常量下来。
 *
 * **服务那半**（`ctx.gwbUnitFolder`）：树里点了谁，浏览器半经 `unit-folder.select` 报上来，
 * 这儿记成「当前」、变了就 `emit('unit-folder/selection')`。置顶是人在树上点出来的，
 * 落 **data**（`gwbData`，局部注入）而不是设置——判据跟外壳的布局档一样：人在设置面里
 * 手填的是设置，件因人的操作自己写下的是数据。
 *
 * 写成 Service 而不是 `apply` 函数，是因为要往 ctx 上挂一个名字给别人 inject。
 * 私有字段用 TS `private` 不用 `#`：cordis 给每个消费者派生一份 `Object.create(this)`，
 * `#` 的槽不在原型链上，派生对象上一读就炸。
 */
export default class GwbUnitFolder extends Service implements GwbUnitFolderApi {
  /** 硬依赖只有这两个：外壳（没它两格没处挂）、命令总线（没它浏览器半调不到任何东西） */
  static inject = ['gwbShell', 'gwbCommands']

  /** 本会话最近一次点击；没点过是 undefined，`current()` 那时回落到置顶 */
  private clicked: UnitSelection | undefined
  /** 置顶单元的绝对路径——data 文档 `pinned` 在内存里的镜像，写时同步落盘 */
  private pinnedPaths: string[] = []
  /** 设置件的 get；没装设置件一直是 undefined */
  private settings: { get(key: string): unknown } | undefined
  /** data 件的两面；没装 data 件一直是 undefined，置顶只活在内存 */
  private data: DataDocs | undefined
  /** 「没装 data 件、置顶落不了盘」只说一次 */
  private dataWarned = false
  /** 工具条按钮表：键是 (entryId, 按钮 id)。皮经 unit-folder.toolbarButtons 取表 */
  private readonly toolbarTable: ToolbarButtonRegistry
  /** 内核事件口——登记表一变推一声，页面那侧听见重取按钮表 */
  private readonly kernel: GwbKernelApi
  private readonly log: ReturnType<GwbContext['logger']>

  constructor(ctx: GwbContext) {
    super(ctx, 'gwbUnitFolder')
    // 构造时 this.ctx 还是**提供方**自己的，logger 绑的是本件
    this.log = ctx.logger(name)
    this.kernel = requireKernel(ctx)
    this.toolbarTable = createToolbarButtonRegistry((message) => ctx.logger(name).warn(message))
  }

  [Service.init](): void {
    const ctx = this.ctx as GwbContext
    this.log.info('挂载：单元盘面数据源就绪')

    // 注册在 init 里，同步的，不用自己包 effect（服务内部挂在调用方的 effect 上了）。
    // 身份不用报——服务从 fiber 上认。两格各自报自己的浏览器半与样式表地址。
    // duplicable（并排开第二份）随 shell 0.7 的 PaneSpec 收紧被摘除——特性休眠待作者适配新 API 后恢复
    ctx.gwbShell.registerPane({
      id: 'main',
      title: '单元',
      icon: 'folder-open',
      client: CLIENT_URL,
      style: STYLE_URL,
    })
    ctx.gwbShell.registerPane({
      id: 'viewer',
      title: '文件原文',
      icon: 'file-text',
      client: CLIENT_URL,
      style: STYLE_URL,
    })
    ctx.gwbShell.describeSelf({ title: '单元文件夹', icon: 'folders' })

    /**
     * 唯一一项设置。**局部注入**：设置件不在的 home 里这个件照常挂，只是 `settings` 一直是
     * `undefined`。`define` 自己回的注销函数已经挂在调用方的 effect 上了，不用再包一层。
     * 0.3 起没有 `pinned-unit` 了——置顶是树上点出来的，落 data
     */
    ctx.inject(['gwbSettings'], (scoped) => {
      scoped.gwbSettings.define({
        key: 'units-root',
        title: '单元容器根',
        type: 'string',
        description: '装单元目录的那个根的绝对路径（如 D:\\unitfolders）：根下一层一个单元目录，各自带一张 unit.json。不填这个件的命令全都不工作',
      })
      this.settings = scoped.gwbSettings
    })

    /**
     * 置顶落盘。同样局部注入：没装 data 件置顶只活在内存，第一次要落盘时 warn 一句。
     * data 件挂上时把盘上那份读进内存；**内存里已经有值就反过来写盘**——人先点了置顶、
     * data 件后挂上的那种顺序，最近的动作是内存那份
     */
    ctx.inject(['gwbData'], (scoped) => {
      this.data = scoped.gwbData
      void (async () => {
        if (this.pinnedPaths.length > 0) {
          await this.persistPinned()
          return
        }
        const before = this.current()
        this.pinnedPaths = parsePinnedDoc(await scoped.gwbData.readDoc(PINNED_DOC))
        this.log.info(this.pinnedPaths.length === 0 ? '置顶：盘上没有' : `置顶 ${this.pinnedPaths.length} 个：${this.pinnedPaths.join('、')}`)
        this.announceIfChanged(before)
      })().catch((err: unknown) => {
        this.log.warn(`读置顶文档失败：${err instanceof Error ? err.message : String(err)}`)
      })
    })

    this.registerCommands(ctx)

    /**
     * 说明书那一格（包根的 `skills/`，随本件卸载回收）。局部注入，理由同上——说明书
     * 不是它能不能干活的前提。**`..` 相对的是产物所在的目录**：产物是 `dist/index.js`，
     * 所以包根那个 `skills/` 写作 `'../skills/'`；那个目录还得进 `package.json` 的 `files`
     */
    ctx.inject(['gwbSkills'], (scoped) => {
      scoped.effect(() => scoped.gwbSkills.register(new URL('../skills/', import.meta.url)))
    })

    this.log.info(`服务就绪（ctx.gwbUnitFolder）：current / pinned / registerToolbarButton；选中变化经 ${SELECTION_EVENT} 广播，按钮表经 unit-folder.toolbarButtons 过桥`)
  }

  current(): UnitSelection | undefined {
    return resolveCurrent(this.clicked, this.pinnedPaths)
  }

  pinned(): string[] {
    return [...this.pinnedPaths]
  }

  /**
   * 取它的是哪个件（工具条按钮的身份）。方法里的 `this.ctx` 是**消费者**的 ctx，
   * `fiber.entry` 是 loader 挂上的——跟外壳 `registerPane` 认窗格归属同一条路：
   * 身份不由登记方自己报
   */
  private toolbarOwner(): { entryId: string; pkg: string } {
    const fiber = this.ctx.fiber as unknown as { entry?: { id?: unknown; options?: { name?: unknown } } } | undefined
    const entry = fiber?.entry
    const entryId = entry?.id
    const pkg = entry?.options?.name
    if (typeof entryId !== 'string' || entryId === '' || typeof pkg !== 'string' || pkg === '') {
      throw new Error('取不到调用方的身份——ctx.gwbUnitFolder 只能在经 cordis.yml 挂上的件里用')
    }
    return { entryId, pkg }
  }

  /**
   * 登记一颗工具条按钮。收尾挂在**调用方**的 effect 上（this.ctx 在方法里是消费者的），
   * 件卸载时自动摘——忘了收的症状是「件卸了按钮还在，点了没人应」，静默的错，这层
   * 自动消掉。摘完也推一声，让页面把按钮从工具条上拿下去
   */
  registerToolbarButton(spec: ToolbarButtonSpec): () => void {
    const owner = this.toolbarOwner()
    const off = this.toolbarTable.register(owner, spec)
    this.log.info(`工具条按钮 ${spec.id}（${spec.label}）登记上了（${owner.pkg}）`)
    this.nudgeToolbar()
    this.ctx.effect(() => () => {
      off()
      this.nudgeToolbar()
    })
    return off
  }

  /** 登记表一变推这一声。页面那侧听见就重取 unit-folder.toolbarButtons */
  private nudgeToolbar(): void {
    this.kernel.emit({ t: TOOLBAR_EVENT })
  }

  /** 容器根：**用时现读**，绝对化归 `rootFromSetting` 一处 */
  private resolveUnitsRoot(): string | undefined {
    return rootFromSetting(this.settings?.get('units-root'))
  }

  /**
   * 带路径参数的命令共用的那堵墙：**每条都先解 `units-root`、再把参数路径验成根内的
   * 绝对路径**（见 browse.ts 的 resolveInside）。命令总线对外暴露，参数不能默认是界面
   * 自己递来的那份清单上的。
   */
  private withTarget(args: unknown, run: (root: string, target: string) => unknown): unknown {
    const root = this.resolveUnitsRoot()
    if (root === undefined) return { ok: false, code: 'unconfigured', error: MISSING_UNITS_ROOT }
    const requested = argsOf(args).path
    const target = resolveInside(root, requested)
    if (target === null) return { ok: false, error: `路径不在容器根内：${String(requested)}` }
    return run(root, target)
  }

  /**
   * `current()` 的值变了就喊一声。点击与置顶两条路都经这儿：置顶在没点过时改变的是
   * 回落值，消费方看到的「当前」一样变了，所以也要喊
   */
  private announceIfChanged(before: UnitSelection | undefined): void {
    const after = this.current()
    if (before?.path === after?.path) return
    // 提供方自己的 ctx 上 emit：事件是全局派发的，谁 on 了都收得到
    ;(this.ctx as GwbContext).emit(SELECTION_EVENT, after)
  }

  /** 内存里那份写回盘。没装 data 件只 warn 一次，不抛——置顶照样在本次会话里生效 */
  private async persistPinned(): Promise<void> {
    if (this.data === undefined) {
      if (!this.dataWarned) {
        this.dataWarned = true
        this.log.warn('没装 data 件（gwbData），置顶只活在内存，重启即忘')
      }
      return
    }
    await this.data.writeDoc(PINNED_DOC, { paths: this.pinnedPaths })
  }

  /** 换一张置顶表：变了才落盘，`current()` 的回落值跟着变了就广播 */
  private setPinned(next: string[]): Promise<void> {
    const before = this.current()
    this.pinnedPaths = next
    this.announceIfChanged(before)
    return this.persistPinned()
  }

  private registerCommands(ctx: GwbContext): void {
    const cli = ctx.gwbCommands
    // inject 保证了它在，这句只是把类型收窄。**每条都包 ctx.effect**：register 回的是
    // 注销函数，不包的话条目停了、fiber 灭了，名字还留在表上
    if (cli === undefined) return
    const register = (def: Omit<GwbCommandDef, 'plugin'>, handler: Parameters<typeof cli.register>[1]): void => {
      ctx.effect(() => cli.register({ ...def, plugin: '@godcreator/gwb-unit-folder' }, handler))
    }

    register(
      {
        name: 'unit-folder.list',
        description: '现扫单元容器，回全部单元清单',
        usage: '认领过的按 kind 分组（出生证读不出的带 reason 落 unidentified）、另带 pinned：置顶的单元条目数组，按置顶先后。置顶了但目录已不在的，这一趟顺手从置顶表里摘掉并落盘。无参数',
      },
      async () => {
        const root = this.resolveUnitsRoot()
        if (root === undefined) return { ok: false, code: 'unconfigured', error: MISSING_UNITS_ROOT }
        const started = Date.now()
        const outcome = takeInventory(root)
        // 扫不动是真出岔子（根指到文件、没权限、盘掉了），如实报错；根不存在不走这条，
        // 它带着 rootExists: false 从成功那一支出去
        if (!outcome.ok) {
          this.log.warn(`unit-folder.list 扫不动：${outcome.error}`)
          return { ok: false, error: outcome.error }
        }
        const total = outcome.data.byKind.reduce((n, g) => n + g.units.length, 0) + outcome.data.unidentified.length
        this.log.info(`unit-folder.list 结束：${total} 个单元，耗时 ${Date.now() - started}ms`)
        const pinned = findPinned(outcome.data, this.pinnedPaths)
        if (pinned.gone.length > 0) {
          this.log.info(`置顶里 ${pinned.gone.length} 个单元已不在，摘掉：${pinned.gone.join('、')}`)
          let next = this.pinnedPaths
          for (const p of pinned.gone) next = removePinned(next, p)
          await this.setPinned(next)
        }
        return { ok: true, data: { ...outcome.data, pinned: pinned.entries } }
      },
    )

    register(
      {
        name: 'unit-folder.create',
        description: '在容器根下建一个新单元：算目录名、建目录、写出生证 unit.json',
        usage:
          '参数 { kind, title, purpose, icon, status? }，全是非空字符串。kind 是中文种类短词（先 unit-folder.list 看已有的种类，能归进去就别造新词）；title 是树里显示的短名；purpose 写厚一点——这个单元是什么、为什么存在、边界在哪、跟谁不是一回事；icon 是 lucide 图标名，kebab-case（https://lucide.dev/icons ，如 puzzle / book-open / server）；status 是 active / paused / retired，省了是 active。目录名 yyMMddHH + 三个小写字母，撞名重摇；createdAt 由本件填。到 unit.json 为止，仓与文档站交给目标线自己的工具。回 { name, path, identity }',
      },
      (args) => {
        const root = this.resolveUnitsRoot()
        if (root === undefined) return { ok: false, code: 'unconfigured', error: MISSING_UNITS_ROOT }
        const a = argsOf(args)
        const outcome = createUnit(root, { kind: a.kind, title: a.title, purpose: a.purpose, icon: a.icon, status: a.status })
        if (outcome.ok) this.log.info(`建了单元 ${outcome.data.name}（${outcome.data.identity.kind}：${outcome.data.identity.title}）`)
        else this.log.warn(`建单元没成：${outcome.error}`)
        return outcome
      },
    )

    register(
      {
        name: 'unit-folder.toolbarButtons',
        description: '此刻有哪些件往单元树格的工具条里登记了按钮',
        usage: '浏览器半取表用，人一般不调。无参数',
      },
      () => ({ ok: true, data: { buttons: this.toolbarTable.list() } }),
    )

    register(
      {
        name: 'unit-folder.listDir',
        description: '列容器根内一个目录的一层（不递归）',
        usage: '参数 { path: string }——要列的目录，容器根内的绝对路径',
      },
      (args) =>
        this.withTarget(args, (_root, target) => {
          // 信封形状归口 GwbResult：data 才是载荷的位置，outcome 原样出去客户端读不到
          const outcome = listDir(target)
          return outcome.ok ? { ok: true, data: { entries: outcome.entries } } : outcome
        }),
    )

    register(
      {
        name: 'unit-folder.readFile',
        description: '读容器根内一个文件的原文（截断预览）',
        usage: '参数 { path: string }——要读的文件，容器根内的绝对路径',
      },
      (args) => this.withTarget(args, (_root, target) => readFilePreview(target)),
    )

    register(
      {
        name: 'unit-folder.open',
        description: '在资源管理器里打开容器根内一个目录',
        usage: '参数 { path: string }——要打开的目录，容器根内的绝对路径',
      },
      (args) =>
        this.withTarget(args, (_root, target) => {
          // explorer.exe 成功时退出码也可能是 1，不看成败——成败以「进程起没起得来」计
          const child = spawn('explorer.exe', [target], { detached: true, stdio: 'ignore' })
          child.on('error', (err) => this.log.warn(`资源管理器起不来：${err.message}`))
          child.unref()
          return { ok: true }
        }),
    )

    register(
      {
        name: 'unit-folder.code',
        description: '用 VSCode 新窗口打开容器根内一个目录（code -n）',
        usage: '参数 { path: string }——要打开的目录，容器根内的绝对路径',
      },
      (args) =>
        this.withTarget(args, (_root, target) => {
          // code 是 PATH 上的 .cmd，直接 spawn 会被 Node 挡（EINVAL），走 shell 转一道。
          // **命令拼成单条字符串**再交给 shell——args 数组 + shell:true 会吃 DEP0190 告警。
          // -n = 新窗口；同 explorer：成败以「进程起没起得来」计，code 不在 PATH 时
          // cmd 报「不是内部或外部命令」进不了 error 事件——那算环境没装，日志见不了
          const child = spawn(`code -n "${target}"`, { shell: true, detached: true, stdio: 'ignore' })
          child.on('error', (err) => this.log.warn(`VSCode 起不来：${err.message}`))
          child.unref()
          return { ok: true }
        }),
    )

    // ── 选中与置顶：服务面的命令入口 ────────────────────────────────────────────

    register(
      {
        name: 'unit-folder.select',
        description: '报一次选中（树里点行，agent 也能调）',
        usage: '参数 { path: string }——点的那个目录，容器根内的绝对路径。回 { unitPath, unitName, path }，并在 current() 变了时广播 unit-folder/selection',
      },
      (args) =>
        this.withTarget(args, (root, target) => {
          const selection = selectionFor(root, target)
          if (selection === null) return { ok: false, error: `算不出所属单元：${target}` }
          const before = this.current()
          this.clicked = selection
          this.log.info(`选中 ${selection.unitName}${selection.path === selection.unitPath ? '' : `（${selection.path}）`}`)
          this.announceIfChanged(before)
          return { ok: true, data: selection }
        }),
    )

    register(
      {
        name: 'unit-folder.current',
        description: '此刻的「当前单元」',
        usage: '最近一次点击，没点过回落到第一个置顶单元，都没有 data 是 null。回 { unitPath, unitName, path } | null。无参数',
      },
      () => ({ ok: true, data: this.current() ?? null }),
    )

    register(
      {
        name: 'unit-folder.pin',
        description: '把一个单元加进置顶（清单最上那块「置顶」，可以有多个）',
        usage: '参数 { path: string }——单元目录，必须是容器根下一层；追加到置顶表末尾，已经置顶的不挪位置；落 data 文档 pinned（{ paths }）。不改最近一次点击。回 { paths }',
      },
      (args) =>
        this.withTarget(args, (root, target) => {
          if (!isUnitDir(root, target)) return { ok: false, error: `置顶只认单元目录（容器根下一层）：${target}` }
          if (!isDirectory(target)) return { ok: false, error: `不是目录：${target}` }
          this.log.info(`置顶 ${path.basename(target)}`)
          // registry.run 会 await 这个 promise，落盘的成败进回执
          return this.setPinned(addPinned(this.pinnedPaths, target)).then(() => ({ ok: true, data: { paths: this.pinned() } }))
        }),
    )

    register(
      {
        name: 'unit-folder.unpin',
        description: '把一个单元从置顶里摘掉',
        usage: '参数 { path: string }——要摘的单元目录，容器根内的绝对路径；不在置顶表里也回 ok。回 { paths }',
      },
      (args) =>
        this.withTarget(args, (_root, target) => {
          this.log.info(`取消置顶 ${path.basename(target)}`)
          return this.setPinned(removePinned(this.pinnedPaths, target)).then(() => ({ ok: true, data: { paths: this.pinned() } }))
        }),
    )
  }
}

declare module 'cordis' {
  interface Context {
    gwbUnitFolder: GwbUnitFolderApi
  }
  interface Events {
    'unit-folder/selection'(selection: UnitSelection | undefined): void
  }
}
