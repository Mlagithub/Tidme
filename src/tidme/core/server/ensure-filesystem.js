/*\
module-type: startup
Tidme 文件系统目录存放自愈（仅 Node / filesystem 适配器）

目标：导入的阅读材料按目录落盘 —— Tidme/Books/<书>/<节>.tid（而非平铺 Tidme_Books_<书>_…）。
TiddlyWiki 的 filesystem 适配器仅在有普通 tiddler $:/config/FileSystemPaths 时按目录保存；
该配置必须是真实 tiddler（shadow 会被 tiddlerExists 排除，故插件不内置 shadow）。
本模块在"filesystem 插件已启用且配置缺失"时自动创建该真实 tiddler，保证目录存放不因配置丢失而回归。
若 wiki 自行维护了 FSP（更定制），已存在则不覆盖。
\*/

(function () {
	"use strict";

	/*jslint node: true, browser: true */
	/*global $tw: false */

	exports.name = "tidme-ensure-filesystem-paths";
	exports.platforms = ["node"];
	exports.after = ["load-modules"];

	/** FSP 默认内容：匹配到的 Tidme 命名空间 tiddler 原样输出 title 为 filepath（保留 / → 子目录） */
	function fileSystemPathsText() {
		return [
			"[is[tiddler]prefix[Tidme/Books/]]",
			"[is[tiddler]prefix[Tidme/Decks/]]",
			"[is[tiddler]prefix[Tidme/Clips/]]",
			"[is[tiddler]prefix[Tidme/]]"
		].join("\n");
	}

	/** 供 startup 与测试共用：filesystem 生效且配置缺失 → 创建真实 FSP tiddler */
	function ensureFileSystemPaths(wiki) {
		try {
			if (!wiki) return;
			if (wiki.getTiddler("$:/config/FileSystemPaths")) return; // wiki 已维护（或更定制），不覆盖
			if (!wiki.getTiddler("$:/plugins/tiddlywiki/filesystem")) return; // 非 filesystem 适配器
			wiki.addTiddler({
				title: "$:/config/FileSystemPaths",
				type: "text/vnd.tiddlywiki",
				text: fileSystemPathsText()
			});
		} catch (e) {
			console.error("[tidme] ensure FileSystemPaths failed:", e);
		}
	}

	exports.startup = function () {
		ensureFileSystemPaths($tw.wiki);
	};

	exports.ensureFileSystemPaths = ensureFileSystemPaths;
	exports.fileSystemPathsText = fileSystemPathsText;
})();
