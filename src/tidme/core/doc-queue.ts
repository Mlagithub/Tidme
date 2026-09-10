/*
core/doc-queue.ts — 阅读队列过滤器与快照

职责：**哪些卡在待读队列里**——过滤器字符串与求值快照（阅读列表 / 今日待读 / 学习流的 topic 段共用）。
- docItemsFilter：「复习本书」子集牌组的 item 来源
- collectTopicQueue：TOPIC_QUEUE_FILTER 求值 + 排序字段预解析

不含：文档实体谓词（core/doc-query）、续读点与入口目标（core/doc-readpoint）。
跨 core 模块引用一律显式 require（避免 esbuild 内联复制）。
*/

declare function require(module: string): any;
const ns = require('$:/plugins/keepone/tidme/core/ns.js');
const sched = require('$:/plugins/keepone/tidme/core/scheduler.js');
const schema = require('$:/plugins/keepone/tidme/core/schema.js');

/**
 * 本书 item 在队过滤器（「复习本书」子集牌组的 card 来源 / 文档页计数）。
 * 出队标记一律在此排除（done/ignored/suspended），与默认牌组 card 口径一致。
 * 注意：过滤器 run 之间是并集——严禁把 ITEM_FILTER 之类片段拼接进单个 run 之外
 * （曾因拼接产生第二个 run，把全库 item 混进"复习本书"子集）。
 */
export function docItemsFilter(docId: string): string {
  return `[all[shadows+tiddlers]tidme.doc[${docId}]tidme.kind[item]${ns.QUEUE_EXCLUDE}]`;
}

/**
 * 阅读队列快照：TOPIC_QUEUE_FILTER 求值 + 排序字段预解析（priority/due/order）。
 * 出队三态（done/ignored/suspended）由过滤器排除，此处再兜底一次
 * （shadow 覆盖写回等边缘下过滤器与字段可能不一致）。wiki 为注入参数，无 $tw 全局依赖。
 *
 * 宿主页（分节文档页）排除只有一处判据：过滤器里的 `!tidme.structure[sectioned]`
 * （文档页构建处必写 structure）。曾在此再叠一次「有节卡的文档页」全库扫描，
 * 于是 JS 侧与 today 的过滤器计数口径不同（同屏两个"待读"数字不一致）。
 */
export function collectTopicQueue(wiki: any): Record<string, any>[] {
  if (!wiki || typeof wiki.filterTiddlers !== 'function') return [];
  return wiki
    .filterTiddlers(ns.TOPIC_QUEUE_FILTER)
    .map((t: string) => {
      const f = wiki.getTiddler(t)?.fields || {};
      return {
        title: t,
        fields: f,
        kind: String(f['tidme.subkind'] || ''),
        priority: sched.normalizePriority(f['tidme.priority']),
        due: schema.parseTwDate(f.due, new Date(0)),
        order: String(f['tidme.order'] || f['tidme.breadcrumb'] || t),
        doc: String(f['tidme.doc'] || ''),
        breadcrumb: String(f['tidme.breadcrumb'] || t),
      };
    })
    .filter((c: Record<string, any>) => sched.isInQueue(c.fields));
}
