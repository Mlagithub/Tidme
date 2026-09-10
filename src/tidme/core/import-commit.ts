/*
core/import-commit.ts — 导入产物落库执行器（对齐写库唯一实现）

背景：widgets/split.ts commitSplit 与 widgets/import.ts commitResult 各自实现
同一套"alignCards 三路写库（keep/patches/archives）+ 文档页落位"逻辑，
细节已漂移（docpage 修正只在 split 侧做；防御性写只在 split 侧做）。
本模块收口为唯一实现，两处调用点只负责准备产物与发事件：
- 对齐：同 docId 已有 section 旧卡 → alignCards（未变保 SRS 进度 / 内容变补丁
  重挂接 / 消失归档 obsolete+done，不硬删）；仅对齐普通节，摘录/挖空/问答不动
- 防御性写只补"无 trail key 的漏网新卡"；同 key 旧卡已代表的新卡跳过
  （否则 ID 随 ordinal 漂移时会产生重复节卡）
本模块只写 wiki、不做 DOM；对齐纯算法在 core/align。
跨 core 模块引用一律显式 require（避免 esbuild 内联复制）。
*/

declare function require(module: string): any;
const align = require('$:/plugins/keepone/tidme/core/align.js');

export interface CommitImportOptions {
  docId: string;
  /** 管线产出的文档页字段（title=管线 docRoot；落库时以 docTitle 为准） */
  docTiddler: Record<string, any>;
  /** 文档页最终 title（split=源 tiddler title；import=已存在 docPage ?? docRoot） */
  docTitle: string;
  /** 全部卡片产物（不含文档页；调用方先滤掉 _deleted） */
  cards: Record<string, any>[];
  /**
   * 把卡 tidme.docpage 统一改写为 docTitle。
   * split 场景（源 tiddler 覆盖为文档页）需要；import 场景保持管线值。
   */
  rewriteDocPage?: boolean;
}

export interface CommitImportResult {
  created: number;
  updated: number;
  archived: number;
  /** 是否走了对齐路径（同 docId 已有旧节卡） */
  aligned: boolean;
  /** 疑似同名书碰撞：docId 由 title+creator+language 派生，不同内容的同名书会得到同一
   *  docId；对齐路径下旧节无一保留且批量消失时，多半是另一本书而非修订版（修订版通常
   *  有未变节）。仅告警不改行为——由调用方决定是否提示用户换标题重导。 */
  collisionSuspect: boolean;
}

/** 对齐（或全量）写库：split.ts / import.ts 共用的唯一实现 */
export async function commitImportToWiki(wiki: any, opts: CommitImportOptions): Promise<CommitImportResult> {
  const { docId, docTiddler, docTitle, cards } = opts;
  const rewriteDocPage = opts.rewriteDocPage === true;
  const fixDocPage = (c: Record<string, any>) => {
    if (rewriteDocPage && c['tidme.docpage'] && c['tidme.docpage'] !== docTitle) c['tidme.docpage'] = docTitle;
  };

  // 对齐前置查询（写库前取旧状态）：文档页真实 title + 同 docId 的普通节旧卡（排除摘录、
  // 文档页（宿主页 kind=topic）与牌组页——learning-package 词书页带 legacy kind=topic +
  // tidme.doc，但它是牌组实体，绝不能作为"旧节卡"进入对齐被归档/重写；口径同
  // ns.TOPIC_QUEUE_FILTER 的 !tag 排除）
  const docPage = wiki.filterTiddlers(`[tag[tidme-doc]tidme.doc[${docId}]]`)[0] || '';
  const alignDocTitle = docPage || docTitle;
  const oldCards: { title: string; fields: Record<string, any> }[] = wiki
    .filterTiddlers(
      `[tidme.doc[${docId}]tidme.kind[topic]!tidme.subkind[extract]!tag[$:/tags/TidmeDeck]!tag[tidme-doc]!is[draft]]`,
    )
    .map((ot: string) => ({ title: ot, fields: wiki.getTiddler(ot)?.fields || {} }));

  const result: CommitImportResult = { created: 0, updated: 0, archived: 0, aligned: false, collisionSuspect: false };

  if (oldCards.length) {
    result.aligned = true;
    const sectionCards = cards.filter((c) => c['tidme.kind'] === 'topic');
    const alignedCards = await align.alignCards(oldCards, alignDocTitle, sectionCards.map((c: any) => ({ title: c.title, fields: c })));
    const keptTitles = new Set<string>(alignedCards.keep.map((k: any) => k.title));
    const patchedTitles = new Set<string>(alignedCards.patches.map((p: any) => p.title));
    result.collisionSuspect = alignedCards.unchanged === 0 && alignedCards.archives.length >= 2;

    // 新增节
    for (const k of alignedCards.keep) {
      fixDocPage(k.fields);
      wiki.addTiddler({ ...k.fields });
      result.created++;
    }
    // 内容变/顺序变：保留旧 ID 与 SRS 进度（修改重挂接）
    for (const p of alignedCards.patches) {
      const existing = wiki.getTiddler(p.title);
      if (!existing) continue;
      const merged = { ...existing.fields, ...p.fields };
      fixDocPage(merged);
      wiki.addTiddler(merged);
      result.updated++;
    }
    // 消失归档：obsolete + done 出队（不硬删）
    for (const at of alignedCards.archives) {
      const existing = wiki.getTiddler(at);
      if (!existing) continue;
      wiki.addTiddler({ ...existing.fields, 'tidme.obsolete': 'yes', 'tidme.done': 'yes' });
      result.archived++;
    }
    // 防御性写：仅补对齐算法未覆盖的漏网新卡（keyless breadcrumb 等）；
    // trail key 已被同 key 旧卡代表的新卡跳过——防止 ordinal 漂移换 ID 时写出重复节卡
    const oldKeys = new Set(
      oldCards
        .map((o) => align.cardKey(String(o.fields['tidme.breadcrumb'] || o.title), alignDocTitle))
        .filter(Boolean),
    );
    for (const c of cards) {
      if (keptTitles.has(c.title) || patchedTitles.has(c.title)) continue;
      if (wiki.getTiddler(c.title)) continue;
      const key = align.cardKey(String(c['tidme.breadcrumb'] || c.title), alignDocTitle);
      if (key && oldKeys.has(key)) continue;
      fixDocPage(c);
      wiki.addTiddler({ ...c });
      result.created++;
    }
  } else {
    // 首次导入：全量写
    for (const c of cards) {
      fixDocPage(c);
      wiki.addTiddler({ ...c });
      result.created++;
    }
  }

  // 文档页：以 docTitle 落库（复用旧 docPage 的 title，引用稳定）
  wiki.addTiddler({ ...docTiddler, title: docTitle });
  if (result.collisionSuspect) {
    console.warn(
      `[tidme] docId ${docId} 疑似同名书碰撞：旧节无一保留且批量消失（${result.archived} archived / 0 unchanged）。` +
        `docId 由 title+creator+language 派生，不同内容的同名书会共享 docId；若这不是同一本书的修订版，请换标题重新导入。`,
    );
  }
  return result;
}
