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
- 两条路径的"已存在"语义有意不同，不是漂移：keep 覆盖写入（对齐认定它就是同一节的新
  内容，也由此复活此前归档的同 title 卡）；防御性补写遇到已存在的 title 一律跳过并计入
  skippedExisting（那是标题撞上了别的 tiddler，覆盖会吃掉别人的内容）
- 三处计数（dropped / ambiguous / skippedExisting）与 collisionSuspect 都随返回值上报，
  调用方负责展示；core 只额外 console.warn 一次
本模块只写 wiki、不做 DOM；对齐纯算法在 core/align。
跨 core 模块引用一律显式 require（避免 esbuild 内联复制）。
*/

declare function require(module: string): any;
const align = require('$:/plugins/keepone/tidme/core/align.js');
const docOps = require('$:/plugins/keepone/tidme/core/doc-ops.js');
const ns = require('$:/plugins/keepone/tidme/core/ns.js');

export interface CommitImportOptions {
  docId: string;
  /** 管线产出的文档页字段（title=管线 docRoot；落库时以最终 title 为准） */
  docTiddler: Record<string, any>;
  /** 期望的文档页 title：同 docId 已有文档页时以既有的为准（引用稳定），否则用它 */
  docTitle: string;
  /** 全部卡片产物（不含文档页；调用方先滤掉 _deleted） */
  cards: Record<string, any>[];
  /**
   * 把卡 tidme.docpage 统一改写为最终文档页 title。
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
  /** 实际落库的文档页 title（同 docId 已有文档页时是既有的那个） */
  docTitle: string;
  /** 同 key 多张新卡中被丢弃的张数（对齐只能二选一 → 内容会丢，调用方必须上报） */
  dropped: number;
  /** 出现同 key 多张新卡的 key 数（对齐结果取决于启发式，本身有歧义） */
  ambiguous: number;
  /** 防御性补写遇到同名 tiddler 而跳过的张数（标题撞上别的 tiddler，覆盖会吃掉它） */
  skippedExisting: number;
  /** 疑似同名书碰撞：docId 由 title+creator+language 派生，不同内容的同名书会得到同一
   *  docId；对齐路径下旧节无一保留且批量消失时，多半是另一本书而非修订版（修订版通常
   *  有未变节）。不硬失败——调用方据此提示用户换标题重导。 */
  collisionSuspect: boolean;
}

/** 对齐（或全量）写库：split.ts / import.ts / 服务端 importer 共用的唯一实现 */
export async function commitImportToWiki(wiki: any, opts: CommitImportOptions): Promise<CommitImportResult> {
  const { docId, docTiddler, cards } = opts;
  const rewriteDocPage = opts.rewriteDocPage === true;

  // 对齐前置查询（写库前取旧状态）：文档页真实 title + 同 docId 的普通节旧卡（排除摘录、
  // 文档页（宿主页 kind=topic）、牌组页与已归档卡——learning-package 词书页带 legacy
  // kind=topic + tidme.doc，但它是牌组实体，绝不能作为"旧节卡"进入对齐被归档/重写；
  // 已归档（tidme.obsolete）的卡排除后，同名节再次出现会按新卡重建，避免"永久归档"）
  const docPage = docOps.docPageOfDoc(wiki, docId);
  // 已存在文档页时以它为准（引用稳定，调用方不必各自查一遍）；对齐与落库用同一个 title
  const finalDocTitle = docPage || opts.docTitle;
  const fixDocPage = (c: Record<string, any>) => {
    if (rewriteDocPage && c['tidme.docpage'] && c['tidme.docpage'] !== finalDocTitle) c['tidme.docpage'] = finalDocTitle;
  };
  const alignDocTitle = finalDocTitle;
  const oldCards: { title: string; fields: Record<string, any> }[] = wiki
    .filterTiddlers(
      `[tidme.doc[${docId}]tidme.kind[topic]!tidme.subkind[extract]${ns.NOT_DECK_FILTER}!tag[tidme-doc]!has[tidme.obsolete]!is[draft]]`,
    )
    .map((ot: string) => ({ title: ot, fields: wiki.getTiddler(ot)?.fields || {} }));

  const result: CommitImportResult = {
    created: 0,
    updated: 0,
    archived: 0,
    aligned: false,
    docTitle: finalDocTitle,
    dropped: 0,
    ambiguous: 0,
    skippedExisting: 0,
    collisionSuspect: false,
  };

  if (oldCards.length) {
    result.aligned = true;
    const sectionCards = cards.filter((c) => c['tidme.kind'] === 'topic');
    const alignedCards = await align.alignCards(oldCards, alignDocTitle, sectionCards.map((c: any) => ({ title: c.title, fields: c })));
    const keptTitles = new Set<string>(alignedCards.keep.map((k: any) => k.title));
    result.dropped = Number(alignedCards.dropped) || 0;
    result.ambiguous = Number(alignedCards.ambiguous) || 0;
    // 疑似同名书碰撞：旧节无一保留、批量消失，且来卡标题在库中均不存在。
    // 若标题已存在（此前归档、现在"复活"），那是修订/回退而非另一本书，不误报。
    const revived = sectionCards.some((c: any) => wiki.getTiddler(c.title));
    result.collisionSuspect = alignedCards.unchanged === 0 && alignedCards.archives.length >= 2 && !revived;

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
    // 防御性写：只补对齐未裁决的新卡（非节卡、或 trail key 为空的节卡）。判据单一——
    // "已被对齐采用（keep/配对）或明确丢弃"都不写；标题已存在则跳过并计数（标题撞车）。
    const coveredTitles = new Set<string>([
      ...keptTitles,
      ...alignedCards.consumed.map((t: any) => String(t)),
      ...alignedCards.discarded.map((t: any) => String(t)),
    ]);
    for (const c of cards) {
      if (coveredTitles.has(c.title)) continue;
      if (wiki.getTiddler(c.title)) {
        result.skippedExisting++; // 同名 tiddler 已存在 → 跳过（覆盖会吃掉它的内容）
        continue;
      }
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

  // 文档页：以最终 title 落库（复用旧 docPage 的 title，引用稳定）
  wiki.addTiddler({ ...docTiddler, title: finalDocTitle });
  // 异常一律在此告警（core 无 UI，返回值由调用方展示）：共用一个出口，避免"算了不上报"
  if (result.dropped > 0) {
    console.warn(
      `[tidme] docId ${docId} 有 ${result.ambiguous} 个同名节：同 key 多张新卡只保留一张，已丢弃 ${result.dropped} 张。` +
        `同名节无法靠 breadcrumb 区分，请给节标题改名后重新导入。`,
    );
  }
  if (result.skippedExisting > 0) {
    console.warn(
      `[tidme] docId ${docId} 有 ${result.skippedExisting} 张新卡因同名 tiddler 已存在而跳过：` +
        `标题撞车（可能来自另一文档或手写卡），未覆盖既有内容。`,
    );
  }
  if (result.collisionSuspect) {
    console.warn(
      `[tidme] docId ${docId} 疑似同名书碰撞：旧节无一保留且批量消失（${result.archived} archived / 0 unchanged）。` +
        `docId 由 title+creator+language 派生，不同内容的同名书会共享 docId；若这不是同一本书的修订版，请换标题重新导入。`,
    );
  }
  return result;
}
