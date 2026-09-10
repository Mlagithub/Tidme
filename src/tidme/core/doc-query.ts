/*
core/doc-query.ts — 文档实体谓词与查询（只读 wiki，不写库）

职责：文档页/阅读单元的判定与查找——「这是什么」与「它下面有什么」。
- isDocPage / isContinuousCard：实体谓词（全库唯一口径）
- docPageOfDoc / docFolderOwner：按 docId / folder 反查文档页
- sectionsOfDoc / sectionOfDocByPage：阅读单元集合与按页定位

不含：续读点读写（core/doc-readpoint）、队列过滤器（core/doc-queue）、删除级联（core/doc-delete）。
跨 core 模块引用一律显式 require（避免 esbuild 内联复制）。
*/

declare function require(module: string): any;
const deckMod = require('$:/plugins/keepone/tidme/core/deck.js');
const ns = require('$:/plugins/keepone/tidme/core/ns.js');

/** 某 doc folder（Tidme/Docs/<slug>）下第一张带 tidme.doc 的卡所属 docId（无占用返回 null）——同名书冲突探测 */
export function docFolderOwner(wiki: any, baseFolder: string): string | null {
  if (!wiki || typeof wiki.filterTiddlers !== 'function') return null;
  // baseFolder 通常来自 paths.docRoot（slug 已过滤字符）；手写路径含 `]`/`}` 时无法插值（TW 不支持转义）
  if (!ns.isFilterSafeTitle(baseFolder)) return null;
  const first = wiki.filterTiddlers(`[all[shadows+tiddlers]prefix[${baseFolder}]has[tidme.doc]]`)[0];
  if (!first) return null;
  const doc = wiki.getTiddler(first)?.fields?.['tidme.doc'];
  return doc !== undefined && doc !== null && doc !== '' ? String(doc) : null;
}

/** 按 docId 查真实文档页 title（folder 含 ~docId 后缀时亦准确）；找不到返回 "" */
export function docPageOfDoc(wiki: any, docId: string): string {
  if (!wiki || typeof wiki.filterTiddlers !== 'function') return '';
  return wiki.filterTiddlers(`[tag[tidme-doc]tidme.doc[${docId}]]`)[0] || '';
}

/** 文档页判定：带 tidme-doc 标签 */
export function isDocPage(f: Record<string, any> | null | undefined): boolean {
  return !!f && Array.isArray(f.tags) && f.tags.includes('tidme-doc');
}

/**
 * 连续型阅读卡判定（整本/整篇不切分的阅读材料：如整本 PDF 或未切分长文）：
 * 文档页自身即阅读卡（带 tidme-doc、kind=topic、structure=continuous）。
 * 这类卡代表整个连续阅读单元——推进只更新阅读点（页码/偏移）不标 done。
 *
 * 唯一判据是 `tidme.structure`（文档页构建处必写：切分产物 sectioned / 整本 PDF continuous）。
 * 曾用「format=pdf 的文档页即连续卡」兜底，那会把**分节** PDF 文档页也判成连续卡
 * （进度显示页码而非节数），与 `ns.TOPIC_QUEUE_FILTER` 的 `!structure[sectioned]` 口径打架。
 */
export function isContinuousCard(fields: Record<string, any> | null | undefined): boolean {
  if (!fields) return false;
  return String(fields['tidme.structure'] || '') === 'continuous';
}

/** 正文章节判定（阅读进度口径）：topic 节卡；摘录、牌组页与文档页（宿主页）不算 */
export function isContentSection(f: Record<string, any>): boolean {
  return f['tidme.kind'] === 'topic' &&
    !isDocPage(f) &&
    String(f['tidme.subkind'] || '') !== 'extract' &&
    !deckMod.isDeckFields(f);
}

/** 文档的阅读单元集合：分节书 → 节卡；连续型文档（整本 PDF/未切分长文）→ 文档页自身。
 *  文档页与节卡同为 kind=topic，靠 tidme-doc 标签区分（文档页不是节卡）。 */
export function sectionsOfDoc(wiki: any, docId: string): string[] {
  const owned = wiki
    .filterTiddlers('[has[tidme.doc]nsort[tidme.order]]')
    .filter((t: string) => {
      const f = wiki.getTiddler(t)?.fields;
      return !!f && String(f['tidme.doc']) === docId;
    });
  const sections = owned.filter((t: string) => isContentSection(wiki.getTiddler(t)?.fields || {}));
  if (sections.length) return sections;
  return owned.filter((t: string) => isContinuousCard(wiki.getTiddler(t)?.fields || {}));
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
