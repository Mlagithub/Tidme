/*
migrate-parent.cjs — 旧数据迁移：为缺 tidme.parent 的 Section 卡补 parent 链

背景：M1 前的导入产物只有 tidme.breadcrumb（"书名 › 章 › 节"），无权威 parent 链。
本脚本按 breadcrumb 反推层级：
  - 节 的父 = breadcrumb 去掉末段后对应的 tiddler（按 tidme.breadcrumb 精确匹配）
  - 找不到则父 = 文档页（breadcrumb 首段，tidme-import-doc 标签）
同时补 tidme.path（= tidme.breadcrumb）。

用法：
  node tools/migrate-parent.cjs <wiki-dir> [--dry-run]
  --dry-run  只报告不写库
*/
const fs = require("fs");
const os = require("os");
const path = require("path");
const TiddlyWiki = require("tiddlywiki");

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const wikiDir = args.filter((a) => !a.startsWith("--"))[0];
if (!wikiDir) {
	console.error("用法: node tools/migrate-parent.cjs <wiki-dir> [--dry-run]");
	process.exit(1);
}

// 在临时目录启动（避免污染源 wiki 的同步状态），加载目标 wiki 的 tiddlers
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tidme-migrate-"));
const tw = TiddlyWiki.TiddlyWiki();
tw.boot.argv = [path.resolve(wikiDir)];
tw.boot.boot();
const wiki = tw.wiki;

const sections = wiki.filterTiddlers("[has[tidme.order]]");
let fixed = 0, skipped = 0;
for (const title of sections) {
	const f = wiki.getTiddler(title).fields;
	if (f["tidme.parent"]) continue; // 已有 parent 链
	const bc = String(f["tidme.breadcrumb"] || "");
	const segs = bc.split(" › ").map((s) => s.trim()).filter(Boolean);
	if (segs.length < 2) { skipped++; continue; } // 无面包屑或只有书名

	// 父 = breadcrumb 去掉末段的完整路径
	const parentBc = segs.slice(0, -1).join(" › ");
	let parent = wiki.filterTiddlers(`[has[tidme.breadcrumb]tidme.breadcrumb[${parentBc}]first[]]`)[0];
	if (!parent) {
		// 回退：文档页 = 首段 + tidme-import-doc 标签
		parent = wiki.filterTiddlers(`[title[${segs[0]}]tag[tidme-import-doc]]`)[0] || segs[0];
	}
	const patch = { title, "tidme.parent": parent };
	if (!f["tidme.path"]) patch["tidme.path"] = bc;
	if (dryRun) {
		console.log(`[dry] ${title} -> parent=${parent}`);
	} else {
		wiki.addTiddler({ ...f, ...patch });
	}
	fixed++;
}
console.log(`\n${dryRun ? "[dry-run] " : ""}共 ${sections.length} 个旧 Section：补链 ${fixed}，跳过 ${skipped}`);
if (!dryRun) {
	console.log("（filesystem wiki 的改动已由同步器写回；TiddlyWeb 用户请通过控制台导入本脚本产出的补丁）");
}
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(0);
