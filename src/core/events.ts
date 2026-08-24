/*
events.ts — tm-tidme-* 消息约定与刷新策略

目的：解决导入/切分/评分后 UI 状态刷新时序问题（现状代码自述的痛点）。
约定：所有跨组件状态变更通过 TW 消息（tm-* / tm-tidme-*）广播，监听方负责刷新自身；
禁止组件直接改写他人状态后依赖隐式刷新。

消息清单（命名空间 tm-tidme-*）：
  tm-tidme-import-done    导入/切分完成  param = { token | docId | bookTitle }
  tm-tidme-section-done   Section 完成（去 ? 标签）  param = section 标题
  tm-tidme-section-later  Section 顺延  param = section 标题
  tm-tidme-card-created   摘录/挖空卡已建  param = 卡标题
  tm-tidme-queue-changed  队列状态变化（评分/顺延/忽略后）  param = deck 标题

刷新策略（配合 core 事件）：
  1. 队列/负载展示（deck 页、条栏、文档页横幅）监听 tm-tidme-queue-changed / tm-tidme-import-done → 重新计数；
  2. 评分动作（fsrs4tw repeat）完成后必须发 tm-tidme-queue-changed（deck 参数）；
  3. 组件只读他人状态（读取过滤器），写入一律走动作 + 消息，不直接改 tiddler 后手动刷新他人。
*/

export const EVENTS = {
	IMPORT_DONE: "tm-tidme-import-done",
	SECTION_DONE: "tm-tidme-section-done",
	SECTION_LATER: "tm-tidme-section-later",
	CARD_CREATED: "tm-tidme-card-created",
	QUEUE_CHANGED: "tm-tidme-queue-changed"
} as const;
