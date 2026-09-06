/*
core/card-factory.ts — 派生卡字段工厂（M3 第一步：从 section.ts 原文迁入，行为不变）

- buildExtract / buildCloze / buildQA：阅读制卡（摘录/挖空/问答）的字段构建唯一实现；
  后续全局手动制卡（M3 触发点矩阵）直接复用本工厂
- parseAnchor / processedSnippets / cleanProcessedText：锚点解析与 SM 对齐
  'Delete processed text' 的加工清理
- commitCard：制卡统一写库口（addTiddler + CARD_CREATED + item 折叠预备）
- M3 泛化：摘录只属于阅读材料——父卡无 tidme.doc 时 buildExtract 返回 null
  （普通笔记直接挖空/问答，item 卡由缺省牌组自动收录）
- 纯字段构建 + 指定 wiki 写入；不做 DOM（划词气泡/弹窗留在调用方 widget）
FSRS 初始字段直接取 core/schema（不再绕 import/parse）；跨 core 模块引用
一律显式 require（避免 esbuild 内联复制）。
*/

declare function require(module: string): any;
const schema = require('$:/plugins/keepone/tidme/core/schema.js');
const paths = require('$:/plugins/keepone/tidme/core/paths.js');
const dom = require('$:/plugins/keepone/tidme/core/dom.js');
const docOps = require('$:/plugins/keepone/tidme/core/doc-ops.js');
const ns = require('$:/plugins/keepone/tidme/core/ns.js');

const escapeHtml = dom.escapeHtml;

/** 解析 tidme.anchor（{section, snippet}） */
export function parseAnchor(raw: any): { section: string; snippet: string } | null {
  if (!raw) return null;
  try {
    const o = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (o && o.section) return { section: String(o.section), snippet: String(o.snippet || '') };
  } catch { /* 忽略非法 anchor */ }
  return null;
}

/**
 * 派生卡命名空间解析：从父卡 title 的实际位置派生（folder 冲突时可能带 ~docId 后缀，slug 重算会错位）。
 * - 摘录：与父卡同目录，叶段 += "--extract"
 * - 挖空/问答（阅读材料来源）：目录 Books→Decks 镜像，叶段 += "--cloze"/"--qa"
 * - 普通笔记（非 Tidme/Books 来源，M6）：统一收进 Tidme/Decks/散卡/<笔记名>--<类型>
 *   （item 类卡片全部入 Decks 命名空间，不再散落在来源目录） */
export function derivedCardBase(pf: Record<string, any>, parentTitle: string, kind: 'extract' | 'cloze' | 'qa'): string {
  const leaf = paths.leafIdOf(parentTitle);
  // 阅读材料（Tidme/Books/ 下）：摘录留原目录，挖空/问答镜像到平行 Decks
  if (parentTitle.startsWith(ns.NS_BOOKS) && leaf) {
    const dir = parentTitle.slice(0, parentTitle.lastIndexOf('/') + 1);
    if (kind === 'extract') return dir + leaf + '--extract';
    return ns.booksToDecksRoot(dir) + leaf + '--' + kind;
  }
  // 普通笔记（无 doc 来源）→ 散卡桶：Tidme/Decks/散卡/<笔记名 slug>--<类型>
  const parentSlug = paths.slugify(parentTitle) || 'untitled';
  return paths.joinPath(ns.NS_DECKS_SCATTER, parentSlug) + '--' + kind;
}

/** 拍平命名空间下同层冲突的序号后缀：base 已被占用则 base-N（N=2,3,…）。 */
export function nextFreeTitle(wiki: any, base: string): string {
  let title = base;
  let i = 2;
  while (wiki.getTiddler(title)) title = `${base}-${i++}`;
  return title;
}

/** 规整片段（紧凑空白 + 截断），用于 anchor.snippet / caption 预览 */
function compactSnippet(s: string, max: number): string {
  return String(s).replace(/\s+/g, ' ').trim().slice(0, max);
}

/**
 * 派生卡公共字段基座：FSRS 初值 + 溯源继承（source/author/format/priority/afactor）+
 * 命名空间字段（doc/parent/kind/subkind/anchor/breadcrumb）。三个 build* 只提供差异项。
 */
function derivedCardFields(opts: {
  parentTitle: string;
  pf: Record<string, any>;
  title: string;
  kind: 'topic' | 'item';
  subkind: 'extract' | 'cloze' | 'qa';
  caption: string;
  text: string;
  snippet: string;
  breadcrumbSuffix: string;
}): Record<string, any> {
  const { pf, parentTitle } = opts;
  const crumbTail = String(pf['tidme.breadcrumb'] || parentTitle);
  return {
    title: opts.title,
    type: 'text/vnd.tiddlywiki',
    caption: opts.caption,
    text: opts.text,
    ...schema.initialFsrsFields(new Date()),
    ...(pf.bag ? { bag: pf.bag } : {}),
    revision: '0',
    'tidme.doc': pf['tidme.doc'] || '',
    'tidme.parent': parentTitle,
    'tidme.kind': opts.kind,
    'tidme.subkind': opts.subkind,
    'tidme.anchor': JSON.stringify({ section: parentTitle, snippet: opts.snippet }),
    'tidme.breadcrumb': `${crumbTail}${ns.CRUMB_SEP}${opts.breadcrumbSuffix}`,
    'tidme.source': pf['tidme.source'] || '',
    'tidme.author': pf['tidme.author'] || '',
    'tidme.format': pf['tidme.format'] || '',
    // G4：派生卡继承父卡优先级（SM 摘录/挖空继承文章优先）
    ...(pf['tidme.priority'] !== undefined ? { 'tidme.priority': String(pf['tidme.priority']) } : {}),
    // SM 对齐：派生卡继承父卡 A-Factor（摘录/挖空作为独立材料沿用父文章的展期节奏）
    ...(pf['tidme.afactor'] !== undefined ? { 'tidme.afactor': String(pf['tidme.afactor']) } : {}),
  };
}

/** 摘录卡字段（Alt+X）。tidme.anchor = 原文定位（跳回 Section 高亮用）。
 * 分类对齐 SuperMemo：摘录 = Topic（阅读材料），kind=topic/subkind=extract，
 * 进阅读列表（阅读流）。要成为测试卡：在摘录上挖空 → item（cloze）。
 * M3 泛化：父卡无 tidme.doc（普通笔记）→ 返回 null（摘录不属于笔记；改用挖空/问答）。 */
export function buildExtract(wiki: any, parentTitle: string, selection: string): Record<string, any> | null {
  const pf = wiki.getTiddler(parentTitle)?.fields || {};
  if (!pf['tidme.doc']) return null;
  const title = nextFreeTitle(wiki, derivedCardBase(pf, parentTitle, 'extract'));
  const preview = compactSnippet(selection, 30);
  return derivedCardFields({
    parentTitle,
    pf,
    title,
    kind: 'topic',
    subkind: 'extract',
    caption: preview + (selection.length > preview.length ? '…' : ''),
    text: `<blockquote>\n${escapeHtml(selection.trim())}\n</blockquote>\n\n<p class="tm-import-muted">—— 摘自 [[${parentTitle}]]</p>`,
    snippet: compactSnippet(selection, 80),
    breadcrumbSuffix: '摘录',
  });
}

/** 挖空卡字段（Alt+Z）。分类对齐 SuperMemo：挖空 = Item（测试卡），kind=item/subkind=cloze */
export function buildCloze(wiki: any, parentTitle: string, block: string, selected: string): Record<string, any> | null {
  const at = block.indexOf(selected);
  if (at === -1) return null;
  const safeSel = selected.replace(/"/g, '”');
  const clozeLine = `${block.slice(0, at)}<<C "${safeSel}" "c1" "">>${block.slice(at + selected.length)}`;
  const pf = wiki.getTiddler(parentTitle)?.fields || {};
  const title = nextFreeTitle(wiki, derivedCardBase(pf, parentTitle, 'cloze'));
  return derivedCardFields({
    parentTitle,
    pf,
    title,
    kind: 'item',
    subkind: 'cloze',
    caption: clozeLine,
    text: '',
    snippet: compactSnippet(selected, 80),
    breadcrumbSuffix: '挖空',
  });
}

/** 问答卡字段（QA Card）。kind=item/subkind=qa */
export function buildQA(wiki: any, parentTitle: string, question: string, answer: string): Record<string, any> {
  const pf = wiki.getTiddler(parentTitle)?.fields || {};
  const title = nextFreeTitle(wiki, derivedCardBase(pf, parentTitle, 'qa'));
  return derivedCardFields({
    parentTitle,
    pf,
    title,
    kind: 'item',
    subkind: 'qa',
    caption: question || answer.slice(0, 30),
    text: `Q: ${question}\n\nA: ${answer}`,
    snippet: compactSnippet(answer, 80),
    breadcrumbSuffix: '问答',
  });
}

/**
 * 收集本卡全部衍生卡（摘录/挖空/问答）的 anchor 片段（SM 'Delete processed text' 的清理对象）。
 * 对应官方帮助：Delete processed text - delete all texts that have already been extracted or ignored。
 */
export function processedSnippets(wiki: any, title: string): string[] {
  const childTitles = wiki.filterTiddlers(`[all[shadows+tiddlers]tidme.parent[${title.replace(/\]/g, '')}]]`);
  const out: string[] = [];
  for (const c of childTitles) {
    const f = wiki.getTiddler(c)?.fields;
    if (!f) continue;
    const anchor = parseAnchor(f['tidme.anchor']);
    if (anchor?.snippet) out.push(anchor.snippet);
  }
  return out;
}

/**
 * SM 对齐 'Delete processed text'：从本卡原文中删除已被摘录/挖空/问答的文本片段。
 * 衍生卡不受影响（SM：Done! 删正文但保留 extracted material）；snippet 不在原文中时跳过，幂等。
 * @returns 实际删除的片段数
 */
export function cleanProcessedText(wiki: any, title: string): number {
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

/**
 * 制卡统一写库口（M3）：addTiddler + CARD_CREATED 事件 + item 折叠态预备。
 * 阅读划词与未来的全局制卡入口共用，禁止各自拼写库与事件顺序。
 * @returns 是否已写库（draft 为空/被拒时 false）
 */
export function commitCard(wiki: any, draft: Record<string, any> | null, widget?: any): boolean {
  if (!draft || !draft.title) return false;
  wiki.addTiddler(draft);
  docOps.prepareCardFold(wiki, draft.title);
  return true;
}
