/*\
title: $:/plugins/keepone/tidme/editor/operations/make-cloze-card
type: application/javascript
module-type: texteditoroperation

Tidme 真制卡（M3）：把编辑器选中文本直接制成挖空卡（kind=item/cloze，
进缺省牌组）。父卡 = 正在编辑的 tiddler（草稿态解析 draft.of）；
不改写编辑器文本。旧「挖空」按钮（插入 <<C>> 宏）保留用于既有卡片的宏排版。
\*/

(function () {
	/*jslint node: true, browser: true */
	/*global $tw: false */
	"use strict";

	exports["tidme-make-cloze"] = function (event, operation) {
		// simple 引擎 createTextOperation 返回 null（不支持文本操作）：静默跳过
		if (!operation) return;
		// 不改写 operation（replacement 保持 null = 引擎原生的"无变更"路径），只读 selection 制卡
		require("$:/plugins/keepone/tidme/editor/operations/make-card-common").makeCard(this, operation, "cloze");
	};
})();
