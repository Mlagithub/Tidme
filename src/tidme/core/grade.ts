/*
core/grade.ts — 复习评分写路径（唯一实现）

此前评分写库被 wikitext repeat.tid 与 card-viewer.rateCard 各自编排且已漂移
（专注时长只有后者记、PriorityDynamics 配置只有前者读）。本模块收口为唯一写路径：
FSRS 计算 → 字段写回（含 annotate-colour）→ <deck>/log → 优先级动态 →
会话推进（Again 挪队尾重学）→ 专注时长 → 折叠态/计时锚点清理。

撤销（Undo）：每次评分把快照入栈（唯一持有者 = core/undo），undoLastGrade 反向回滚
字段/日志/优先级/配额/搁置/操练变动与会话。会话边界清栈由 core/session 负责。

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
const undo = require('$:/plugins/keepone/tidme/core/undo.js');
const drill = require('$:/plugins/keepone/tidme/core/drill.js');
import type { LearningSession } from './session.ts';
import type { ReviewUndoSnapshot } from './undo.ts';

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
  // 学习日（换天时刻）经 core/scheduler 单点解析；日志键仍是绝对时刻（UTC 17 位串）
  const learningDay = sched.learningDayContext(wiki, now).learningDay;

  // 突击 Cram 模式分支：不改写 FSRS 字段、不写日志、不计配额，纯操练
  if (isCram) {
    undo.pushUndo({
      kind: 'cram',
      title: opts.title,
      deckTitle: deck.title,
      logKey,
      prevSession: sessionSnapshot(currentSession),
      learningDay,
      at: now,
    });

    const cramNext = advanceSessionAfterGrade(wiki, opts.title, rating, currentSession, []);
    settleGradeUi(wiki, opts.title, now);
    if (currentSession) {
      result.next = cramNext;
      result.finished = cramNext === null;
    }

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
    if (parsed.P?.maximum_interval !== undefined) {
      const mi = Number(parsed.P.maximum_interval);
      if (Number.isFinite(mi) && mi > 0) maxInterval = mi;
    }
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
  // 配额记账类别（state 归一化后判定）：0 = 引入新卡；2 = 复习卡；1/3 = 会内学习步（不计额度）
  const stateBefore = sched.stateOf(f);
  const quotaKind: sched.QuotaKind = stateBefore === '0' ? 'new' : stateBefore === '2' ? 'review' : 'learn';

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
    drill.recordFinalDrill(wiki, opts.title, now);
    finalDrillChange = 'added';
  } else if (rating === 'Good' || rating === 'Easy') {
    const removed = drill.removeFinalDrill(wiki, opts.title);
    if (removed) finalDrillChange = 'removed';
  }

  // 记录快照以支持撤销（内存栈；唯一持有者 = core/undo）
  undo.pushUndo({
    kind: 'review',
    title: opts.title,
    deckTitle: deck.title,
    logKey,
    prevFields: { ...f },
    prevSession: sessionSnapshot(currentSession),
    quotaKind,
    learningDay,
    at: now,
    newlyBuried,
    finalDrillChange,
  });

  wiki.addTiddler({
    ...f,
    ...target.card,
    'annotate-colour': RATING_COLOURS[rating] || 'dodgerblue',
    'tidme.priority': String(priority),
  });

  // 3. 复习日志（<deck>/log 单文件，键 = 17 位复习时刻，值 = review_log JSON）
  wiki.setText(ns.deckLogTitle(deck.title), null, logKey, JSON.stringify(target.review_log));

  // 3.5 每日配额记账（new = 引入新卡；review = 复习卡；会内学习步不计额度）
  sched.recordDailyQuota(wiki, quotaKind, now);

  // 4. 会话推进 + 5. 专注时长/折叠态清理（与 cram 分支共用同一收尾）
  const sAfter = session.getSession(wiki);
  const next = advanceSessionAfterGrade(wiki, opts.title, rating, sAfter, newlyBuried);
  settleGradeUi(wiki, opts.title, now);
  if (sAfter) {
    result.next = next;
    result.finished = next === null;
  }

  result.ok = true;
  result.due = target.card.due !== undefined ? String(target.card.due) : null;
  return result;
}

/** 评分前的会话快照（null = 当时无全局会话） */
function sessionSnapshot(s: LearningSession | null): ReviewUndoSnapshot['prevSession'] {
  return s ? { list: [...s.list], mode: s.mode, currentIndex: s.currentIndex } : null;
}

/** 评分后的会话推进（Again 挪队尾重学，其余移出；当日被搁置的兄弟卡一并剔除）。
 *  cram 与正常评分共用——两支曾各自复制这段逻辑并已出现差异。 */
function advanceSessionAfterGrade(
  wiki: any,
  title: string,
  rating: string,
  current: LearningSession | null,
  newlyBuried: string[],
): string | null {
  if (!current) return null;
  let list = current.list.filter((t: string) => t !== title);
  if (newlyBuried.length) {
    const buriedSet = new Set(newlyBuried);
    list = list.filter((t: string) => !buriedSet.has(t));
  }
  if (rating === 'Again') list.push(title);
  session.setSession(wiki, { list, mode: current.mode, currentIndex: current.currentIndex });
  return session.advanceSession(wiki, null);
}

/** 评分收尾：结算专注时长锚点 + 清折叠态（两分支共用） */
function settleGradeUi(wiki: any, title: string, now: Date): void {
  session.consumeFocusAnchor(wiki, title, now);
  wiki.deleteTiddler(ns.FOLDED_STATE_PREFIX + title);
}

/** 撤销栈深度（UI 用它决定「撤销」按钮是否可用） */
export function getUndoStackDepth(): number {
  return undo.undoDepth();
}

/** 清空撤销栈（会话边界由 core/session 调用；测试亦用） */
export function clearUndoStack(): void {
  undo.clearUndo();
}

/**
 * 撤销上一次评分（Undo）：
 * 1. 恢复卡片所有字段（FSRS 字段族 + annotate-colour + priority）
 * 2. 从 <deck>/log 中删除对应时间戳的单条复习日志
 * 3. 撤销兄弟卡搁置状态与日末操练变动
 * 4. 恢复评分前的会话列表与焦点（仅当仍是同一学习日——跨天回写会复活昨日会话）
 * 5. 回滚当日新卡/复习卡配额计数
 * 6. 更新撤销状态镜像 tiddler
 */
export function undoLastGrade(wiki: any, now: Date = new Date()): { ok: boolean; title?: string } {
  if (!wiki) return { ok: false };
  const snapshot = undo.popUndo();
  if (!snapshot) return { ok: false };

  // 跨天不再回写会话：撤销是"同一场学习内的纠错"，隔天恢复旧列表会凭空复活已结束的会话。
  // （会话结束时 core/session 也会清栈，此处是第二道保险。）now 可注入，与 gradeCard 同风格。
  const sameDay = snapshot.learningDay === sched.learningDayContext(wiki, now).learningDay;
  const restoreSession = sameDay ? snapshot.prevSession : null;

  if (snapshot.kind === 'cram') {
    if (restoreSession) {
      session.setSession(wiki, restoreSession);
      session.enterCard(wiki, snapshot.title);
    }
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
  if (snapshot.newlyBuried.length) {
    sched.unburyCards(wiki, snapshot.newlyBuried);
  }

  // 2.6 撤销 Final Drill 变化
  if (snapshot.finalDrillChange === 'added') {
    drill.removeFinalDrill(wiki, snapshot.title);
  } else if (snapshot.finalDrillChange === 'removed') {
    drill.recordFinalDrill(wiki, snapshot.title, snapshot.at);
  }

  // 3. 恢复会话状态并重新进入该卡（锚点用"现在"：撤销本身耗时不该计入专注时长）
  if (restoreSession) {
    session.setSession(wiki, restoreSession);
    session.enterCard(wiki, snapshot.title);
  }

  // 4. 回滚每日配额（按记账时的同一类别；learn 不记账即无操作）
  sched.rollbackDailyQuota(wiki, snapshot.quotaKind, snapshot.at);

  // 5. 更新撤销状态镜像

  return { ok: true, title: snapshot.title };
}
