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
const deckMod = require('$:/plugins/keepone/tidme/core/deck.js');
const icons = require('$:/plugins/keepone/tidme/ui/base/icons.js');
const sessionMod = require('$:/plugins/keepone/tidme/core/session.js');
const ns = require('$:/plugins/keepone/tidme/core/ns.js');
const config = require('$:/plugins/keepone/tidme/core/config.js');
const Widget = require('$:/core/modules/widgets/widget.js').widget;

const DEFAULT_DECK = deckMod.DEFAULT_DECK;

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

      const learnBtn = icons.iconButton(doc, 'tm-btn tm-btn--primary tm-workflow-btn-hero', 'study', '开始学习');
      learnBtn.title = '复习全部到期/新知识卡（挖空/问答）；阅读材料的混入与交错比在「设置」页配置';
      learnBtn.addEventListener('click', () => startGlobalLearning(wiki, this));
      root.appendChild(learnBtn);

      parent.insertBefore(root, nextSibling);
    }
  }
  return WorkflowWidget as any;
}

/**
 * 全局 SuperMemo 动态交错学习流启动器：
 * 1. 组合到期 Item 与 Priority 排序 Topic 生成动态交错队列
 * 2. 写入全局学习会话 $:/state/tidme/learning-session
 * 3. 导航到首张学习卡（或在无到期任务时发射庆祝粒子）
 */
function startGlobalLearning(wiki: any, widget: any): void {
  const deckEngine = require('$:/plugins/keepone/tidme/core/deck-engine.js');
  // 队列构成与交错比唯一收口 = core/config（设置页配置；topic 混入 + item:topic 交错比）
  const opts = config.readQueueOptions(wiki);
  const queue = deckEngine.composeGlobalLearningQueue((filter: string) => wiki.filterTiddlers(filter), {
    mode: opts.mode,
    topics: opts.topics,
    itemRatio: opts.itemRatio,
    topicRatio: opts.topicRatio,
  });

  if (!queue || queue.length === 0) {
    widget.dispatchEvent({ type: 'tm-confetti-launch' });
    widget.dispatchEvent({ type: 'tm-confetti-launch', originY: 0.6, spread: 70, delay: 300 });
    widget.dispatchEvent({ type: 'tm-confetti-launch', originY: 0.55, spread: 30, delay: 600 });
    widget.dispatchEvent({ type: 'tm-notify', param: ns.NOTIFY_CONGRATULATION });
    return;
  }

  const first = queue[0];
  sessionMod.setSession(wiki, {
    list: queue,
    currentIndex: '0',
    mode: opts.mode === 'strict' ? 'global-strict' : opts.topics ? 'global-interleaved' : 'items-only',
  });

  // <deck>/study 会话列表（fsrs4tw 契约后缀见 core/session）
  wiki.addTiddler({ title: DEFAULT_DECK + sessionMod.DECK_STUDY_SUFFIX, list: queue });
  // 首卡折叠态统一走 core/doc-ops.prepareCardFold（item → hide/show，按所属 deck card_unfold）
  docOps.prepareCardFold(wiki, first);

  widget.dispatchEvent({ type: 'tm-navigate', navigateTo: first });
}

/** 开始阅读目标（开始学习按钮外的"开始阅读"语义）：
 *  全局续读点（最近读过）→ 第一张待读 topic → 阅读列表页 */
function globalReadingTarget(wiki: any): string {
  // 阅读入口决策收敛 core/doc-ops（续读点出队顺延 + 真实队列口径），本文件只保留入口
  return docOps.globalReadingTarget(wiki);
}

exports['tidme-workflow'] = makeWorkflow();
exports.globalReadingTarget = globalReadingTarget;
exports.startGlobalLearning = startGlobalLearning;
