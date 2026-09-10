/*
align.ts — 重切分对齐（内容未变保 ID 与 SRS 进度、变更重挂接、消失归档）

场景：源 tiddler 已切分过（存在同 docId 的旧 Section 卡），再次切分时：
- 内容 + 路径未变的节 → 保留旧卡（SRS 进度不丢，仅同步阅读顺序 order）
- 内容变化但路径未变的节 → 保留旧卡并更新内容字段（SRS 进度保留，"修改重挂接"）
- 新出现的节 → 保留 runSplit 的新卡（created）
- 旧卡在新结果中消失 → 归档（tidme.obsolete=yes + tidme.done=yes 出队，不硬删）
- 同 key 多张新卡（同名节）→ 只采用一张，其余进 dropped/ambiguous 计数上报（不静默丢内容）

输入是 runSplit 的新卡 tiddler 列表 + 同 docId 的旧卡；匹配键 = breadcrumb 剥离文档前缀后的 trail。
纯函数 + async（内容指纹），无 $tw 依赖，双端可用。
*/

declare function require(module: string): any;
// 跨 core 模块一律显式 require：ES import 会被 esbuild 内联复制成第二份实现
// （contentFingerprint/normalizeText 曾因此在本模块内重复定义），改名/修复会失效。
const ids = require('$:/plugins/keepone/tidme/core/ids.js');
const ns = require('$:/plugins/keepone/tidme/core/ns.js');
import type { CardLike } from './schema.ts';

/** 对齐用卡实体（类型级复用 schema.CardLike） */
export type AlignCard = CardLike;

export interface AlignResult {
  /** 保留的新卡（无旧卡对应的新增节），由调用方写库 */
  keep: AlignCard[];
  /** 旧卡更新补丁（内容变 / 顺序变），由调用方写库（{...oldFields, ...fields}） */
  patches: { title: string; fields: Record<string, any> }[];
  /** 归档的旧卡标题（标记 obsolete + 出队） */
  archives: string[];
  /** 未变而保留的旧卡数 */
  unchanged: number;
  /** 与旧卡配对（采用）的新卡 title：列全是为了让落库层知道"这些新卡已被对齐处理"，
   *  否则会把未变/重挂接的新卡当成漏网卡重复写入（ID 随 ordinal 漂移时正是如此） */
  consumed: string[];
  /** 同 key 多张新卡中未被采用而被丢弃的新卡 title（内容不入库，调用方必须告警） */
  discarded: string[];
  /** 丢弃张数 = `discarded.length`（单点派生，避免两个字段漂移） */
  dropped: number;
  /** 出现同 key 多张新卡的 key 数（对齐本身有歧义，结果取决于"文本长度最接近"启发式） */
  ambiguous: number;
}

/** breadcrumb（含文档前缀）→ 匹配 key：剥离文档标题前缀 */
export function cardKey(breadcrumb: string, docTitle: string): string {
  const parts = String(breadcrumb || '').split(ns.CRUMB_SEP).map((s) => s.trim()).filter(Boolean);
  // 文档标题可能是唯一化后缀（如 "书名 ~2"），前缀匹配即可
  if (docTitle && parts.length && (parts[0] === docTitle || parts[0].startsWith(docTitle + ' '))) {
    return parts.slice(1).join(ns.CRUMB_SEP);
  }
  return parts.join(ns.CRUMB_SEP);
}

/**
 * 对齐旧卡与新切分结果。
 * @param oldCards 旧 section 卡（tidme.doc === docId 且 kind=section）
 * @param docTitle 文档页标题（用于剥离 breadcrumb 前缀）
 * @param newCards runSplit 生成的新卡 tiddler（含 tidme.breadcrumb / text / tidme.hash / tidme.order / caption / tidme.chars）
 */
export async function alignCards(oldCards: AlignCard[], docTitle: string, newCards: AlignCard[]): Promise<AlignResult> {
  const result: AlignResult = {
    keep: [],
    patches: [],
    archives: [],
    unchanged: 0,
    consumed: [],
    discarded: [],
    dropped: 0,
    ambiguous: 0,
  };
  if (!newCards.length) return result;

  const newKeyed = new Map<string, AlignCard[]>();
  for (const c of newCards) {
    const key = cardKey(String(c.fields['tidme.breadcrumb'] || c.title), docTitle);
    if (!key) continue;
    if (!newKeyed.has(key)) newKeyed.set(key, []);
    newKeyed.get(key)!.push(c);
  }

  /** 已计过数的歧义 key：一张旧卡只配对一张新卡，多出的新卡会被丢弃 */
  const ambiguousKeys = new Set<string>();
  const oldSeen = new Set<string>();
  for (const old of oldCards) {
    const key = cardKey(String(old.fields['tidme.breadcrumb'] || old.title), docTitle);
    if (!key) {
      result.archives.push(old.title);
      continue;
    }
    oldSeen.add(key);
    const matches = newKeyed.get(key) || [];
    if (!matches.length) {
      // 旧卡在新结果中消失 → 归档（不硬删）
      result.archives.push(old.title);
      continue;
    }
    // 取第一张匹配的新卡（同 key 多张时按序取；罕见情况取内容最相近的）
    let best = matches[0];
    if (matches.length > 1) {
      best = matches.reduce((a, b) =>
        Math.abs(ids.normalizeText(a.fields.text).length - ids.normalizeText(old.fields.text).length) <=
            Math.abs(ids.normalizeText(b.fields.text).length - ids.normalizeText(old.fields.text).length)
          ? a
          : b
      );
    }
    // 同 key 多张新卡（重复标题的节）→ 只能采用一张，其余丢弃；丢弃会丢内容，故列名上报
    if (matches.length > 1 && !ambiguousKeys.has(key)) {
      ambiguousKeys.add(key);
      for (const m of matches) if (m !== best) result.discarded.push(m.title);
    }
    const oldText = ids.normalizeText(old.fields.text);
    const newText = ids.normalizeText(best.fields.text);
    const orderChanged = String(old.fields['tidme.order']) !== String(best.fields['tidme.order']);
    result.consumed.push(best.title);
    if (oldText === newText) {
      // 内容未变 → 保留旧卡（SRS 进度保留）；仅顺序变化时同步 order
      if (orderChanged) {
        result.patches.push({ title: old.title, fields: { 'tidme.order': best.fields['tidme.order'] } });
      }
      result.unchanged++;
    } else {
      // 内容变化 → 更新内容字段，保留 ID 与 SRS 进度（修改重挂接）
      const hash = await ids.contentFingerprint(best.fields.text);
      result.patches.push({
        title: old.title,
        fields: {
          text: best.fields.text,
          caption: best.fields.caption,
          'tidme.chars': best.fields['tidme.chars'],
          'tidme.hash': hash,
          'tidme.order': best.fields['tidme.order'],
        },
      });
    }
  }

  // 新卡中无旧卡对应的 → 保留（created）
  for (const c of newCards) {
    const key = cardKey(String(c.fields['tidme.breadcrumb'] || c.title), docTitle);
    if (key && !oldSeen.has(key)) result.keep.push(c);
  }
  result.ambiguous = ambiguousKeys.size;
  result.dropped = result.discarded.length;
  return result;
}
