/**
 * import-tidme-deck.cjs
 * 通用 Tidme 牌组导入与迁移脚本
 * 将各类 Tidme 牌组插件包（JSON 格式）自动导入到目标 TiddlyWiki 工程，并将卡片迁移到 Tidme/Decks/<word>--qa 规范
 * 
 * 用法:
 *   node import-tidme-deck.cjs <plugin-file.json> <wiki-folder>
 * 
 * 示例:
 *   node import-tidme-deck.cjs "./plugins_tidme_decks-GRE_3.json" "./wiki"
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const TiddlyWiki = require("tiddlywiki");

/**
 * 若字段值是一个指向其它 tiddler 的 TiddlyWiki 转clusion，返回被引用标题；否则返回 null。
 * 支持 "{{||Title}}"（块级）与 "{{Title}}"（内联）两种形式。
 */
function transcludeTarget(value) {
    if (typeof value !== "string") return null;
    const s = value.trim();
    let m = s.match(/^\{\{\s*\|\|([^}]+?)\s*\}\}$/);
    if (m) return m[1].trim();
    m = s.match(/^\{\{\s*([^|{}][^}]*?)\s*\}\}$/);
    return m ? m[1].trim() : null;
}

async function importDeck(pluginFile, wikiFolder) {
    // 1. 读取并解析插件文件
    console.log("📖 读取插件文件:", pluginFile);
    const raw = fs.readFileSync(pluginFile, "utf8");
    let pluginData;
    try {
        pluginData = JSON.parse(raw);
    } catch (e) {
        console.error("❌ JSON 解析失败:", e.message);
        process.exit(1);
    }

    // 提取 plugin tiddler 和嵌入 tiddlers
    let pluginTiddler, allTiddlers = {};
    if (Array.isArray(pluginData)) {
        const plugin = pluginData.find(function (t) { return t.title && t.title.startsWith("$:/plugins/"); });
        if (!plugin) {
            // 如果没有明显的 $:/plugins/ 元素，可能整体就是一个包含多个 tiddlers 的数组
            for (const t of pluginData) {
                if (t.title) allTiddlers[t.title] = t;
            }
        } else {
            for (const t of pluginData) if (t !== plugin) allTiddlers[t.title] = t;
            pluginTiddler = plugin;
        }
    } else if (pluginData.title && pluginData.title.startsWith("$:/plugins/")) {
        pluginTiddler = pluginData;
    } else if (pluginData.title) {
        allTiddlers[pluginData.title] = pluginData;
    } else {
        console.error("❌ 无法识别的文件格式");
        process.exit(1);
    }

    // 解析 plugin.text 中的嵌入 tiddlers (escaped JSON)
    if (pluginTiddler && pluginTiddler.text) {
        try {
            const parsed = JSON.parse(pluginTiddler.text);
            if (parsed.tiddlers) {
                for (const k of Object.keys(parsed.tiddlers)) {
                    allTiddlers[k] = { ...parsed.tiddlers[k], title: k };
                }
                console.log(`📦 从 plugin.text 解析出 ${Object.keys(parsed.tiddlers).length} 个嵌入 tiddlers`);
            }
        } catch (e) {
            console.warn("⚠️ plugin.text 解析失败:", e.message);
        }
    }
    console.log(`📋 总计待导入 tiddlers: ${Object.keys(allTiddlers).length}`);

    // 2. 启动 TiddlyWiki 加载目标 wiki (filesystem syncer 自动持久化)
    const wikiDir = path.resolve(wikiFolder);
    if (!fs.existsSync(path.join(wikiDir, "tiddlywiki.info"))) {
        console.error("❌ 目标目录不是 TiddlyWiki (缺少 tiddlywiki.info):", wikiDir);
        process.exit(1);
    }

    // 先预载核心插件（如果本地存在）
    const pluginDir = path.resolve(__dirname, "bin");
    const corePlugins = ["$__plugins_keepone_tidme.json", "$__tidme_languages_zh-Hans.json"]
        .map(function (n) { return path.join(pluginDir, n); })
        .filter(function (f) { return fs.existsSync(f); })
        .map(function (f) { return JSON.parse(fs.readFileSync(f, "utf8")); });

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tidme-import-"));
    try {
        const tw = TiddlyWiki.TiddlyWiki();
        if (corePlugins.length) {
            tw.preloadTiddlerArray(corePlugins);
            console.log("📂 已预载核心插件");
        } else {
            console.warn("⚠️ 未找到核心插件, 如有需要请先运行 npm run build:plugins");
        }
        tw.boot.argv = [wikiDir];
        tw.boot.boot();
        const wiki = tw.wiki;

        // 3. 导入所有 tiddlers (deck 模板、样式、定义)
        let imported = 0;
        for (const title of Object.keys(allTiddlers)) {
            try {
                wiki.addTiddler({ ...allTiddlers[title], title });
                imported++;
            } catch (e) {
                console.warn(`⚠️ 导入失败 ${title}: ${e.message}`);
            }
        }
        console.log(`✅ 导入完成: ${imported} 个 tiddlers`);

        // 4. 动态识别 Deck 与前缀，进行卡片通用迁移
        console.log("\n🔄 动态识别牌组并迁移卡片到 Tidme/Decks/<word>--qa ...");

        const deckTiddlers = Object.keys(allTiddlers).filter(function (t) { return t.startsWith("$:/Deck/"); });
        let deckInfos = [];

        if (deckTiddlers.length > 0) {
            for (const dTitle of deckTiddlers) {
                const dName = dTitle.replace("$:/Deck/", "");
                const t = allTiddlers[dTitle];
                let prefix = `$:/${dName}/`;
                // 从 f.card 中尝试提取 prefix[...] 过滤器规则
                if (t && t.card) {
                    const match = t.card.match(/prefix\[([^\]]+)\]/);
                    if (match && match[1]) {
                        prefix = match[1];
                    }
                }
                deckInfos.push({ deckTitle: dTitle, deckName: dName, prefix: prefix });
            }
        } else {
            // 备用规则：从非系统前缀推断牌组前缀
            const prefixes = new Set();
            for (const t of Object.keys(allTiddlers)) {
                if (t.startsWith("$:/") && !t.startsWith("$:/plugins/") && !t.startsWith("$:/config/") && !t.startsWith("$:/tags/")) {
                    const parts = t.split("/");
                    if (parts.length >= 3) {
                        prefixes.add(`$:/${parts[1]}/`);
                    }
                }
            }
            for (const p of prefixes) {
                const dName = p.replace(/^\$:?\/?/, "").replace(/\/$/, "");
                deckInfos.push({ deckTitle: `$:/Deck/${dName}`, deckName: dName, prefix: p });
            }
        }

        console.log(`🔍 动态识别到 ${deckInfos.length} 个 Deck 牌组: ${deckInfos.map(function (d) { return d.deckName; }).join(", ")}`);

        // 计算 FSRS 初始字段
        const now = new Date();
        const p = function (n) { return String(n).padStart(2, "0"); };
        const twDate = `${now.getUTCFullYear()}${p(now.getUTCMonth() + 1)}${p(now.getUTCDate())}${p(now.getUTCHours())}${p(now.getUTCMinutes())}${p(now.getUTCSeconds())}000`;
        const fsrsFields = { due: twDate, state: "0", reps: "0", lapses: "0", stability: "0", difficulty: "0", elapsed_days: "0", scheduled_days: "0", last_review: twDate };

        let totalMigrated = 0;

        for (const info of deckInfos) {
            const deckTitle = info.deckTitle;
            const deckName = info.deckName;
            const prefix = info.prefix;

            const allCardTitles = wiki.filterTiddlers(`[prefix[${prefix}]]`);
            console.log(`🔍 牌组 [${deckName}] (前缀: ${prefix}) 过滤找到 ${allCardTitles.length} 个关联 tiddlers`);

            // 获取 Deck / 插件元数据（标题、作者）
            const deckTiddlerObj = wiki.getTiddler(deckTitle);
            const deckFieldsObj = deckTiddlerObj ? deckTiddlerObj.fields : {};
            const deckCaption = deckFieldsObj.caption || (pluginTiddler && pluginTiddler.description) || deckName;
            const deckAuthor = deckFieldsObj.author || (pluginTiddler && pluginTiddler.author) || "Tidme";

            let migrated = 0;
            let cardIndex = 1;

            for (const title of allCardTitles) {
                // 排除 Deck 定义、插件及文档系统页面
                if (title === deckTitle) continue;
                if (title.startsWith("$:/plugins/")) continue;
                if (title.endsWith("/readme") || title.endsWith("/template") || title.endsWith("/style.css")) continue;

                const t = wiki.getTiddler(title);
                if (!t) continue;
                const f = t.fields;
                const srcCard = allTiddlers[title] || {};

                // 检测源卡片是否复用牌组自身的 back 模板（text 指向 $:/plugins/... 的转clusion）
                const backRef = transcludeTarget(srcCard.text != null ? srcCard.text : f.text);

                // 提取 word_json 中的结构化数据（若存在）
                let wordData = null;
                if (f.word_json) {
                    try {
                        wordData = typeof f.word_json === "string" ? JSON.parse(f.word_json) : f.word_json;
                    } catch (e) {}
                }

                const headWord = (wordData && (wordData.headWord || wordData.word)) || f.word || f.headWord || title.split("/").pop();
                if (!headWord) continue;

                const wordId = (wordData && wordData.content && wordData.content.word && wordData.content.word.wordId) || f["tidme.id"] || f.wordId || headWord;

                // 新命名规范: Tidme/Decks/<headWord>--qa
                let newTitle = "Tidme/Decks/" + headWord + "--qa";
                let preserveFields = null;
                let i = 2;
                while (wiki.getTiddler(newTitle)) {
                    const exFields = wiki.getTiddler(newTitle).fields || {};
                    if (exFields["tidme.doc"] === deckName && exFields["tidme.kind"] === "item" && exFields["tidme.subkind"] === "qa") {
                        preserveFields = exFields; // 同牌组旧导入卡：保留其 FSRS 学习进度，仅刷新渲染字段
                        break;
                    }
                    newTitle = "Tidme/Decks/" + headWord + "--qa-" + i++;
                }

                // 提取正面 (caption) 和排版优雅的 Q&A 正文 (text)
                const phonetic = (wordData && wordData.content && wordData.content.word && wordData.content.word.content)
                    ? (wordData.content.word.content.usphone ? `/${wordData.content.word.content.usphone}/` : (wordData.content.word.content.ukphone ? `/${wordData.content.word.content.ukphone}/` : ""))
                    : "";

                let cardCaption = headWord;

                // 构造 Q & A 格式的标准正文，完全对齐 Tidme 参考卡片规范
                let qaText = "";
                if (wordData && wordData.content && wordData.content.word) {
                    const wc = wordData.content.word.content || {};
                    const transList = Array.isArray(wc.trans)
                        ? wc.trans.map(tr => `${tr.pos ? tr.pos + ". " : ""}${tr.tranCn || ""}`).join("；")
                        : "";

                    const lines = [];
                    lines.push(`Q: ${headWord}${phonetic ? " " + phonetic : ""}`);
                    lines.push("");
                    lines.push(`A: ''${headWord}'' ${phonetic}`);
                    if (transList) {
                        lines.push(`* **释义**：${transList}`);
                    }
                    if (wc.sentence && Array.isArray(wc.sentence.sentences) && wc.sentence.sentences.length > 0) {
                        const s = wc.sentence.sentences[0];
                        const cleanEng = (s.sContent || s.sContent_eng || "").replace(/<\/?b>/gi, "");
                        lines.push(`* **例句**：${cleanEng}${s.sCn ? "（" + s.sCn + "）" : ""}`);
                    }
                    if (wc.remMethod && wc.remMethod.val) {
                        lines.push(`* **助记**：${wc.remMethod.val}`);
                    }
                    if (wc.relWord && Array.isArray(wc.relWord.rels) && wc.relWord.rels.length > 0) {
                        const relsStr = wc.relWord.rels.map(r => `${r.pos ? r.pos + ". " : ""}${(r.words || []).map(w => w.hwd + " " + (w.tran || "")).join(", ")}`).join("；");
                        lines.push(`* **同根**：${relsStr}`);
                    }
                    qaText = lines.join("\n");
                } else if (f.text && f.text.startsWith("Q:")) {
                    qaText = f.text;
                } else {
                    qaText = `Q: ${headWord}\n\nA: ${f.text || headWord}`;
                }

                // 复用牌组自身的 back 模板（若源卡片 text 是指向模板的转clusion），否则回退到通用 Q&A 正文。
                // 注意：caption 始终保持纯词 headWord——若写入 "{{||.../front}}" 转clusion，
                //       标题模板（$:/core/ui/ViewTemplate/title/default 的 <$view field="caption"/>）会原样输出，导致卡片标题显示为裸转clusion文本。
                const backTemplateOk = backRef && allTiddlers[backRef];
                const migCaption = cardCaption;
                const migText = backTemplateOk ? (srcCard.text != null ? srcCard.text : f.text) : qaText;

                // 构造面包屑路径与锚点
                const breadcrumb = deckCaption + " › " + headWord;
                const anchorObj = JSON.stringify({ section: deckTitle, snippet: headWord });

                // 清理字段：去除 header 字段首尾空白与控制字符，防止 TiddlyWiki 因 unsafe fields 退化为 .json 文件落盘
                const cleanedFields = {};
                for (const [k, v] of Object.entries(f)) {
                    if (k === "text" || k === "caption" || k === "word_json") {
                        continue; // 由新构造逻辑精确覆盖
                    } else if (typeof v === "string") {
                        const trimmed = v.trim().replace(/[\x00-\x1F]/g, "");
                        if (trimmed) {
                            cleanedFields[k] = trimmed;
                        }
                    } else {
                        cleanedFields[k] = v;
                    }
                }

                // 保留 word / word_json，供牌组 front/back 模板用 {!!word}/{!!word_json} 渲染
                if (cleanedFields.word == null) cleanedFields.word = headWord;
                if (f.word_json != null) {
                    const wj = typeof f.word_json === "string" ? f.word_json : JSON.stringify(f.word_json);
                    cleanedFields.word_json = wj.replace(/[\r\n]+/g, "");
                }

                // 提取 tags 数组
                let cardTags = [];
                if (Array.isArray(f.tags)) {
                    cardTags = [...f.tags];
                } else if (f.tags) {
                    cardTags = String(f.tags).split(" ").filter(Boolean);
                }
                if (!cardTags.includes("tidme-deck-qa")) {
                    cardTags.push("tidme-deck-qa");
                }

                // 若为同牌组旧卡的覆盖更新：保留其已有的 FSRS 学习进度（due/state/reps/...），仅刷新渲染与元信息字段
                const preservedFsrs = {};
                if (preserveFields) {
                    for (const k of ["due", "state", "reps", "lapses", "stability", "difficulty", "elapsed_days", "scheduled_days", "last_review"]) {
                        if (preserveFields[k] != null) preservedFsrs[k] = preserveFields[k];
                    }
                }

                // 组装符合 src/tidme (schema.ts / split.ts) 实体契约的完整字段
                const newFields = {
                    ...cleanedFields,
                    title: newTitle,
                    type: "text/vnd.tiddlywiki",
                    caption: migCaption,
                    text: migText,
                    tags: cardTags,

                    // Tidme 核心规范字段 (FIELD in src/tidme/core/schema.ts)
                    "tidme.kind": "item",
                    "tidme.subkind": "qa",
                    "tidme.doc": deckName,
                    "tidme.docpage": deckTitle,
                    "tidme.id": wordId,
                    "tidme.parent": deckTitle,
                    "tidme.anchor": anchorObj,
                    "tidme.path": breadcrumb,
                    "tidme.breadcrumb": breadcrumb,
                    "tidme.order": String(cardIndex).padStart(6, "0"),
                    "tidme.source": deckCaption,
                    "tidme.author": deckAuthor,
                    "tidme.format": "deck",
                    "tidme.priority": "50",
                    "tidme.afactor": "2.5",

                    // FSRS 算法 9 大核心字段
                    ...fsrsFields,

                    // 覆盖同牌组旧卡时保留学习进度
                    ...preservedFsrs
                };

                wiki.addTiddler(newFields);
                wiki.deleteTiddler(title);
                migrated++;
                cardIndex++;
            }
            totalMigrated += migrated;
            console.log(`✅ 牌组 [${deckName}] 迁移完成: ${migrated} 张 qa 卡片 -> Tidme/Decks/<word>--qa`);

            // 5. 动态更新对应 deck 的 card 过滤器与标签
            const deck = wiki.getTiddler(deckTitle);
            if (deck) {
                const f = { ...deck.fields };
                f.card = `[all[shadows+tiddlers]prefix[Tidme/Decks/]tidme.doc[${deckName}]]`;
                let tagsArr = [];
                if (Array.isArray(f.tags)) {
                    tagsArr = [...f.tags];
                } else if (f.tags) {
                    tagsArr = String(f.tags).split(" ").filter(Boolean);
                }
                if (!tagsArr.includes("$:/tags/TidmeDeck")) {
                    tagsArr.push("$:/tags/TidmeDeck");
                }
                if (!tagsArr.includes("tidme-deck-qa")) {
                    tagsArr.push("tidme-deck-qa");
                }
                f.tags = tagsArr;
                f["tidme.doc"] = deckName;
                f["tidme.kind"] = "topic";
                wiki.addTiddler(f);
                console.log(`✅ 已更新牌组定义 [${deckTitle}] 的 card 过滤器及标签`);
            } else {
                console.warn(`⚠️ 未找到牌组定义 ${deckTitle}`);
            }
        }

        console.log(`\n🎉 全部卡片导入处理完毕! 共迁移 ${totalMigrated} 张卡片。`);
        
        // 6. 等待 filesystem syncer 将所有异步 save/delete 任务持久化落盘
        if (tw.syncer) {
            console.log("💾 正在等待 filesystem syncer 将卡片持久化保存到磁盘...");
            await new Promise(function (resolve) {
                const timer = setInterval(function () {
                    if (!tw.syncer.isDirty() && (!tw.syncer.numTasksInProgress || tw.syncer.numTasksInProgress === 0)) {
                        clearInterval(timer);
                        console.log("✅ 全部文件已成功落盘!");
                        resolve();
                    }
                }, 100);
            });
        }
    } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
    }
    process.exit(0);
}

// CLI 参数检查
const args = process.argv.slice(2);
const pluginFile = args[0];
const wikiFolder = args[1];

if (!pluginFile || !wikiFolder) {
    console.error("用法: node import-tidme-deck.cjs <plugin-file.json> <wiki-folder>");
    console.error("示例: node import-tidme-deck.cjs ./plugins_tidme_decks-GRE_3.json ./wiki");
    process.exit(1);
}

importDeck(pluginFile, wikiFolder).catch(function (e) {
    console.error("❌ 失败:", e);
    process.exit(1);
});

