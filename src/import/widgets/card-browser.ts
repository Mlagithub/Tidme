/*
widgets/card-browser.ts — 侧边栏卡片浏览/管理器（树形）

<$card-browser/> 以树形展示：
  Deck（牌组）→ 文档（按 tidme.doc 分组）→ 卡片（按 tidme.breadcrumb 序 + 缩进）
每张卡：状态标记（新/学习中/到期/搁置/已读）+ 打开 + 删除。
折叠层级用 <details>（Deck、文档可展开/收起）。
事件总线：监听队列/导入变化 → 重建树（评分、阅读操作、批量操作后即时更新）。
*/

declare function require(module: string): any;
const events = require("$:/plugins/tidme/core/events.js");
const Widget = require("$:/core/modules/widgets/widget.js").widget;

function el(doc: Document, tag: string, cls?: string, text?: string): HTMLElement {
	const e = doc.createElement(tag);
	if (cls) e.className = cls;
	if (text !== undefined) e.textContent = text;
	return e;
}

/** 卡片状态标记 */
function badge(fields: Record<string, any>): string {
	const tags = Array.isArray(fields.tags) ? fields.tags : [];
	if (fields["tidme.suspended"] === "yes") return "⏸";
	if (!tags.includes("?")) return "✓";
	const state = String(fields.state || "0");
	if (state === "1" || state === "3") return "学";
	if (state === "2") return "到";
	return "新";
}

function kindName(fields: Record<string, any>): string {
	const kind = String(fields["tidme.kind"] || "");
	if (kind === "extract") return "摘";
	if (kind === "cloze") return "挖";
	if (kind === "qa") return "问";
	return "";
}

function makeCardBrowser(): WidgetCtor {
	class CardBrowserWidget extends Widget {
		render(parent: any, nextSibling: any) {
			this.parentDomNode = parent;
			this.computeAttributes();
			this.execute();
			const doc = this.document;
			const wiki = this.wiki;
			const wrap = el(doc, "div", "tm-card-browser");

			const renderTree = () => {
				wrap.textContent = "";
				wrap.appendChild(el(doc, "div", "tm-import-muted",
					"状态：新 学=学习中 到=到期 ✓=已读 ⏸=搁置 · 摘/挖=摘录/挖空卡"));
				const decks = wiki.filterTiddlers("[tag[$:/tags/TidmeDeck]!is[draft]]");
				if (!decks.length) {
					wrap.appendChild(el(doc, "div", "tm-import-muted", "暂无牌组——导入/切分后自动创建。"));
					return;
				}
				for (const deck of decks) {
					const d = wiki.getTiddler(deck)?.fields || {};
					const cardTitles = wiki.filterTiddlers(`[subfilter{${deck}!!card}!subfilter{${deck}!!card_exclude}]`);
					const cards = cardTitles
						.map((title: string) => ({ title, fields: wiki.getTiddler(title)?.fields || {} }))
						.filter((c: any) => c.fields["tidme.doc"] || c.fields["tidme.kind"]);

					const deckDetails = el(doc, "details", "tm-cb-deck");
					deckDetails.open = true;
					const deckSummary = el(doc, "summary", "", "");
					const caption = String(d.caption || deck.split("/").pop() || deck);
					deckSummary.appendChild(el(doc, "strong", "", `${caption}（${cards.length}）`));
					deckDetails.appendChild(deckSummary);

					// 按文档分组（tidme.doc）
					const docGroups = new Map<string, any[]>();
					for (const c of cards) {
						const key = String(c.fields["tidme.doc"] || c.fields["tidme.parent"] || "__none__");
						if (!docGroups.has(key)) docGroups.set(key, []);
						docGroups.get(key)!.push(c);
					}
					const docOrder = [...docGroups.entries()].sort((a, b) => {
						const ta = a[1][0]?.fields["tidme.breadcrumb"] || "";
						const tb = b[1][0]?.fields["tidme.breadcrumb"] || "";
						return ta < tb ? -1 : ta > tb ? 1 : 0;
					});

					for (const [docKey, docCards] of docOrder) {
						const first = docCards[0]?.fields;
						const bc = String(first?.["tidme.breadcrumb"] || "");
						const docTitle = bc.split(" › ")[0] || docKey;
						const docDetails = el(doc, "details", "tm-cb-doc");
						docDetails.open = true;
						const docSummary = el(doc, "summary", "", "");
						docSummary.appendChild(el(doc, "span", "tm-cb-doc-title", `${docTitle}（${docCards.length}）`));
						docDetails.appendChild(docSummary);

						const sorted = [...docCards].sort((a: any, b: any) => {
							const pa = String(a.fields["tidme.breadcrumb"] || "");
							const pb = String(b.fields["tidme.breadcrumb"] || "");
							return pa < pb ? -1 : pa > pb ? 1 : 0;
						});
						for (const c of sorted) {
							const row = el(doc, "div", "tm-cb-card");
							const depth = Math.max(0, String(c.fields["tidme.breadcrumb"] || "").split(" › ").length - 1);
							row.style.paddingLeft = `${depth * 0.9}em`;
							row.appendChild(el(doc, "span", "tm-cb-badge", badge(c.fields)));
							const kn = kindName(c.fields);
							if (kn) row.appendChild(el(doc, "span", "tm-cb-kind", kn));
							const title = el(doc, "a", "tc-tiddlylink tm-cb-link", String(c.fields["tidme.breadcrumb"] || c.title).split(" › ").pop() || c.title);
							title.href = "#";
							title.title = c.title;
							title.addEventListener("click", (e: Event) => {
								e.preventDefault();
								this.dispatchEvent({ type: "tm-navigate", navigateTo: c.title });
							});
							row.appendChild(title);
							const del = el(doc, "button", "tm-cb-del", "✕");
							del.title = "删除卡片";
							del.addEventListener("click", () => {
								wiki.deleteTiddler(c.title);
								events.dispatch(this, events.EVENTS.QUEUE_CHANGED);
								renderTree();
							});
							row.appendChild(del);
							docDetails.appendChild(row);
						}
						deckDetails.appendChild(docDetails);
					}
					wrap.appendChild(deckDetails);
				}
			};

			renderTree();

			// 事件总线：队列/导入变化 → 重建树
			this._rerender = renderTree;
			if (!this._bound) {
				this._bound = true;
				events.bindComponentRefresh(
					[events.EVENTS.QUEUE_CHANGED, events.EVENTS.IMPORT_DONE, events.EVENTS.CARD_CREATED],
					() => this._rerender?.()
				);
			}

			parent.insertBefore(wrap, nextSibling);
			this.domNodes.push(wrap);
		}
		refresh() { return false; }
	}
	return CardBrowserWidget as any;
}

type WidgetCtor = { new(parseTreeNode: any, options: any): any };

exports["card-browser"] = makeCardBrowser();
