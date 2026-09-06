/*\
module-type: startup
Tidme 自动顺延调度器（浏览器 / Node / TiddlyWeb 通用）
启动时执行一次 + 每小时检查，对低优先级逾期卡执行 auto-postpone（防队列爆炸）。
配置 tiddler：$:/config/Tidme/AutoPostpone
  {"enable": true, "maxPriority": 60, "postponeDays": 7, "keepTop": 10}
默认 enable=false（不自动改数据）；用户在「设置」页开启。
\*/

(function() {
  'use strict';

  /*jslint node: true, browser: true */
  /*global $tw: false */

  exports.name = 'tidme-auto-postpone';
  exports.platforms = ['browser', 'node'];
  exports.after = ['load-modules'];

  function runAutoPostpone() {
    try {
      var sched = require('$:/plugins/keepone/tidme/core/scheduler.js');
      var config = require('$:/plugins/keepone/tidme/core/config.js');
      var cfg = config.readAutoPostpone($tw.wiki);
      if (!cfg.enable) return;

      var cards = $tw.wiki.filterTiddlers('[all[shadows+tiddlers]!is[draft]!has[tidme.done]!has[tidme.ignored]!has[tidme.suspended]has[due]]').map(function(title) {
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
          title: '$:/temp/tidme/autopostpone/last',
          text: JSON.stringify({ at: new Date().toISOString(), overdue: result.stats.overdue, postponed: result.stats.postponed, kept: result.stats.kept }),
        });
      }
    } catch (e) {
      console.error('[tidme] auto-postpone failed:', e);
    }
  }

  /** 日志布局 v2 迁移与修剪：旧版按天日志合并进单一 <deck>/log 并删除旧 tiddler；
   *  按「设置 → 复习日志保留天数」修剪超期条目（0 = 永久保留）。启动 + 每小时执行。 */
  function migrateAndPruneLogs() {
    try {
      var config = require('$:/plugins/keepone/tidme/core/config.js');
      var nsMod = require('$:/plugins/keepone/tidme/core/ns.js');
      var retentionDays = config.readLogRetentionDays($tw.wiki);
      var cutoffDay = retentionDays > 0 ? nsMod.todayKey(new Date(Date.now() - retentionDays * 86400000)) : null;
      var titles = $tw.wiki.filterTiddlers('[all[shadows+tiddlers]prefix[$:/Deck/]]');
      var legacy = titles.filter(function(t) {
        return /\/log\/\d{8}$/.test(t);
      });
      for (var i = 0; i < legacy.length; i++) {
        var lt = legacy[i];
        var day = lt.slice(-8);
        var logTitle = lt.slice(0, -9); // 去掉 "/<YYYYMMDD>"
        var dayData = $tw.wiki.getTiddlerData(lt) || {};
        var merged = $tw.wiki.getTiddlerData(logTitle) || {};
        for (var k in dayData) {
          if ($tw.utils.hop(dayData, k)) merged[day + k] = dayData[k];
        }
        $tw.wiki.setTiddlerData(logTitle, merged);
        $tw.wiki.deleteTiddler(lt);
      }
      if (cutoffDay === null) return;
      var logs = $tw.wiki.filterTiddlers('[all[shadows+tiddlers]prefix[$:/Deck/]]').filter(function(t) {
        return /\/log$/.test(t);
      });
      for (var j = 0; j < logs.length; j++) {
        var logT = logs[j];
        var data2 = $tw.wiki.getTiddlerData(logT) || {};
        var kept = {};
        var removed = 0;
        for (var key in data2) {
          if ($tw.utils.hop(data2, key)) {
            if (String(key).slice(0, 8) < cutoffDay) {
              removed++;
              continue;
            }
            kept[key] = data2[key];
          }
        }
        if (removed > 0) {
          if (Object.keys(kept).length) $tw.wiki.setTiddlerData(logT, kept);
          else $tw.wiki.deleteTiddler(logT);
        }
      }
    } catch (e) {
      console.error('[tidme] log migrate/prune failed:', e);
    }
  }

  exports.startup = function() {
    // 启动时执行一次（对齐"每天开始"），此后每小时检查（配置开关控制实际行为）
    migrateAndPruneLogs();
    runAutoPostpone();
    var timer = setInterval(function() {
      runAutoPostpone();
      migrateAndPruneLogs();
    }, 3600000);
    // unref：不阻止进程退出（测试/CLI 场景）；真实服务端由监听 socket 保活
    if (timer && typeof timer.unref === 'function') timer.unref();
  };

  exports.migrateAndPruneLogs = migrateAndPruneLogs; // 供测试/复用
})();
