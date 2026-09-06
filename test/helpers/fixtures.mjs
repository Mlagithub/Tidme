/*
fixtures.mjs — 共享造数 builder（Arrange 收口）

只收口"基础设施形态"的造数（字段集、管线导入落库）；各测试独有的领域摆置
（特定的书结构、特定字段组合）留在各自文件里，不要硬塞进这里。
*/
import { twDate } from "./tw-date.mjs";

/** 最小 item 知识卡字段集（默认新卡：state=0，due=现在） */
export function makeItem(title, { state = "0", due = twDate(), priority, ...extra } = {}) {
	return {
		title,
		"tidme.kind": "item",
		state,
		due: due instanceof Date ? twDate(due) : due,
		caption: title,
		text: "x",
		...(priority !== undefined ? { "tidme.priority": String(priority) } : {}),
		...extra
	};
}

/** 最小 topic 阅读卡字段集 */
export function makeTopic(title, { due = twDate(), ...extra } = {}) {
	return {
		title,
		"tidme.kind": "topic",
		due: due instanceof Date ? twDate(due) : due,
		caption: title,
		text: "x",
		...extra
	};
}

/** 用导入管线把 markdown 切成书并落库（文档页 + 节卡），返回 runSplit 结果 */
export async function importMarkdown(wiki, pipelineMod, markdown, { title = "导入书", type = "text/markdown" } = {}) {
	const r = await pipelineMod.runSplit({ text: markdown, title, type, minChars: 0 });
	for (const t of r.tiddlers) wiki.addTiddler(t);
	return r;
}
