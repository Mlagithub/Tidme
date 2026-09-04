/*\
schedulablenext — 从输入列表（学习会话 / 队列）取"当前卡之后"的第一张可调度卡。

推进语义统一收敛于 core/scheduler（nextSchedulable + isDueNow），取代
startstudy.tid 内联的"从头取第一张非出队卡"实现——后者会把当前卡之前
未处理的卡（如被 ▶ 跳过的摘录）反复拉回，造成交错学习 1:1 死循环。

用法: [<titles>schedulablenext<currentTiddler>]   → 下一张（或空）
- 输入: 候选卡标题列表（source 迭代）
- 参数: 当前卡标题（不在列表中则从头找）
- 输出: 0 或 1 张：cur 之后第一张未出队且 due≤now 的卡
\*/
(function () {
	/*jslint node: true, browser: true */
	/*global $tw: false */
	"use strict";

	var sched = require("$:/plugins/keepone/tidme/core/scheduler");

	exports.schedulablenext = function (source, operator, options) {
		var items = [];
		source(function (tiddler, title) {
			items.push(title);
		});
		var cur = operator.operand || null;
		var next = sched.nextSchedulable(items, cur, function (t) {
			var f = options.wiki.getTiddler(t);
			return f ? sched.isDueNow(f.fields) : false;
		});
		return next ? [next] : [];
	};
})();
