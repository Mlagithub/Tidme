/*
study-mode.test.mjs — 学习模式条与统一结束学习（M5 Wave 1）

- core/session：endSession 三清（全局会话 + 全部 <deck>/study + $:/temp/tidme/*）、
  isSessionActive / getActiveStudy（global 与 deck 两个来源）
- 学习模式条 widget：未激活隐藏 / 激活显示进度 / 结束点击清场（走唯一刷新机制嗅探）
*/
import { test } from "node:test";
import assert from "node:assert/strict";
import { bootPlugin } from "../helpers/tw-boot.mjs";

const { wiki, mod, reset } = bootPlugin({ prefix: "tidme-mode-" });
let session, reactive, modeBar;
test.before(() => {
	session = mod("core/session.js");
	reactive = mod("core/reactive.js");
	modeBar = mod("review/widgets/study-mode.js");
});

test.beforeEach(reset);

/** 造一张牌组 + 全局会话 + 牌组会话 + 临时项的完整激活态 */
function setupActive() {
	wiki.addTiddler({ title: "$:/Deck/甲", tags: ["$:/tags/TidmeDeck"], caption: "甲", card: "[tidme.kind[item]]" });
	wiki.addTiddler({ title: "$:/state/tidme/learning-session", list: ["卡甲", "卡乙", "卡丙"], mode: "items-only" });
	wiki.addTiddler({ title: "$:/Deck/甲/study", list: ["卡丁"] });
	wiki.addTiddler({ title: "$:/temp/tidme/study/input/卡甲", text: "x" });
	wiki.addTiddler({ title: "$:/temp/tidme/autopostpone/last", text: "{}" });
}

test("session: isSessionActive / getActiveStudy——全局会话优先，回退牌组会话", () => {
	assert.equal(session.isSessionActive(wiki), false, "初始未激活");
	setupActive();
	assert.equal(session.isSessionActive(wiki), true);
	const a = session.getActiveStudy(wiki);
	assert.equal(a.source, "global", "全局会话优先");
	assert.deepEqual([...a.list], ["卡甲", "卡乙", "卡丙"]);
	wiki.deleteTiddler("$:/state/tidme/learning-session");
	const b = session.getActiveStudy(wiki);
	assert.equal(b.source, "deck", "回退到牌组会话");
	assert.equal(b.deckTitle, "$:/Deck/甲");
	assert.deepEqual([...b.list], ["卡丁"]);
});

test("session: endSession 三清（全局会话 + 全部 <deck>/study + $:/temp/tidme/*）", () => {
	setupActive();
	assert.equal(session.isSessionActive(wiki), true);
	const n = session.endSession(wiki);
	assert.ok(n >= 4, `清理数应 ≥4（会话+study+2 临时项），实际 ${n}`);
	assert.ok(!wiki.getTiddler("$:/state/tidme/learning-session"), "全局会话已删除");
	assert.ok(!wiki.getTiddler("$:/Deck/甲/study"), "牌组 study 列表一并清除");
	assert.ok(!wiki.getTiddler("$:/temp/tidme/study/input/卡甲"), "临时项已删除");
	assert.ok(!wiki.getTiddler("$:/temp/tidme/autopostpone/last"), "临时项已删除");
	assert.equal(session.isSessionActive(wiki), false, "结束后再无激活会话");
	// 幂等：再清一次安全
	assert.equal(session.endSession(wiki), 0);
});

test("reactive: 会话变化谓词覆盖全局会话与 <deck>/study", () => {
	assert.equal(reactive.isSessionChange("$:/state/tidme/learning-session"), true);
	assert.equal(reactive.isSessionChange("$:/Deck/甲/study"), true);
	assert.equal(reactive.isSessionChange("$:/Deck/甲"), false);
	assert.equal(reactive.isSessionChange("普通笔记"), false);
});

// ---- 学习模式条 widget（假 DOM 渲染） ----

function fakeNode(tag = "div") {
	const node = {
		nodeType: 1, tagName: String(tag).toUpperCase(),
		childNodes: [], children: [], style: {}, attributes: {}, parentNode: null,
		classList: { add() {}, remove() {}, contains() { return false; } },
		setAttribute(k, v) { this.attributes[k] = v; },
		addEventListener(type, fn) { (this._listeners ||= {})[type] = fn; },
		dispatchEvent() { return true; },
		removeEventListener() {},
		appendChild(c) { this.childNodes.push(c); this.children.push(c); c.parentNode = this; return c; },
		insertBefore(c) { this.childNodes.push(c); this.children.push(c); c.parentNode = this; return c; },
		removeChild(c) { this.childNodes = this.childNodes.filter((x) => x !== c); return c; },
		innerHTML: ""
	};
	// 对齐真实 DOM 语义：赋值 textContent 清空全部子节点
	Object.defineProperty(node, "textContent", {
		get() {
			if (node._text !== undefined) return node._text;
			return (node.childNodes || []).map((c) => c.textContent).join("");
		},
		set(v) {
			if (!v) { node.childNodes = []; node.children = []; }
			node._text = v;
		}
	});
	return node;
}

function renderBar(currentTiddler) {
	const holder = fakeNode("div");
	const w = new modeBar["tidme-study-mode-bar"]({ attributes: {} }, {
		wiki,
		document: { createElement: (t) => fakeNode(t), body: fakeNode("body") },
		parentWidget: {
			variables: { currentTiddler: { value: currentTiddler, params: [], isMacroDefinition: false } },
			getVariable: (n) => (n === "currentTiddler" ? currentTiddler : ""),
			getAncestorCount: () => 0
		},
		variables: {}
	});
	w.render(holder, null);
	return { w, holder };
}

function barText(holder) {
	return (holder.children[0]?.childNodes || []).map((c) => c.textContent).join("|");
}

test("模式条: 未激活隐藏，激活显示进度，refresh 嗅探会话变化", () => {
	const { w, holder } = renderBar("卡甲");
	assert.equal(holder.children[0].style.display, "none", "未激活隐藏");
	setupActive();
	// 唯一刷新机制：learning-session 变化 → refresh 嗅探重建
	assert.equal(w.refresh({ "$:/state/tidme/learning-session": { modified: true } }), true, "会话变化触发重建");
	assert.equal(holder.children[0].style.display, "", "激活可见");
	assert.equal(barText(holder), "学习中|1/3|结束学习", "进度为当前卡在会话中的位置");
	// 队列外的 tiddler 不显示进度
	const { w: w2, holder: h2 } = renderBar("无关笔记");
	w2.refresh({ "$:/state/tidme/learning-session": { modified: true } });
	assert.equal(barText(h2), "学习中|结束学习");
});

test("模式条: 结束学习 → endSession 清场 + 派发导航/通知", () => {
	setupActive();
	const { w, holder } = renderBar("卡乙");
	w.refresh({ "$:/state/tidme/learning-session": { modified: true } });
	// 点击结束按钮
	const btn = holder.children[0].childNodes.find((c) => c.textContent === "结束学习");
	btn._listeners.click();
	assert.equal(session.isSessionActive(wiki), false, "点击后全部清场");
	assert.equal(holder.children[0].style.display, "none", "结束后隐藏");
});
