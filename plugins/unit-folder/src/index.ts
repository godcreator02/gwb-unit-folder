import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { Service } from 'cordis'
import type { GwbContext, GwbKernelApi } from '@godcreator/gwb-kernel-desktop'
import { requireKernel } from './vocab.js'
// 只为让这几个插件的 `declare module 'cordis'` 生效——它们给 ctx 加上各自的服务名
import type { GwbCommandDef } from '@godcreator/gwb-commands'
import type {} from '@godcreator/gwb-data'
import type {} from '@godcreator/gwb-shell'
import type {} from '@godcreator/gwb-skills'
import type {} from '@godcreator/gwb-settings'
import { listDir, readFilePreview, resolveInside } from './browse.js'
import { takeInventory } from './scan.js'
import { createUnit } from './create.js'
import {
  addPinned,
  findPinned,
  isUnitDir,
  isUnitListed,
  parsePinnedDoc,
  PINNED_DOC,
  removePinned,
  resolveCurrent,
  selectExistingDir,
  type UnitSelection,
} from './current.js'
import { locateCodeExe } from './vscode.js'
import { TOOLBAR_EVENT, createToolbarButtonRegistry, type ToolbarButtonRegistry, type ToolbarButtonSpec } from './toolbar.js'

export const name = 'gwb-unit-folder'

export type { UnitSelection, PinnedDoc } from './current.js'
export type { UnitIdentity, UnitStatus } from './scan.js'
export type { ToolbarButtonSpec } from './toolbar.js'

/**
 * 浏览器侧代码与样式表的地址，注册窗格时报给外壳。产物 `dist/index.js`、`dist/client.js`、
 * `dist/style.css` 在同一个目录，从本模块的 `import.meta.url` 算成 `file://`——内核不替插件
 * 找文件，也不认识任何包名与导出名。
 */
const CLIENT_URL = new URL('./client.js', import.meta.url).href
const STYLE_URL = new URL('./style.css', import.meta.url).href

/**
 * 缺配置时回的那句话。**界面不认这段文字**，认的是结果上的 `code: 'unconfigured'`
 * ——措辞随时会改，界面按文字判断的话，改一次措辞就漏判一次。
 */
const MISSING_UNITS_ROOT = '未配置单元容器根——到「设置」给单元文件夹填 units-root'

/** 选中变化时广播的事件名。载荷与 `current()` 同形；变成没有「当前」时是 undefined */
export const SELECTION_EVENT = 'unit-folder/selection'

/**
 * 设置值 → 绝对根。**返回值一律经 `path.resolve`**：设置是人手填的，写个相对路径完全合理，
 * 而宿主的工作目录是应用启动时定的、跟人心里那个「相对谁」多半不是一回事。绝对化只
 * 在这一处做，扫描那层因此只跟绝对路径打交道，回给界面的每条 `path` 也都是绝对的。
 *
 * 不是字符串、或者去掉空白之后是空的，都算**没配**（`undefined`）——**不给默认值**：
 * 容器根是这台机器的事实，编一个只会造成「配置了但不在」的假象。
 */
export function rootFromSetting(raw: unknown): string | undefined {
  const dir = typeof raw === 'string' ? raw.trim() : ''
  return dir === '' ? undefined : path.resolve(dir)
}

/**
 * 消费方拿到的服务。写 `inject: ['gwbUnitFolder']`（或局部 `ctx.inject`）才有。
 *
 * 方向是**特殊认识一般**：要知道「人现在看的是哪个单元」的插件来注入本插件，本插件不认识
 * 任何一个消费方。要跟着选中走，`current()` 取初值、`ctx.on('unit-folder/selection', …)`
 * 听后续——两样的形状是同一个 `UnitSelection`。
 */
export interface GwbUnitFolderApi {
  /**
   * 最近一次点击（开了多个单元树窗格时以最后一次为准）；本会话还没点过时回落到第一个置顶单元；
   * 都没有回 undefined。规则本体在 `current.ts` 的 resolveCurrent
   */
  current(): UnitSelection | undefined
  /** 置顶单元的绝对路径，按置顶先后。存在 data 文档 `pinned` 里，没装数据插件时只存在内存里 */
  pinned(): string[]
  /**
   * 往单元树窗格的工具条里登记一个按钮，排在本插件自己那几个按钮的后面。按钮画在浏览器侧，
   * 点击与「可不可用」的询问都经命令总线回到登记方——形状与判据见 `toolbar.ts` 的
   * `ToolbarButtonSpec`。回注销函数；登记方卸载时自动注销
   */
  registerToolbarButton(spec: ToolbarButtonSpec): () => void
}

/** 命令总线传来的参数是 `unknown`：按对象收下，字段各自再判 */
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

/** 本插件用到的数据插件的两个方法；只 import type，运行时没装数据插件这个字段就是 undefined */
type DataDocs = Pick<GwbContext['gwbData'], 'readDoc' | 'writeDoc'>

/**
 * 单元清单的数据源 + 「当前选中」服务。
 *
 * **数据源**：现扫容器根、逐个读出生证（`src/scan.ts`），不启动任何子进程。
 * 「单元」是个纯目录约定——根下一层一个目录、里头一张 `unit.json`——所以这件事只用
 * `node:fs` 就能做完。容器根在**设置**里（`gwbSettings.define` 声明的 `units-root`，
 * 值存在 `<home>/settings.json`），条目上没有配置：cordis.yml 的 `config`、环境变量、
 * 应用级配置，三样都没有。设置插件是**局部注入**的——没装它本插件照常加载，只是读不到根，
 * 命令一律回 `unconfigured`。**每次调用现读**，不在加载时读一次存成常量。
 *
 * **服务**（`ctx.gwbUnitFolder`）：树里点了谁，浏览器侧经 `unit-folder.select` 报上来，
 * 这儿记成「当前」、变了就 `emit('unit-folder/selection')`。置顶是人在树上点出来的，
 * 存进 **data**（`gwbData`，局部注入）而不是设置——判据跟外壳把布局存进 data 一样：人在设置界面里
 * 手填的是设置，插件因人的操作自己写下的是数据。
 *
 * 写成 Service 而不是 `apply` 函数，是因为要往 ctx 上提供一个服务名给别人 inject。
 * 私有字段用 TS `private` 不用 `#`：cordis 给每个消费者派生一份 `Object.create(this)`，
 * `#` 字段不在原型链上，在派生对象上一读就抛错。
 */
export default class GwbUnitFolder extends Service implements GwbUnitFolderApi {
  /** 必需依赖只有这两个：外壳（没它两个窗格没处注册）、命令总线（没它浏览器侧调不到任何东西） */
  static inject = ['gwbShell', 'gwbCommands']

  /** 本会话最近一次点击；没点过是 undefined，`current()` 那时回落到置顶 */
  private clicked: UnitSelection | undefined
  /** 置顶单元的绝对路径——data 文档 `pinned` 在内存里的副本，写时同步存盘 */
  private pinnedPaths: string[] = []
  /** 设置插件的 get；设置插件不在时是 undefined */
  private settings: { get(key: string): unknown } | undefined
  /** 数据插件的两个方法；数据插件不在时是 undefined，置顶只存在内存里 */
  private data: DataDocs | undefined
  /** 「没装数据插件、置顶存不了盘」只提示一次 */
  private dataWarned = false
  /**
   * VSCode 可执行文件路径的缓存：undefined 还没找过，null 找过没有，字符串找到了。
   * 一次加载期内复用——中途装了 VSCode 要重新加载才认，比每条命令都启动一次
   * `where` 划算
   */
  private codeExe: string | null | undefined
  /** 工具条按钮表：键是 (entryId, 按钮 id)。浏览器侧经 unit-folder.toolbarButtons 取表 */
  private readonly toolbarTable: ToolbarButtonRegistry
  /** 内核事件接口——登记表一变就推一条事件，页面收到后重取按钮表 */
  private readonly kernel: GwbKernelApi
  private readonly log: ReturnType<GwbContext['logger']>

  constructor(ctx: GwbContext) {
    super(ctx, 'gwbUnitFolder')
    // 构造时 this.ctx 还是**提供方**自己的，logger 绑的是本插件
    this.log = ctx.logger(name)
    this.kernel = requireKernel(ctx)
    this.toolbarTable = createToolbarButtonRegistry((message) => ctx.logger(name).warn(message))
  }

  [Service.init](): void {
    const ctx = this.ctx as GwbContext
    this.log.info('加载：单元清单数据源就绪')

    // 注册在 init 里，同步的，不用自己包 effect（外壳的服务把注销登记在调用方的 effect 上）。
    // 身份不用报——服务从 fiber 上认。两个窗格各自报自己的浏览器侧代码与样式表地址。
    // main（单元树）不写 kind，缺省是工具窗格、整页一份；viewer（原文）是文档窗格——能多开，
    // 一份装一个文件（key 是文件绝对路径，见 client/open-file.ts）
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
      kind: 'document',
      client: CLIENT_URL,
      style: STYLE_URL,
    })
    ctx.gwbShell.describeSelf({ title: '单元文件夹', icon: 'folders' })

    /**
     * 唯一一项设置。**局部注入**：设置插件不在的 home 里本插件照常加载，只是 `settings` 是
     * `undefined`。`define` 自己回的注销函数已经登记在调用方的 effect 上了，不用再包一层。
     * 设置插件卸载时 `settings` 设回 undefined，不留着一个已卸载插件的方法
     */
    ctx.inject(['gwbSettings'], (scoped) => {
      scoped.gwbSettings.define({
        key: 'units-root',
        title: '单元容器根',
        type: 'string',
        description: '装单元目录的那个根的绝对路径（如 D:\\unitfolders）：根下一层一个单元目录，各自带一张 unit.json。不填这个插件的命令全都不工作',
      })
      this.settings = scoped.gwbSettings
      scoped.effect(() => () => {
        this.settings = undefined
      })
    })

    /**
     * 置顶存盘。同样局部注入：没装数据插件时置顶只存在内存里，第一次要存盘时 warn 一句。
     * 数据插件加载时把盘上那份读进内存；**内存里已经有值就反过来写盘**——人先点了置顶、
     * 数据插件后加载的那种顺序，最近的动作是内存那份。数据插件卸载时 `data` 设回 undefined
     */
    ctx.inject(['gwbData'], (scoped) => {
      this.data = scoped.gwbData
      scoped.effect(() => () => {
        this.data = undefined
      })
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
     * 说明书（包根的 `skills/`，随本插件卸载注销）。局部注入，理由同上——说明书
     * 不是它能不能干活的前提。**`..` 相对的是产物所在的目录**：产物是 `dist/index.js`，
     * 所以包根那个 `skills/` 写作 `'../skills/'`；那个目录还得进 `package.json` 的 `files`
     */
    ctx.inject(['gwbSkills'], (scoped) => {
      scoped.effect(() => scoped.gwbSkills.register(new URL('../skills/', import.meta.url)))
    })

    this.log.info(`服务就绪（ctx.gwbUnitFolder）：current / pinned / registerToolbarButton；选中变化经 ${SELECTION_EVENT} 广播，按钮表经 unit-folder.toolbarButtons 交给浏览器侧`)
  }

  current(): UnitSelection | undefined {
    return resolveCurrent(this.clicked, this.pinnedPaths)
  }

  pinned(): string[] {
    return [...this.pinnedPaths]
  }

  /**
   * 调用它的是哪个插件（工具条按钮的身份）。方法里的 `this.ctx` 是**消费者**的 ctx，
   * `fiber.entry` 是 loader 设上的——跟外壳 `registerPane` 认窗格归属同一个办法：
   * 身份不由登记方自己报
   */
  private toolbarOwner(): { entryId: string; pkg: string } {
    const fiber = this.ctx.fiber as unknown as { entry?: { id?: unknown; options?: { name?: unknown } } } | undefined
    const entry = fiber?.entry
    const entryId = entry?.id
    const pkg = entry?.options?.name
    if (typeof entryId !== 'string' || entryId === '' || typeof pkg !== 'string' || pkg === '') {
      throw new Error('取不到调用方的身份——ctx.gwbUnitFolder 只能在经 cordis.yml 加载的插件里用')
    }
    return { entryId, pkg }
  }

  /**
   * 登记一个工具条按钮。注销登记在**调用方**的 effect 上（this.ctx 在方法里是消费者的），
   * 登记方卸载时自动注销——忘了注销的症状是「插件卸了按钮还在，点了没有反应」，不报错，
   * 这里替调用方做掉。注销完也推一条事件，让页面把按钮从工具条上拿掉
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

  /** 登记表一变就推这条事件。页面收到后重取 unit-folder.toolbarButtons */
  private nudgeToolbar(): void {
    this.kernel.emit({ t: TOOLBAR_EVENT })
  }

  /** 容器根：**用时现读**，绝对化只在 `rootFromSetting` 一处 */
  private resolveUnitsRoot(): string | undefined {
    return rootFromSetting(this.settings?.get('units-root'))
  }

  /**
   * 带路径参数的命令共用的路径检查：**每条都先解 `units-root`、再把参数路径验成根内的
   * 绝对路径**（见 browse.ts 的 resolveInside）。命令总线对外开放，不能假定参数一定是界面
   * 从自己的清单里传来的。
   */
  private withTarget(args: unknown, run: (root: string, target: string) => unknown): unknown {
    const root = this.resolveUnitsRoot()
    if (root === undefined) return { ok: false, code: 'unconfigured', error: MISSING_UNITS_ROOT }
    const requested = argsOf(args).path
    const target = resolveInside(root, requested)
    if (target === null) return { ok: false, error: `路径不在容器根内：${String(requested)}` }
    return run(root, target)
  }

  /** VSCode 可执行文件，见 `vscode.ts`；找不到回 null，由调用方明说打不开，不改用别的办法 */
  private resolveCodeExe(): string | null {
    if (this.codeExe === undefined) this.codeExe = locateCodeExe()
    return this.codeExe
  }

  /**
   * `current()` 的值变了就广播一次。点击、置顶、清掉已删单元几条路都经这儿：置顶在没点过时改变的是
   * 回落值，消费方看到的「当前」一样变了，所以也要广播
   */
  private announceIfChanged(before: UnitSelection | undefined): void {
    const after = this.current()
    if (before?.path === after?.path) return
    // 在提供方自己的 ctx 上 emit：事件是全局派发的，谁 on 了都收得到
    ;(this.ctx as GwbContext).emit(SELECTION_EVENT, after)
  }

  /** 内存里那份写回盘。没装数据插件只 warn 一次，不抛——置顶照样在本次会话里生效 */
  private async persistPinned(): Promise<void> {
    if (this.data === undefined) {
      if (!this.dataWarned) {
        this.dataWarned = true
        this.log.warn('没装数据插件（gwbData），置顶只存在内存里，重启就没了')
      }
      return
    }
    await this.data.writeDoc(PINNED_DOC, { paths: this.pinnedPaths })
  }

  /** 换一张置顶表并存盘，`current()` 的回落值跟着变了就广播 */
  private setPinned(next: string[]): Promise<void> {
    const before = this.current()
    this.pinnedPaths = next
    this.announceIfChanged(before)
    return this.persistPinned()
  }

  private registerCommands(ctx: GwbContext): void {
    const cli = ctx.gwbCommands
    // inject 保证了它在，这句只是把类型收窄。**每条都包 ctx.effect**：register 回的是
    // 注销函数，不包的话条目停了、fiber 销毁了，名字还留在表上
    if (cli === undefined) return
    const register = (def: Omit<GwbCommandDef, 'plugin'>, handler: Parameters<typeof cli.register>[1]): void => {
      ctx.effect(() => cli.register({ ...def, plugin: '@godcreator/gwb-unit-folder' }, handler))
    }

    register(
      {
        name: 'unit-folder.list',
        description: '现扫单元容器，回全部单元清单',
        usage: '认领过的按 kind 分组（出生证读不出的带 reason 落 unidentified）、另带 pinned：置顶的单元条目数组，按置顶先后。置顶了但目录已不在的，这一次顺手从置顶表里摘掉并存盘；最近一次点击的单元已不在的，清掉这次点击并广播 unit-folder/selection。无参数',
      },
      async () => {
        const root = this.resolveUnitsRoot()
        if (root === undefined) return { ok: false, code: 'unconfigured', error: MISSING_UNITS_ROOT }
        const started = Date.now()
        const outcome = takeInventory(root)
        // 扫不动是真出错（根指到文件、没权限、盘掉了），如实报错；根不存在不走这条，
        // 它带着 rootExists: false 从成功那一支出去
        if (!outcome.ok) {
          this.log.warn(`unit-folder.list 扫不动：${outcome.error}`)
          return { ok: false, error: outcome.error }
        }
        const total = outcome.data.byKind.reduce((n, g) => n + g.units.length, 0) + outcome.data.unidentified.length
        this.log.info(`unit-folder.list 结束：${total} 个单元，耗时 ${Date.now() - started}ms`)
        const pinned = findPinned(outcome.data, this.pinnedPaths)
        const clickedGone = this.clicked !== undefined && !isUnitListed(outcome.data, this.clicked.unitPath)
        if (pinned.gone.length > 0 || clickedGone) {
          // 两样一起清完再判一次变没变：同一次扫描只广播一次
          const before = this.current()
          if (clickedGone) {
            this.log.info(`最近一次点击的单元已不在，清掉：${this.clicked?.unitPath ?? ''}`)
            this.clicked = undefined
          }
          if (pinned.gone.length > 0) {
            this.log.info(`置顶里 ${pinned.gone.length} 个单元已不在，摘掉：${pinned.gone.join('、')}`)
            let next = this.pinnedPaths
            for (const p of pinned.gone) next = removePinned(next, p)
            this.pinnedPaths = next
          }
          this.announceIfChanged(before)
          if (pinned.gone.length > 0) await this.persistPinned()
        }
        return { ok: true, data: { ...outcome.data, pinned: pinned.entries } }
      },
    )

    register(
      {
        name: 'unit-folder.create',
        description: '在容器根下建一个新单元：算目录名、建目录、写出生证 unit.json',
        usage:
          '参数 { kind, title, purpose, icon, status?, slug? }，前四项非空字符串。kind 是中文种类短词（先 unit-folder.list 看已有的种类，能归进去就别造新词）；title 是树里显示的短名；purpose 是它唯一的自述，一句话说清这个单元是什么、干什么，容易跟谁混就点一句（不写历史、版本沿革、已完成的任务清单）；icon 是 lucide 图标名，kebab-case（https://lucide.dev/icons ，如 puzzle / book-open / server）；status 是 active / paused / retired，省了是 active；slug 是目录名里的功能名——小写字母数字、段间用单个连字符（如 gwb-test），省了目录名就只有随机段。目录名 <五位随机小写字母数字>-<slug>，撞名重摇；createdAt 由本插件填——时间不进目录名。到 unit.json 为止，仓与文档站交给目标线自己的工具。回 { name, path, identity }',
      },
      (args) => {
        const root = this.resolveUnitsRoot()
        if (root === undefined) return { ok: false, code: 'unconfigured', error: MISSING_UNITS_ROOT }
        const a = argsOf(args)
        const outcome = createUnit(root, { kind: a.kind, title: a.title, purpose: a.purpose, icon: a.icon, status: a.status, slug: a.slug })
        if (outcome.ok) this.log.info(`建了单元 ${outcome.data.name}（${outcome.data.identity.kind}：${outcome.data.identity.title}）`)
        else this.log.warn(`建单元没成：${outcome.error}`)
        return outcome
      },
    )

    register(
      {
        name: 'unit-folder.toolbarButtons',
        description: '此刻有哪些插件往单元树窗格的工具条里登记了按钮',
        usage: '浏览器侧取表用，人一般不调。无参数',
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
          // 回执形状统一是 GwbResult：载荷放在 data 里，outcome 原样回出去客户端读不到
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
        usage: '参数 { path: string }——要打开的目录，容器根内的绝对路径，必须已存在',
      },
      (args) =>
        this.withTarget(args, (_root, target) => {
          // explorer 本来就不认「打开一个不存在的目录」，与其让它弹错误框，这里先说明白
          if (!isDirectory(target)) return { ok: false, error: `不是目录：${target}` }
          // explorer.exe 成功时退出码也可能是 1，不看退出码——成败以「进程能不能启动」计
          const child = spawn('explorer.exe', [target], { detached: true, stdio: 'ignore' })
          child.on('error', (err) => this.log.warn(`资源管理器启动失败：${err.message}`))
          child.unref()
          return { ok: true }
        }),
    )

    register(
      {
        name: 'unit-folder.code',
        description: '用 VSCode 新窗口打开容器根内一个目录（code -n）',
        usage:
          '参数 { path: string }——要打开的目录，容器根内的绝对路径，必须已存在。找不到 VSCode 可执行入口（PATH 上没有 code）时回失败，不改用别的办法',
      },
      (args) =>
        this.withTarget(args, (_root, target) => {
          if (!isDirectory(target)) return { ok: false, error: `不是目录：${target}` }
          const codeExe = this.resolveCodeExe()
          if (codeExe === null) {
            this.log.warn('找不到 VSCode 的可执行入口：PATH 上没有 code，也推不出 Code.exe')
            return { ok: false, error: '找不到 VSCode 的可执行入口——PATH 上没有 code，装好再来' }
          }
          // Code.exe 是真 exe：不开 shell、独立 argv，target 只是路径，不再是命令文本
          // （拼 `code -n "…"` 交给 cmd 的话，路径里的引号、百分号都是合法文件名字符，
          // 却会被命令解释器解释；而 spawn .cmd 又必须开 shell，所以改为找 Code.exe 本身）。
          // -n = 新窗口；同 explorer：成败以「进程能不能启动」计
          const child = spawn(codeExe, ['-n', target], { detached: true, stdio: 'ignore' })
          child.on('error', (err) => this.log.warn(`VSCode 启动失败：${err.message}`))
          child.unref()
          return { ok: true }
        }),
    )

    // ── 选中与置顶：服务的命令入口 ────────────────────────────────────────────

    register(
      {
        name: 'unit-folder.select',
        description: '报一次选中（树里点行，agent 也能调）',
        usage:
          '参数 { path: string }——点的那个目录，容器根内的绝对路径，必须已存在（不存在直接回失败）。回 { unitPath, unitName, path }，并在 current() 变了时广播 unit-folder/selection',
      },
      (args) =>
        this.withTarget(args, (root, target) => {
          const outcome = selectExistingDir(root, target, isDirectory)
          if (!outcome.ok) return outcome
          const selection = outcome.data
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
        usage: '参数 { path: string }——单元目录，必须是容器根下一层；追加到置顶表末尾，已经置顶的不挪位置；存进 data 文档 pinned（{ paths }）。不改最近一次点击。回 { paths }',
      },
      (args) =>
        this.withTarget(args, (root, target) => {
          if (!isUnitDir(root, target)) return { ok: false, error: `置顶只认单元目录（容器根下一层）：${target}` }
          if (!isDirectory(target)) return { ok: false, error: `不是目录：${target}` }
          this.log.info(`置顶 ${path.basename(target)}`)
          // registry.run 会 await 这个 promise，存盘的成败进回执
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
