import { useState } from 'react'
import './unit-folder-seams.css'

/**
 * 首页的接缝图：单元文件夹插件的三个模块（浏览器侧、node 侧、判断与读盘）与外面的东西之间的十二条接缝。
 * 虚线框是模块，框里的方块是能力，带编号的线是接缝：实线是调用，虚线是读写磁盘。
 * 点编号看那条接缝的契约，点虚线框看那个模块连着谁。编号与首页正文「接缝逐条」一致
 */

type ModuleId = 'browser' | 'node' | 'logic'

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

interface Capability extends Rect {
  id: string
  module: ModuleId
  label: string
  code: string
}

interface Outside extends Rect {
  id: string
  label: string
  detail: string
  look: 'actor' | 'plugin' | 'disk' | 'process'
}

interface Seam {
  n: number
  look: 'call' | 'disk' | 'mixed'
  /** 实线部分的路径；mixed 的虚线部分在 diskPath */
  path: string
  diskPath?: string
  badge: [number, number]
  /** 这条接缝两端的能力或外部对象 */
  ends: string[]
  title: string
  contract: string
  owner: string
}

const MODULES: Array<Rect & { id: ModuleId; title: string; role: string }> = [
  { id: 'browser', x: 20, y: 120, w: 250, h: 280, title: '浏览器侧 src/client/', role: '两个窗格，只经命令总线说话' },
  { id: 'node', x: 370, y: 120, w: 270, h: 280, title: 'node 侧 src/index.ts', role: 'cordis 服务：接线与会话状态' },
  { id: 'logic', x: 700, y: 120, w: 280, h: 280, title: '判断与读盘 src/*.ts', role: '不依赖 cordis，测试直接调' },
]

const CAPABILITIES: Capability[] = [
  { id: 'b-tree', module: 'browser', x: 34, y: 164, w: 222, h: 46, label: '单元树窗格 main', code: 'UnitFolderPane' },
  { id: 'b-viewer', module: 'browser', x: 34, y: 218, w: 222, h: 46, label: '原文窗格 viewer', code: 'ViewerPane' },
  { id: 'b-open', module: 'browser', x: 34, y: 272, w: 222, h: 46, label: '点文件的开法', code: 'open-file.ts' },
  { id: 'b-buttons', module: 'browser', x: 34, y: 326, w: 222, h: 46, label: '登记进来的按钮', code: 'toolbar-buttons.tsx' },
  { id: 'n-commands', module: 'node', x: 384, y: 164, w: 242, h: 46, label: '十一条命令', code: 'registerCommands' },
  { id: 'n-path', module: 'node', x: 384, y: 218, w: 242, h: 46, label: '路径检查', code: 'withTarget' },
  { id: 'n-service', module: 'node', x: 384, y: 272, w: 242, h: 46, label: '服务与选中事件', code: 'current · pinned · emit' },
  { id: 'n-toolbar', module: 'node', x: 384, y: 326, w: 242, h: 46, label: '工具条登记表', code: 'registerToolbarButton' },
  { id: 'l-scan', module: 'logic', x: 714, y: 162, w: 252, h: 40, label: '现扫容器根', code: 'scan.ts takeInventory' },
  { id: 'l-browse', module: 'logic', x: 714, y: 206, w: 252, h: 40, label: '路径验证、列目录、读原文', code: 'browse.ts resolveInside' },
  { id: 'l-current', module: 'logic', x: 714, y: 250, w: 252, h: 40, label: '当前单元与置顶表', code: 'current.ts resolveCurrent' },
  { id: 'l-create', module: 'logic', x: 714, y: 294, w: 252, h: 40, label: '建单元', code: 'create.ts createUnit' },
  { id: 'l-vscode', module: 'logic', x: 714, y: 338, w: 252, h: 40, label: '找 VSCode', code: 'vscode.ts locateCodeExe' },
]

const OUTSIDE: Outside[] = [
  { id: 'person', x: 20, y: 20, w: 130, h: 52, label: '人', detail: '在单元树里点', look: 'actor' },
  { id: 'bus', x: 300, y: 20, w: 280, h: 52, label: '命令总线 gwb-commands', detail: 'unit-folder.* 按名字调', look: 'plugin' },
  { id: 'agent', x: 620, y: 20, w: 150, h: 52, label: 'agent', detail: '经 MCP 入口 run', look: 'actor' },
  { id: 'consumer', x: 810, y: 20, w: 170, h: 52, label: '消费方插件', detail: '此刻没有', look: 'plugin' },
  { id: 'kernel', x: 282, y: 322, w: 76, h: 52, label: '内核', detail: 'emit → on', look: 'plugin' },
  { id: 'shell', x: 20, y: 470, w: 150, h: 52, label: '外壳 gwb-shell', detail: 'registerPane · openPane', look: 'plugin' },
  { id: 'settings', x: 370, y: 470, w: 110, h: 52, label: '设置', detail: 'units-root', look: 'plugin' },
  { id: 'data', x: 495, y: 470, w: 115, h: 52, label: '数据', detail: '文档 pinned', look: 'plugin' },
  { id: 'skills', x: 625, y: 470, w: 110, h: 52, label: '说明书', detail: 'skills/', look: 'plugin' },
  { id: 'process', x: 755, y: 470, w: 150, h: 52, label: '外部进程', detail: 'explorer · Code.exe', look: 'process' },
  { id: 'pinned-file', x: 440, y: 590, w: 225, h: 52, label: '<home>/data/unit-folder/', detail: 'pinned.json { paths }', look: 'disk' },
  { id: 'units-root', x: 700, y: 590, w: 280, h: 52, label: '容器根 D:\\unitfolders', detail: '<单元>/unit.json 六项', look: 'disk' },
]

const SEAMS: Seam[] = [
  {
    n: 1,
    look: 'call',
    path: 'M 245 120 V 46 H 300 M 440 72 V 120',
    badge: [245, 92],
    ends: ['b-tree', 'b-viewer', 'bus', 'n-commands'],
    title: '浏览器侧 → 命令总线 → node 侧',
    contract: "host.call('unit-folder.<名>', args) → { ok, data?, error?, code? }",
    owner: 'node 侧校验参数、回执形状；浏览器侧按形状收，不认错误文字，只认 code',
  },
  {
    n: 2,
    look: 'call',
    path: 'M 620 46 H 580',
    badge: [600, 46],
    ends: ['agent', 'bus', 'n-commands'],
    title: 'agent → 命令总线 → node 侧',
    contract: 'run {"command":"unit-folder.list"} —— 与第 1 条同一组命令、同一套回执',
    owner: '参数不能假定来自界面：带路径的命令都过第 3 条里的路径检查',
  },
  {
    n: 3,
    look: 'call',
    path: 'M 640 260 H 700',
    badge: [670, 260],
    ends: ['n-commands', 'n-path', 'n-service', 'l-scan', 'l-browse', 'l-current', 'l-create', 'l-vscode'],
    title: 'node 侧 → 判断与读盘',
    contract: 'takeInventory(root) · resolveInside(root, path) → string | null · resolveCurrent(clicked, pinned) · createUnit(root, input)',
    owner: '判断全在右边，进出都是普通值；node 侧只管解出容器根、记会话状态、广播',
  },
  {
    n: 4,
    look: 'disk',
    path: 'M 950 400 V 590',
    badge: [950, 530],
    ends: ['l-scan', 'l-browse', 'l-create', 'units-root'],
    title: '判断与读盘 ⇢ 容器根',
    contract: '列根下一层目录；读 <单元>/unit.json（kind / title / purpose / status / icon / createdAt）；建单元时写它',
    owner: '字段表的正本在 scan.ts validateIdentity，读写共用；每次现读，不缓存',
  },
  {
    n: 5,
    look: 'call',
    path: 'M 390 400 V 444 H 120 V 470',
    badge: [255, 444],
    ends: ['n-commands', 'shell'],
    title: 'node 侧 → 外壳：登记窗格',
    contract: "registerPane({ id: 'main' | 'viewer', client, style, kind? }) · describeSelf({ title, icon })",
    owner: '外壳在本插件卸载时注销窗格；本插件只报 file:// 地址',
  },
  {
    n: 6,
    look: 'call',
    path: 'M 60 470 V 400',
    badge: [60, 436],
    ends: ['shell', 'b-tree', 'b-viewer', 'b-open'],
    title: '外壳 ⇄ 浏览器侧：挂载与开窗格',
    contract: "mountPane(args, container) → { dispose, retarget? } · shell.openPane('viewer', { key, params, preview | placement })",
    owner: '开在哪、同 key 激活哪份、预览替不替换归外壳；本插件只说是哪种开法',
  },
  {
    n: 7,
    look: 'call',
    path: 'M 425 400 V 470',
    badge: [425, 436],
    ends: ['n-path', 'settings'],
    title: 'node 侧 ⇄ 设置插件',
    contract: "define({ key: 'units-root', type: 'string' }) · 每条命令现读 get('units-root')",
    owner: '局部注入；缺了本插件照常加载，命令回 code: unconfigured',
  },
  {
    n: 8,
    look: 'mixed',
    path: 'M 552 400 V 470',
    diskPath: 'M 552 522 V 590',
    badge: [552, 436],
    ends: ['n-service', 'data', 'pinned-file'],
    title: 'node 侧 ⇄ 数据插件 ⇢ 置顶文档',
    contract: "readDoc('pinned') · writeDoc('pinned', { paths: string[] })",
    owner: '读回来按 parsePinnedDoc 验形状；局部注入，缺了置顶只存在内存里',
  },
  {
    n: 9,
    look: 'call',
    path: 'M 620 120 V 96 H 895 V 72',
    badge: [760, 96],
    ends: ['n-service', 'n-toolbar', 'consumer'],
    title: 'node 侧 → 消费方插件',
    contract: "ctx.gwbUnitFolder.current() / pinned() / registerToolbarButton(spec) · on('unit-folder/selection', sel)",
    owner: '本插件不认识任何消费方；此刻容器里没有插件用这个服务',
  },
  {
    n: 10,
    look: 'call',
    path: 'M 370 348 H 358 M 282 348 H 270',
    badge: [320, 304],
    ends: ['n-toolbar', 'kernel', 'b-buttons'],
    title: 'node 侧 → 内核事件 → 浏览器侧',
    contract: "gwbKernel.emit({ t: 'gwb-unit-folder-toolbar' }) → window.gwb.on → 重取 unit-folder.toolbarButtons",
    owner: '只是提醒重取，按钮表本身仍走第 1 条',
  },
  {
    n: 11,
    look: 'call',
    path: 'M 640 380 H 668 V 440 H 830 V 470',
    badge: [760, 440],
    ends: ['n-commands', 'l-vscode', 'process'],
    title: 'node 侧 → 外部进程',
    contract: "spawn('explorer.exe', [dir]) · where.exe code → spawn(Code.exe, ['-n', dir])，不开 shell",
    owner: '成败以进程能不能启动计；找不到 Code.exe 回失败，不改用 shell',
  },
  {
    n: 12,
    look: 'call',
    path: 'M 615 400 V 455 H 680 V 470',
    badge: [648, 455],
    ends: ['n-commands', 'skills'],
    title: 'node 侧 → 说明书插件',
    contract: "gwbSkills.register(new URL('../skills/', import.meta.url))",
    owner: '局部注入；缺了 agent 读不到 unit-folder 这份说明书',
  },
]

const MODULE_OF: Record<string, ModuleId> = Object.fromEntries(CAPABILITIES.map((c) => [c.id, c.module]))

function touchesModule(seam: Seam, module: ModuleId): boolean {
  return seam.ends.some((end) => MODULE_OF[end] === module)
}

/** 当前选择下，哪些东西保持高亮；什么都没选时返回 null，全部照常显示 */
function litIdsOf(seam: Seam | undefined, module: ModuleId | null): Set<string> | null {
  if (seam !== undefined) return new Set([...seam.ends, `seam-${seam.n}`])
  if (module === null) return null
  const lit = new Set<string>([module])
  for (const capability of CAPABILITIES) if (capability.module === module) lit.add(capability.id)
  for (const candidate of SEAMS) {
    if (!touchesModule(candidate, module)) continue
    lit.add(`seam-${candidate.n}`)
    for (const end of candidate.ends) lit.add(end)
  }
  return lit
}

export function UnitFolderSeams() {
  const [seamNumber, setSeamNumber] = useState<number | null>(null)
  const [module, setModule] = useState<ModuleId | null>(null)
  const seam = SEAMS.find((s) => s.n === seamNumber)
  const lit = litIdsOf(seam, module)
  const dim = (id: string): string => (lit === null || lit.has(id) ? 'uf-on' : 'uf-off')
  const selectedModule = MODULES.find((m) => m.id === module)

  const pickSeam = (n: number): void => {
    setModule(null)
    setSeamNumber((current) => (current === n ? null : n))
  }
  const pickModule = (id: ModuleId): void => {
    setSeamNumber(null)
    setModule((current) => (current === id ? null : id))
  }

  return (
    <figure className="uf-seams not-prose my-6 @container">
      <svg viewBox="0 0 1000 660" className="w-full h-auto select-none" role="img" aria-label="单元文件夹插件的接缝图">
        <defs>
          <marker id="uf-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" className="uf-arrow-head" />
          </marker>
        </defs>

        {MODULES.map((m) => (
          <g key={m.id} className={`uf-module ${dim(m.id)}`} onClick={() => pickModule(m.id)}>
            <rect x={m.x} y={m.y} width={m.w} height={m.h} rx={12} className={module === m.id ? 'uf-module-box uf-picked' : 'uf-module-box'} />
            <text x={m.x + 14} y={m.y + 19} className="uf-module-title">{m.title}</text>
            <text x={m.x + 14} y={m.y + 33} className="uf-muted">{m.role}</text>
          </g>
        ))}

        {CAPABILITIES.map((c) => (
          <g key={c.id} className={`uf-module ${dim(c.id)}`} onClick={() => pickModule(c.module)}>
            <rect x={c.x} y={c.y} width={c.w} height={c.h} rx={7} className="uf-capability" />
            <text x={c.x + 10} y={c.y + (c.h > 42 ? 19 : 17)} className="uf-label">{c.label}</text>
            <text x={c.x + 10} y={c.y + (c.h > 42 ? 36 : 32)} className="uf-code">{c.code}</text>
          </g>
        ))}

        {OUTSIDE.map((o) => (
          <g key={o.id} className={dim(o.id)}>
            <rect x={o.x} y={o.y} width={o.w} height={o.h} rx={o.look === 'actor' ? 26 : 8} className={`uf-outside uf-${o.look}`} />
            <text x={o.x + o.w / 2} y={o.y + 22} textAnchor="middle" className="uf-label">{o.label}</text>
            <text x={o.x + o.w / 2} y={o.y + 39} textAnchor="middle" className="uf-code">{o.detail}</text>
          </g>
        ))}

        <path d="M 85 72 V 120" className="uf-entry" markerEnd="url(#uf-arrow)" />

        {SEAMS.map((s) => (
          <g key={s.n} className={dim(`seam-${s.n}`)}>
            <path d={s.path} className={s.look === 'disk' ? 'uf-line uf-line-disk' : 'uf-line'} markerEnd="url(#uf-arrow)" />
            {s.diskPath !== undefined && <path d={s.diskPath} className="uf-line uf-line-disk" markerEnd="url(#uf-arrow)" />}
          </g>
        ))}

        {SEAMS.map((s) => (
          <g
            key={`badge-${s.n}`}
            className={`uf-badge ${dim(`seam-${s.n}`)} ${seamNumber === s.n ? 'uf-picked' : ''}`}
            onClick={() => pickSeam(s.n)}
            role="button"
            aria-label={`接缝 ${s.n}：${s.title}`}
          >
            <circle cx={s.badge[0]} cy={s.badge[1]} r={11} />
            <text x={s.badge[0]} y={s.badge[1] + 4} textAnchor="middle">{s.n}</text>
          </g>
        ))}
      </svg>

      <figcaption className="uf-panel rounded-lg border border-fd-border bg-fd-card p-4 text-sm">
        {seam !== undefined ? (
          <>
            <div className="font-semibold">
              接缝 {seam.n}：{seam.title}
              <span className="ms-2 text-xs font-normal text-fd-muted-foreground">{seam.look === 'disk' ? '读写磁盘' : seam.look === 'mixed' ? '调用，再落到磁盘' : '调用'}</span>
            </div>
            <code className="mt-2 block whitespace-pre-wrap break-words rounded bg-fd-muted px-2 py-1.5 text-xs">{seam.contract}</code>
            <p className="mt-2 text-fd-muted-foreground">{seam.owner}</p>
          </>
        ) : selectedModule !== undefined ? (
          <>
            <div className="font-semibold">{selectedModule.title}</div>
            <p className="mt-1 text-fd-muted-foreground">
              {selectedModule.role}。连着接缝 {SEAMS.filter((s) => touchesModule(s, selectedModule.id)).map((s) => s.n).join('、')}。
            </p>
          </>
        ) : (
          <p className="text-fd-muted-foreground">点一个编号看这条接缝的契约；点一个虚线框看这个模块连着哪几条接缝。实线是调用，虚线是读写磁盘。</p>
        )}
      </figcaption>
    </figure>
  )
}
