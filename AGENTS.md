# Tidme — Agent 工作指南

TiddlyWiki 5 插件：增量学习 / 间隔重复（FSRS）。TypeScript 源码经 esbuild（tiddlywiki-plugin-dev）
编译为插件 tiddler JSON。提交信息用中文 + conventional commits 前缀（feat/fix/refactor/chore/test），
master 分支走 semantic-release。

## 目录

- `src/tidme/core` 领域核心（调度/会话/牌组/统计/命名空间），纯逻辑 + wiki 注入
- `src/tidme/import/parse` 导入解析（EPUB/Markdown → tiddler，辅助功能）；`import/widgets` 导入 UI
- `src/tidme/review` 复习流（filters/buttons/ViewTemplate）；`manager` 卡片管理 UI；`editor` CodeMirror 集成
- `src/zh-Hans`、`src/fr-FR` 语言包 **git 子模块**（常未初始化，缺失是正常现象）
- `test/` 分层测试（见下）；`tools/` 构建脚本；`bin/` 构建产物（**git 跟踪，改源码后重建并提交**）

## 常用命令

```bash
node tools/build-plugins.cjs   # 构建 bin/（插件 JSON + parse.cjs）；改 src 后必须先跑
npm test                       # 全部测试（node --test，237 用例 ~6s）
npm run test:coverage          # 同上 + 覆盖率
npm run dev                    # tiddlywiki-plugin-dev 开发模式
```

Node ≥22（类型剥离直跑 .ts）；本机 node 由 fnm 管理。CI = build → test:coverage（Node 22）。

## 架构边界（改核心代码必守）

1. 分层：wikitext 模板只渲染 → widgets 只做 DOM 组装与事件广播 → core 是唯一逻辑实现，无 DOM
2. **core 内跨模块引用一律显式 `require("$:/plugins/keepone/tidme/core/<x>.js")`，禁用 ES import**
   （esbuild 会把 ES import 内联复制成多份实现；`editor/*` 是刻意例外，作为 section.ts 私有实现内联）
3. core 函数首参注入 `wiki`；`$tw` 全局只允许出现在 startup 薄壳（core/server/*）
4. 同一概念全库只有一份实现；过滤器组合统一走 core/deck-engine，调度统一走 core/scheduler
5. 导入解析叫 **parse**，不要叫 pipeline（易与渐进学习流程混淆）

## 测试约定

- 分层：`unit/` 直测 TS 源码；`integration/` boot 真实 TW + bin 产物；`e2e/` 真实 TiddlyWeb / 学习流
- 用例基线**只增不减**（当前 237）；五条黄金法则：AAA / 一测一概念 / 命名即文档 / 谨慎 Mock / 测试独立
- 永不 mock `$tw`/wiki（boot 真实 TW）；setup 一律走 `test/helpers/`（bootPlugin/fake-dom/tw-date 等），禁止手写第二份
- 已知陷阱：
  - TW 经 vm 沙箱 boot，`filterTiddlers` 返回跨 realm 数组 → 断言前先 `[...out]` 展开，对象逐字段比
  - 源码文本断言用引号无关正则 `/querySelector\(['"]\.foo['"]\)/`（dprint preferSingle 会改引号）
  - `reset()` 默认不清 `$:/` 前缀 system tiddler，需要时 `reset({ alsoSystem: ["$:/Deck/"] })`
- 语言包 json 缺失时 boot 会 warn——中文文案断言失败先查这个

## 风格与门禁

- dprint（preferSingle）经 husky pre-commit + lint-staged **只格式化暂存文件**；全库尚未统一格式化，
  不要跑全库 `dprint check` 期望干净，也不要一次性全库 fmt 污染 diff
- 17 位 TW UTC 日期串（`yyyymmddhhmmssmmm`）用 `test/helpers/tw-date.mjs` 的 twDate/parseTwDate，
  生产侧唯一实现在 core/schema.ts
- 代码注释自包含：不引用计划/设计类文档，不使用 M1/G4 式路线图编号，直接描述行为与理由
- 仓库中的计划/里程碑类 markdown 是历史记录，可能滞后，勿作为现状依据；现状以代码与本文件为准
