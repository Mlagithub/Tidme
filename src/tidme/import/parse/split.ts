/*
split.ts — 通用切分器

对任意 markdown / wikitext / HTML / TXT 文本执行：
  格式识别 → Block 流 → 大纲树切分 → 确定性 ID → tiddler 落库（含自动 deck）
产物即标准 TW 导入格式；节卡带 kind=topic（阅读材料）。

docId 由源标题派生（同一 tiddler 重切分 ID 稳定；标题唯一性由 TW 保证）。
预览干预（挂账）：overrides API 在 chunker 层（applyOverrides，有测试）；UI 接入前 runSplit 不透传此参数。
*/

import { contentFingerprint, makeDocId, makeSectionId, normalizeText } from '$:/plugins/keepone/tidme/core/ids';
import type { DocMeta } from '$:/plugins/keepone/tidme/core/ids';
import { CRUMB_SEP } from '$:/plugins/keepone/tidme/core/ns';
import { docRoot, joinPath, sectionLeaf } from '$:/plugins/keepone/tidme/core/paths';
import { PRIORITY_DEFAULT } from '$:/plugins/keepone/tidme/core/scheduler';
import { initialFsrsFields, twDateString } from '$:/plugins/keepone/tidme/core/schema';
// 文档页/节卡字段基座唯一产地（不变式字段不在此重拼）
import { buildDocPageFields, buildSectionCardFields } from '$:/plugins/keepone/tidme/core/card-factory';
import { applyOverrides, chunkBook } from './chunker';
import type { ChunkOptions, RawSection } from './chunker';
import { blocksFromHtml, blocksFromMarkdown, blocksFromPlainText, blocksFromWikitext, formatLabel, guessTitle, sniffFormat } from './ingest-text';
import type { TextFormat } from './ingest-text';

/**
 * 提炼短标题：智能剔除副标题（冒号/破折号后内容）及括号内营销/描述说明
 * 例如："批判性思维与说服性写作：独立思考者的精进技巧（通过25种思维练习...）" -> "批判性思维与说服性写作"
 */
export function cleanTitle(title: string): string {
  let t = String(title || '').trim();
  if (!t) return t;
  // 1. 剔除全角/半角括号及内部补充描述
  t = t.replace(/[（(【\[][^））】\]]*[）)】\]]/g, '').trim();
  // 2. 剔除冒号、破折号及后面的副标题说明
  t = t.split(/[:：——–]/)[0].trim();
  return t || title;
}

export interface SplitInput {
  /** 正文文本 */
  text: string;
  /** 源 tiddler 标题（docId 派生 + 文档页标题）；缺省取探测标题 */
  title?: string;
  /** 显式格式：text/markdown | text/vnd.tiddlywiki | text/html | 空（自动探测） */
  type?: string;
  /** 溯源字段（url/author/date 等）→ Document */
  sourceFields?: Record<string, string>;
  bag?: string;
  maxChars?: number;
  minChars?: number;
  /** 是否自动创建按文档 deck（默认 true；分类重构后 topic 不走牌组，此参数已无实际作用，保留兼容） */
  autoDeck?: boolean;
  /** 卡片优先级 0–100（0 最高；默认 50） */
  priority?: number;
  /**
   * 预览干预（挂账）：overrides 解析 API 已实现（chunker.applyOverrides，有测试），
   * 但导入预览 UI 走 _deleted/_renamed 标记，未经 runSplit 传入——UI 接入时在此恢复参数。
   */
  /**
   * 命名空间冲突探测：给定候选 doc folder（Tidme/Docs/<slug>），返回占用它的 docId（无占用返回 null）。
   * 同名书（不同 docId）导入时据此加 ~docId 后缀，避免文档页互相覆盖；同一 docId 重导入幂等复用。
   * 纯解析无 wiki 时不传（视为无冲突）。
   */
  folderOccupied?: (baseFolder: string) => string | null;
}

/**
 * 解析最终文档根路径：folder 被其它 docId 占用 → docRoot + "~" + docId 短哈希；否则原样。
 * 重导入（占用者为同一 docId）不加后缀 —— 幂等。
 * （paths 纯函数不带 docId 后缀；占用的判定与追加都在此导入期完成）
 */
function resolveDocRoot(bookTitle: string, docId: string, folderOccupied?: (baseFolder: string) => string | null): string {
  const base = docRoot(bookTitle);
  const owner = folderOccupied ? folderOccupied(base) : null;
  if (owner && String(owner) !== String(docId)) {
    return base + '~' + String(docId).replace(/^d/, '').slice(0, 6);
  }
  return base;
}

export interface SplitResult {
  bookTitle: string;
  docId: string;
  meta: DocMeta;
  format: TextFormat;
  sectionCount: number;
  stats: { sections: number; hardSplitCount: number };
  tiddlers: Record<string, any>[];
  warnings: string[];
  /** 最终节明细（含 parts 子节边界与 merged 标记），供预览/干预 UI 使用 */
  sections: RawSection[];
}

function formatFromType(type: string | undefined, text: string): TextFormat {
  const t = String(type || '').toLowerCase();
  if (t.includes('markdown')) return 'markdown';
  if (t.includes('tiddlywiki') || t === 'text/x-tiddlywiki') return 'wikitext';
  if (t.includes('html')) return 'html';
  if (t === 'text/plain') return 'txt';
  return sniffFormat(text);
}

function blocksFor(format: TextFormat, text: string) {
  if (format === 'markdown') return blocksFromMarkdown(text);
  if (format === 'wikitext') return blocksFromWikitext(text);
  if (format === 'html') return blocksFromHtml(text);
  return blocksFromPlainText(text);
}

/**
 * 生成 tiddler 落库产物（文档页 + 节卡）。
 * 卡片：caption(正面=节标题) + text(背面 HTML) + kind=topic/subkind=section + FSRS 九件套 + tidme.* 溯源。
 * 无 ?/. 学习标签、无自动牌组：topic（阅读材料）由阅读列表/文档页统一管理，不走 deck/牌组体系；
 * item（测试卡）进默认牌组复习流。
 */
export async function emitTiddlers(
  docId: string,
  meta: DocMeta & { __format?: string },
  bookTitle: string,
  sections: RawSection[],
  bag: string,
  autoDeck = true,
  priority = PRIORITY_DEFAULT,
  folderOccupied?: (baseFolder: string) => string | null,
): Promise<{ tiddlers: Record<string, any>[]; warnings: string[] }> {
  const warnings: string[] = [];
  const format = meta.__format || 'epub';
  const nowFields = initialFsrsFields(new Date());
  const syncFields = { bag, revision: '0' };

  // 文档根路径（A1：同名不同 docId 的 folder 冲突 → 加 ~docId 短哈希，幂等）：
  // docRoot 是"每卡可读的真实文档页 title"，落库成 tidme.docpage，UI 导航不再重算。
  const bookT = bookTitle || 'Untitled Import';
  const docRoot = resolveDocRoot(bookT, docId, folderOccupied);
  const docTitle = bookT; // 面包屑/显示用可读名（保持 align.ts 的 cardKey 匹配逻辑）

  const cards: Record<string, any>[] = [];
  for (const s of sections) {
    if (!s.text.trim()) continue; // 丢弃零字节空节（NCX 锚点产物）
    const trail = [docTitle, ...s.trail].map((t) => String(t || '').trim()).filter(Boolean);
    const id = await makeSectionId(docId, trail, s.ordinal as number);
    const hash = await contentFingerprint(s.text);
    const joined = trail.join(CRUMB_SEP);
    // 叶段 = 可读 caption slug + "-" + 稳定 id（A2：搜索/最近/反向链接可读；唯一性由 id 保证）
    const capText = s.title || trail[trail.length - 1] || '';
    const title = joinPath(docRoot, sectionLeaf(capText, id));
    // 节卡字段基座唯一产地 = core/card-factory（kind/subkind/doc/chars/priority/afactor/breadcrumb
    // 等不变式不在此重拼）；切分身份字段（id/hash/order/level/merged/file）走 extra
    cards.push(buildSectionCardFields({
      title,
      caption: capText, // 卡片正面：学习模式折叠态只渲染 caption
      text: s.html,
      docId,
      docPage: docRoot, // 文档页真实 title（含 ~docId 后缀时亦准确）
      chars: s.chars,
      priority,
      breadcrumb: joined, // 路径显示唯一字段（tidme.path 已废止：同值冗余、无读取方）
      extra: {
        ...nowFields,
        ...syncFields,
        'tidme.id': id,
        'tidme.hash': hash,
        'tidme.order': String(s.ordinal).padStart(6, '0'), // 零填充：字符串排序=阅读顺序
        'tidme.level': String(s.level),
        'tidme.source': meta.title || '',
        'tidme.author': meta.creator || '',
        'tidme.format': format,
        ...(s.merged ? { 'tidme.merged': 'yes' } : {}),
        ...(s.file ? { 'tidme.file': s.file } : {}),
      },
    }));
  }

  const links = cards.map((t) => `* [[${t.caption || t.title}|${t.title}]]`).join('\n');
  const docLines = [`//${formatLabel(format)}//`];
  if (meta.creator) docLines.push('Author: ' + meta.creator);
  if (meta.language) docLines.push('Language: ' + meta.language);
  if (meta.date) docLines.push('Date: ' + meta.date);
  docLines.push('Document ID: ' + docId);
  docLines.push(`Total ${cards.length} sections:`, '', links);

  const docTiddler: Record<string, any> = buildDocPageFields({
    title: docRoot, // 文档页落 Tidme/Docs/<书名>[/~docId] 命名空间
    caption: docTitle, // 可读名：标题模板/列表显示用（title 是路径）
    docId,
    structure: 'sectioned',
    format,
    text: docLines.join('\n'),
    extra: {
      bag,
      revision: '0',
      ...(meta.title ? { 'tidme.source': meta.title } : {}),
      ...(meta.author || meta.creator ? { 'tidme.author': meta.author || meta.creator } : {}),
      ...(meta.language ? { 'tidme.language': meta.language } : {}),
      ...(meta.url ? { 'tidme.url': meta.url } : {}),
      ...(meta.date ? { 'tidme.date': meta.date } : {}),
      ...(meta.license ? { 'tidme.license': meta.license } : {}),
    },
  });

  // 无自动牌组：topic（阅读材料）由阅读列表/文档页管理，不走 deck/牌组体系
  const tiddlers = [docTiddler, ...cards];
  return { tiddlers, warnings };
}

/**
 * 通用切分：任意 markdown / wikitext / HTML / TXT 文本 → 文档页 + Section 卡 + 自动 deck。
 * 同一输入（title + text 不变）重切分产物确定（ID 稳定）。
 */
export async function runSplit(input: SplitInput): Promise<SplitResult> {
  const text = String(input.text || '');
  if (!text.trim()) throw new Error('Content is empty');
  const format = formatFromType(input.type, text);
  const blocks = blocksFor(format, text);
  if (!blocks.length) throw new Error('Cannot parse any content blocks');

  const meta: DocMeta & Record<string, string> = {
    title: input.title || guessTitle(text, format) || 'Untitled Import',
    ...(input.sourceFields || {}),
  };
  const bookTitle = meta.title;
  const docId = await makeDocId({ title: bookTitle, creator: meta.creator || '', language: meta.language || '' });

  const { sections, stats } = chunkBook(
    [{ fileName: bookTitle, fileBreadcrumb: [], blocks }],
    { maxChars: input.maxChars, minChars: input.minChars },
  );
  const metaWithFormat = { ...meta, __format: format };
  const { tiddlers, warnings } = await emitTiddlers(
    docId,
    metaWithFormat,
    bookTitle,
    sections,
    input.bag || 'default',
    input.autoDeck !== false,
    input.priority,
    input.folderOccupied,
  );
  return {
    bookTitle,
    docId,
    meta,
    format,
    sectionCount: stats.sections,
    stats,
    tiddlers,
    warnings,
    sections,
  };
}

export { initialFsrsFields, twDateString };
