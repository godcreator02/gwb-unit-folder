---
born-at: 2026-09-17T15:30
type: choice
parent: [2026-09-08-gwb-unit-folder]
label: 样式围栏改类名前缀
domain: 浏览器半
---

## 背景

2026-09-17 default home 里「单元」那一格整片失样：名字与说明粘成一行、图钉和归档图标各占一行、
没有任何布局。只有这一格坏，同一扇窗里别的格都好好的。

查下来是两件各自合理的事撞在一起：

- 本件的样式表还是老的**属性包裹**方案（`tools/build-styles.ts` 把整张工具类表包进
  `:where([data-gwb-plugin="@godcreator/gwb-unit-folder"])`），靠外壳在窗格容器上挂的那个属性吃样式
- 外壳挂的属性值取自**布局存档**里那一格的 `pluginKey`，不是现场查的。default 的存档是换 scope
  之前存的，写着 `@godcreator02/gwb-unit-folder`；`entryId` 没变，所以格照样挂得上

差一个 `02`，工具类一条都没匹配上；preflight 是全局那份照常生效，svg 被它压成块级，于是图标各占一行。
别的格不受影响，是因为 UI 平台仓那几件与站件早在 2026-09-09 就迁到了类名前缀方案，属性对它们
「只是身份标记」，值对不对无所谓。本件是还留在老方案上的少数。

## 结论与边界

定：本件跟上类名前缀方案，前缀 `unitfolder`（v4 的 prefix 只收 a-z，写不成 `unit-folder`）。

- `src/client/styles.css` 自己就是完整的 Tailwind 入口，`prefix(unitfolder)`；构建最后一步换成
  `tailwindcss -i … -o dist/style.css`，`tools/build-styles.ts` 删掉
- `src/client` 里所有类名带 `unitfolder:`，含 shadcn 组件的 cva 串；本件自己的四个类
  （图标块三态、选中高亮带）改写成 `@utility`，同样带前缀，不再是全页裸类
- 弹层挂回容器的补丁（`portal.tsx` 与 tooltip / dropdown-menu 里的 `container`）一并拆掉：
  前缀方案下挂到 body 也有样式
- 守卫：`tests/prefix.test.ts` 抓漏写前缀；产物守卫改成「类选择器一律 `.unitfolder\:` 开头、
  表里没有 `data-gwb-plugin`」

边界：服务面、命令面、事件一个字没动，版本 0.5.0 → 0.6.0。外壳信存档里旧包名这件事本身没修——
那是 UI 平台仓的事，反馈投过去了；本件从此不依赖那个属性，它对不对都与本件无关。

## 依据

隔离 home `uf-prefix-2609171509` 里装开发版，用 `shell.layout.save` 故意把两格的 `pluginKey` 写成
旧名 `@godcreator02/gwb-unit-folder` 复现当天的存档，重载后：DOM 上两格的 `data-gwb-plugin` 确实
是旧名，树格版式完整、选中高亮带在；往 body 下直接挂一个带 tooltip 类名的元素，计算样式里
z-index / 背景 / 内边距 / 字号 / 圆角全部生效。radix 弹层本身经 CDP 合成事件点不开（dockview
那边早有同样的墙），弹层验到「挂 body 有样式」这一步为止。

无 probes 物证：截图与探针脚本在会话暂存区，未入库。

## 代价与遗留

类名串变长一倍，读 shadcn 组件时多一层噪声；新拉的 shadcn 组件要手工补前缀，漏了靠 prefix 守卫抓。
遗留：gwb-windows-backup（单元 26090814sgu）还带着 `tools/build-styles.ts`，同一颗雷，另起一件事。
