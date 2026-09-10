/*
deck-engine.ts — deck 队列组合逻辑（纯函数，queue 过滤器组合的唯一真源）

产出 learn/due/newly/unfold/random/queue 等过滤器字符串；wikitext 模板（deck 页的两个
ViewTemplate）经 `deckfilter` 过滤器操作符取用这些字符串，模板内不再复制组合逻辑。
无头/服务端测试可无 DOM 直接使用。
注：本模块产出的是"已插值 deck 标题"的过滤器字符串（无 $(var)$ 依赖，双端一致）。
跨 core 模块引用一律显式 require：相对 ES import 会被 esbuild 内联复制成第二份实现
（`isFilterSafeTitle` 曾因此在产物中出现两次）。测试经真实 TW 加载本模块（可无 DOM）。
*/

declare function require(module: string): any;
const ns = require('$:/plugins/keepone/tidme/core/ns.js');
const DECK_PREFIX = ns.DECK_PREFIX;
const TOPIC_QUEUE_FILTER = ns.TOPIC_QUEUE_FILTER;
const isFilterSafeTitle = ns.isFilterSafeTitle;

export interface DeckFields {
  // 1. 范围界定
  card?: string;
  card_exclude?: string;
  card_unfold?: string;

  // 2. FSRS 状态空间切分
  state_learn?: string;
  state_due?: string;
  state_new?: string;

  // 3. 队列组内排序与配额
  order_learn?: string;
  order_due?: string;
  order_new?: string;

  // 4. 宏观调度
  order?: string;
}

export interface DeckFilters {
  learn: string;
  due: string;
  newly: string;
  unfold: string;
  random: string;
  dueNew: string;
  newDue: string;
  randomCombo: string;
  queue: string;
}

/** 组合 deck 过滤器（deckTitle 已插值，可直接被 subfilter 求值）。
 *  deckTitle 含 `]`/`}` 时无法安全插值（TW 过滤器不支持转义）→ 返回全空过滤器并告警，
 *  调用方按"空过滤器 = 无成员"处理，避免 "Filter error" 文本冒充卡标题。 */
export function composeDeckFilters(deckTitle: string, fields: DeckFields = {}): DeckFilters {
  const d = deckTitle;
  if (!isFilterSafeTitle(d)) {
    console.warn('[tidme] deck title 含过滤器不安全字符，队列过滤器置空:', d);
    return { learn: '', due: '', newly: '', unfold: '', random: '', dueNew: '', newDue: '', randomCombo: '', queue: '' };
  }
  // 学习步随机开关（默认牌组 random_learn 字段，对齐 SuperMemo 的 Randomize final drill）：
  // 关 = 学习中的卡按到期前置；开 = 学习中的卡均匀随机
  // 注意：`+[op]` 是 run 级操作符（作用于累计结果），不能写进同一个 run 的括号内
  // （`[... +[sortrandom[]]]` 是语法错误，TW 会返回 "Filter error" 占位项）。
  const learnSort = String(fields.random_learn || '') === 'yes' ? ' +[sortrandom[]]' : ' +[sort[due]]';
  const learn = `[subfilter{${d}!!card}!subfilter{${d}!!card_exclude}subfilter{${d}!!state_learn}]${learnSort}`;
  const due = `[subfilter{${d}!!card}!subfilter{${d}!!card_exclude}subfilter{${d}!!state_due}subfilter{${d}!!order_due}]`;
  const newly = `[subfilter{${d}!!card}!subfilter{${d}!!card_exclude}subfilter{${d}!!state_new}subfilter{${d}!!order_new}]`;
  const unfold = `[subfilter{${d}!!card_unfold}]`;
  // random 模式：内联 due/newly 子过滤（不依赖模板变量，否则纯 JS 评估时变量未定义 →
  // 子过滤崩溃，队列静默塌缩）。`+[sortrandom[]]` 是 run 级操作符，作用于**累计结果**
  // （due ∪ newly 整体乱序）——模板侧经 deckfilter 操作符取本串，不存在"另一份实现"。
  const random = `${due} ${newly} +[sortrandom[]]`;
  const dueNew = `${learn} ${due} ${newly}`;
  const newDue = `${learn} ${newly} ${due}`;
  const randomCombo = `${learn} ${random}`;
  const order = fields.order || 'due-new';
  const queue = order === 'new-due' ? newDue : order === 'random' ? randomCombo : dueNew;
  return { learn, due, newly, unfold, random, dueNew, newDue, randomCombo, queue };
}

export interface GlobalQueueOptions {
  itemRatio?: number;
  topicRatio?: number;
  /** strict = 宏观三段式（到期 Items → 到期 Topics → 新 Pending）；interleaved = item:topic 交错（默认，SM 交错学习精神） */
  mode?: 'interleaved' | 'strict';
  /**
   * 是否把阅读材料（topic）混入全局学习队列（默认 false = 纯知识卡复习流）。
   * 阅读节卡导入即带 due=now → 未读即"逾期"，默认混入会把整批待读阅读卡插进
   * 知识卡学习流（每 4 张词卡打断一次）。阅读材料由阅读列表/文档页/继续阅读消化；
   * 需要 SM 交错时显式 topics: true。
   */
  topics?: boolean;
}

// 学习队列 Topic 过滤：直接以 ns.TOPIC_QUEUE_FILTER 完整契约组合（勿对契约字符串做
// slice 截断拼接——尾部任何改动都会静默产出错误过滤器）。
// TW 过滤器 run 语义（本文件依赖，已在真实 TW 验证）：
// - 无前缀 run 与累计结果取并集；:filter[...] 与 +[op] 作用于**累计结果**。
//   因此"到期段 + 待读段"两段表达式严禁拼进一次求值——后段的 +[!has[due]]
//   会把累计并集里的到期卡全部滤掉（曾踩坑）。两段各自求值、JS 侧拼接。
// - compare:date:lt 对无 due 的卡恒真（空串 < 任意时刻）——到期判定必须先 :filter[has[due]]。
// - 优先级字段是 tidme.priority：nsort[priority] 排的是不存在的 priority 字段（静默不排序）。

/** 已到期 Topic（has[due] 且 due < now；与 scheduler.isDueNow 同口径，仅同一毫秒边界差），按优先级升序 */
function topicDueFilter(): string {
  return `${TOPIC_QUEUE_FILTER} :filter[has[due]] :filter[{!!due}compare:date:lt<now [UTC]YYYY0MM0DD0hh0mm0ssXXX>] +[nsort[tidme.priority]]`;
}

/** 未排期 Topic（无 due = 从未进入调度，Pending 语义，按优先级升序） */
function topicPendingFilter(): string {
  return `${TOPIC_QUEUE_FILTER} +[!has[due]] +[nsort[tidme.priority]]`;
}

/**
 * SuperMemo 风格全局动态学习队列生成器：
 * - 默认（topics 未开）：纯知识卡队列（default deck 的 learn+due+new）——阅读材料不打断复习。
 * - topics:true + interleaved：到期/待读 Topic（Priority 升序）与 Item 队列按 itemRatio:topicRatio 交错。
 * - topics:true + strict：宏观三段式 —— 到期 Items → 到期/逾期 Topics → 新导入 Pending。
 */
export function composeGlobalLearningQueue(
  evaluate: (filter: string) => string[],
  opts: GlobalQueueOptions = {},
): string[] {
  const defaultDeckFilters = composeDeckFilters(DECK_PREFIX + 'default');
  const mode = opts.mode || 'interleaved';
  const includeTopics = opts.topics === true;

  if (mode === 'strict') {
    const dueItems = evaluate(`${defaultDeckFilters.learn} ${defaultDeckFilters.due}`);
    const newItems = evaluate(defaultDeckFilters.newly);
    if (!includeTopics) return [...dueItems, ...newItems];
    const dueTopics = evaluate(topicDueFilter());
    const pendingTopics = evaluate(topicPendingFilter());
    return [...dueItems, ...dueTopics, ...newItems, ...pendingTopics];
  }

  // interleaved：item 队列为主体；topics:true 时按比例交错优先 topic（否则纯知识卡）。
  // 到期/待读两段分别求值再 JS 侧拼接（拼接进同一次求值会触发累计过滤互杀，见文件头部 run 语义说明）
  const rawItems = evaluate(defaultDeckFilters.queue);
  const rawTopics = includeTopics
    ? [...evaluate(topicDueFilter()), ...evaluate(topicPendingFilter())]
    : [];

  // 交错比例：0/负数/NaN 一律回落到 ≥1（否则内层 while 不推进 → 死循环挂死 UI）
  const ratio = (v: number | undefined, dflt: number) => Math.max(1, Math.floor(Number(v)) || dflt);
  const itemRatio = ratio(opts.itemRatio, 4);
  const topicRatio = ratio(opts.topicRatio, 1);
  const result: string[] = [];

  let i = 0;
  let t = 0;
  while (i < rawItems.length || t < rawTopics.length) {
    let count = 0;
    while (i < rawItems.length && count < itemRatio) {
      result.push(rawItems[i++]);
      count++;
    }
    count = 0;
    while (t < rawTopics.length && count < topicRatio) {
      result.push(rawTopics[t++]);
      count++;
    }
  }
  return result;
}
