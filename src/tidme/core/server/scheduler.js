/*\
module-type: startup
Tidme 服务端调度器（仅 Node / TiddlyWeb）
每日（启动时 + 每小时检查）对低优先级逾期卡执行 auto-postpone。
配置 tiddler：$:/config/Tidme/AutoPostpone
  {"enable": true, "maxPriority": 60, "postponeDays": 7, "keepTop": 10}
\*/

(function () {
	"use strict";

	/*jslint node: true, browser: true */
	/*global $tw: false */

	exports.name = "tidme-server-scheduler";
	exports.platforms = ["node"];
	exports.after = ["load-modules"];

	function runAutoPostpone() {
		try {
			var raw = $tw.wiki.getTiddlerText("$:/config/Tidme/AutoPostpone", "{}");
			var cfg = {};
			try { cfg = JSON.parse(raw || "{}"); } catch (e) { /* 忽略非法配置 */ }
			if (!cfg.enable) return;

			var sched = require("$:/plugins/keepone/tidme/core/scheduler");
			var cards = $tw.wiki.filterTiddlers("[all[shadows+tiddlers]!is[draft]!has[tidme.done]!has[tidme.ignored]!has[tidme.suspended]has[due]]").map(function (title) {
				return { title: title, fields: $tw.wiki.getTiddler(title).fields };
			});
			var result = sched.autoPostpone(cards, cfg);
			for (var i = 0; i < result.patches.length; i++) {
				var p = result.patches[i];
				var existing = $tw.wiki.getTiddler(p.title);
				if (existing) {
					$tw.wiki.addTiddler($tw.utils.extend({}, existing.fields, p.fields));
				}
			}
			if (result.stats.postponed > 0) {
				$tw.wiki.addTiddler({
					title: "$:/temp/tidme/autopostpone/last",
					text: JSON.stringify({ at: new Date().toISOString(), overdue: result.stats.overdue, postponed: result.stats.postponed, kept: result.stats.kept })
				});
			}
		} catch (e) {
			console.error("[tidme] auto-postpone failed:", e);
		}
	}

	exports.startup = function () {
		// 启动时执行一次（对齐"每天开始"），此后每小时检查（配置开关控制实际行为）
		runAutoPostpone();
		var timer = setInterval(runAutoPostpone, 3600000);
		// unref：不阻止进程退出（测试/CLI 场景）；真实服务端由监听 socket 保活
		if (timer && typeof timer.unref === "function") timer.unref();
	};
})();
