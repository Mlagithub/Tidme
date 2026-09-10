/*
core/doc-delete.ts — 删除一本书的阅读材料（级联，唯一实现）

职责：删除阅读材料并保留知识产物——这是**写**操作，与查询/续读点分开放。
删除：文档页 + 全部 topic/subkind=section 节卡（导入切分节 + 大纲手动插入的"新节"；含 obsolete 归档）
      + 该书的 PDF 二进制与 OCR 转写页 + 该书的子集牌组
保留：摘录（topic/extract）、挖空/问答（item）、其它知识对象
附带：续读点仅当指向被删内容时清除；学习会话列表剔除被删卡（保留其余队列语义）

跨 core 模块引用一律显式 require（避免 esbuild 内联复制）。
*/

declare function require(module: string): any;
const ns = require('$:/plugins/keepone/tidme/core/ns.js');
const session = require('$:/plugins/keepone/tidme/core/session.js');
const deckMod = require('$:/plugins/keepone/tidme/core/deck.js');
const docQuery = require('$:/plugins/keepone/tidme/core/doc-query.js');
const readPoint = require('$:/plugins/keepone/tidme/core/doc-readpoint.js');

const isDocPage = docQuery.isDocPage;

/**
 * 删除一本书的"阅读材料"，保留全部"知识产物"（契约见 core/doc-query 的文档判定与 core/doc-readpoint 的续读点）。
 * 一律按 docId 字段筛选（不依赖 title 结构，folder 后缀/历史格式均覆盖）。
 * @returns 删除的 tiddler 数
 */
export function deleteDocContent(wiki: any, docId: string): number {
  if (!wiki || typeof wiki.filterTiddlers !== 'function' || !docId) return 0;
  const owned = wiki.filterTiddlers(`[all[shadows+tiddlers]tidme.doc[${docId}]]`);
  const targets = new Set<string>();
  for (const t of owned) {
    const f = wiki.getTiddler(t)?.fields || {};
    // 牌组页（词书宿主，learning-package 词卡按 tidme.doc 挂其下）是牌组体系实体，
    // 不属阅读材料——绝不随文档清理删除（其子集牌组仍按下文单独清理）
    if (deckMod.isDeckFields(f)) continue;
    // 阅读材料：文档页 + topic 节卡（subkind!==extract → 摘录保留；item 保留）
    if (isDocPage(f)) {
      targets.add(t);
      // PDF/附件：二进制与 OCR 转写页同属阅读材料，级联清理
      if (f['tidme.asset']) targets.add(String(f['tidme.asset']));
      // OCR 转写页按 title 前缀查（title 含 `]`/`}` 时无法插值，跳过——这些页由系统生成，正常不会触发）
      if (ns.isFilterSafeTitle(t)) {
        for (const o of wiki.filterTiddlers(`[all[shadows+tiddlers]prefix[${t}/ocr-p]]`)) targets.add(o);
      }
      continue;
    }
    if (f['tidme.kind'] === 'topic' && String(f['tidme.subkind'] || 'section') !== 'extract') targets.add(t);
  }
  // 子集牌组是临时复习脚手架（引用保留的知识卡），随本书清理（经 core/deck 判定）
  for (const d of deckMod.listDecks(wiki)) {
    const dd = deckMod.getDeck(wiki, d);
    if (deckMod.isSubset(dd) && String(dd?.fields['tidme.subset-doc'] || '') === docId) targets.add(d);
  }

  // 学习会话：剔除被删卡（保留其余卡与队列语义；session 是唯一读写口）
  session.removeFromSessionMany(wiki, targets);
  // 续读点：仅当指向被删内容时清除（指向保留的摘录/卡则保留）
  const rp = readPoint.parseReadPoint(wiki, docId);
  if (rp && targets.has(rp.t)) wiki.deleteTiddler(readPoint.READPOINT_PREFIX + docId);
  const g = readPoint.globalReadPointTitle(wiki);
  if (g && targets.has(g)) wiki.deleteTiddler(readPoint.GLOBAL_READPOINT);

  let n = 0;
  for (const t of targets) {
    if (wiki.getTiddler(t)) {
      wiki.deleteTiddler(t);
      n++;
    }
  }
  return n;
}
