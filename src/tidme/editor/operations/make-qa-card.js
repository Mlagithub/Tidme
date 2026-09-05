/*\
title: $:/plugins/keepone/tidme/editor/operations/make-qa-card
type: application/javascript
module-type: texteditoroperation

Tidme 真制卡（M3）：把编辑器选中文本作为答案，弹窗补问题后制成问答卡
（kind=item/qa，进缺省牌组）。父卡 = 正在编辑的 tiddler（草稿态解析 draft.of）；
不改写编辑器文本。
\*/

(function () {
	/*jslint node: true, browser: true */
	/*global $tw: false */
	"use strict";

	exports["tidme-make-qa"] = function (event, operation) {
		// simple 引擎 createTextOperation 返回 null（不支持文本操作）：静默跳过
		if (!operation) return;
		// 不改写 operation（replacement 保持 null = 引擎原生的"无变更"路径），只读 selection 制卡
		require("$:/plugins/keepone/tidme/editor/operations/make-card-common").makeCard(this, operation, "qa");
	};
})();
