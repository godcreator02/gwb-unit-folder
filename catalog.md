# catalog · gwb-unit-folder

插件的身份卡：是谁、提供什么、靠谁。命令清单不存卡——现扫门的 `index`。
登记面变了这张卡要跟着改，tests/catalog.test.ts 钉着防漏。

**定位**：单元文件夹件——出生证（unit.json）字段表的正本；建单元、现扫单元容器根读出生证，树里按状态与种类过滤、展开看文件、点文件读原文；「当前单元」事件（unit-folder/selection）往外报人现在看的是哪个单元，消费方局部注入 ctx.gwbUnitFolder、它不认识消费方。

## 提供

`gwbUnitFolder`：current（此刻选中的单元）/ pinned（全部置顶）/ registerToolbarButton 与 selection 事件

## 依赖

`gwbCommands`（硬依赖，inject）、`gwbShell`（硬依赖，inject）、`gwbData`（局部注入）、`gwbSettings`（局部注入）、`gwbSkills`（局部注入）

## 命令

命令清单不存卡——**现扫门的 `index`**（回执的命令行自带 plugin 包名归属）。
