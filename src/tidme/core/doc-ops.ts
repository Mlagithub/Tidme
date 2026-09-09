/*
core/doc-ops.ts — 文档/卡片运维操作（文档查询、删除阅读材料、折叠态、阅读入口目标）
只依赖 wiki 对象与 core/session（常量），不渲染 DOM。
跨 core 模块引用一律显式 require（避免 esbuild 内联复制）。
*/

declare function require(module: string): any;
const session = require('$:/plugins/keepone/tidme/core/session.js');
const deckMod = require('$:/plugins/keepone/tidme/core/deck.js');
const ns = require('$:/plugins/keepone/tidme/core/ns.js');
const sched = require('$:/plugins/keepone/tidme/core/scheduler.js');

export const READPOINT_PREFIX = '$:/config/tidme/readpoint/';
/** 全局续读点（最近打开的阅读卡；section-bar 写、workflow「开始阅读」读） */
export const GLOBAL_READPOINT = READPOINT_PREFIX + 'global';

/** 各书的章节进度（一次全库扫描按书聚合；口径与 sectionsOfDoc 一致：topic 且非摘录）。
 * 供「最近阅读」等聚合视图使用——避免每书一次全库扫描（书多时 O(书数×全库)）。 */
export function sectionsProgressByDoc(wiki: any): Map<string, { done: number; total: number }> {
  const agg = new Map<string, { done: number; total: number }>();
  if (!wiki || typeof wiki.filterTiddlers !== 'function') return agg;
  const secs = wiki.filterTiddlers('[has[tidme.doc]nsort[tidme.order]]');
  for (const t of secs) {
    const f = wiki.getTiddler(t)?.fields;
    if (!f) continue;
    if (!isContentSection(f)) continue;
    const docId = String(f['tidme.doc'] || '');
    const a = agg.get(docId) || { done: 0, total: 0 };
    a.total += 1;
    if (sched.isCardDone(f)) a.done += 1;
    agg.set(docId, a);
  }
  return agg;
}

/** 某 book folder（Tidme/Books/<slug>）下第一张带 tidme.doc 的卡所属 docId（无占用返回 null）——同名书冲突探测 */
export function docFolderOwner(wiki: any, baseFolder: string): string | null {
  if (!wiki || typeof wiki.filterTiddlers !== 'function') return null;
  const first = wiki.filterTiddlers(`[all[shadows+tiddlers]prefix[${baseFolder}]has[tidme.doc]]`)[0];
  if (!first) return null;
  const doc = wiki.getTiddler(first)?.fields?.['tidme.doc'];
  return doc !== undefined && doc !== null && doc !== '' ? String(doc) : null;
}

/** 按 docId 查真实文档页 title（folder 含 ~docId 后缀时亦准确）；找不到返回 "" */
export function docPageOfDoc(wiki: any, docId: string): string {
  if (!wiki || typeof wiki.filterTiddlers !== 'function') return '';
  return wiki.filterTiddlers(`[tag[tidme-import-doc]tidme.doc[${docId}]]`)[0] || '';
}

/** 文档页判定：带 tidme-import-doc 标签 */
function isDocPage(f: Record<string, any>): boolean {
  return Array.isArray(f.tags) && f.tags.includes('tidme-import-doc');
}

/** 正文章节判定（阅读进度口径）：topic 节卡；摘录与牌组页（词书 tidme.doc 的宿主）不算 */
function isContentSection(f: Record<string, any>): boolean {
  return f['tidme.kind'] === 'topic' &&
    String(f['tidme.subkind'] || '') !== 'extract' &&
    !deckMod.isDeckFields(f);
}

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

/**
 * 阅读目标卡的续读点位置标签：PDF 节卡（有 tidme.pages）携带起始页 `p<start>`，
 * 文本卡返回空串。推进流（已读/下一节/完成下一张）写续读点必须经此携带页码——
 * 用 s:'' 覆盖会把上一段的绝对页抹掉，下次打开回落首页（阅读记录丢失）。
 */
export function readPointPositionOf(wiki: any, title: string): string {
  if (!wiki || !title) return '';
  const pages = String(wiki.getTiddler(title)?.fields?.['tidme.pages'] || '');
  const m = /^\s*(\d+)\s*-\s*\d+\s*$/.exec(pages);
  return m ? `p${m[1]}` : '';
}

/** 写全局续读点（最近打开的阅读卡）；modified 供「最近阅读」排序，唯一写入口 */
export function saveGlobalReadPoint(wiki: any, title: string): void {
  if (!wiki || !title) return;
  wiki.addTiddler({ title: GLOBAL_READPOINT, text: title, modified: new Date() });
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
    if (!sched.isCardDone(f) && f['tidme.suspended'] !== 'yes') return rp.t;
  }
  const first = sectionsOfDoc(wiki, docId).find((t: string) => {
    const f = wiki.getTiddler(t)?.fields;
    return !!f && !sched.isCardDone(f) && f['tidme.suspended'] !== 'yes';
  });
  return first || docPageOfDoc(wiki, docId) || '';
}

/**
 * 删除一本书的"阅读材料"，保留全部"知识产物"：
 * 删除：文档页 + 全部 topic/subkind=section 节卡（导入切分节 + 大纲手动插入的"新节"；含 obsolete 归档）
 * 保留：摘录（topic/extract）、挖空/问答（item）、无 kind 手动散卡、子集牌组外的知识对象
 * 附带：删除本书子集牌组（tidme.subset-doc）；续读点仅当其指向被删内容时清除；
 *       学习会话列表剔除被删卡（保留其余队列语义）。
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
    // 阅读材料：文档页 + topic 节卡（subkind!==extract → 摘录保留；kind=item/无 kind 保留）
    if (isDocPage(f)) {
      targets.add(t);
      // PDF：二进制与 OCR 转写页同属阅读材料，级联清理
      if (f['tidme.pdf']) targets.add(String(f['tidme.pdf']));
      for (const o of wiki.filterTiddlers(`[all[shadows+tiddlers]prefix[${t}/ocr-p]]`)) targets.add(o);
      continue;
    }
    if (f['tidme.kind'] === 'topic' && String(f['tidme.subkind'] || 'section') !== 'extract') targets.add(t);
  }
  // 子集牌组是临时复习脚手架（引用保留的知识卡），随本书清理（经 core/deck 判定）
  for (const d of deckMod.listDecks(wiki)) {
    const dd = deckMod.getDeck(wiki, d);
    if (deckMod.isSubset(dd) && String(dd?.fields['tidme.subset-doc'] || '') === docId) targets.add(d);
  }

  // 学习会话：剔除被删卡（保留其余卡与队列语义）
  const sess = wiki.getTiddler(session.SESSION_TIDDLER);
  if (sess && Array.isArray(sess.fields.list)) {
    const keep = sess.fields.list.filter((t: string) => !targets.has(t));
    if (keep.length !== sess.fields.list.length) {
      wiki.addTiddler({ ...sess.fields, title: session.SESSION_TIDDLER, list: keep });
    }
  }
  // 续读点：仅当指向被删内容时清除（指向保留的摘录/卡则保留）
  const rpTarget = parseReadPointRaw(String(wiki.getTiddler(READPOINT_PREFIX + docId)?.fields.text || ''));
  if (rpTarget && targets.has(rpTarget.t)) {
    wiki.deleteTiddler(READPOINT_PREFIX + docId);
  }
  const gTarget = parseReadPointRaw(String(wiki.getTiddler(GLOBAL_READPOINT)?.fields.text || ''));
  if (gTarget && targets.has(gTarget.t)) {
    wiki.deleteTiddler(GLOBAL_READPOINT);
  }

  let n = 0;
  for (const t of targets) {
    if (wiki.getTiddler(t)) {
      wiki.deleteTiddler(t);
      n++;
    }
  }
  return n;
}

/** 某文档全部正文章节（阅读进度口径，与文档页一致；topic 卡中排除摘录与牌组页） */
export function sectionsOfDoc(wiki: any, docId: string): string[] {
  const all = wiki
    .filterTiddlers('[has[tidme.doc]nsort[tidme.order]]')
    .filter((t: string) => {
      const f = wiki.getTiddler(t)?.fields;
      if (!f) return false;
      return String(f['tidme.doc']) === docId && isContentSection(f);
    });
  const nonDoc = all.filter((t: string) => !isDocPage(wiki.getTiddler(t)?.fields || {}));
  return nonDoc.length > 0 ? nonDoc : all;
}

/** 根据页码查找该页所属的节卡（若无匹配则返回 null） */
export function sectionOfDocByPage(wiki: any, docId: string, page: number): string | null {
  if (!wiki || !docId || !Number.isFinite(page)) return null;
  const sections = sectionsOfDoc(wiki, docId);
  for (const s of sections) {
    const f = wiki.getTiddler(s)?.fields;
    if (!f || !f['tidme.pages']) continue;
    const m = /^\s*(\d+)\s*-\s*(\d+)\s*$/.exec(String(f['tidme.pages']));
    if (m) {
      const start = Number(m[1]);
      const end = Number(m[2]);
      if (page >= start && page <= end) {
        return s;
      }
    }
  }
  return null;
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
  const g = String(wiki.getTiddler(GLOBAL_READPOINT)?.fields?.text || '').trim();
  // 牌组页不是阅读目标（learning-package 词书带 legacy kind=topic，曾在队时被记为续读点）
  const gIsDeck = g && deckMod.isDeckFields(wiki.getTiddler(g)?.fields || {});
  if (g && !gIsDeck && wiki.getTiddler(g)) {
    const f = wiki.getTiddler(g).fields || {};
    if (!sched.isCardDone(f) && f['tidme.suspended'] !== 'yes') return g;
    // 续读点卡已出队：按本书阅读顺序顺延到下一张在队卡；本书读完则落入全局队列
    const docId = String(f['tidme.doc'] || '');
    if (docId) {
      const next = sched.nextSchedulable(sectionsOfDoc(wiki, docId), g, (t: string) => {
        const nf = wiki.getTiddler(t)?.fields;
        return !!nf && !sched.isCardDone(nf) && nf['tidme.suspended'] !== 'yes';
      });
      if (next) return next;
    }
  }
  const queue = sched.sortTopicQueue(sched.collectTopicQueue(wiki));
  const readable = queue.find((c: any) => sched.isDueNow(c.fields));
  return (readable || queue[0])?.title || ns.PAGE_READING_LIST;
}

/** 解析 tidme.anchor 提取 snippet（内部纯函数） */
function parseAnchorSnippet(raw: any): string {
  if (!raw) return '';
  try {
    const o = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return String(o?.snippet || '');
  } catch {
    return '';
  }
}

/**
 * 收集本卡全部衍生卡（摘录/挖空/问答）的 anchor 片段（SM 'Delete processed text' 的清理对象）。
 * 对应官方帮助：Delete processed text - delete all texts that have already been extracted or ignored。
 */
export function processedSnippets(wiki: any, title: string): string[] {
  if (!wiki || typeof wiki.filterTiddlers !== 'function') return [];
  const childTitles = wiki.filterTiddlers(`[all[shadows+tiddlers]tidme.parent[${title.replace(/\]/g, '')}]]`);
  const out: string[] = [];
  for (const c of childTitles) {
    const f = wiki.getTiddler(c)?.fields;
    if (!f) continue;
    const snippet = parseAnchorSnippet(f['tidme.anchor']);
    if (snippet) out.push(snippet);
  }
  return out;
}

/**
 * SM 对齐 'Delete processed text'：从本卡原文中删除已被摘录/挖空/问答的文本片段。
 * 衍生卡不受影响（SM：Done! 删正文但保留 extracted material）；snippet 不在原文中时跳过，幂等。
 * @returns 实际删除的片段数
 */
export function cleanProcessedText(wiki: any, title: string): number {
  if (!wiki || typeof wiki.getTiddler !== 'function') return 0;
  const t = wiki.getTiddler(title);
  if (!t) return 0;
  let out = String(t.fields.text || '');
  const snippets = processedSnippets(wiki, title);
  let removed = 0;
  for (const s of snippets) {
    let at = out.indexOf(s);
    if (at === -1) continue;
    let end = at + s.length;
    // 顺带吸收邻接的单个空白，避免删除后两段文字粘连
    if (at > 0 && /\s/.test(out[at - 1])) at--;
    if (end < out.length && /\s/.test(out[end])) end++;
    out = out.slice(0, at) + out.slice(end);
    removed++;
  }
  if (removed) {
    out = out
      .replace(/<p>\s*<\/p>/g, '') // 清理整段被删后遗留的空 <p>
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    wiki.addTiddler({ ...t.fields, text: out });
  }
  return removed;
}
