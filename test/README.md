# Tidme 测试规范

> 全库测试共同遵守的约定。背景与里程碑见 `doc/test-plan.md`；
> 五条黄金法则：AAA / 一测一概念 / 命名即文档 / 谨慎 Mock / 测试独立。

## 目录分层

```
test/
  helpers/        共享基建（唯一一份，禁止在测试文件里手写第二份 setup）
  unit/           L1 纯单元：import src 直测 TS 源码（快，不依赖构建产物）
  integration/    L2 插件集成：boot 真实 TW + bin 插件产物 + modules.execute
  pipeline/       L3 导入管线：bin/pipeline.cjs + jsdom + epub fixture
  e2e/            L4 无头 E2E：真实 TiddlyWeb / 全业务流
```

`node --test` 从仓库根递归发现 `*.test.{mjs,cjs,js}`；新文件放进对应层即可。

## helpers 一览

| 模块 | 用途 |
|---|---|
| `helpers/tw-boot.mjs` | `bootPlugin({langs?, prefix?, preload?})` → `{tw, wiki, tmp, mod(p), reset()}`。L2/L4 唯一 boot 入口 |
| `helpers/tw-date.mjs` | `twDate(d)` / `T(offsetHours)` / `PAST()` / `FUTURE()`：17 位 TW UTC 日期串 |
| `helpers/fake-dom.mjs` | widget 渲染冒烟的假 DOM：`renderWidget(wiki, mod, name, opts)`、`collectText`、`collectButtons`、`fakeDocument`。陷阱备忘见文件头注释 |
| `helpers/jsdom-env.mjs` | 导入管线无头运行：`loadPipelineBundle()`、`installDom()`、`fixtureEpubPath()` |
| `helpers/fixtures.mjs` | `makeItem` / `makeTopic` / `importMarkdown`：最小造数 builder |

测试对象是 **bin 产物**（与 dev/发布一致），改动 src 后先 `npm run build:plugins`。

## 五条法则的落地约定

1. **AAA**：Arrange 用 helpers builder；Act 只调一次被测单元；Assert 聚焦单一概念
   （对同一返回对象的多字段断言算一个概念）。
2. **一测一概念**：一个 `test()` 只回答一个问题。禁止把多个操作捆进一个用例
   （`"A / B / C"` 式命名即是违例信号）。
3. **命名即文档**：`被测行为 — 关键约束 (领域理由)`，例如
   `"autoPostpone: 保留 top N 高优先级，顺延其余低优先级逾期卡"`。
4. **谨慎 Mock**：
   - 永不 mock：`$tw`/wiki（boot 真实 TW）、文件系统（真实 mkdtemp）、被测模块内部；
   - 允许注入：DOMParser/jszip（走 helpers）、网络/LLM（`httpFn`）、widget DOM（fake-dom）；
   - 废止：对 bin 产物做子串断言；测试内复刻生产组合逻辑（应 import 生产实现）。
5. **测试独立**：文件级由 node:test 进程隔离保证；文件内 L2 测试一律
   `test.beforeEach(reset)`（`reset` 清非系统 tiddler；注意 `$:/` 前缀与 shadow 不会被清）。
   禁止依赖同文件前序用例留下的数据。共享 fixture 的渲染冒烟文件（browser）拆分前
   暂不 reset，拆分时改为按组件重建 fixture。

## 断言偏好

行为结果（wiki 状态 / due / 队列内容）> 渲染文本（`includes` 只作冒烟兜底）> ~~实现细节（禁止）~~。
UI 文案断言能改为"触发动作 → 断言 tiddler 字段变化"的一律改写。

**跨 realm 陷阱**：TW 在 Node 下经 vm 沙箱 boot，`wiki.filterTiddlers(...)` 的数组与
widget/core 返回的对象原型来自沙箱 realm——`assert.deepEqual(x, [...])` 会因原型不同而失败。
一律先展开/逐字段：`assert.deepEqual([...out], ["A"])`；对象逐字段 `assert.equal(o.k, v)`。

## 运行

```bash
npm run build:plugins   # 先构建 bin（L2/L3/L4 依赖）
npm test                # test:unit（node --test）+ test:study（无头学习流回归）
```
