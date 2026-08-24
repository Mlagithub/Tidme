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
	const random = `[subfilter<filter_due>] [subfilter<filter_new>] +[sortrandom[]]`;
	const dueNew = `${learn} ${due} ${newly}`;
	const newDue = `${learn} ${newly} ${due}`;
	const randomCombo = `${learn} [subfilter<filter_random>]`;
	const order = fields.order || "due-new";
	const queue = order === "new-due" ? newDue : order === "random" ? randomCombo : dueNew;
	return { learn, due, newly, unfold, random, dueNew, newDue, randomCombo, queue };
}

/**
 * 计算 deck 学习队列（按 order 组合 learn/due/new）。
 * @param deckTitle deck tiddler 标题
 * @param filterTiddlers 求值函数（TW wiki.filterTiddlers 的绑定版；无头测试可传自定义求值器）
 * @param getFields 取 deck 字段（默认经 filterTiddlers 内建；无头测试可传）
 */
export function deckQueue(
	deckTitle: string,
	evaluate: (filter: string) => string[],
	fields?: DeckFields
): string[] {
	const f = composeDeckFilters(deckTitle, fields);
	return evaluate(f.queue);
}
