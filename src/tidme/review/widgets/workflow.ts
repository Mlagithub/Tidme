/*
widgets/workflow.ts — $:/Decks 工作流中心：开始学习按钮

- 开始学习：调起 startGlobalLearning 走 core/deck-engine.composeGlobalLearningQueue
  （默认纯知识卡复习流），写到 $:/state/tidme/learning-session 并跳到首张。
- 可选项「到期阅读材料也加入学习流」写 $:/config/Tidme/QueueMode
  （存在 = 混入 topic：strict=宏观三段式 / interleaved=4:1 交错）。
*/

declare function require(module: string): any;
const dom = require('$:/plugins/keepone/tidme/ui/base/dom.js');
const docOps = require('$:/plugins/keepone/tidme/core/doc-ops.js');
const icons = require('$:/plugins/keepone/tidme/ui/base/icons.js');
const sessionMod = require('$:/plugins/keepone/tidme/core/session.js');
const ns = require('$:/plugins/keepone/tidme/core/ns.js');
const lingoMod = require('$:/plugins/keepone/tidme/core/lingo.js');
const Widget = require('$:/core/modules/widgets/widget.js').widget;

// 共享 DOM 工具（实现收敛于 core/dom）
const el = dom.el;

function makeWorkflow(): any {
  class WorkflowWidget extends Widget {
    render(parent: any, nextSibling: any) {
      this.parentDomNode = parent;
      this.computeAttributes();
      this.execute();
      const doc = this.document;
      const wiki = this.wiki;
      const root = el(doc, 'div', 'tm-decks-actions');
      this.domNodes.push(root);

      const label = lingoMod.lingo(wiki, 'startstudy', 'Start Study');
      const learnBtn = icons.iconButton(doc, 'tm-btn tm-btn--primary tm-workflow-btn-hero', 'study', label);
      learnBtn.title = lingoMod.lingo(
        wiki,
        'workflow.hero.tip',
        'Review all due and new knowledge cards (cloze / Q&A)',
      );
      learnBtn.addEventListener('click', () => startGlobalLearning(wiki, this));
      root.appendChild(learnBtn);

      parent.insertBefore(root, nextSibling);
    }
  }
  return WorkflowWidget as any;
}

/**
 * 全局学习流启动（widget 侧）：队列组合、会话与 <deck>/study 镜像写入全部收口在
 * core/session.startGlobalLearningSession（会话唯一读写口）；本函数只保留表现层
 * ——无到期任务的三连庆祝与导航到首卡。
 */
function startGlobalLearning(wiki: any, widget: any): void {
  const first = sessionMod.startGlobalLearningSession(wiki);
  if (!first) {
    widget.dispatchEvent({ type: 'tm-confetti-launch' });
    widget.dispatchEvent({ type: 'tm-confetti-launch', originY: 0.6, spread: 70, delay: 300 });
    widget.dispatchEvent({ type: 'tm-confetti-launch', originY: 0.55, spread: 30, delay: 600 });
    widget.dispatchEvent({ type: 'tm-notify', param: ns.NOTIFY_CONGRATULATION });
    return;
  }
  widget.dispatchEvent({ type: 'tm-navigate', navigateTo: first });
}

/** 开始阅读目标（开始学习按钮外的"开始阅读"语义）：
 *  全局续读点（最近读过）→ 第一张待读 topic → 阅读列表页 */
function globalReadingTarget(wiki: any): string {
  // 阅读入口决策收敛 core/doc-ops（续读点出队顺延 + 真实队列口径），本文件只保留入口
  return docOps.globalReadingTarget(wiki);
}

exports['tidme-workflow'] = makeWorkflow();
exports['workflow-center'] = makeWorkflow();
exports.globalReadingTarget = globalReadingTarget;
exports.startGlobalLearning = startGlobalLearning;
