/*
core/doc-readpoint.ts — 续读点持久化、位置串编解码与阅读入口目标

职责：**读到哪儿**这件事的全部读写。
- 续读点存储：$:/config/tidme/readpoint/<docId>（JSON {t,s}）+ 全局续读点（纯 title）
- 位置串编解码：`p<N>` = 页码（PDF/连续阅读），空串 = 无卡内定位（按标题定位）
- 入口目标：单本书（docReadingTarget）/ 全局（globalReadingTarget）
- 阅读进度：docReadingProgress（续读点页码 + 单元计数）

不含：文档实体谓词与查找（core/doc-query）、队列过滤器（core/doc-queue）、删除级联（core/doc-delete）。
跨 core 模块引用一律显式 require（避免 esbuild 内联复制）。
*/

declare function require(module: string): any;
const ns = require('$:/plugins/keepone/tidme/core/ns.js');
const sched = require('$:/plugins/keepone/tidme/core/scheduler.js');
const deckMod = require('$:/plugins/keepone/tidme/core/deck.js');
const docQuery = require('$:/plugins/keepone/tidme/core/doc-query.js');
const docQueue = require('$:/plugins/keepone/tidme/core/doc-queue.js');

const sectionsOfDoc = docQuery.sectionsOfDoc;
const docPageOfDoc = docQuery.docPageOfDoc;
const isContinuousCard = docQuery.isContinuousCard;

export const READPOINT_PREFIX = '$:/config/tidme/readpoint/';
/** 全局续读点（最近打开的阅读卡；section-bar 写、workflow「开始阅读」读） */
export const GLOBAL_READPOINT = READPOINT_PREFIX + 'global';

/** 续读点 text 解析（JSON {t,s} 或旧版纯标题）→ {t,s}；空返回 null */
function parseReadPointRaw(raw: string | undefined): { t: string; s: string } | null {
  const s0 = String(raw || '').trim();
  if (!s0) return null;
  try {
    const o = JSON.parse(s0);
    if (o && o.t) return { t: String(o.t), s: String(o.s || '') };
  } catch { /* 旧格式 */ }
  return { t: s0, s: '' };
}

/** 读续读点（持久化于 $:/config/ 命名空间；无 → null）。阅读条栏/文档页/全局续读唯一实现 */
export function parseReadPoint(wiki: any, doc: string): { t: string; s: string } | null {
  if (!wiki || !doc) return null;
  const t = wiki.getTiddler(READPOINT_PREFIX + doc);
  return t ? parseReadPointRaw(String(t.fields.text || '')) : null;
}

/** 写续读点（text = JSON {t,s}，持久化到 $:/config/ 命名空间） */
export function saveReadPoint(wiki: any, doc: string, rp: { t: string; s: string }): void {
  if (!wiki || !doc || !rp || !rp.t) return;
  const now = new Date();
  wiki.addTiddler({ title: READPOINT_PREFIX + doc, type: 'application/json', text: JSON.stringify(rp), modified: now });
}

/** 清除续读点 */
export function clearReadPoint(wiki: any, doc: string): void {
  if (!wiki || !doc) return;
  wiki.deleteTiddler(READPOINT_PREFIX + doc);
}

// ---------- 续读点位置串编解码（唯一实现） ----------
// 位置串表达"卡内定位"：`p<N>` = PDF 页码；空串 = 无卡内定位（按标题定位）。
// 读侧散落曾导致"用 s:'' 覆盖页码"这类丢阅读位置的缺陷（见 readPointPositionOf 注释）。

/** 页码 → 位置串（非正/非有限数 → 空串） */
export function formatPagePosition(page: unknown): string {
  const n = Number(page);
  return Number.isFinite(n) && n >= 1 ? `p${Math.floor(n)}` : '';
}

/** 位置串 → 页码（非 `p<N>` → null） */
export function parsePagePosition(s: unknown): number | null {
  const m = /^p(\d+)$/.exec(String(s || '').trim());
  return m ? Number(m[1]) : null;
}

/**
 * 阅读目标卡的续读点位置标签：PDF 节卡（有 tidme.pages）携带起始页 `p<start>`，
 * 文本卡返回空串。推进流（已读/下一节/完成下一张）写续读点必须经此携带页码——
 * 用 s:'' 覆盖会把上一段的绝对页抹掉，下次打开回落首页（阅读记录丢失）。
 */
export function readPointPositionOf(wiki: any, title: string): string {
  if (!wiki || !title) return '';
  const pages = String(wiki.getTiddler(title)?.fields?.['tidme.pages'] || '');
  const m = /^\s*(\d+)\s*-\s*\d+\s*$/.exec(pages);
  return m ? formatPagePosition(m[1]) : '';
}

/** 写全局续读点（最近打开的阅读卡）；modified 供「最近阅读」排序，唯一写入口 */
export function saveGlobalReadPoint(wiki: any, title: string): void {
  if (!wiki || !title) return;
  wiki.addTiddler({ title: GLOBAL_READPOINT, text: title, modified: new Date() });
}

/** 读全局续读点指向的卡 title（纯 title 文本；空 → ""） */
export function globalReadPointTitle(wiki: any): string {
  if (!wiki || typeof wiki.getTiddler !== 'function') return '';
  return String(wiki.getTiddler(GLOBAL_READPOINT)?.fields?.text || '').trim();
}

/** 清除全局续读点 */
export function clearGlobalReadPoint(wiki: any): void {
  if (!wiki || typeof wiki.deleteTiddler !== 'function') return;
  wiki.deleteTiddler(GLOBAL_READPOINT);
}

export interface DocReadingProgress {
  type: 'sections' | 'continuous';
  current: number;
  total: number;
  percent: number;
  doneText: string;
}

/**
 * 获取文档真实阅读进度：
 * - 连续型文档（PDF 或整篇长文）：当前阅读页/偏移 vs 总页数/总长；
 * - 分节型文档：已完成节数 vs 总节数。
 */
export function docReadingProgress(wiki: any, docId: string): DocReadingProgress {
  if (!wiki || !docId) return { type: 'sections', current: 0, total: 0, percent: 0, doneText: '0/0' };
  const docPage = docPageOfDoc(wiki, docId);
  const docFields = docPage ? wiki.getTiddler(docPage)?.fields : null;

  if (docFields && isContinuousCard(docFields)) {
    const rp = parseReadPoint(wiki, docId);
    const currentPage = (rp && parsePagePosition(rp.s)) || 1;
    let totalPages = Number(docFields['tidme.pages-total'] || 0);
    if (!totalPages && docFields['tidme.pages']) {
      const m = /^\s*(\d+)\s*-\s*(\d+)\s*$/.exec(String(docFields['tidme.pages']));
      if (m) totalPages = Number(m[2]);
    }
    if (!totalPages && currentPage > 1) {
      totalPages = Math.max(currentPage, 1);
    }
    const percent = totalPages > 0 ? Math.min(100, Math.round((currentPage / totalPages) * 100)) : 0;
    return {
      type: 'continuous',
      current: currentPage,
      total: totalPages,
      percent,
      doneText: totalPages > 0 ? `p.${currentPage}/${totalPages}` : `p.${currentPage}`,
    };
  }

  const all = sectionsOfDoc(wiki, docId);
  const done = all.filter((t: string) => sched.isCardOutOfQueue(wiki.getTiddler(t)?.fields)).length;
  const total = all.length;
  const percent = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  return {
    type: 'sections',
    current: done,
    total,
    percent,
    doneText: `${done}/${total}`,
  };
}

/**
 * 单本书的阅读入口目标（最近阅读行内「继续」用；与全局入口同一定位口径）：
 * 该书续读点仍在队（未读/未忽略/未搁置）→ 续读点卡；
 * 否则按本书阅读顺序（tidme.order）取第一张在队卡；
 * 本书无可读卡 → 返回空串（调用方回退文档页）。
 */
export function docReadingTarget(wiki: any, docId: string): string {
  if (!wiki || !docId) return '';
  const rp = parseReadPoint(wiki, docId);
  if (rp && wiki.getTiddler(rp.t)) {
    const f = wiki.getTiddler(rp.t).fields || {};
    if (sched.isInQueue(f)) return rp.t;
  }
  const first = sectionsOfDoc(wiki, docId).find((t: string) => {
    const f = wiki.getTiddler(t)?.fields;
    return !!f && sched.isInQueue(f);
  });
  // 本书无可读卡（含连续型文档：其 sectionsOfDoc 回退为文档页自身）→ 返回空串，
  // 由调用方按自身场景回退（阅读列表落可读卡、今日页落当前行标题）
  return first || '';
}

/**
 * 全局阅读入口目标（「今天」继续阅读 / 工作流开始阅读共用）：
 * 1) 全局续读点指向的卡仍在队（未读/未忽略/未搁置）→ 返回续读点（用户显式位置）；
 * 2) 续读点卡已出队 → 按本书阅读顺序顺延到下一张在队卡（接着读，而非跳回已读内容）；
 * 3) 无/失效续读点或本书已读完 → 真实阅读队列第一张：当前可读（isDueNow）优先，
 *    排序同阅读列表（优先级 → due → 阅读顺序）；全部未来排期时回退排序第一张（允许显式打开）；
 * 4) 队列空 → 阅读列表页。
 */
export function globalReadingTarget(wiki: any): string {
  if (!wiki || typeof wiki.filterTiddlers !== 'function') return ns.PAGE_READING_LIST;
  const g = globalReadPointTitle(wiki);
  // 牌组页不是阅读目标（learning-package 词书带 legacy kind=topic，曾在队时被记为续读点）
  const gIsDeck = g && deckMod.isDeckFields(wiki.getTiddler(g)?.fields || {});
  if (g && !gIsDeck && wiki.getTiddler(g)) {
    const f = wiki.getTiddler(g).fields || {};
    if (sched.isInQueue(f)) return g;
    // 续读点卡已出队：按本书阅读顺序顺延到下一张在队卡；本书读完则落入全局队列
    const docId = String(f['tidme.doc'] || '');
    if (docId) {
      const next = sched.nextSchedulable(sectionsOfDoc(wiki, docId), g, (t: string) => {
        const nf = wiki.getTiddler(t)?.fields;
        return !!nf && !sched.isCardOutOfQueue(nf) && nf['tidme.suspended'] !== 'yes';
      });
      if (next) return next;
    }
  }
  const queue = sched.sortTopicQueue(docQueue.collectTopicQueue(wiki));
  const readable = queue.find((c: any) => sched.isDueNowFor(wiki, c.fields));
  return (readable || queue[0])?.title || ns.PAGE_READING_LIST;
}
