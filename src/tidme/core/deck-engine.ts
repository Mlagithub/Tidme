/*
deck-engine.ts — deck 队列组合逻辑（纯函数）

复刻 fsrs4tw ui/ViewTemplate/deck 的 <$let> 过滤器组合（learn/due/new/unfold/random/queue）。
无头/服务端测试可无 DOM 直接使用；wikitext 模板可改用本模块产出的过滤器字符串。
注：本模块产出的是"已插值 deck 标题"的过滤器字符串（无 $(var)$ 依赖，双端一致）。
本模块被 node 测试直接 import，禁用 require；仅 ES 引零依赖的 core/ns 常量。
*/

import { DECK_PREFIX, TOPIC_QUEUE_FILTER } from './ns.ts';

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

/** 组合 deck 过滤器（deckTitle 已插值，可直接被 subfilter 求值） */
export function composeDeckFilters(deckTitle: string, fields: DeckFields = {}): DeckFilters {
  const d = deckTitle;
  // 学习步随机开关（默认牌组 random_learn 字段，对齐 SuperMemo 的 Randomize final drill）：
  // 关 = 学习中的卡按到期前置；开 = 学习中的卡均匀随机
  const learnSort = String(fields.random_learn || '') === 'yes' ? ' +[sortrandom[]]' : 'sort[due]';
  const learn = `[subfilter{${d}!!card}!subfilter{${d}!!card_exclude}subfilter{${d}!!state_learn}${learnSort}]`;
  const due = `[subfilter{${d}!!card}!subfilter{${d}!!card_exclude}subfilter{${d}!!state_due}subfilter{${d}!!order_due}]`;
  const newly = `[subfilter{${d}!!card}!subfilter{${d}!!card_exclude}subfilter{${d}!!state_new}subfilter{${d}!!order_new}]`;
  const unfold = `[subfilter{${d}!!card_unfold}]`;
  // random 模式：内联 due/newly 子过滤（不依赖 .tid 中由 $let 注入的 <filter_*>，
  // 否则纯 JS 评估时变量未定义 → 子过滤崩溃，队列静默塌缩）。
  // 注意：+[sortrandom[]] 是 run 内链式操作符，只作用于紧邻的 newly run（TW 无 :sortrandom
  // run 前缀）——"随机"实际语义 = due 段按 due 序在前 + 新卡段乱序，与 fsrs4tw
  // viewtemplate-deck.tid 的 filter_random 同构（有意保持一致，勿单侧"修复"）
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
  /**
   * 从结果中剔除的标题（如存量分节书籍的文档页：书籍入口而非可学习卡；
   * 整本不切分的 PDF 文档页是阅读卡，不在剔除之列）。由调用方按 wiki 计算。
   */
  excludeTitles?: string[];
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
  const excluded = new Set(opts.excludeTitles || []);
  const keep = (titles: string[]) => titles.filter((t) => !excluded.has(t));

  if (mode === 'strict') {
    const dueItems = evaluate(`${defaultDeckFilters.learn} ${defaultDeckFilters.due}`);
    const newItems = evaluate(defaultDeckFilters.newly);
    if (!includeTopics) return [...dueItems, ...newItems];
    const dueTopics = keep(evaluate(topicDueFilter()));
    const pendingTopics = keep(evaluate(topicPendingFilter()));
    return [...dueItems, ...dueTopics, ...newItems, ...pendingTopics];
  }

  // interleaved：item 队列为主体；topics:true 时按比例交错优先 topic（否则纯知识卡）。
  // 到期/待读两段分别求值再 JS 侧拼接（拼接进同一次求值会触发累计过滤互杀，见文件头部 run 语义说明）
  const rawItems = evaluate(defaultDeckFilters.queue);
  const rawTopics = includeTopics
    ? [...keep(evaluate(topicDueFilter())), ...keep(evaluate(topicPendingFilter()))]
    : [];

  const itemRatio = opts.itemRatio ?? 4;
  const topicRatio = opts.topicRatio ?? 1;
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
