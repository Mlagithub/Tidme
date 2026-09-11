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
  /** 突击 Cram 模式：不写 FSRS 状态与日志，仅操练 */
  cram?: boolean;
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

  const currentSession = session.getSession(wiki);
  const isCram = opts.cram !== undefined ? !!opts.cram : (currentSession?.mode === 'cram');
  const logKey = schema.twDateString(now);
  const rollover = config && typeof config.readRolloverHour === 'function' ? config.readRolloverHour(wiki) : 4;
  const learningDay = schema.learningDayOf(now, rollover);

  // 突击 Cram 模式分支：不改写 FSRS 字段、不写日志、不计配额，纯操练
  if (isCram) {
    undoStack.push({
      title: opts.title,
      deckTitle: deck.title,
      logKey,
      prevFields: { ...f },
      prevSession: currentSession
        ? { list: [...currentSession.list], mode: currentSession.mode, currentIndex: currentSession.currentIndex }
        : null,
      wasNew: false,
      learningDay,
      at: now,
      isCram: true,
    });
    if (undoStack.length > MAX_UNDO_DEPTH) undoStack.shift();
    wiki.addTiddler({ title: ns.UNDO_STATE_TITLE, depth: String(undoStack.length), can_undo: 'yes' });

    if (currentSession) {
      const list = currentSession.list.filter((t: string) => t !== opts.title);
      if (rating === 'Again') list.push(opts.title);
      session.setSession(wiki, { list, mode: currentSession.mode, currentIndex: currentSession.currentIndex });
      const nextT = session.advanceSession(wiki, null);
      result.next = nextT;
      result.finished = nextT === null;
    }

    session.consumeFocusAnchor(wiki, opts.title, now);
    wiki.deleteTiddler(ns.FOLDED_STATE_PREFIX + opts.title);

    result.ok = true;
    result.due = f.due !== undefined ? String(f.due) : null;
    return result;
  }

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
  const isNewCard = !f.state || f.state === '0';

  // 兄弟卡搁置（Bury Siblings）
  let newlyBuried: string[] = [];
  if (config && typeof config.readBurySiblings === 'function' && config.readBurySiblings(wiki)) {
    const siblings = sched.findSiblings(wiki, opts.title);
    if (siblings.length) {
      newlyBuried = sched.buryCards(wiki, siblings, learningDay);
    }
  }

  // 日末操练（Final Drill）记录与达标移除
  let finalDrillChange: 'added' | 'removed' | null = null;
  if (rating === 'Again') {
    sched.recordFinalDrill(wiki, opts.title, now);
    finalDrillChange = 'added';
  } else if (rating === 'Good' || rating === 'Easy') {
    const removed = sched.removeFinalDrill(wiki, opts.title);
    if (removed) finalDrillChange = 'removed';
  }

  // 记录快照以支持 Undo 撤销（内存栈，深度 MAX_UNDO_DEPTH = 30）
  undoStack.push({
    title: opts.title,
    deckTitle: deck.title,
    logKey,
    prevFields: { ...f },
    prevSession: currentSession
      ? { list: [...currentSession.list], mode: currentSession.mode, currentIndex: currentSession.currentIndex }
      : null,
    wasNew: isNewCard,
    learningDay,
    at: now,
    isCram: false,
    newlyBuried,
    finalDrillChange,
  });
  if (undoStack.length > MAX_UNDO_DEPTH) undoStack.shift();
  wiki.addTiddler({ title: ns.UNDO_STATE_TITLE, depth: String(undoStack.length), can_undo: 'yes' });

  wiki.addTiddler({
    ...f,
    ...target.card,
    'annotate-colour': RATING_COLOURS[rating] || 'dodgerblue',
    'tidme.priority': String(priority),
  });

  // 3. 复习日志（<deck>/log 单文件，键 = 17 位复习时刻，值 = review_log JSON）
  wiki.setText(ns.deckLogTitle(deck.title), null, logKey, JSON.stringify(target.review_log));

  // 3.5 每日配额记账
  sched.recordDailyQuota(wiki, isNewCard, now, rollover);

  // 4. 会话推进（Again 挪队尾重学，其余移出；且排除当日被搁置的兄弟卡）
  const s = session.getSession(wiki);
  if (s) {
    let list = s.list.filter((t: string) => t !== opts.title);
    if (newlyBuried.length) {
      const buriedSet = new Set(newlyBuried);
      list = list.filter((t: string) => !buriedSet.has(t));
    }
    if (rating === 'Again') list.push(opts.title);
    session.setSession(wiki, { list, mode: s.mode, currentIndex: s.currentIndex });
    const nextT = session.advanceSession(wiki, null);
    result.next = nextT;
    result.finished = nextT === null;
  }

  // 5. 专注时长（锚点结算 → 记入阅读时长统计）+ 折叠态清理。
  session.consumeFocusAnchor(wiki, opts.title, now);
  wiki.deleteTiddler(ns.FOLDED_STATE_PREFIX + opts.title);

  result.ok = true;
  result.due = target.card.due !== undefined ? String(target.card.due) : null;
  return result;
}

export interface GradeSnapshot {
  title: string;
  deckTitle: string;
  logKey: string;
  prevFields: Record<string, any>;
  prevSession: { list: string[]; mode?: string; currentIndex?: string } | null;
  wasNew: boolean;
  learningDay: string;
  at: Date;
  isCram?: boolean;
  newlyBuried?: string[];
  finalDrillChange?: 'added' | 'removed' | null;
}

const undoStack: GradeSnapshot[] = [];
export const MAX_UNDO_DEPTH = 30;

export function getUndoStackDepth(): number {
  return undoStack.length;
}

export function clearUndoStack(): void {
  undoStack.length = 0;
}

/**
 * 撤销上一次评分（Undo）：
 * 1. 恢复卡片所有字段（FSRS 字段族 + annotate-colour + priority）
 * 2. 从 <deck>/log 中删除对应时间戳的单条复习日志
 * 3. 撤销兄弟卡搁置状态与日末操练变动
 * 4. 恢复评分前的会话列表与焦点
 * 5. 回滚当日新卡/复习卡配额计数
 * 6. 更新撤销状态 tiddler
 */
export function undoLastGrade(wiki: any): { ok: boolean; title?: string } {
  if (!wiki || !undoStack.length) return { ok: false };
  const snapshot = undoStack.pop()!;

  // Cram 模式的撤销：仅恢复会话列表与焦点
  if (snapshot.isCram) {
    if (snapshot.prevSession) {
      session.setSession(wiki, snapshot.prevSession);
      session.enterCard(wiki, snapshot.title, snapshot.at);
    }
    wiki.addTiddler({
      title: ns.UNDO_STATE_TITLE,
      depth: String(undoStack.length),
      can_undo: undoStack.length > 0 ? 'yes' : 'no',
    });
    return { ok: true, title: snapshot.title };
  }

  // 1. 恢复卡片原始字段
  wiki.addTiddler(snapshot.prevFields);

  // 2. 撤销复习日志
  const logTitle = ns.deckLogTitle(snapshot.deckTitle);
  const logData = wiki.getTiddlerData(logTitle);
  if (logData && typeof logData === 'object' && logData[snapshot.logKey]) {
    delete logData[snapshot.logKey];
    wiki.addTiddler({ title: logTitle, type: 'application/json', text: JSON.stringify(logData) });
  }

  // 2.5 撤销兄弟卡搁置
  if (snapshot.newlyBuried && snapshot.newlyBuried.length) {
    sched.unburyCards(wiki, snapshot.newlyBuried);
  }

  // 2.6 撤销 Final Drill 变化
  if (snapshot.finalDrillChange === 'added') {
    sched.removeFinalDrill(wiki, snapshot.title);
  } else if (snapshot.finalDrillChange === 'removed') {
    sched.recordFinalDrill(wiki, snapshot.title, snapshot.at);
  }

  // 3. 恢复会话状态并重新进入该卡
  if (snapshot.prevSession) {
    session.setSession(wiki, snapshot.prevSession);
    session.enterCard(wiki, snapshot.title, snapshot.at);
  }

  // 4. 回滚每日配额
  const rollover = config && typeof config.readRolloverHour === 'function' ? config.readRolloverHour(wiki) : 4;
  sched.rollbackDailyQuota(wiki, snapshot.wasNew, snapshot.at, rollover);

  // 5. 更新撤销状态
  wiki.addTiddler({
    title: ns.UNDO_STATE_TITLE,
    depth: String(undoStack.length),
    can_undo: undoStack.length > 0 ? 'yes' : 'no',
  });

  return { ok: true, title: snapshot.title };
}
