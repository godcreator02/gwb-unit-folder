# catalog · gwb-unit-folder

插件的身份卡：是谁、提供什么、靠谁。命令清单不存卡——现扫 `/surface`。
登记面变了这张卡要跟着改，tests/catalog.test.ts 钉着防漏。

**定位**：单元文件夹件——现扫单元容器根读出生证（unit.json），树里展开看文件、点文件读原文；「当前单元」事件（unit-folder/selection）往外报人现在看的是哪个单元，消费方局部注入 ctx.gwbUnitFolder、它不认识消费方。

## 提供

`gwbUnitFolder`：current（此刻选中的单元）/ pinned（置顶）与 selection 事件

## 依赖

`gwbCommands`（硬依赖，inject）、`gwbShell`（硬依赖，inject）、`gwbData`（局部注入）、`gwbSettings`（局部注入）、`gwbSkills`（局部注入）

## 命令

命令清单不存卡——**现扫 `/surface`**（`?plugin=gwb-unit-folder` 取这一组的形状）。
