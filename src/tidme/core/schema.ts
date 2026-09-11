/*
schema.ts — 实体字段规范与校验

- 常量：实体 kind / subkind、FSRS 字段族
- 日期：twDateString / parseTwDate（17 位 TW UTC 串唯一实现）
- 校验：missingFsrsFields / assertCardFields（写库前调用，缺失即抛错）
- 宽松读取：解析期容忍缺字段；写入期由 assertCardFields 兜住契约

本规范只覆盖**卡片实体**（阅读材料 topic / 测试卡 item：kind + subkind + FSRS 九件套）。
导入 parse 产物另有 Section 族字段（tidme.id/order/level/hash），由 import/parse 自身保证，
不在此模块校验。
*/

export const KINDS = ['topic', 'item'] as const;
export type Kind = (typeof KINDS)[number];

/** 卡实体最小形状（调度/统计/对齐共用的类型契约；仅类型层，无运行时开销） */
export interface CardLike {
  title: string;
  fields: Record<string, any>;
}

/** 子类型：驱动展示差异（徽章/加工路径/具体按钮），不决定学习模式。
 *  - section  = 导入切分出的阅读节
 *  - extract  = 划词摘录（待加工成卡）
 *  - concept  = 概念/笔记卡（topic 轨道，走 A-Factor 展期，不走 FSRS 评分）
 *  - cloze / qa = 测试卡（item 轨道） */
export const SUBKINDS = ['section', 'extract', 'concept', 'cloze', 'qa'] as const;
export type SubKind = (typeof SUBKINDS)[number];

/** FSRS 字段族（卡实体必填，见 data-model §3） */
export const FSRS_FIELDS = [
  'due',
  'state',
  'reps',
  'lapses',
  'stability',
  'difficulty',
  'elapsed_days',
  'scheduled_days',
  'last_review',
] as const;

/** TW 日期字符串（UTC 语义，YYYY0MM0DD0hh0mm0ss0XXX，与 $tw.utils.stringifyDate 一致） */
export function twDateString(d: Date): string {
  const p = (n: number, l: number) => String(n).padStart(l, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1, 2)}${p(d.getUTCDate(), 2)}${p(d.getUTCHours(), 2)}${p(d.getUTCMinutes(), 2)}${p(d.getUTCSeconds(), 2)}${
    p(d.getUTCMilliseconds(), 3)
  }`;
}

/**
 * 学习日键（YYYYMMDD 本地学习日）。
 * 对标 Anki 默认凌晨 4:00 本地换天（可配置 0–23 点）：
 * 将时刻减去换天偏移量后取本地自然日，确保夜间（如 01:00）复习仍计入同一学习日。
 * @param now 待判定时刻，默认当前
 * @param rolloverHour 换天时刻（0–23 小时，默认 4）
 */
export function learningDayOf(now: Date = new Date(), rolloverHour = 4): string {
  const h = Math.min(23, Math.max(0, Math.floor(Number(rolloverHour) || 0)));
  const effective = new Date(now.getTime() - h * 3600000);
  const p = (n: number, l = 2) => String(n).padStart(l, '0');
  return `${effective.getFullYear()}${p(effective.getMonth() + 1)}${p(effective.getDate())}`;
}

/** 日期键（UTC，YYYYMMDD）：日志修剪与跨端绝对日期比较（日期归本模块唯一产地）。
 *  @param now 默认当前时刻；传偏移时刻可算"保留截止日"（见 server/scheduler 日志修剪） */
export function todayKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10).replace(/-/g, '');
}

/**
 * 严格解析：非法/缺失返回 null（不静默回退到「现在」）。
 * 调度类判定（isDueNow / 计时锚点 / 排期比较）用它：脏数据必须表现为「不可判定」，
 * 而不是伪装成"立即到期"或"刚刚操作过"。
 */
export function tryParseTwDate(v: unknown): Date | null {
  const s = String(v || '');
  if (/^\d{17}$/.test(s)) {
    const d = new Date(Date.UTC(
      Number(s.slice(0, 4)),
      Number(s.slice(4, 6)) - 1,
      Number(s.slice(6, 8)),
      Number(s.slice(8, 10)),
      Number(s.slice(10, 12)),
      Number(s.slice(12, 14)),
      Number(s.slice(14, 17)),
    ));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (!s) return null;
  const p = Date.parse(s);
  return Number.isNaN(p) ? null : new Date(p);
}

/**
 * TW 日期串（YYYY0MM0DD0hh0mm0ss0XXX，UTC 语义，与 $tw.utils.parseDate 一致）→ Date。
 * 注意：TW 的日期字符串是 UTC 编码（stringifyDate 用 getUTC*），按本地时区解析
 * 会造成系统性的时区偏差（如评分间隔显示"8 hours from now"）。
 * 宽容版：非法值回 fallback（默认「现在」）——仅用于展示/排序等不敏感场景；
 * 需要区分「非法」的场景请用 tryParseTwDate。
 */
export function parseTwDate(v: unknown, fallback = new Date()): Date {
  const s = String(v || '');
  if (/^\d{17}$/.test(s)) {
    const d = new Date(Date.UTC(
      Number(s.slice(0, 4)),
      Number(s.slice(4, 6)) - 1,
      Number(s.slice(6, 8)),
      Number(s.slice(8, 10)),
      Number(s.slice(10, 12)),
      Number(s.slice(12, 14)),
      Number(s.slice(14, 17)),
    ));
    return Number.isNaN(d.getTime()) ? fallback : d;
  }
  const p = Date.parse(s);
  return Number.isNaN(p) ? fallback : new Date(p);
}

/**
 * FSRS 初始字段集。
 * 关键修复：fsrs4tw 的过滤器要求卡片已含全部 FSRS 字段才走评分写入路径；
 * 缺字段的卡评分静默失败 → 队列首位永不变（表现为"无法切换下一张"）。
 */
export function initialFsrsFields(now: Date): Record<string, string> {
  const t = twDateString(now);
  return {
    due: t,
    state: '0',
    reps: '0',
    lapses: '0',
    stability: '0',
    difficulty: '0',
    elapsed_days: '0',
    scheduled_days: '0',
    last_review: t,
  };
}

/** 返回 tiddler 字段中缺失的 FSRS 字段（空数组 = 齐全） */
export function missingFsrsFields(fields: Record<string, unknown>): string[] {
  return FSRS_FIELDS.filter((f) => fields[f] === undefined || fields[f] === null || fields[f] === '');
}

/** 卡片字段契约校验（写库前调用，缺失即抛错）：kind ∈ KINDS 且 FSRS 九件套齐全。
 *  唯一调用方是 core/card-factory.commitCard——制卡入口是契约保障点（缺 kind/FSRS 的
 *  产物以前会静默写库，随后被队列与视图静默忽略）。 */
export function assertCardFields(fields: Record<string, unknown>): void {
  const kind = fields['tidme.kind'];
  if (typeof kind !== 'string' || !(KINDS as readonly string[]).includes(kind)) {
    throw new Error(`[tidme/core] 卡片缺/非法 tidme.kind: ${JSON.stringify(kind)}`);
  }
  const missing = missingFsrsFields(fields);
  if (missing.length) {
    throw new Error(`[tidme/core] ${kind} 卡缺 FSRS 字段: ${missing.join(', ')}`);
  }
}

/** HTML 实体安全转义（纯函数） */
export function escapeHtml(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
