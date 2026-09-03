/*
deck-engine.ts — deck 队列组合逻辑（纯函数）

复刻 fsrs4tw ui/ViewTemplate/deck 的 <$let> 过滤器组合（learn/due/new/unfold/random/queue）。
无头/服务端测试可无 DOM 直接使用；wikitext 模板（M4 起）可改用本模块产出的过滤器字符串。
注：本模块产出的是"已插值 deck 标题"的过滤器字符串（无 $(var)$ 依赖，双端一致）。
*/

export interface DeckFields {
	card?: string;
	card_exclude?: string;
	card_unfold?: string;
	state_learn?: string;
	state_due?: string;
	state_new?: string;
	order?: string;
	order_learn?: string;
	order_due?: string;
	order_new?: string;
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
	const learn = `[subfilter{${d}!!card}!subfilter{${d}!!card_exclude}subfilter{${d}!!state_learn}sort[due]]`;
	const due = `[subfilter{${d}!!card}!subfilter{${d}!!card_exclude}subfilter{${d}!!state_due}subfilter{${d}!!order_due}]`;
	const newly = `[subfilter{${d}!!card}!subfilter{${d}!!card_exclude}subfilter{${d}!!state_new}subfilter{${d}!!order_new}]`;
	const unfold = `[subfilter{${d}!!card_unfold}]`;
	// random 模式：内联 due/newly 子过滤并随机（不依赖 .tid 中由 $let 注入的 <filter_*>，
	// 否则纯 JS 评估时变量未定义 → 子过滤崩溃，队列静默塌缩）
	const random = `${due} ${newly} +[sortrandom[]]`;
	const dueNew = `${learn} ${due} ${newly}`;
	const newDue = `${learn} ${newly} ${due}`;
	const randomCombo = `${learn} ${random}`;
	const order = fields.order || "due-new";
	const queue = order === "new-due" ? newDue : order === "random" ? randomCombo : dueNew;
	return { learn, due, newly, unfold, random, dueNew, newDue, randomCombo, queue };
}

export interface GlobalQueueOptions {
	itemRatio?: number;
	topicRatio?: number;
	/** strict = 宏观三段式（到期 Items → 到期 Topics → 新 Pending）；interleaved = item:topic 交错（默认，SM 交错学习精神） */
	mode?: "interleaved" | "strict";
	/**
	 * 是否把阅读材料（topic）混入全局学习队列（默认 false = 纯知识卡复习流）。
	 * 阅读节卡导入即带 due=now → 未读即"逾期"，默认混入会把整批待读阅读卡插进
	 * 知识卡学习流（每 4 张词卡打断一次）。阅读材料由阅读列表/文档页/继续阅读消化；
	 * 需要 SM 交错时显式 topics: true。
	 */
	topics?: boolean;
}

const TOPIC_BASE = "[all[shadows+tiddlers]tidme.kind[topic]!has[tidme.done]!has[tidme.ignored]!has[tidme.suspended]";

/** 到期/逾期 Topic（has[due] 且 due ≤ 今天；含逾期积压，按优先级升序） */
function topicDueFilter(): string {
	return `${TOPIC_BASE}has[due]days:due[0]] ` +
		`${TOPIC_BASE}has[due]] :filter[{!!due}compare:date:lt<now [UTC]YYYY0MM0DD0hh0mm0ssXXX>] ` +
		`+[nsort[priority]]`;
}

/** 未排期 Topic（无 due = 从未进入调度，Pending 语义，按优先级升序） */
function topicPendingFilter(): string {
	return `${TOPIC_BASE}!has[due]] +[nsort[priority]]`;
}

/**
 * SuperMemo 风格全局动态学习队列生成器：
 * - 默认（topics 未开）：纯知识卡队列（default deck 的 learn+due+new）——阅读材料不打断复习。
 * - topics:true + interleaved：到期/待读 Topic（Priority 升序）与 Item 队列按 itemRatio:topicRatio 交错。
 * - topics:true + strict：宏观三段式 —— 到期 Items → 到期/逾期 Topics → 新导入 Pending。
 */
export function composeGlobalLearningQueue(
	evaluate: (filter: string) => string[],
	opts: GlobalQueueOptions = {}
): string[] {
	const defaultDeckFilters = composeDeckFilters("$:/Deck/default");
	const mode = opts.mode || "interleaved";
	const includeTopics = opts.topics === true;

	if (mode === "strict") {
		const dueItems = evaluate(`${defaultDeckFilters.learn} ${defaultDeckFilters.due}`);
		const newItems = evaluate(defaultDeckFilters.newly);
		if (!includeTopics) return [...dueItems, ...newItems];
		const dueTopics = evaluate(topicDueFilter());
		const pendingTopics = evaluate(topicPendingFilter());
		return [...dueItems, ...dueTopics, ...newItems, ...pendingTopics];
	}

	// interleaved：item 队列为主体；topics:true 时按比例交错优先 topic（否则纯知识卡）
	const rawItems = evaluate(defaultDeckFilters.queue);
	const rawTopics = includeTopics ? evaluate(`${topicDueFilter()} ${topicPendingFilter()}`) : [];

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
