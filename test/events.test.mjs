/*
events.test.mjs — core 事件总线单元测试（node:test）

覆盖：EVENTS 常量、dispatch（widget 分发封装）、onTidme/notifyTidme（进程内订阅-通知-注销）、
bridgeTidmeEvents（$tw.rootWidget 消息 → 进程内订阅）、bindComponentRefresh（多类型订阅）。
纯函数测试，不依赖 TW 沙箱。
*/
import { test } from "node:test";
import assert from "node:assert/strict";

const events = await import("../src/tidme/core/events.ts");

test("EVENTS: tm-tidme-* 命名空间常量", () => {
	assert.equal(events.EVENTS.IMPORT_DONE, "tm-tidme-import-done");
	assert.equal(events.EVENTS.SECTION_DONE, "tm-tidme-section-done");
	assert.equal(events.EVENTS.SECTION_LATER, "tm-tidme-section-later");
	assert.equal(events.EVENTS.CARD_CREATED, "tm-tidme-card-created");
	assert.equal(events.EVENTS.QUEUE_CHANGED, "tm-tidme-queue-changed");
	for (const t of Object.values(events.EVENTS)) {
		assert.ok(t.startsWith("tm-tidme-"), `${t} 应属于 tm-tidme-* 命名空间`);
	}
});

test("dispatch: 调用 widget.dispatchEvent（无 widget / 无方法时静默）", () => {
	const calls = [];
	events.dispatch({ dispatchEvent: (e) => calls.push(e) }, "tm-tidme-queue-changed", "deckX");
	assert.equal(calls.length, 1);
	assert.equal(calls[0].type, "tm-tidme-queue-changed");
	assert.equal(calls[0].param, "deckX");

	assert.doesNotThrow(() => events.dispatch(null, "tm-tidme-queue-changed"));
	assert.doesNotThrow(() => events.dispatch({}, "tm-tidme-queue-changed"));
	assert.doesNotThrow(() => events.dispatch({ dispatchEvent() { throw new Error("boom"); } }, "tm-tidme-queue-changed"));
});

test("onTidme/notifyTidme: 订阅-通知-注销", () => {
	let n = 0;
	const off = events.onTidme("t1", () => n++);
	events.notifyTidme("t1");
	assert.equal(n, 1);
	off();
	events.notifyTidme("t1");
	assert.equal(n, 1, "注销后不再通知");
	assert.doesNotThrow(() => events.notifyTidme("t2")); // 无订阅者
});

test("notifyTidme: 单点异常不拖累其他订阅者", () => {
	let n = 0;
	events.onTidme("t3", () => { throw new Error("boom"); });
	events.onTidme("t3", () => n++);
	assert.doesNotThrow(() => events.notifyTidme("t3"));
	assert.equal(n, 1);
});

test("bridgeTidmeEvents: rootWidget 收到 tm-tidme-* 消息 → 进程内订阅触发", () => {
	const listeners = {};
	const root = { addEventListener: (type, fn) => { listeners[type] = fn; } };
	events.bridgeTidmeEvents({ rootWidget: root });
	assert.ok(typeof listeners[events.EVENTS.QUEUE_CHANGED] === "function", "桥接注册了监听");
	assert.ok(typeof listeners[events.EVENTS.IMPORT_DONE] === "function");

	let n = 0;
	const off = events.onTidme(events.EVENTS.QUEUE_CHANGED, () => n++);
	listeners[events.EVENTS.QUEUE_CHANGED]();
	assert.equal(n, 1, "rootWidget 消息驱动进程内订阅");
	off();
	listeners[events.EVENTS.QUEUE_CHANGED]();
	assert.equal(n, 1, "注销后不再触发");
});

test("bridgeTidmeEvents: 无 rootWidget 环境静默跳过（无头/测试）", () => {
	assert.doesNotThrow(() => events.bridgeTidmeEvents({ rootWidget: null }));
	assert.doesNotThrow(() => events.bridgeTidmeEvents(undefined));
});

test("bindComponentRefresh: 多类型订阅 + 桥接", () => {
	let n = 0;
	events.bindComponentRefresh([events.EVENTS.QUEUE_CHANGED, events.EVENTS.IMPORT_DONE], () => n++);
	events.notifyTidme(events.EVENTS.QUEUE_CHANGED);
	events.notifyTidme(events.EVENTS.IMPORT_DONE);
	assert.equal(n, 2, "两类事件各触发一次");
	assert.doesNotThrow(() => events.notifyTidme(events.EVENTS.SECTION_LATER));
});
