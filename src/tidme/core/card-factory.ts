/*
core/card-factory.ts — 派生卡字段工厂（从 section.ts 迁入，行为不变）

- buildExtract / buildCloze / buildQA / buildImageQA / buildStandaloneCard：制卡的
  字段构建唯一实现；锚点解析（parseAnchor）与 SM 'Delete processed text' 的加工
  清理（processedSnippets / cleanProcessedText）也在本模块——清理对象是"本卡衍生卡"，
  与制卡同属加工闭环（它不查文档/阅读队列，放 doc-ops 属放错抽屉）
- commitCard：制卡统一写库口（addTiddler + item 折叠预备）
- 摘录只属于阅读材料——父卡无 tidme.doc 时 buildExtract 返回 null
  （普通笔记直接挖空/问答，item 卡由缺省牌组自动收录）
- 纯字段构建 + 指定 wiki 写入；不做 DOM（划词气泡/弹窗留在调用方 widget）
FSRS 初始字段直接取 core/schema（不再绕 import/parse）；跨 core 模块引用
一律显式 require（避免 esbuild 内联复制）。
*/

declare function require(module: string): any;
const schema = require('$:/plugins/keepone/tidme/core/schema.js');
const paths = require('$:/plugins/keepone/tidme/core/paths.js');
const session = require('$:/plugins/keepone/tidme/core/session.js');
const sched = require('$:/plugins/keepone/tidme/core/scheduler.js');
const ns = require('$:/plugins/keepone/tidme/core/ns.js');
const titleMod = require('$:/plugins/keepone/tidme/core/title.js');

const escapeHtml = schema.escapeHtml;

// ---------- 文档页 / 节卡字段基座（切分产物、整本 PDF、手动插节共用） ----------

export interface DocPageFieldsOptions {
  /** 文档页 title（Tidme/Docs/<slug> 路径） */
  title: string;
  /** 可读名（列表/模板显示用；title 是路径） */
  caption?: string;
  docId: string;
  /** 阅读单元形态：sectioned = 有节卡（页只是入口）/ continuous = 页自身即阅读卡 */
  structure: 'sectioned' | 'continuous';
  format?: string;
  text?: string;
  /** 形态差异字段（FSRS 初值、asset、溯源 url/author/date、bag/revision 等） */
  extra?: Record<string, any>;
}

/**
 * 文档页字段基座（唯一产地）：不变式字段（tidme-doc 标签、kind=topic、doc/docpage、
 * structure）都在这里，各构建处只提供差异（extra）。
 * 曾由切分产物与整本 PDF 各拼一份，新增字段漏一处即静默失配（kind/structure 都漏过）。
 */
export function buildDocPageFields(opts: DocPageFieldsOptions): Record<string, any> {
  const base: Record<string, any> = {
    title: opts.title,
    type: 'text/vnd.tiddlywiki',
    tags: ['tidme-doc'],
    'tidme.kind': 'topic',
    'tidme.doc': opts.docId,
    'tidme.docpage': opts.title,
    'tidme.structure': opts.structure,
  };
  if (opts.caption !== undefined && opts.caption !== '') base.caption = opts.caption;
  if (opts.text !== undefined) base.text = opts.text;
  if (opts.format) base['tidme.format'] = opts.format;
  return { ...base, ...(opts.extra || {}) };
}

export interface SectionCardFieldsOptions {
  title: string;
  caption?: string;
  docId: string;
  /** 文档页 title（含 ~docId 后缀时以此为准） */
  docPage?: string;
  text?: string;
  /** 正文字数（默认按 text 长度） */
  chars?: number;
  priority?: string | number;
  /** A-Factor；缺省按 chars 启发式（与切分产物同口径） */
  afactor?: string | number;
  breadcrumb?: string;
  /** 切分产物的身份/顺序字段（tidme.id/hash/order/level/merged/file）等 */
  extra?: Record<string, any>;
}

/**
 * 节卡字段基座（唯一产地）：kind=topic/subkind=section/doc/chars/priority/afactor/breadcrumb
 * 等不变式在这里；切分产物与「手动插入节」都走它，防止默认值在两处漂移
 * （如 A-Factor 启发式、priority 归一化）。
 */
export function buildSectionCardFields(opts: SectionCardFieldsOptions): Record<string, any> {
  const text = opts.text === undefined ? '' : String(opts.text);
  const chars = opts.chars === undefined ? text.length : Number(opts.chars);
  const base: Record<string, any> = {
    title: opts.title,
    type: 'text/vnd.tiddlywiki',
    ...schema.initialFsrsFields(new Date()),
    'tidme.kind': 'topic',
    'tidme.subkind': 'section',
    'tidme.doc': opts.docId,
    'tidme.chars': String(chars),
    'tidme.priority': String(sched.normalizePriority(opts.priority)),
    'tidme.afactor': String(opts.afactor === undefined ? sched.afactorForText(chars) : opts.afactor),
  };
  if (opts.caption !== undefined) base.caption = opts.caption;
  if (opts.text !== undefined) base.text = text;
  if (opts.docPage) base['tidme.docpage'] = opts.docPage;
  if (opts.breadcrumb) base['tidme.breadcrumb'] = opts.breadcrumb;
  return { ...base, ...(opts.extra || {}) };
}

/** 解析 tidme.anchor（{section, snippet, page}） */
export function parseAnchor(raw: any): { section: string; snippet: string; page?: number } | null {
  if (!raw) return null;
  try {
    const o = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (o && o.section) {
      return {
        section: String(o.section),
        snippet: String(o.snippet || ''),
        page: o.page ? Number(o.page) : undefined,
      };
    }
  } catch { /* 忽略非法 anchor */ }
  return null;
}

/**
 * 派生卡命名空间解析：从父卡 title 的实际位置派生（folder 冲突时可能带 ~docId 后缀，slug 重算会错位）。
 * - 摘录：与父卡同目录，叶段 += "--extract"
 * - 挖空/问答（阅读材料来源）：目录 Docs→Decks 镜像，叶段 += "--cloze"/"--qa"
 * - 普通笔记（非 Tidme/Docs 来源）：统一收进 Tidme/Decks/standalone/<笔记名>--<类型>
 *   （item 类卡片全部入 Decks 命名空间，不再散落在来源目录） */
export function derivedCardBase(pf: Record<string, any>, parentTitle: string, kind: 'extract' | 'cloze' | 'qa'): string {
  const leaf = paths.leafIdOf(parentTitle);
  // 阅读材料（Tidme/Docs/ 下）：摘录留原目录，挖空/问答镜像到平行 Decks
  if (parentTitle.startsWith(ns.NS_DOCS) && leaf) {
    const dir = parentTitle.slice(0, parentTitle.lastIndexOf('/') + 1);
    if (kind === 'extract') return dir + leaf + '--extract';
    return ns.docsToDecksRoot(dir) + leaf + '--' + kind;
  }
  // 普通笔记（无 doc 来源）→ 独立卡桶：Tidme/Decks/standalone/<笔记名 slug>--<类型>
  const parentSlug = paths.slugify(parentTitle) || 'untitled';
  return paths.joinPath(ns.NS_DECKS_STANDALONE, parentSlug) + '--' + kind;
}

/** 规整片段（紧凑空白 + 截断），用于 anchor.snippet / caption 预览 */
function compactSnippet(s: string, max: number): string {
  return String(s).replace(/\s+/g, ' ').trim().slice(0, max);
}

/** 提取纯文本摘要作为安全 Caption，剥离所有 HTML/Base64，确保不会污染卡片摘要与列表渲染 */
export function safeCaption(question: string, answer: string, prefix = ''): string {
  // 彻底剔除所有 HTML 标签（含 <img src="data:...">），收敛空白
  const textQ = String(question || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const textA = String(answer || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (textQ) return textQ.slice(0, 40);
  if (textA) return (prefix ? prefix + ' ' : '') + textA.slice(0, 35);
  return prefix || 'Q&A Card';
}

/** 派生图片问答卡标题基座：短化命名空间（<NS_DECKS>{书名}/P{页}-{label或QA}），避免深层目录全量冗长堆叠。
 *  与文本卡（derivedCardBase 的 Docs→Decks 目录镜像）刻意不同：图片卡只取书名段、
 *  不镜像深层目录（同书图片卡集中一目录，靠 core/title.freeTitle 保证唯一）。 */
export function derivedImageQABase(pf: Record<string, any>, parentTitle: string, page?: number, label?: string): string {
  let dir = '';
  if (parentTitle.startsWith(ns.NS_DOCS)) {
    const parts = parentTitle.split('/');
    const docName = parts[2] || 'doc';
    dir = ns.NS_DECKS + docName + '/';
  } else {
    const parentSlug = paths.slugify(parentTitle) || 'untitled';
    dir = paths.joinPath(ns.NS_DECKS_STANDALONE, parentSlug) + '/';
  }
  const pagePrefix = page && page > 0 ? `P${page}-` : '';
  const labelSuffix = label ? paths.slugify(label).slice(0, 25) : 'QA';
  return `${dir}${pagePrefix}${labelSuffix || 'QA'}`;
}

/**
 * 派生卡公共字段基座：FSRS 初值 + 溯源继承（source/author/format/priority/afactor）+
 * 命名空间字段（doc/parent/kind/subkind/anchor/breadcrumb）。三个 build* 只提供差异项。
 * 字段契约：身份 = title（无 tidme.id/order/level/hash——那是导入 parse Section 族的
 * 规范，见 core/schema 头部声明；本基座不适用 schema.assertKind）。
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
    // 派生卡继承父卡优先级（SM 摘录/挖空继承文章优先，缺省归一回默认 50）
    'tidme.priority': String(sched.normalizePriority(pf['tidme.priority'])),
    // SM 对齐：Topic 派生卡继承父卡 A-Factor（若无则按自身篇幅启发式设定，默认 1.5）
    ...(opts.kind === 'topic'
      ? {
        'tidme.afactor': String(
          pf['tidme.afactor'] !== undefined
            ? sched.normalizeAFactor(pf['tidme.afactor'])
            : sched.afactorForText(opts.text?.length || 0),
        ),
      }
      : pf['tidme.afactor'] !== undefined
      ? { 'tidme.afactor': String(pf['tidme.afactor']) }
      : {}),
  };
}

/** 摘录卡字段（Alt+X）。tidme.anchor = 原文定位（跳回 Section 高亮用）。
 * 分类对齐 SuperMemo：摘录 = Topic（阅读材料），kind=topic/subkind=extract，
 * 进阅读列表（阅读流）。要成为测试卡：在摘录上挖空 → item（cloze）。
 * 父卡无 tidme.doc（普通笔记）→ 返回 null（摘录不属于笔记；改用挖空/问答）。
 * @param pending 本批次已 build 但尚未落库的 title（弹窗确认等窗口用，见 core/title） */
export function buildExtract(wiki: any, parentTitle: string, selection: string, pending?: Iterable<string>): Record<string, any> | null {
  const pf = wiki.getTiddler(parentTitle)?.fields || {};
  if (!pf['tidme.doc']) return null;
  const title = titleMod.freeTitle(wiki, derivedCardBase(pf, parentTitle, 'extract'), pending);
  const preview = compactSnippet(selection, 30);
  return derivedCardFields({
    parentTitle,
    pf,
    title,
    kind: 'topic',
    subkind: 'extract',
    caption: preview + (selection.length > preview.length ? '…' : ''),
    text: `<blockquote>\n${escapeHtml(selection.trim())}\n</blockquote>\n\n<p class="tm-import-muted">-- From [[${parentTitle}]]</p>`,
    snippet: compactSnippet(selection, 80),
    breadcrumbSuffix: 'Extract',
  });
}

/** 挖空卡字段（Alt+Z）。分类对齐 SuperMemo：挖空 = Item（测试卡），kind=item/subkind=cloze
 * @param pending 本批次已 build 但尚未落库的 title（本卡要等弹窗确认才落库，见 core/title） */
export function buildCloze(wiki: any, parentTitle: string, block: string, selected: string, pending?: Iterable<string>): Record<string, any> | null {
  const at = block.indexOf(selected);
  if (at === -1) return null;
  const safeSel = selected.replace(/"/g, '”');
  const clozeLine = `${block.slice(0, at)}<<C "${safeSel}" "c1" "">>${block.slice(at + selected.length)}`;
  const pf = wiki.getTiddler(parentTitle)?.fields || {};
  const title = titleMod.freeTitle(wiki, derivedCardBase(pf, parentTitle, 'cloze'), pending);
  return derivedCardFields({
    parentTitle,
    pf,
    title,
    kind: 'item',
    subkind: 'cloze',
    caption: clozeLine,
    text: '',
    snippet: compactSnippet(selected, 80),
    breadcrumbSuffix: 'Cloze',
  });
}

/** 问答卡字段（QA Card）。kind=item/subkind=qa
 * @param pending 本批次已 build 但尚未落库的 title（见 core/title） */
export function buildQA(wiki: any, parentTitle: string, question: string, answer: string, pending?: Iterable<string>): Record<string, any> {
  const pf = wiki.getTiddler(parentTitle)?.fields || {};
  const title = titleMod.freeTitle(wiki, derivedCardBase(pf, parentTitle, 'qa'), pending);
  const q = String(question || '').trim();
  const a = String(answer || '').trim();
  return derivedCardFields({
    parentTitle,
    pf,
    title,
    kind: 'item',
    subkind: 'qa',
    caption: safeCaption(question, answer),
    text: [q, a].filter(Boolean).join('\n\n'),
    snippet: compactSnippet(answer, 80),
    breadcrumbSuffix: 'Q&A',
  });
}

export interface ImageQAOptions {
  dataUrl: string;
  answer: string;
  label?: string;
  page?: number;
}

/** 图片问答卡字段（PDF 框选或截图制卡）。kind=item/subkind=qa
 * @param pending 本批次已 build 但尚未落库的 title（见 core/title） */
export function buildImageQA(wiki: any, parentTitle: string, opts: ImageQAOptions, pending?: Iterable<string>): Record<string, any> {
  const pf = wiki.getTiddler(parentTitle)?.fields || {};
  const base = derivedImageQABase(pf, parentTitle, opts.page, opts.label);
  const title = titleMod.freeTitle(wiki, base, pending);
  const labelText = (opts.label || '').trim();
  const answerText = (opts.answer || '').trim();
  const qBody = labelText
    ? `**${labelText}**\n\n<img src="${opts.dataUrl}" style="max-width:100%">`
    : `<img src="${opts.dataUrl}" style="max-width:100%">`;
  const caption = labelText
    ? `[Img] ${labelText}`
    : safeCaption('', answerText, `[Img] p.${opts.page || ''} Q&A`);
  const card = derivedCardFields({
    parentTitle,
    pf,
    title,
    kind: 'item',
    subkind: 'qa',
    caption,
    text: [qBody, answerText || '(Answer pending)'].filter(Boolean).join('\n\n'),
    snippet: compactSnippet(answerText || labelText, 80),
    breadcrumbSuffix: 'Image Q&A',
  });
  if (opts.page && opts.page > 0) {
    card['tidme.page'] = String(opts.page);
    card['tidme.anchor'] = JSON.stringify({
      section: parentTitle,
      page: opts.page,
      snippet: compactSnippet(labelText || answerText, 80),
    });
  }
  return card;
}

export interface StandaloneCardOptions {
  type: 'qa' | 'cloze' | 'concept';
  title?: string;
  deck?: string; // 牌组名；空 / STANDALONE_DECK_TOKEN / 'standalone' 均归散卡桶
  question?: string;
  answer?: string;
  clozeContent?: string;
  conceptContent?: string;
  tags?: string[];
  priority?: string | number;
  /** 本批次已 build 但尚未落库的 title（连建制卡等窗口用，见 core/title） */
  pending?: Iterable<string>;
}

/** 独立制卡「散卡桶 / standalone」的内部标识（omni-creator 下拉 value 与此共用同一来源） */
export const STANDALONE_DECK_TOKEN = '__standalone__';

/** 全局独立卡片构建（无需依附特定阅读材料）。kind 由模板决定，归属于指定牌组或独立卡桶 */
export function buildStandaloneCard(wiki: any, opts: StandaloneCardOptions): Record<string, any> {
  const deck = (opts.deck || STANDALONE_DECK_TOKEN).trim();
  const lower = deck.toLowerCase();
  const isStandalone = !deck ||
    deck === STANDALONE_DECK_TOKEN ||
    lower === 'standalone' ||
    deck === '散卡' ||
    deck === ns.NS_DECKS_STANDALONE ||
    deck === ns.DECK_PREFIX + 'standalone' ||
    deck === 'Tidme/Decks/散卡' ||
    deck === ns.DECK_PREFIX + '散卡';
  const deckDir = isStandalone ? ns.NS_DECKS_STANDALONE : `Tidme/Decks/${deck}`;
  // tidme.deck/breadcrumb 落展示名：独立卡桶不落内部哨兵 token
  const deckName = isStandalone ? String(ns.NS_DECKS_STANDALONE).slice(String(ns.NS_DECKS).length) : deck;

  // 智能标题基座
  let slug = '';
  if (opts.title) {
    slug = paths.slugify(opts.title);
  }
  if (!slug) {
    if (opts.type === 'qa') {
      slug = paths.slugify(opts.question?.slice(0, 20) || '') || 'QA';
    } else if (opts.type === 'cloze') {
      slug = paths.slugify(opts.clozeContent?.slice(0, 20) || '') || 'Cloze';
    } else {
      slug = paths.slugify(opts.conceptContent?.slice(0, 20) || '') || 'Concept';
    }
  }

  const baseTitle = paths.joinPath(deckDir, slug || 'Card');
  const title = titleMod.freeTitle(wiki, baseTitle, opts.pending);

  let kind: 'topic' | 'item' = 'item';
  let subkind = 'qa';
  let caption = '';
  let text = '';

  if (opts.type === 'qa') {
    kind = 'item';
    subkind = 'qa';
    const q = (opts.question || '').trim();
    const a = (opts.answer || '').trim();
    caption = opts.title ? opts.title : safeCaption(q, a);
    text = [q, a].filter(Boolean).join('\n\n');
  } else if (opts.type === 'cloze') {
    kind = 'item';
    subkind = 'cloze';
    const content = (opts.clozeContent || '').trim();
    caption = opts.title ? opts.title : content.slice(0, 40) || 'Cloze Card';
    text = '';
  } else {
    kind = 'topic';
    subkind = 'concept';
    const content = (opts.conceptContent || '').trim();
    caption = opts.title ? opts.title : content.slice(0, 30) || 'Concept Card';
    text = content;
  }

  return {
    title,
    type: 'text/vnd.tiddlywiki',
    caption,
    text,
    ...schema.initialFsrsFields(new Date()),
    revision: '0',
    'tidme.deck': deckName,
    'tidme.kind': kind,
    'tidme.subkind': subkind,
    'tidme.breadcrumb': deckName,
    'tidme.priority': String(sched.normalizePriority(opts.priority)),
    ...(opts.type === 'concept'
      ? {
        'tidme.afactor': String(sched.AFACTOR_DEFAULT),
        'tidme.chars': String(text.length),
      }
      : {}),
    ...(Array.isArray(opts.tags) && opts.tags.length ? { tags: opts.tags } : {}),
  };
}

/**
 * 制卡统一写库口：契约校验 + addTiddler + item 折叠态预备。
 * 阅读划词与全局制卡入口共用，禁止各自拼写库与折叠顺序。
 * 校验先于写库：缺 kind/FSRS 的产物直接抛错（以前会静默写库，随后被队列与视图忽略）。
 * @returns 是否已写库（draft 为空/缺 title 时 false）
 */
export function commitCard(wiki: any, draft: Record<string, any> | null): boolean {
  if (!draft || !draft.title) return false;
  schema.assertCardFields(draft);
  wiki.addTiddler(draft);
  session.prepareCardFold(wiki, draft.title);
  return true;
}

// ---------- SM 'Delete processed text'：加工清理（制卡闭环的另一半） ----------

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
