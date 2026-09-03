/**
 * deck-to-tid.cjs — 插件式牌组（TiddlyMemo/旧 Tidme fsrs4tw 时代）→ 当前 Tidme 卡 .tid 转换器
 *
 * 输入：从 https://oflg.github.io/Tidme/manual/zh-Hans 下载的牌组插件包
 *      （$__plugins_tidme_decks-<NAME>_<N>.json，单插件 tiddler 文件：
 *       顶层 = [ {title:"$:/plugins/tidme/decks-<NAME>_<N>", text: JSON.stringify({tiddlers:{...}})} ]）
 * 输出：当前 src/tidme（schema.ts / card-manager / 默认牌组）能识别的 tiddler 文件：
 *      - 卡片：Tidme/Decks/<deck>/<word>--qa.tid（tidme.kind=item / subkind=qa / FSRS 九件套 / tidme.*）
 *        kind=item → $:/Deck/default 的 card 过滤器（tidme.kind[item]）直接收录 → 默认复习流识别
 *      - 牌组定义：$__Deck_<name>.tid（tag $:/tags/TidmeDeck，card= 字段过滤器）→ 牌组库/按牌组复习
 *
 * 用法：
 *   node tools/deck-to-tid.cjs <plugin-file.json> [--out <dir>] [--dry-run]
 *     --out     输出根目录（默认 <repo>/wiki/tiddlers —— dev wiki 直接识别）
 *     --dry-run 只打印转换计划与样例，不写盘
 *   node tools/deck-to-tid.cjs "$__plugins_tidme_decks-IELTS_3.json" --dry-run
 */

const fs = require("fs");
const path = require("path");

// ---------- 小工具 ----------
const RE_TITLE_UNSAFE = /[《》「」『』（）()【\[\]】/\\:*?"<>|\s]+/g;

/** 路径安全 slug（保留中英文字母数字与 -_，折叠空白与非法字符） */
function slugify(name) {
	const s = String(name || "")
		.normalize("NFKC")
		.replace(RE_TITLE_UNSAFE, "-")
		.replace(/[\-_.]+/g, "-")
		.replace(/^[\-_.]+|[\-_.]+$/g, "")
		.slice(0, 80);
	return s || "word";
}

/** TW UTC 日期串（YYYY0MM0DD0hh0mm0ss0XXX，与 schema.twDateString 同形） */
function twDateString(d) {
	const p = (n, l = 2) => String(n).padStart(l, "0");
	return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}${p(d.getUTCMilliseconds(), 3)}`;
}

/** 字段值清洗：去控制字符与首尾空白（防 TW .tid 解析退化 .json 落盘） */
function cleanField(v) {
	return String(v ?? "")
		.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "")
		.replace(/[ \t]+/g, " ")
		.trim();
}

function stripHtmlTags(s) {
	return String(s || "").replace(/<[^>]+>/g, "");
}

// ---------- 解析插件包 ----------
/** 解析顶层（数组或单 tiddler）→ { plugin, tiddlers } */
function parsePluginFile(file) {
	let data;
	try {
		data = JSON.parse(fs.readFileSync(file, "utf8"));
	} catch (e) {
		throw new Error(`JSON 解析失败: ${e.message}`);
	}
	const arr = Array.isArray(data) ? data : [data];
	const plugin = arr.find((t) => t && typeof t.title === "string" && t.title.startsWith("$:/plugins/") && typeof t.text === "string");
	if (!plugin) {
		// 宽松：任意带 text=JSON{tiddlers} 的 tiddler
		const withInner = arr.find((t) => {
			if (!t || typeof t.text !== "string") return false;
			try { return !!(JSON.parse(t.text).tiddlers); } catch { return false; }
		});
		if (!withInner) throw new Error("未找到插件 tiddler（需 title=$:/plugins/… 且 text 为 JSON{tiddlers}）");
		return { plugin: withInner, tiddlers: JSON.parse(withInner.text).tiddlers };
	}
	let inner;
	try {
		inner = JSON.parse(plugin.text);
	} catch (e) {
		throw new Error(`插件 text 不是合法 JSON: ${e.message}`);
	}
	if (!inner || typeof inner !== "object" || !inner.tiddlers) {
		throw new Error("插件 text 缺少 {tiddlers: {...}}");
	}
	return { plugin, tiddlers: inner.tiddlers };
}

// ---------- 词卡 → 当前 Tidme item 卡 ----------
const FSRS_ZERO = { reps: "0", lapses: "0", stability: "0", difficulty: "0", elapsed_days: "0", scheduled_days: "0" };

/** 有道 word_json → 展示字段 { headWord, wordId, phonetic, trans, sentences, phrases, rem, rels, synos } */
function extractWord(wj) {
	const w = wj && typeof wj === "object" ? wj : (() => { try { return JSON.parse(wj); } catch { return null; } })();
	if (!w) return null;
	const word = w.content && w.content.word;
	const content = (word && word.content) || {};
	const trans = Array.isArray(content.trans)
		? content.trans
			.map((t) => {
				const cn = stripHtmlTags(t.tranCn).replace(/\s+/g, " ").trim();
				return cn ? `${t.pos ? t.pos + ". " : ""}${cn}` : "";
			})
			.filter(Boolean)
		: [];
	const sentences = (content.sentence && Array.isArray(content.sentence.sentences) ? content.sentence.sentences : [])
		.map((s) => {
			const en = stripHtmlTags(s.sContent || s.sContent_eng || "").replace(/\s+/g, " ").trim();
			const cn = stripHtmlTags(s.sCn || "").replace(/\s+/g, " ").trim();
			return en ? (cn ? `${en}（${cn}）` : en) : "";
		})
		.filter(Boolean);
	const phrases = (content.phrase && Array.isArray(content.phrase.phrases) ? content.phrase.phrases : [])
		.slice(0, 3)
		.map((p) => {
			const pc = stripHtmlTags(p.pContent || "").replace(/\s+/g, " ").trim();
			const cn = stripHtmlTags(p.pCn || "").replace(/\s+/g, " ").trim();
			return pc ? (cn ? `${pc}（${cn}）` : pc) : "";
		})
		.filter(Boolean);
	const rels = (content.relWord && Array.isArray(content.relWord.rels) ? content.relWord.rels : [])
		.map((r) => (r.words || []).map((x) => {
			const h = stripHtmlTags(x.hwd || "").trim();
			const tr = stripHtmlTags(x.tran || "").replace(/\s+/g, " ").trim();
			return h ? (tr ? `${h} ${tr}` : h) : "";
		}).filter(Boolean))
		.flat();
	const synos = (content.syno && Array.isArray(content.syno.synos) ? content.syno.synos : [])
		.map((r) => (r.hwds || []).map((x) => stripHtmlTags(x.w || "").trim()).filter(Boolean).join(" / "))
		.filter(Boolean);
	const phonetic = content.usphone || content.ukphone || "";
	return {
		headWord: stripHtmlTags(w.headWord || w.wordHead || "").replace(/\s+/g, " ").trim(),
		wordId: cleanField(word.wordId || w.headWord),
		wordRank: Number(w.wordRank) || 0,
		phonetic: phonetic ? `/${phonetic}/` : "",
		trans: trans.slice(0, 6),
		sentences: sentences.slice(0, 2),
		phrases,
		rels: rels.slice(0, 8),
		synos: synos.slice(0, 8),
		rem: content.remMethod && content.remMethod.val ? cleanField(stripHtmlTags(content.remMethod.val)) : ""
	};
}

/** 组装 Q&A wikitext 正文（对齐 buildQA 的 caption/text 语义：caption=正面，text=背面详解） */
function buildQaText(w) {
	const lines = [`Q: ${w.headWord}${w.phonetic ? " " + w.phonetic : ""}`, "", `A: ''${w.headWord}''${w.phonetic ? " " + w.phonetic : ""}`];
	if (w.trans.length) lines.push("", "* **释义**：" + w.trans.join("；"));
	if (w.sentences.length) lines.push("", "* **例句**：" + w.sentences[0]);
	if (w.phrases.length) lines.push("", "* **短语**：" + w.phrases.join("；"));
	if (w.rem) lines.push("", "* **助记**：" + w.rem);
	if (w.rels.length) lines.push("", "* **同根**：" + w.rels.join("；"));
	if (w.synos.length) lines.push("", "* **同近**：" + w.synos.join("；"));
	return lines.join("\n");
}

/** 序列化 .tid：字段头（固定顺序，title 放中间亦可）→ 空行 → 正文 */
function serializeTid(fields, text) {
	const lines = [];
	for (const k of Object.keys(fields)) {
		const v = cleanField(fields[k]);
		if (v !== "") lines.push(`${k}: ${v}`);
	}
	return lines.join("\n") + "\n\n" + String(text || "").replace(/\n$/, "") + "\n";
}

// ---------- 主流程 ----------
async function main() {
	const args = process.argv.slice(2);
	const files = args.filter((a) => !a.startsWith("--"));
	const optOut = args.indexOf("--out") >= 0 ? args[args.indexOf("--out") + 1] : null;
	const dryRun = args.includes("--dry-run");
	if (!files.length) {
		console.error("用法: node tools/deck-to-tid.cjs <plugin-file.json> [--out <dir>] [--dry-run]");
		process.exit(1);
	}
	const root = path.resolve(__dirname, "..");
	const outRoot = optOut ? path.resolve(optOut) : path.join(root, "wiki", "tiddlers");

	for (const file of files) {
		console.log(`\n📖 解析: ${path.basename(file)}`);
		const { plugin, tiddlers } = parsePluginFile(file);

		// 1) deck 定义：tag $:/tags/TidmeDeck 的 $:/Deck/<name>
		const deckTitles = Object.keys(tiddlers).filter((t) => {
			const tags = tiddlers[t].tags;
			const arr = Array.isArray(tags) ? tags : String(tags || "").split(/\s+/);
			return arr.includes("$:/tags/TidmeDeck") && t.startsWith("$:/Deck/");
		});
		if (!deckTitles.length) { console.warn("⚠️ 未找到 $:/Deck/* 定义（tag $:/tags/TidmeDeck），跳过本文件"); continue; }
		for (const deckTitle of deckTitles) {
			const deck = tiddlers[deckTitle];
			const deckName = deckTitle.replace("$:/Deck/", "");
			const deckSlug = slugify(deckName);
			// 插件 caption 清理：去掉 {{...}} 转义 / HTML，回退 deckName
			const rawCaption = cleanField(String(deck.caption || deck.description || plugin.description || deckName).replace(/\{\{.*?\}\}/g, "").replace(/\[img[^\]]*\]/gi, "").replace(/<[^>]+>/g, ""));
			const caption = rawCaption || deckName;
			// 卡前缀：deck.card 的 prefix[...]，回退 $:/<deckName>/
			const cardFilter = String(deck.card || "");
			const pm = cardFilter.match(/prefix\[([^\]]+)\]/);
			const prefix = pm && pm[1] ? pm[1] : `$:/${deckName}/`;
			const cardTitles = Object.keys(tiddlers).filter((t) => t.startsWith(prefix) && !t.startsWith("$:/plugins/"));
			console.log(`🃏 牌组 [${deckTitle}] caption=${caption} · 卡前缀 ${prefix} · 命中 ${cardTitles.length} 卡`);

			const now = new Date();
			const nowStr = twDateString(now);
			const planned = []; // { title, fields, text, fileRel }
			const usedTitles = new Set();

			for (const title of cardTitles) {
				const t = tiddlers[title];
				const w = extractWord(t.word_json != null ? t.word_json : t.fields && t.fields.word_json);
				if (!w || !w.headWord) continue;
				// title：Tidme/Decks/<deckSlug>/<wordSlug>--qa（同 deck 冲突 -N）
				let leaf = `${slugify(w.headWord)}--qa`;
				let full = `Tidme/Decks/${deckSlug}/${leaf}`;
				let n = 2;
				while (usedTitles.has(full)) full = `Tidme/Decks/${deckSlug}/${leaf.replace(/--qa(-\d+)?$/, "")}-${n++}--qa`;
				usedTitles.add(full);
				const qaText = buildQaText(w);
				const crumb = `${caption} › ${w.headWord}`;
				planned.push({
					title: full,
					fields: {
						caption: w.headWord,
						type: "text/vnd.tiddlywiki",
						due: nowStr,
						state: "0",
						last_review: nowStr,
						...FSRS_ZERO,
						"tidme.kind": "item",
						"tidme.subkind": "qa",
						"tidme.doc": deckName,
						"tidme.id": w.wordId,
						"tidme.breadcrumb": crumb,
						"tidme.path": crumb,
						"tidme.order": String(w.wordRank || 0).padStart(6, "0"),
						"tidme.source": caption,
						"tidme.author": cleanField(plugin.author || ""),
						"tidme.format": "deck",
						"tidme.priority": "50",
						"tidme.afactor": "2.0"
					},
					text: qaText,
					fileRel: `Tidme/Decks/${deckSlug}/${leaf}.tid`
				});
			}
			console.log(`   → 生成 ${planned.length} 张 item 卡（QA）`);

			// deck 定义字段（照抄 $:/Deck/default 模板，card 换成按 tidme.doc 过滤）
			const deckFields = {
				title: deckTitle,
				tags: "$:/tags/TidmeDeck",
				caption,
				description: cleanField(String(plugin.description || "").replace(/\n/g, " ")).slice(0, 400),
				card: `[all[shadows+tiddlers]tidme.doc[${deckName}]tidme.kind[item]!has[tidme.done]!has[tidme.ignored]!has[tidme.suspended]]`,
				card_exclude: "[field:tidme.done[yes]] [field:tidme.ignored[yes]]",
				card_unfold: "",
				order: "due-new",
				order_learn: "[sort[due]]",
				order_new: "[sortan[title]]",
				order_due: "[sort[due]]",
				exclude_action: "{{$:/plugins/keepone/tidme/review/buttons/action/exclude}}",
				unfold_action: "{{$:/plugins/keepone/tidme/review/buttons/action/unfold}}",
				leech_threshold: "8",
				leech_action: "{{$:/plugins/keepone/tidme/review/buttons/action/exclude}}",
				state_learn: "[state[1]] [state[3]] :filter[{!!due}compare:date:lt<now [UTC]YYYY0MM0DD0hh0mm0ssXXX>]",
				state_due: "[state[2]has[due]] -[!days:due[1]]",
				state_new: "[!has[state]] [state[0]]",
				p: '{"request_retention":0.9,"maximum_interval":36500,"w":[0.4,0.6,2.4,5.8,4.93,0.94,0.86,0.01,1.49,0.14,0.94,2.18,0.05,0.34,1.26,0.29,2.61]}'
			};
			const deckRel = `$__Deck_${deckName.replace(/\//g, "_")}.tid`;

			// ---------- 展示 or 写盘 ----------
			if (dryRun) {
				console.log(`   [dry-run] 写盘目标根: ${outRoot}`);
				console.log(`   [dry-run] 文件: ${outRoot}\\${deckRel}  （deck 定义）`);
				for (const p of planned.slice(0, 1)) {
					console.log(`   [dry-run] 文件: ${outRoot}\\${p.fileRel}`);
					console.log(serializeTid(p.fields, p.text).split("\n").map((l) => "       " + l).join("\n"));
				}
				if (planned.length > 1) console.log(`   [dry-run] … 及另外 ${planned.length - 1} 张卡`);
				continue;
			}

			// 写 deck 定义
			const deckAbs = path.join(outRoot, ...deckRel.split("/"));
			fs.mkdirSync(path.dirname(deckAbs), { recursive: true });
			fs.writeFileSync(deckAbs, serializeTid(deckFields, ""), "utf8");
			console.log(`   ✅ ${deckAbs}`);

			// 写卡
			let written = 0;
			for (const p of planned) {
				const abs = path.join(outRoot, ...p.fileRel.split("/"));
				fs.mkdirSync(path.dirname(abs), { recursive: true });
				fs.writeFileSync(abs, serializeTid(p.fields, p.text), "utf8");
				written++;
			}
			console.log(`   ✅ 已写 ${written} 张卡 → ${outRoot}\\Tidme\\Decks\\${deckSlug}\\`);
		}
	}
	console.log("\n完成。将 .tid 放入 filesystem wiki 的 tiddlers 目录（或重启 dev wiki）后，卡片由 $:/Deck/default 复习流收录；牌组由 $:/Decks 页列出。");
}

main().catch((e) => { console.error("❌", e); process.exit(1); });
