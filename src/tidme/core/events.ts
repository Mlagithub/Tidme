/*
events.ts — tm-tidme-* 消息约定与刷新策略（G9 事件总线落地）

目的：解决导入/切分/评分后 UI 状态刷新时序问题（现状代码自述的痛点）。
约定：所有跨组件状态变更通过 TW 消息（tm-* / tm-tidme-*）广播，监听方负责刷新自身；
禁止组件直接改写他人状态后依赖隐式刷新。

消息清单（命名空间 tm-tidme-*）：
  tm-tidme-import-done    导入/切分完成  param = { token | docId | bookTitle }
  tm-tidme-section-done   Section 完成（去 ? 标签）  param = section 标题
  tm-tidme-section-later  Section 顺延  param = section 标题
  tm-tidme-card-created   摘录/挖空卡已建  param = 卡标题
  tm-tidme-queue-changed  队列状态变化（评分/顺延/忽略后）  param = deck 标题

机制（浏览器端）：
  - 发送：dispatch(widget, type, param) —— 沿 widget 树冒泡到 $tw.rootWidget
  - 桥接：bridgeTidmeEvents() 把 rootWidget 收到的 tm-tidme-* 事件接到进程内监听表
    （notifyTidme）；无头/测试环境没有 rootWidget 时跳过桥接，纯函数仍可单测
  - 组件订阅：bindComponentRefresh(types, rebuild) —— 组件 render 时调用，
    消息到达后触发 rebuild（组件内部用 _wrap.parentNode 判活，已卸载实例零成本跳过）
  - 刷新策略：队列/负载展示（统计面板、卡片管理器、侧边栏树、批量操作页）监听
    QUEUE_CHANGED / IMPORT_DONE → 重建；评分（fsrs4tw repeat）、忽略（exclude）、
    阅读操作（section-bar）、批量操作（queue-ops / card-manager）在写库后发送消息。
*/

export const EVENTS = {
	IMPORT_DONE: "tm-tidme-import-done",
	SECTION_DONE: "tm-tidme-section-done",
	SECTION_LATER: "tm-tidme-section-later",
	CARD_CREATED: "tm-tidme-card-created",
	QUEUE_CHANGED: "tm-tidme-queue-changed"
} as const;

/** 发送 tidme 事件（沿 widget 树冒泡；无 widget/无监听者时静默） */
export function dispatch(widget: any, type: string, param?: unknown): void {
	try {
		if (widget && typeof widget.dispatchEvent === "function") {
			widget.dispatchEvent({ type, param });
		}
	} catch {
		/* 忽略分发错误（无监听者不算错） */
	}
}

type Handler = () => void;
const listeners = new Map<string, Set<Handler>>();

/** 进程内订阅（返回注销函数；组件无销毁钩子时可不调用，靠实例判活） */
export function onTidme(type: string, handler: Handler): () => void {
	if (!listeners.has(type)) listeners.set(type, new Set());
	listeners.get(type)!.add(handler);
	return () => { listeners.get(type)?.delete(handler); };
}

/** 通知进程内订阅者（单点失败不拖累） */
export function notifyTidme(type: string): void {
	const set = listeners.get(type);
	if (!set) return;
	for (const h of [...set]) {
		try { h(); } catch { /* 单点失败忽略 */ }
	}
}

let bridged = false;

/**
 * 桥接：$tw.rootWidget 收到的 tm-tidme-* 消息 → notifyTidme（每进程只桥接一次）。
 * 浏览器端 $tw.rootWidget 存在；无头/测试环境不存在时静默跳过（进程内订阅仍可用）。
 */
export function bridgeTidmeEvents(env?: any): void {
	if (bridged) return;
	const root = env?.rootWidget ?? (typeof $tw !== "undefined" ? $tw.rootWidget : null);
	if (!root || typeof root.addEventListener !== "function") return;
	bridged = true;
	for (const type of Object.values(EVENTS)) {
		root.addEventListener(type, () => { notifyTidme(type); });
	}
}

/**
 * 组件刷新订阅：桥接 + 订阅一组事件到 rebuild 回调。
 * 组件 render 时调用一次；rebuild 应自判活（_wrap.parentNode 存在才重建）。
 */
export function bindComponentRefresh(types: readonly string[], rebuild: () => void): void {
	bridgeTidmeEvents();
	for (const t of types) onTidme(t, rebuild);
}
