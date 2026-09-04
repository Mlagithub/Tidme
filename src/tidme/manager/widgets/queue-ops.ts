/*
widgets/queue-ops.ts — 牌组批量操作（M4-T4）

<$queue-ops/> 对每个 TidmeDeck 列出批量动作：
  顺延(7天) / 提前(今天) / 忽略(出队) / 搁置(暂停) / 恢复 / 遗忘(回新卡)
动作基于 core scheduler 纯函数，对 deck.card 过滤出的卡片批量写字段。
事件总线：操作后发 tm-tidme-queue-changed；监听队列变化重建列表（计数保持最新）。
*/

declare function require(module: string): any;
const sched = require("$:/plugins/keepone/tidme/core/scheduler.js");
const events = require("$:/plugins/keepone/tidme/core/events.js");
const uiUtils = require("$:/plugins/keepone/tidme/core/ui-utils.js");
const deckMod = require("$:/plugins/keepone/tidme/core/deck.js");
const Widget = require("$:/core/modules/widgets/widget.js").widget;

// 共享 DOM 工具（实现收敛于 core/ui-utils）
const el = uiUtils.el;

function makeQueueOps(): WidgetCtor {
	class QueueOpsWidget extends Widget {
		render(parent: any, nextSibling: any) {
			this.parentDomNode = parent;
			this.computeAttributes();
			this.execute();
			const doc = this.document;
			const wiki = this.wiki;
			const wrap = el(doc, "div", "tm-queue-ops");

			// P3 toast 反馈
			const toast = (msg: string, kind = "") => {
				const t = el(doc, "div", "tm-toast" + (kind ? " tm-toast--" + kind : ""), msg);
				wrap.insertBefore(t, wrap.firstChild);
				setTimeout(() => t.remove(), 2500);
			};

			wrap.appendChild(el(doc, "h3", "", "牌组批量操作（优先级调度）"));
			wrap.appendChild(el(doc, "div", "tm-import-muted",
				"顺延=due+7d（低优先级积压）· 提前=今天复习 · 忽略=移出队列 · 搁置=暂停（deck.card 已排除）· 遗忘=回新卡"));

			// G8 手动触发 auto-postpone（浏览器端启动时 + 每小时自动执行，此处为手动兜底 + 开关）
			const autoRow = el(doc, "div", "tm-import-actions", "");
			const autoStatus = el(doc, "span", "tm-import-muted", "");
			const readCfg = (): any => {
				try { return JSON.parse(wiki.getTiddlerText("$:/config/Tidme/AutoPostpone", "{}") || "{}"); } catch { return {}; }
			};
			// 每日自动顺延开关（写入 $:/config/Tidme/AutoPostpone.enable）
			const autoCheck = doc.createElement("input");
			autoCheck.type = "checkbox";
			autoCheck.checked = readCfg().enable === true;
			autoCheck.title = "开启后：启动时与每小时自动顺延低优先级逾期卡（浏览器与 TiddlyWeb 服务端通用），保护高优先级复习卡";
			autoCheck.addEventListener("change", () => {
				const cfg = readCfg();
				cfg.enable = autoCheck.checked;
				wiki.addTiddler({ title: "$:/config/Tidme/AutoPostpone", type: "application/json", text: JSON.stringify(cfg) });
				events.dispatch(this, events.EVENTS.QUEUE_CHANGED);
			});
			autoRow.appendChild(autoCheck);
			autoRow.appendChild(el(doc, "label", "tm-import-muted", "每日自动顺延（auto-postpone）"));
			const runAuto = el(doc, "button", "tm-btn tm-btn--primary", "⚡ 立即顺延（auto-postpone）");
			runAuto.title = "手动触发：低优先级逾期卡顺延 postponeDays 天，保留 top N 高优先级（配置见 $:/config/Tidme/AutoPostpone）";
			runAuto.addEventListener("click", () => {
				const cfg = readCfg();
				const cards = wiki.filterTiddlers("[all[shadows+tiddlers]!is[draft]!has[tidme.done]!has[tidme.ignored]!has[tidme.suspended]has[due]]")
					.map((t: string) => ({ title: t, fields: wiki.getTiddler(t)?.fields || {} }));
				const result = sched.autoPostpone(cards, cfg);
				for (const p of result.patches) {
					const existing = wiki.getTiddler(p.title);
					if (existing) wiki.addTiddler({ ...existing.fields, ...p.fields });
				}
				events.dispatch(this, events.EVENTS.QUEUE_CHANGED);
				autoStatus.textContent =
					`✓ 逾期 ${result.stats.overdue} · 顺延 ${result.stats.postponed} · 保留高优 ${result.stats.kept}`;
				renderList();
			});
			autoRow.appendChild(runAuto);
			autoRow.appendChild(autoStatus);
			wrap.appendChild(autoRow);

			const list = el(doc, "div", "tm-queue-ops-list");
			wrap.appendChild(list);

			const renderList = () => {
				list.textContent = "";
				const decks = deckMod.listDecks(wiki);
				if (!decks.length) {
					const empty = el(doc, "div", "tm-empty", "");
					empty.appendChild(el(doc, "div", "tm-empty-icon", "🃏"));
					empty.appendChild(el(doc, "div", "", "暂无牌组。"));
					list.appendChild(empty);
					return;
				}
				for (const deck of decks) {
					const cards = deckMod.deckCards(wiki, deck);
					// P2：每牌组一张卡片（名称 + 计数 + 动作组）
					const card = el(doc, "div", "tm-queue-card");
					const head = el(doc, "div", "tm-queue-card-head");
					const caption = uiUtils.captionText(wiki, wiki.getTiddler(deck)?.fields?.caption || deck.split("/").pop() || deck, this);
					head.appendChild(el(doc, "strong", "", caption));
					head.appendChild(el(doc, "span", "tm-queue-card-count", `${cards.length} 卡`));
					head.title = deck;
					card.appendChild(head);
					const btns = el(doc, "div", "tm-queue-card-btns");
					const apply = (op: (f: Record<string, any>) => Record<string, any>, label: string) => {
						const b = el(doc, "button", "tm-btn", label);
						b.addEventListener("click", () => {
							let n = 0;
							for (const title of cards) {
								const t = wiki.getTiddler(title);
								if (!t) continue;
								wiki.addTiddler({ ...t.fields, ...op(t.fields) });
								n++;
							}
							events.dispatch(this, events.EVENTS.QUEUE_CHANGED);
							renderList();
							toast(`${label}：已处理 ${n} 张`, "ok");
						});
						return b;
					};
					btns.appendChild(apply((f) => sched.postponeCard(f, 7), "顺延7d"));
					btns.appendChild(apply(() => sched.advanceCard(), "提前"));
					btns.appendChild(apply((f) => sched.ignoreCard(f), "忽略"));
					btns.appendChild(apply(() => sched.suspendCard(), "搁置"));
					btns.appendChild(apply(() => sched.resumeCard(), "恢复"));
					btns.appendChild(apply(() => sched.forgetCard(), "遗忘"));
					card.appendChild(btns);
					list.appendChild(card);
				}
			};
			renderList();

			// 事件总线：队列变化 → 重建列表（计数保持最新）
			this._rerender = renderList;
			if (!this._bound) {
				this._bound = true;
				events.bindComponentRefresh([events.EVENTS.QUEUE_CHANGED], () => this._rerender?.());
			}

			parent.insertBefore(wrap, nextSibling);
			this.domNodes.push(wrap);
		}
		refresh() { return false; }
	}
	return QueueOpsWidget as any;
}

type WidgetCtor = { new(parseTreeNode: any, options: any): any };

exports["queue-ops"] = makeQueueOps();
