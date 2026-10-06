import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { Service } from 'cordis'
import type { GwbContext, GwbKernelApi } from '@godcreator/gwb-kernel-desktop'
import { requireKernel } from './vocab.js'
// 只为让这几个插件的 `declare module 'cordis'` 生效：它们给 ctx 补上各自的服务名
import type { GwbCommandDef, GwbCommandHandler } from '@godcreator/gwb-commands'
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

/** 浏览器侧代码与样式表的 `file://` 地址，注册窗格时报给外壳；三个产物在同一个 `dist/` 目录 */
const CLIENT_URL = new URL('./client.js', import.meta.url).href
const STYLE_URL = new URL('./style.css', import.meta.url).href

/** 缺配置时回的那句话。界面认的是回执上的 `code: 'unconfigured'`，不认这段文字 */
const MISSING_UNITS_ROOT = '未配置单元容器根——到「设置」给单元文件夹填 units-root'

/** 选中变化时广播的事件名。载荷与 `current()` 同形；变成没有「当前」时是 undefined */
export const SELECTION_EVENT = 'unit-folder/selection'

/**
 * 设置值 → 容器根的绝对路径，绝对化只在这一处做。不是字符串、或去掉空白之后是空的，都算没配（undefined），
 * 不给默认值
 */
export function rootFromSetting(raw: unknown): string | undefined {
  const dir = typeof raw === 'string' ? raw.trim() : ''
  return dir === '' ? undefined : path.resolve(dir)
}

/**
 * 消费方拿到的服务，写 `inject: ['gwbUnitFolder']`（或局部 `ctx.inject`）才有。要跟着选中走，
 * `current()` 取初值、`ctx.on('unit-folder/selection', …)` 听后续——两样的形状是同一个 `UnitSelection`
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
  /** 容器根的绝对路径，每次从设置 `units-root` 现读；没配、或设置插件不在时回 undefined */
  unitsRoot(): string | undefined
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

/** 本插件用到的数据插件的两个方法；只 import type，没装数据插件时这个字段是 undefined */
type DataDocs = Pick<GwbContext['gwbData'], 'readDoc' | 'writeDoc'>

/**
 * 单元清单的数据源，加上服务 `ctx.gwbUnitFolder`：记下树里点了谁、变了就广播 `unit-folder/selection`，
 * 置顶存进数据插件的文档 `pinned`。容器根每次调用时从设置 `units-root` 现读。
 * 私有字段用 TS 的 `private` 不用 `#`：cordis 给每个消费方派生 `Object.create(this)`，`#` 字段在派生对象上一读就抛错
 */
export default class GwbUnitFolder extends Service implements GwbUnitFolderApi {
  /** 必需依赖只有这两个：外壳（注册两个窗格）、命令总线（浏览器侧只经它通信） */
  static inject = ['gwbShell', 'gwbCommands']

  /** 本会话最近一次点击；没点过是 undefined，`current()` 那时回落到置顶 */
  private clickedSelection: UnitSelection | undefined
  /** 置顶单元的绝对路径：data 文档 `pinned` 在内存里的副本，改了就同步存盘 */
  private pinnedPaths: string[] = []
  /**
   * 读本插件分区里 `units-root` 的原值；设置插件不在时是 undefined。
   * 存成闭包、不存设置服务对象：别的插件经服务调进来时，方法里经 `this` 读到的服务对象会被 cordis 重新绑到调用方，
   * `get` 就读成调用方自己的分区
   */
  private readUnitsRootSetting: (() => unknown) | undefined
  /** 数据插件的两个方法；数据插件不在时是 undefined，置顶只存在内存里 */
  private data: DataDocs | undefined
  /** 「没装数据插件、置顶存不了盘」只提示一次 */
  private missingDataPluginWarned = false
  /**
   * VSCode 可执行文件路径的缓存：undefined 还没找过，null 找过没有，字符串找到了。
   * 一次加载期内复用，中途装了 VSCode 要重新加载本插件才认
   */
  private codeExePath: string | null | undefined
  /** 工具条按钮表：键是 (entryId, 按钮 id)。浏览器侧经 unit-folder.toolbarButtons 取表 */
  private readonly toolbarButtons: ToolbarButtonRegistry
  /** 内核接口：登记表一变就经它推一条内核事件，页面收到后重取按钮表 */
  private readonly kernel: GwbKernelApi
  private readonly log: ReturnType<GwbContext['logger']>

  constructor(ctx: GwbContext) {
    super(ctx, 'gwbUnitFolder')
    // 构造时 this.ctx 还是提供方自己的，logger 绑的是本插件
    this.log = ctx.logger(name)
    this.kernel = requireKernel(ctx)
    this.toolbarButtons = createToolbarButtonRegistry((message) => ctx.logger(name).warn(message))
  }

  [Service.init](): void {
    const ctx = this.ctx as GwbContext
    this.log.info('加载：单元清单数据源就绪')

    // 外壳把注销登记在调用方的 effect 上，不用自己包 effect。main（单元树）是工具窗格；
    // viewer（原文）是文档窗格，一份装一个文件（key 是文件绝对路径，见 client/open-file.ts）
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

    // 设置插件局部注入：不在时本插件照常加载，命令一律回 unconfigured。设置插件卸载时 readUnitsRootSetting 设回 undefined
    ctx.inject(['gwbSettings'], (scoped) => {
      scoped.gwbSettings.define({
        key: 'units-root',
        title: '单元容器根',
        type: 'string',
        description: '装单元目录的那个根的绝对路径（如 D:\\unitfolders）：根下一层一个单元目录，各自带一张 unit.json。不填这个插件的命令全都不工作',
      })
      this.readUnitsRootSetting = () => scoped.gwbSettings.get('units-root')
      scoped.effect(() => () => {
        this.readUnitsRootSetting = undefined
      })
    })

    // 数据插件局部注入：加载时把盘上的置顶读进内存；内存里已经有值（人先点了置顶、数据插件后加载）就反过来写盘
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

    // 说明书在包根的 skills/，相对产物 dist/index.js 写作 '../skills/'；那个目录要在 package.json 的 files 里
    ctx.inject(['gwbSkills'], (scoped) => {
      scoped.effect(() => scoped.gwbSkills.register(new URL('../skills/', import.meta.url)))
    })

    this.log.info(`服务就绪（ctx.gwbUnitFolder）：current / pinned / registerToolbarButton；选中变化经 ${SELECTION_EVENT} 广播，按钮表经 unit-folder.toolbarButtons 交给浏览器侧`)
  }

  current(): UnitSelection | undefined {
    return resolveCurrent(this.clickedSelection, this.pinnedPaths)
  }

  pinned(): string[] {
    return [...this.pinnedPaths]
  }

  /**
   * 调用它的是哪个插件。方法里的 `this.ctx` 是消费方的 ctx，`fiber.entry` 是 loader 设上的——
   * 跟外壳 `registerPane` 认窗格归属同一个办法，身份不由登记方自己报
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

  /** 登记一个工具条按钮。注销登记在调用方的 effect 上（方法里的 this.ctx 是消费方的），注销后也推一条事件 */
  registerToolbarButton(spec: ToolbarButtonSpec): () => void {
    const owner = this.toolbarOwner()
    const unregister = this.toolbarButtons.register(owner, spec)
    this.log.info(`工具条按钮 ${spec.id}（${spec.label}）登记上了（${owner.pkg}）`)
    this.announceToolbarChanged()
    this.ctx.effect(() => () => {
      unregister()
      this.announceToolbarChanged()
    })
    return unregister
  }

  private announceToolbarChanged(): void {
    this.kernel.emit({ t: TOOLBAR_EVENT })
  }

  unitsRoot(): string | undefined {
    return this.resolveUnitsRoot()
  }

  private resolveUnitsRoot(): string | undefined {
    return rootFromSetting(this.readUnitsRootSetting?.())
  }

  /**
   * 带路径参数的命令共用的路径检查：先解 `units-root`，再把参数路径验成根内的绝对路径（见 browse.ts 的 resolveInside）
   */
  private withTarget(args: unknown, run: (root: string, target: string) => unknown): unknown {
    const root = this.resolveUnitsRoot()
    if (root === undefined) return { ok: false, code: 'unconfigured', error: MISSING_UNITS_ROOT }
    const requested = argsOf(args).path
    const target = resolveInside(root, requested)
    if (target === null) return { ok: false, error: `路径不在容器根内：${String(requested)}` }
    return run(root, target)
  }

  /** VSCode 可执行文件，见 `vscode.ts`；找不到回 null，由调用方明说打不开 */
  private resolveCodeExe(): string | null {
    if (this.codeExePath === undefined) this.codeExePath = locateCodeExe()
    return this.codeExePath
  }

  /**
   * `current()` 的值变了就广播一次。点击、置顶、清掉已删单元几条路都经这里：没点过时置顶改变的是
   * 回落值，消费方看到的「当前」一样变了
   */
  private announceIfChanged(before: UnitSelection | undefined): void {
    const after = this.current()
    if (before?.path === after?.path) return
    // 事件全局派发，在提供方自己的 ctx 上 emit，谁 on 了都收得到
    ;(this.ctx as GwbContext).emit(SELECTION_EVENT, after)
  }

  /** 内存里那份写回盘。没装数据插件只 warn 一次、不抛：置顶照样在本次会话里生效 */
  private async persistPinned(): Promise<void> {
    if (this.data === undefined) {
      if (!this.missingDataPluginWarned) {
        this.missingDataPluginWarned = true
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
    const commandBus = ctx.gwbCommands
    // static inject 保证了它在，这一句只为收窄类型
    if (commandBus === undefined) return
    const register = (def: GwbCommandDef, handler: GwbCommandHandler): void => {
      commandBus.register(def, handler)
    }

    register(
      {
        name: 'unit-folder.list',
        effect: 'read',
        description: '现扫单元容器，回全部单元清单',
        usage: '认领过的按 kind 分组（没出生证的与读不出的归进 unidentified，读不出的带 reason）、另带 pinned：置顶的单元条目数组，按置顶先后。置顶了但目录已不在的，这一次顺带从置顶表里摘掉并存盘；最近一次点击的单元已不在的，清掉这次点击并广播 unit-folder/selection。无参数',
      },
      async () => {
        const root = this.resolveUnitsRoot()
        if (root === undefined) return { ok: false, code: 'unconfigured', error: MISSING_UNITS_ROOT }
        const startedAt = Date.now()
        const outcome = takeInventory(root)
        // 根不存在不走这条（它带着 rootExists: false 从成功那一支出去）；这里是根指到文件、没权限、盘掉了
        if (!outcome.ok) {
          this.log.warn(`unit-folder.list 扫不动：${outcome.error}`)
          return { ok: false, error: outcome.error }
        }
        const unitCount = outcome.data.byKind.reduce((n, group) => n + group.units.length, 0) + outcome.data.unidentified.length
        this.log.info(`unit-folder.list 结束：${unitCount} 个单元，耗时 ${Date.now() - startedAt}ms`)
        const pinnedLookup = findPinned(outcome.data, this.pinnedPaths)
        const clickedUnitGone = this.clickedSelection !== undefined && !isUnitListed(outcome.data, this.clickedSelection.unitPath)
        if (pinnedLookup.gone.length > 0 || clickedUnitGone) {
          // 两样一起清完再判一次变没变：同一次扫描只广播一次
          const before = this.current()
          if (clickedUnitGone) {
            this.log.info(`最近一次点击的单元已不在，清掉：${this.clickedSelection?.unitPath ?? ''}`)
            this.clickedSelection = undefined
          }
          if (pinnedLookup.gone.length > 0) {
            this.log.info(`置顶里 ${pinnedLookup.gone.length} 个单元已不在，摘掉：${pinnedLookup.gone.join('、')}`)
            let remaining = this.pinnedPaths
            for (const gonePath of pinnedLookup.gone) remaining = removePinned(remaining, gonePath)
            this.pinnedPaths = remaining
          }
          this.announceIfChanged(before)
          if (pinnedLookup.gone.length > 0) await this.persistPinned()
        }
        return { ok: true, data: { ...outcome.data, pinned: pinnedLookup.entries } }
      },
    )

    register(
      {
        name: 'unit-folder.create',
        effect: 'write',
        description: '在容器根下建一个新单元：算目录名、建目录、写出生证 unit.json',
        usage:
          '参数 { kind, title, purpose, icon, status?, slug? }，前四项非空字符串。kind 是中文种类短词（先 unit-folder.list 看已有的种类，能归进去就别造新词）；title 是树里显示的短名；purpose 是它唯一的自述，一句话说清这个单元是什么、干什么，容易跟谁混就点一句（不写历史、版本沿革、已完成的任务清单）；icon 是 lucide 图标名，kebab-case（https://lucide.dev/icons ，如 puzzle / book-open / server）；status 是 active / paused / retired，省了是 active；slug 是目录名里的功能名——小写字母数字、段间用单个连字符（如 gwb-test），省了目录名就只有随机段。目录名 <五位随机小写字母数字>-<slug>，重名就重新生成随机段；createdAt 由本插件填——时间不进目录名。到 unit.json 为止，仓与文档站交给目标线自己的工具。回 { name, path, identity }',
      },
      (args) => {
        const root = this.resolveUnitsRoot()
        if (root === undefined) return { ok: false, code: 'unconfigured', error: MISSING_UNITS_ROOT }
        const createArgs = argsOf(args)
        const outcome = createUnit(root, {
          kind: createArgs.kind,
          title: createArgs.title,
          purpose: createArgs.purpose,
          icon: createArgs.icon,
          status: createArgs.status,
          slug: createArgs.slug,
        })
        if (outcome.ok) this.log.info(`建了单元 ${outcome.data.name}（${outcome.data.identity.kind}：${outcome.data.identity.title}）`)
        else this.log.warn(`建单元没成：${outcome.error}`)
        return outcome
      },
    )

    register(
      {
        name: 'unit-folder.toolbarButtons',
        effect: 'read',
        description: '此刻有哪些插件往单元树窗格的工具条里登记了按钮',
        usage: '浏览器侧取表用，人一般不调。无参数',
      },
      () => ({ ok: true, data: { buttons: this.toolbarButtons.list() } }),
    )

    register(
      {
        name: 'unit-folder.listDir',
        effect: 'read',
        description: '列容器根内一个目录的一层（不递归）',
        usage: '参数 { path: string }——要列的目录，容器根内的绝对路径',
      },
      (args) =>
        this.withTarget(args, (_root, target) => {
          // 回执形状统一是 GwbResult：载荷放在 data 里
          const outcome = listDir(target)
          return outcome.ok ? { ok: true, data: { entries: outcome.entries } } : outcome
        }),
    )

    register(
      {
        name: 'unit-folder.readFile',
        effect: 'read',
        description: '读容器根内一个文件的原文（截断预览）',
        usage: '参数 { path: string }——要读的文件，容器根内的绝对路径',
      },
      (args) => this.withTarget(args, (_root, target) => readFilePreview(target)),
    )

    register(
      {
        name: 'unit-folder.open',
        effect: 'write',
        description: '在资源管理器里打开容器根内一个目录',
        usage: '参数 { path: string }——要打开的目录，容器根内的绝对路径，必须已存在',
      },
      (args) =>
        this.withTarget(args, (_root, target) => {
          // explorer 打开不存在的目录会弹错误框，先在这里回失败
          if (!isDirectory(target)) return { ok: false, error: `不是目录：${target}` }
          // explorer.exe 成功时退出码也可能是 1，成败以进程能不能启动计
          const child = spawn('explorer.exe', [target], { detached: true, stdio: 'ignore' })
          child.on('error', (err) => this.log.warn(`资源管理器启动失败：${err.message}`))
          child.unref()
          return { ok: true }
        }),
    )

    register(
      {
        name: 'unit-folder.code',
        effect: 'write',
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
          // 不开 shell、独立参数：target 只是路径，不会被命令解释器解释。-n 是新窗口；成败以进程能不能启动计
          const child = spawn(codeExe, ['-n', target], { detached: true, stdio: 'ignore' })
          child.on('error', (err) => this.log.warn(`VSCode 启动失败：${err.message}`))
          child.unref()
          return { ok: true }
        }),
    )

    register(
      {
        name: 'unit-folder.select',
        effect: 'write',
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
          this.clickedSelection = selection
          this.log.info(`选中 ${selection.unitName}${selection.path === selection.unitPath ? '' : `（${selection.path}）`}`)
          this.announceIfChanged(before)
          return { ok: true, data: selection }
        }),
    )

    register(
      {
        name: 'unit-folder.current',
        effect: 'read',
        description: '此刻的「当前单元」',
        usage: '最近一次点击，没点过回落到第一个置顶单元，都没有 data 是 null。回 { unitPath, unitName, path } | null。无参数',
      },
      () => ({ ok: true, data: this.current() ?? null }),
    )

    register(
      {
        name: 'unit-folder.pin',
        effect: 'write',
        description: '把一个单元加进置顶（清单最上那块「置顶」，可以有多个）',
        usage: '参数 { path: string }——单元目录，必须是容器根下一层；追加到置顶表末尾，已经置顶的不挪位置；存进 data 文档 pinned（{ paths }）。不改最近一次点击。回 { paths }',
      },
      (args) =>
        this.withTarget(args, (root, target) => {
          if (!isUnitDir(root, target)) return { ok: false, error: `置顶只认单元目录（容器根下一层）：${target}` }
          if (!isDirectory(target)) return { ok: false, error: `不是目录：${target}` }
          this.log.info(`置顶 ${path.basename(target)}`)
          // 命令总线会 await 这个 promise，存盘的成败进回执
          return this.setPinned(addPinned(this.pinnedPaths, target)).then(() => ({ ok: true, data: { paths: this.pinned() } }))
        }),
    )

    register(
      {
        name: 'unit-folder.unpin',
        effect: 'write',
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
