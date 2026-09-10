/*
core/grade.ts — 复习评分写路径（唯一实现）

此前评分写库被 wikitext repeat.tid 与 card-viewer.rateCard 各自编排且已漂移
（专注时长只有后者记、PriorityDynamics 配置只有前者读）。本模块收口为唯一写路径：
FSRS 计算 → 字段写回（含 annotate-colour）→ <deck>/log → 优先级动态 →
会话推进（Again 挪队尾重学）→ 专注时长 → 折叠态/计时锚点清理。

留在调用方（tidme-grade 动作 widget + repeat.tid）的部分：
- leech 判定与用户配置动作：deck.leech_action 是 wikitext 动作转译，动作树必须在
  **渲染期**决定是否挂载，而本模块只在动作执行期（invokeAction）运行——故 leech 判定
  整条留在 repeat.tid 的渲染期过滤器里，本模块不做阈值判断（曾返回过无人消费的 leech
  标记，属重复实现，已删除）；
- UI 副作用（关卡/导航/通知/庆祝）与评分结果展示。
core 内跨模块引用一律显式 require（避免 esbuild 内联复制）。
*/

declare function require(module: string): any;
const fsrs = require('$:/plugins/keepone/tidme/core/fsrs.js');
const sched = require('$:/plugins/keepone/tidme/core/scheduler.js');
const session = require('$:/plugins/keepone/tidme/core/session.js');
const schema = require('$:/plugins/keepone/tidme/core/schema.js');
const stats = require('$:/plugins/keepone/tidme/core/stats.js');
const deckMod = require('$:/plugins/keepone/tidme/core/deck.js');
const config = require('$:/plugins/keepone/tidme/core/config.js');
const ns = require('$:/plugins/keepone/tidme/core/ns.js');

/** 评分四档 → annotate-colour 注释色（fsrs4tw 遗产字段，保留写库契约；
 *  repeat.tid 展示层的同名映射无法与 JS 共享，改动须人工同步） */
const RATING_COLOURS: Record<string, string> = { Again: 'red', Hard: 'orange', Good: 'green', Easy: 'dodgerblue' };

/** 单卡专注时长 clamp（秒）：下限防零记录，上限防挂机/异常计时 */
const FOCUS_SEC_MIN = 1;
const FOCUS_SEC_MAX = 3600;

export interface GradeOptions {
  title: string;
  /** 卡所属牌组（完整标题或名称）；空缺回 default 牌组 */
  deckTitle?: string;
  /** Again / Hard / Good / Easy（调用方已归一，此处只按键取值） */
  rating: string;
  now?: Date;
}

export interface GradeResult {
  ok: boolean;
  /** 评分后是否无下一张可学卡（调用方可据此收尾庆祝；剩余卡可能仍在未来排期） */
  finished: boolean;
  /** 下一张当前可学卡（isDueNow 口径，与推进入口统一）；无 → null */
  next: string | null;
  /** 本档评分后的下次到期（TW 17 位串，展示用） */
  due: string | null;
}

/** 消费专注计时锚点（导航时由 session.prepareCardFold / startstudy.tid 写入）：
 *  返回本卡专注秒数（clamp），锚点读取后即删除。无锚点/不可解析返回 0。 */
function consumeFocusSeconds(wiki: any, now: Date): number {
  const raw = String(wiki.getTiddlerText(ns.CARD_OPEN_AT_TITLE, '') || '');
  wiki.deleteTiddler(ns.CARD_OPEN_AT_TITLE);
  const start = raw ? schema.parseTwDate(raw, null as any) : null;
  if (!start) return 0;
  const sec = Math.round((now.getTime() - start.getTime()) / 1000);
  return Math.max(FOCUS_SEC_MIN, Math.min(FOCUS_SEC_MAX, sec));
}

/**
 * 评分写路径：对单卡执行 FSRS 计算与全部落库，返回判定结果。
 * 会话缺位（单牌组 fsrs4tw 路径无全局会话）时照常写卡与日志，只跳过会话推进。
 */
export function gradeCard(wiki: any, opts: GradeOptions): GradeResult {
  const result: GradeResult = { ok: false, finished: false, next: null, due: null };
  if (!wiki || typeof wiki.getTiddler !== 'function' || !opts.title) return result;
  const now = opts.now || new Date();
  const f = wiki.getTiddler(opts.title)?.fields;
  if (!f) return result;

  const deck = deckMod.getDeck(wiki, opts.deckTitle || '') || deckMod.getDeck(wiki, deckMod.DEFAULT_DECK);
  if (!deck) return result;
  const rating = String(opts.rating || '');

  // 1. FSRS 四档计算（缺字段按新卡，与 [fsrs[p]] 过滤器输出一致）
  let target: any = null;
  try {
    const parsed = JSON.parse(fsrs.repeat(f, { p: String(deck.fields.p || ''), now }));
    const key = parsed.Rating?.[rating] ?? rating;
    target = parsed.Cards?.[key];
  } catch {
    target = null;
  }
  if (!target || !target.card) return result;

  // 2. 字段写回：FSRS 补丁 + annotate-colour + 优先级动态（合并一次写，少一轮 refresh）
  const delta = sched.priorityDeltaForRating(rating, config.readPriorityDynamics(wiki));
  const priority = Math.max(0, Math.min(100, sched.normalizePriority(f['tidme.priority']) + delta));
  wiki.addTiddler({
    ...f,
    ...target.card,
    'annotate-colour': RATING_COLOURS[rating] || 'dodgerblue',
    'tidme.priority': String(priority),
  });

  // 3. 复习日志（<deck>/log 单文件，键 = 17 位复习时刻，值 = review_log JSON）
  wiki.setText(ns.deckLogTitle(deck.title), null, schema.twDateString(now), JSON.stringify(target.review_log));

  // 4. 会话推进（Again 挪队尾重学，其余移出；<deck>/study 不在此维护——
  //  那是 fsrs4tw 起学路径的契约，队头推进由 startstudy.tid 决策）。
  //  下一张的决策与两处推进入口共用 session.advanceSession 单点（nextSchedulable +
  //  isDueNow）：被顺延的未来排期卡不作 next。先写会话再决策，故 cur 传 null。
  const s = session.getSession(wiki);
  if (s) {
    const list = s.list.filter((t: string) => t !== opts.title);
    if (rating === 'Again') list.push(opts.title);
    session.setSession(wiki, { list, mode: s.mode, currentIndex: s.currentIndex });
    const nextT = session.advanceSession(wiki, null);
    result.next = nextT;
    result.finished = nextT === null;
  }

  // 5. 专注时长 + 清理（计时锚点、折叠态标记）
  const sec = consumeFocusSeconds(wiki, now);
  if (sec > 0) stats.recordReadTime(wiki, String(f['tidme.doc'] || ''), sec);
  wiki.deleteTiddler(ns.FOLDED_STATE_PREFIX + opts.title);

  // 子集牌组（tidme.subset-doc）不在此清理：它是「复习本书」的作用域容器，
  // 评分会删掉它 = 第一张卡后书籍复习静默解体。焚烧点在使用流程边界：
  // startstudy 空队（用完）/ stopstudy（手动停止）/ endSession（结束学习）。

  result.ok = true;
  result.due = target.card.due !== undefined ? String(target.card.due) : null;
  return result;
}
