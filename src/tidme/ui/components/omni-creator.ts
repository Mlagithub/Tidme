/*
ui/components/omni-creator.ts — 全局独立制卡中心（Omni Card Creator）

- 全局快捷键唤起（Alt+N）：随时随地灵感录入，无需预先划词；
- 模板切换引擎：问答卡 (Q&A)、挖空卡 (Cloze)、概念卡 (Concept)；
- 牌组与分类归属：支持选择散卡桶或指定牌组；
- 连续添加模式（Keep Open）：支持 Anki 式快速连续录卡；
- 快捷键支持：Ctrl+Enter 保存、Esc 关闭；
- 既支持全屏模态浮窗（openOmniCardModal），也支持页面嵌入 Widget。
*/

declare var exports: any;
declare function require(module: string): any;
const dom = require('$:/plugins/keepone/tidme/ui/base/dom.js');
const cardFactory = require('$:/plugins/keepone/tidme/core/card-factory.js');
const deckMod = require('$:/plugins/keepone/tidme/core/deck.js');
const Widget = require('$:/core/modules/widgets/widget.js').widget;

const el = dom.el;

type OmniCardType = 'qa' | 'cloze' | 'concept';

interface OmniCreatorOptions {
  defaultType?: OmniCardType;
  defaultDeck?: string;
  defaultTitle?: string;
  defaultContent?: string;
  defaultQuestion?: string;
  defaultAnswer?: string;
  onSuccess?: (card: any) => void;
}

/** 收集当前 wiki 中的所有牌组名称 */
function listAvailableDecks(wiki: any): string[] {
  const decks = new Set<string>();
  decks.add('散卡');
  if (!wiki || typeof wiki.filterTiddlers !== 'function') return Array.from(decks);
  try {
    const list = deckMod.allDecks ? deckMod.allDecks(wiki) : [];
    for (const d of list) {
      const name = String(d?.name || d?.title || d || '').trim();
      if (name) decks.add(name);
    }
  } catch { /* 容错 */ }
  return Array.from(decks);
}

/** 打开全局独立制卡模态弹窗 */
function openOmniCardModal(doc: Document, wiki: any, opts: OmniCreatorOptions = {}) {
  const existing = doc.querySelector('.tm-omni-creator-overlay');
  if (existing) return; // 避免重复唤出

  const overlay = el(doc, 'div', 'tm-card-modal-overlay tm-omni-creator-overlay');
  const modal = el(doc, 'div', 'tm-card-modal tm-omni-creator-modal');

  let currentType: OmniCardType = opts.defaultType || 'qa';
  let keepOpen = false;

  // 1. 顶部标题栏
  const header = el(doc, 'div', 'tm-card-modal-title tm-omni-header');
  const titleSpan = el(doc, 'span', '', '✨ 新建卡片 (Add Card)');
  const shortcutBadge = el(doc, 'span', 'tm-card-modal-badge', 'Alt+N 快捷唤起');
  header.appendChild(titleSpan);
  header.appendChild(shortcutBadge);
  modal.appendChild(header);

  // 2. 控制行：模板切换与牌组选择
  const ctrlRow = el(doc, 'div', 'tm-omni-ctrl-row');

  // 模板切换按钮组
  const typeGroup = el(doc, 'div', 'tm-omni-type-group');
  const typeBtns: Record<OmniCardType, HTMLElement> = {
    qa: el(doc, 'button', 'tm-omni-type-btn', '❓ 问答卡'),
    cloze: el(doc, 'button', 'tm-omni-type-btn', '🧩 挖空卡'),
    concept: el(doc, 'button', 'tm-omni-type-btn', '💡 概念卡'),
  };

  const updateTypeBtns = () => {
    for (const [k, b] of Object.entries(typeBtns)) {
      b.classList.toggle('tm-omni-type-btn--active', k === currentType);
    }
  };

  for (const [k, b] of Object.entries(typeBtns)) {
    b.type = 'button';
    b.addEventListener('click', () => {
      currentType = k as OmniCardType;
      updateTypeBtns();
      renderFields();
    });
    typeGroup.appendChild(b);
  }
  ctrlRow.appendChild(typeGroup);

  // 牌组下拉选择器
  const deckWrap = el(doc, 'div', 'tm-omni-deck-wrap');
  const deckLabel = el(doc, 'label', '', '牌组:');
  const deckSelect = el(doc, 'select', 'tm-card-modal-input tm-omni-deck-select') as HTMLSelectElement;
  const availableDecks = listAvailableDecks(wiki);
  for (const d of availableDecks) {
    const opt = el(doc, 'option', '', d) as HTMLOptionElement;
    opt.value = d;
    if (d === (opts.defaultDeck || '散卡')) opt.selected = true;
    deckSelect.appendChild(opt);
  }
  deckWrap.appendChild(deckLabel);
  deckWrap.appendChild(deckSelect);
  ctrlRow.appendChild(deckWrap);
  modal.appendChild(ctrlRow);

  // 3. 标题输入框（可选）
  const fieldTitle = el(doc, 'div', 'tm-card-modal-field');
  const titleLabel = el(doc, 'label', '', '标题 (可选，留空自动生成):');
  const titleInput = el(doc, 'input', 'tm-card-modal-input') as HTMLInputElement;
  titleInput.placeholder = '例如：二叉树遍历 / 渐近复杂度分析';
  if (opts.defaultTitle) titleInput.value = opts.defaultTitle;
  fieldTitle.appendChild(titleLabel);
  fieldTitle.appendChild(titleInput);
  modal.appendChild(fieldTitle);

  // 4. 动态表单容器
  const fieldsContainer = el(doc, 'div', 'tm-omni-fields-container');
  modal.appendChild(fieldsContainer);

  let qInput: HTMLTextAreaElement | null = null;
  let aInput: HTMLTextAreaElement | null = null;
  let clozeInput: HTMLTextAreaElement | null = null;
  let conceptInput: HTMLTextAreaElement | null = null;

  const renderFields = () => {
    fieldsContainer.innerHTML = '';
    if (currentType === 'qa') {
      // 问答卡：Q + A
      const fQ = el(doc, 'div', 'tm-card-modal-field');
      fQ.appendChild(el(doc, 'label', '', '问题 (Question):'));
      qInput = el(doc, 'textarea', 'tm-card-modal-textarea') as HTMLTextAreaElement;
      qInput.placeholder = '输入问题内容（支持 Markdown / 粘贴图片）...';
      if (opts.defaultQuestion) qInput.value = opts.defaultQuestion;
      fQ.appendChild(qInput);

      const fA = el(doc, 'div', 'tm-card-modal-field');
      fA.appendChild(el(doc, 'label', '', '答案 (Answer):'));
      aInput = el(doc, 'textarea', 'tm-card-modal-textarea') as HTMLTextAreaElement;
      aInput.placeholder = '输入答案解析或关键结论...';
      if (opts.defaultAnswer) aInput.value = opts.defaultAnswer;
      fA.appendChild(aInput);

      fieldsContainer.appendChild(fQ);
      fieldsContainer.appendChild(fA);
      setTimeout(() => qInput?.focus(), 50);
    } else if (currentType === 'cloze') {
      // 挖空卡：Toolbar + Text
      const fC = el(doc, 'div', 'tm-card-modal-field');
      const clozeHead = el(doc, 'div', 'tm-omni-cloze-header');
      clozeHead.appendChild(el(doc, 'label', '', '挖空文本 (Cloze Text):'));
      const insertClozeBtn = el(doc, 'button', 'tm-omni-btn-sm', '+ 插入挖空 {{C}}');
      insertClozeBtn.type = 'button';
      insertClozeBtn.addEventListener('click', () => {
        if (!clozeInput) return;
        const start = clozeInput.selectionStart || 0;
        const end = clozeInput.selectionEnd || 0;
        const sel = clozeInput.value.slice(start, end) || '填空内容';
        const replacement = `<<C "${sel}" "c1" "">>`;
        clozeInput.setRangeText(replacement, start, end, 'select');
        clozeInput.focus();
      });
      clozeHead.appendChild(insertClozeBtn);
      fC.appendChild(clozeHead);

      clozeInput = el(doc, 'textarea', 'tm-card-modal-textarea tm-omni-cloze-textarea') as HTMLTextAreaElement;
      clozeInput.placeholder = '例如：计算机系统由 <<C "硬件">> 和 <<C "软件">> 组成...';
      if (opts.defaultContent) clozeInput.value = opts.defaultContent;
      fC.appendChild(clozeInput);
      fieldsContainer.appendChild(fC);
      setTimeout(() => clozeInput?.focus(), 50);
    } else {
      // 概念卡：Content (Topic)
      const fN = el(doc, 'div', 'tm-card-modal-field');
      fN.appendChild(el(doc, 'label', '', '知识/笔记正文 (Concept Content):'));
      conceptInput = el(doc, 'textarea', 'tm-card-modal-textarea tm-omni-concept-textarea') as HTMLTextAreaElement;
      conceptInput.placeholder = '输入概念定义、摘录笔记或思考内容（将作为阅读材料进入调度流）...';
      if (opts.defaultContent) conceptInput.value = opts.defaultContent;
      fN.appendChild(conceptInput);
      fieldsContainer.appendChild(fN);
      setTimeout(() => conceptInput?.focus(), 50);
    }
  };

  updateTypeBtns();
  renderFields();

  // 5. 底部栏：连续添加复选框与操作按钮
  const bottomRow = el(doc, 'div', 'tm-card-modal-actions tm-omni-bottom-row');

  const keepWrap = el(doc, 'label', 'tm-omni-keep-wrap');
  const keepCheckbox = doc.createElement('input');
  keepCheckbox.type = 'checkbox';
  keepCheckbox.className = 'tm-omni-keep-checkbox';
  keepCheckbox.addEventListener('change', () => {
    keepOpen = keepCheckbox.checked;
  });
  const keepLabel = el(doc, 'span', '', '连续制卡 (保存后保持打开)');
  keepWrap.appendChild(keepCheckbox);
  keepWrap.appendChild(keepLabel);
  bottomRow.appendChild(keepWrap);

  const btnGroup = el(doc, 'div', 'tm-omni-btn-group');
  const cancelBtn = el(doc, 'button', 'tm-card-modal-btn tm-card-modal-cancel', '关闭 (Esc)');
  const submitBtn = el(doc, 'button', 'tm-card-modal-btn tm-card-modal-submit', '保存卡片 (Ctrl+Enter)');
  btnGroup.appendChild(cancelBtn);
  btnGroup.appendChild(submitBtn);
  bottomRow.appendChild(btnGroup);
  modal.appendChild(bottomRow);

  const close = () => {
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
  };

  const submit = () => {
    const selectedDeck = deckSelect.value || '散卡';
    const userTitle = titleInput.value.trim();

    let draft: Record<string, any> | null = null;

    if (currentType === 'qa') {
      const q = String(qInput?.value || '').trim();
      const a = String(aInput?.value || '').trim();
      if (!q) {
        qInput?.focus();
        return;
      }
      draft = cardFactory.buildStandaloneCard(wiki, {
        type: 'qa',
        title: userTitle,
        deck: selectedDeck,
        question: q,
        answer: a,
      });
    } else if (currentType === 'cloze') {
      const c = String(clozeInput?.value || '').trim();
      if (!c) {
        clozeInput?.focus();
        return;
      }
      draft = cardFactory.buildStandaloneCard(wiki, {
        type: 'cloze',
        title: userTitle,
        deck: selectedDeck,
        clozeContent: c,
      });
    } else {
      const content = String(conceptInput?.value || '').trim();
      if (!content) {
        conceptInput?.focus();
        return;
      }
      draft = cardFactory.buildStandaloneCard(wiki, {
        type: 'concept',
        title: userTitle,
        deck: selectedDeck,
        conceptContent: content,
      });
    }

    if (draft) {
      cardFactory.commitCard(wiki, draft);
      dom.showToast(doc, doc.body, `已创建卡片: ${draft.caption || draft.title}`, 'ok', 2500);
      opts.onSuccess?.(draft);

      if (keepOpen) {
        // 连续录入：清空内容并重新聚焦
        titleInput.value = '';
        if (qInput) qInput.value = '';
        if (aInput) aInput.value = '';
        if (clozeInput) clozeInput.value = '';
        if (conceptInput) conceptInput.value = '';
        if (currentType === 'qa') qInput?.focus();
        else if (currentType === 'cloze') clozeInput?.focus();
        else conceptInput?.focus();
      } else {
        close();
      }
    }
  };

  cancelBtn.addEventListener('click', close);
  submitBtn.addEventListener('click', submit);

  // 快捷键支持
  modal.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
  });

  overlay.appendChild(modal);
  doc.body.appendChild(overlay);
}

/** 注册全局制卡快捷键（Alt+N），模块加载或启动时仅绑定一次 */
let _shortcutRegistered = false;
function initGlobalCardShortcut(wiki: any, win: any = globalThis) {
  if (_shortcutRegistered) return;
  const doc = win.document;
  if (!doc || typeof doc.addEventListener !== 'function') return;
  _shortcutRegistered = true;

  doc.addEventListener('keydown', (e: KeyboardEvent) => {
    // Alt+N：全局独立新建卡片
    if (e.altKey && !e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'n') {
      const activeEl = doc.activeElement as HTMLElement | null;
      const tag = String(activeEl?.tagName || '').toLowerCase();
      // 若当前在普通输入框内且已输入文字，避免打断输入（但若在只读或背景时随时唤起）
      if (activeEl?.isContentEditable) return;
      if (doc.querySelector('.tm-omni-creator-overlay')) return; // 已打开时不重复唤出
      e.preventDefault();
      openOmniCardModal(doc, wiki);
    }
  }, true);
}

/** Widget 导出：供嵌入独立制卡页面或工作台 */
function makeOmniCreatorWidget(): any {
  class OmniCreatorWidget extends Widget {
    render(parent: any, nextSibling: any) {
      this.parentDomNode = parent;
      this.computeAttributes();
      this.execute();
      const doc = this.document || document;
      const wiki = this.wiki;

      const container = el(doc, 'div', 'tm-omni-creator-embedded');
      const btn = el(doc, 'button', 'tm-card-modal-btn tm-card-modal-submit', '✨ 打开全局制卡中心 (Alt+N)');
      btn.addEventListener('click', () => {
        openOmniCardModal(doc, wiki);
      });
      container.appendChild(btn);

      parent.insertBefore(container, nextSibling);
      this.domNodes.push(container);

      // 尝试挂载全局快捷键
      initGlobalCardShortcut(wiki, doc.defaultView || globalThis);
    }
  }
  return OmniCreatorWidget;
}

exports['tidme-card-creator'] = makeOmniCreatorWidget();
exports.openOmniCardModal = openOmniCardModal;
exports.initGlobalCardShortcut = initGlobalCardShortcut;
exports.listAvailableDecks = listAvailableDecks;
