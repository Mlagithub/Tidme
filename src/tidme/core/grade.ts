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
const deckMod = require('$:/plugins/keepone/tidme/core/deck.js');
const config = require('$:/plugins/keepone/tidme/core/config.js');
const ns = require('$:/plugins/keepone/tidme/core/ns.js');

/** 评分四档 → annotate-colour 注释色（fsrs4tw 遗产字段，保留写库契约；
 *  repeat.tid 展示层的同名映射无法与 JS 共享，改动须人工同步） */
const RATING_COLOURS: Record<string, string> = { Again: 'red', Hard: 'orange', Good: 'green', Easy: 'dodgerblue' };

export interface GradeOptions {
  title: string;
  /** 卡所属牌组（完整标题或名称）；空缺回 default 牌组 */
  deckTitle?: string;
  /** Again / Hard / Good / Easy（调用方已归一，此处只按键取值） */
  rating: string;
  now?: Date;
  /** 间隔模糊随机数注入（默认 Math.random，便于测试确定性断言） */
  fuzzRandomFn?: () => number;
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

/**
 * 评分写路径：对单卡执行 FSRS 计算与全部落库，返回判定结果。
 * 会话缺位（单牌组 fsrs4tw 路径无全局会话）时照常写卡与日志，只跳过会话推进。
 * 守卫（不信任调用方）：非 item 卡拒绝；显式传入但**不存在**的牌组拒绝——
 * 否则日志/优先级/leech 阈值会静默写到 default 牌组（曾如此）。
 */
export function gradeCard(wiki: any, opts: GradeOptions): GradeResult {
  const result: GradeResult = { ok: false, finished: false, next: null, due: null };
  if (!wiki || typeof wiki.getTiddler !== 'function' || !opts.title) return result;
  const now = opts.now || new Date();
  const f = wiki.getTiddler(opts.title)?.fields;
  if (!f) return result;
  if (f['tidme.kind'] !== 'item') return result; // 只有测试卡可评分（阅读材料/文档页/非卡不入评分路径）

  const deckName = String(opts.deckTitle || '');
  const deck = deckName ? deckMod.getDeck(wiki, deckName) : deckMod.getDeck(wiki, deckMod.DEFAULT_DECK);
  if (!deck) return result;
  const rating = String(opts.rating || '');

  // 1. FSRS 四档计算（缺字段按新卡，与 [fsrs[p]] 过滤器输出一致）
  let target: any = null;
  let maxInterval = sched.DECK_PARAM_DEFAULTS.maximumInterval;
  try {
    const parsed = JSON.parse(fsrs.repeat(f, { p: String(deck.fields.p || ''), now }));
    const key = parsed.Rating?.[rating] ?? rating;
    target = parsed.Cards?.[key];
    if (parsed.P?.maximum_interval) maxInterval = Number(parsed.P.maximum_interval);
  } catch {
    target = null;
  }
  if (!target || !target.card) return result;

  // 1.5 间隔模糊（Fuzz）：对及格复习卡（state=2 且 scheduled_days >= 2.5）加对称抖动打散聚集
  if (rating !== 'Again' && String(target.card.state) === '2') {
    const rawDays = Number(target.card.scheduled_days);
    if (Number.isFinite(rawDays) && rawDays >= 2.5) {
      const prevInterval = Number(f.scheduled_days || 0);
      const fuzzedDays = sched.applyFuzz(rawDays, {
        prevInterval,
        maxInterval,
        randomFn: opts.fuzzRandomFn,
      });
      if (fuzzedDays !== rawDays) {
        target.card.scheduled_days = String(fuzzedDays);
        target.card.due = schema.twDateString(new Date(now.getTime() + fuzzedDays * 86400000));
        if (target.review_log) target.review_log.scheduled_days = fuzzedDays;
      }
    }
  }

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

  // 5. 专注时长（锚点结算 → 记入阅读时长统计）+ 折叠态清理。
  //  锚点归 core/session（touch/consume 成对），本模块不再自读自删 tiddler。
  session.consumeFocusAnchor(wiki, opts.title, now);
  wiki.deleteTiddler(ns.FOLDED_STATE_PREFIX + opts.title);

  // 子集牌组（tidme.subset-doc）不在此清理：它是「复习本书」的作用域容器，
  // 评分会删掉它 = 第一张卡后书籍复习静默解体。焚烧点在使用流程边界：
  // startstudy 空队（用完）/ stopstudy（手动停止）/ endSession（结束学习）。

  result.ok = true;
  result.due = target.card.due !== undefined ? String(target.card.due) : null;
  return result;
}
