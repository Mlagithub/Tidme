/*
ui/components/omni-creator.ts — 全局独立制卡中心（Omni Card Creator）

- 全局快捷键唤起（Alt+K）：随时随地灵感录入，无需预先划词；
- 模板切换引擎：问答卡 (Q&A)、挖空卡 (Cloze)、概念卡 (Concept)；
- 牌组与分类归属：支持选择散卡桶或指定牌组；
- 连续添加模式（Keep Open）：支持 Anki 式快速连续录卡；
- 快捷键支持：Ctrl+Enter 保存、Esc 关闭；
- 既支持全屏模态浮窗（openOmniCardModal），也支持页面嵌入 Widget。
*/

declare function require(module: string): any;
const dom = require('$:/plugins/keepone/tidme/ui/base/dom.js');
const cardFactory = require('$:/plugins/keepone/tidme/core/card-factory.js');
const deckMod = require('$:/plugins/keepone/tidme/core/deck.js');
const lingoMod = require('$:/plugins/keepone/tidme/core/lingo.js');
const nsMod = require('$:/plugins/keepone/tidme/core/ns.js');
const Widget = require('$:/core/modules/widgets/widget.js').widget;

// CodeMirror 是重依赖（~300KB）：独立 $:/ 模块 + 显式 require，避免 esbuild 把整包内联进每个消费者
const { TidmeLiveEditor } = require('$:/plugins/keepone/tidme/editor/codemirror-editor.js');

const el = dom.el;

/** 检查当前宿主环境是否支持 CodeMirror 6（浏览器 DOM 环境且具备选区与 Range） */
function canUseCodeMirror(doc: any): boolean {
  try {
    return typeof window !== 'undefined' &&
      typeof window.document !== 'undefined' &&
      typeof (window as any).getSelection === 'function' &&
      typeof (window as any).Range === 'function' &&
      (doc === window.document || doc?.defaultView === window || doc?.nodeType === 9);
  } catch {
    return false;
  }
}

type OmniCardType = 'qa' | 'cloze' | 'concept';

interface OmniCreatorOptions {
  defaultType?: OmniCardType;
  defaultDeck?: string;
  defaultTitle?: string;
  defaultTags?: string[];
  defaultContent?: string;
  defaultQuestion?: string;
  defaultAnswer?: string;
  onSuccess?: (card: any) => void;
}

interface DeckOption {
  value: string;
  label: string;
}

/** 获取牌组选项列表（value 统一为内部标识，label 为展示文本） */
function listDeckOptions(wiki: any): DeckOption[] {
  const standaloneLabel = lingoMod.lingo(wiki, 'creator.deck.standalone', 'Standalone');
  const options: DeckOption[] = [
    { value: cardFactory.STANDALONE_DECK_TOKEN, label: standaloneLabel },
  ];
  if (!wiki || typeof wiki.filterTiddlers !== 'function') return options;
  try {
    const list = deckMod.listDecks(wiki);
    const prefix = deckMod.DECK_PREFIX || '$:/Deck/';
    const seen = new Set<string>();
    for (const d of list) {
      const raw = String(d?.name || d?.title || d || '').trim();
      const name = raw.startsWith(prefix) ? raw.slice(prefix.length) : raw;
      if (name && name !== 'default' && !seen.has(name)) {
        seen.add(name);
        options.push({ value: name, label: name });
      }
    }
  } catch { /* 容错 */ }
  return options;
}

/** 收集当前 wiki 中的所有牌组名称（保持外部兼容） */
function listAvailableDecks(wiki: any): string[] {
  return listDeckOptions(wiki).map((opt) => opt.label);
}

/** 收集当前 wiki 中的所有用户标签（按字母排序，排除系统标签） */
function listAvailableTags(wiki: any): string[] {
  if (!wiki || typeof wiki.filterTiddlers !== 'function') return [];
  try {
    return wiki.filterTiddlers('[tags[]!is[system]sortan[]]');
  } catch {
    return [];
  }
}

/** Linear 风格标签模糊匹配：贪心子序列；连续命中/首字符/词首加分（作排序权重）。
 *  返回命中下标（供 <mark> 高亮）与得分，无匹配返回 null；空查询返回空命中（全量列出）。 */
function fuzzyMatchTag(query: string, text: string): { indices: number[]; score: number } | null {
  const q = String(query || '').toLowerCase();
  const t = String(text || '').toLowerCase();
  if (!q) return { indices: [], score: 0 };
  const indices: number[] = [];
  let score = 0;
  let streak = 0;
  let prev = -2;
  let ti = 0;
  for (let qi = 0; qi < q.length; qi++) {
    let found = -1;
    while (ti < t.length) {
      if (t[ti] === q[qi]) {
        found = ti;
        ti++;
        break;
      }
      ti++;
    }
    if (found < 0) return null;
    indices.push(found);
    if (found === prev + 1) {
      streak += 1;
      score += 2 + streak;
    } else {
      streak = 0;
      score += 1;
    }
    if (found === 0) score += 3;
    else if (t[found - 1] === ' ' || t[found - 1] === '-' || t[found - 1] === '_') score += 2;
    prev = found;
  }
  return { indices, score };
}

/** 打开全局独立制卡模态弹窗 */
function openOmniCardModal(doc: Document, wiki: any, opts: OmniCreatorOptions = {}) {
  const existing = doc.querySelector('.tm-omni-creator-overlay');
  if (existing) return; // 避免重复唤出

  const l = (key: string, fb: string) => lingoMod.lingo(wiki, key, fb);

  const overlay = el(doc, 'div', 'tm-card-modal-overlay tm-omni-creator-overlay');
  const modal = el(doc, 'div', 'tm-card-modal tm-omni-creator-modal');

  let currentType: OmniCardType = opts.defaultType || 'qa';
  let keepOpen = false;

  // 1. 顶部标题栏
  const header = el(doc, 'div', 'tm-card-modal-title tm-omni-header');
  const titleSpan = el(doc, 'span', '', `✨ ${l('creator.modal.create', 'Add Card')}`);
  const shortcutBadge = el(doc, 'span', 'tm-card-modal-badge', 'Alt+K');
  header.appendChild(titleSpan);
  header.appendChild(shortcutBadge);
  modal.appendChild(header);

  // 2. 控制行：模板切换与牌组选择
  const ctrlRow = el(doc, 'div', 'tm-omni-ctrl-row');

  // 模板切换按钮组
  const typeGroup = el(doc, 'div', 'tm-omni-type-group');
  const typeBtns: Record<OmniCardType, HTMLElement> = {
    qa: el(doc, 'button', 'tm-omni-type-btn', `❓ ${l('creator.mode.qa', 'Q&A')}`),
    cloze: el(doc, 'button', 'tm-omni-type-btn', `🧩 ${l('creator.mode.cloze', 'Cloze')}`),
    concept: el(doc, 'button', 'tm-omni-type-btn', `💡 ${l('creator.mode.extract', 'Concept')}`),
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
  const deckLabel = el(doc, 'label', '', `${l('deck', 'Deck')}:`);
  const deckSelect = el(doc, 'select', 'tm-card-modal-input tm-omni-deck-select') as HTMLSelectElement;
  const deckOptions = listDeckOptions(wiki);
  const targetDefault = (opts.defaultDeck || cardFactory.STANDALONE_DECK_TOKEN).trim();
  for (const optData of deckOptions) {
    const opt = el(doc, 'option', '', optData.label) as HTMLOptionElement;
    opt.value = optData.value;
    if (optData.value === targetDefault || (targetDefault !== cardFactory.STANDALONE_DECK_TOKEN && optData.label === targetDefault)) {
      opt.selected = true;
    }
    deckSelect.appendChild(opt);
  }
  deckWrap.appendChild(deckLabel);
  deckWrap.appendChild(deckSelect);
  ctrlRow.appendChild(deckWrap);
  modal.appendChild(ctrlRow);

  // 3. 标题输入框（可选）
  const fieldTitle = el(doc, 'div', 'tm-card-modal-field');
  const titleLabel = el(doc, 'label', '', `${l('creator.field.title', 'Card Title')} (${l('optional', 'Optional')}):`);
  const titleInput = el(doc, 'input', 'tm-card-modal-input') as HTMLInputElement;
  titleInput.placeholder = l('creator.field.title.placeholder', 'Optional concise summary...');
  if (opts.defaultTitle) titleInput.value = opts.defaultTitle;
  fieldTitle.appendChild(titleLabel);
  fieldTitle.appendChild(titleInput);
  modal.appendChild(fieldTitle);

  // 3.5 标签输入（Linear 风格 combobox）：单输入框模糊过滤已有标签 + 最近使用分区 +
  // 键盘闭环（↑↓ 导航 / Enter·Tab 选中 / 退格删末位 pill / Esc 先关列表再关弹窗）+
  // 无精确匹配时「创建新标签」行；连续点选不关闭列表；输入中的逗号批量添加保留旧行为。
  const fieldTags = el(doc, 'div', 'tm-card-modal-field tm-omni-tags-field');
  const tagsLabel = el(doc, 'label', '', `${l('creator.field.tags', 'Tags')} (${l('optional', 'Optional')}):`);
  fieldTags.appendChild(tagsLabel);

  const selectedTags: string[] = opts.defaultTags ? [...opts.defaultTags] : [];
  const availableTags = listAvailableTags(wiki);
  const tagSet = new Set<string>(availableTags);
  const countCache = new Map<string, number>();
  const tagCount = (tag: string): number => {
    const cached = countCache.get(tag);
    if (cached !== undefined) return cached;
    let n = 0;
    try {
      // 跨 realm 数组只取长度，无需展开（AGENTS 陷阱注记）
      n = wiki.getTiddlersWithTag ? [...wiki.getTiddlersWithTag(tag)].length : 0;
    } catch {
      n = 0;
    }
    countCache.set(tag, n);
    return n;
  };

  // 最近使用标签（组件私有 $:/state）：提交带标签的卡片时前插，去重封顶 10 个
  const RECENT_TAGS_TITLE = nsMod.OMNI_RECENT_TAGS_TITLE;
  const readRecentTags = (): string[] => {
    try {
      const arr = JSON.parse(String(wiki.getTiddlerText(RECENT_TAGS_TITLE, '') || '[]'));
      if (!Array.isArray(arr)) return [];
      return arr.filter((t: unknown) => typeof t === 'string' && t.trim()).map((t: string) => t.trim()).slice(0, 10);
    } catch {
      return [];
    }
  };
  const pushRecentTags = (tags: string[]) => {
    if (!tags.length) return;
    const merged = [...tags, ...readRecentTags().filter((t) => !tags.includes(t))].slice(0, 10);
    wiki.addTiddler({ title: RECENT_TAGS_TITLE, text: JSON.stringify(merged) });
  };

  const normalizeTag = (raw: string): string => {
    let clean = raw.trim();
    if (clean.startsWith('[[') && clean.endsWith(']]')) clean = clean.slice(2, -2).trim();
    return clean;
  };
  const splitTagInput = (raw: string): string[] =>
    (raw.includes(',') || raw.includes('，') ? raw.split(/[,，]+/) : [raw])
      .map(normalizeTag)
      .filter((s) => !!s);

  const pillsContainer = el(doc, 'span', 'tm-omni-tag-pills');
  const renderTagPills = () => {
    pillsContainer.textContent = '';
    for (const tag of selectedTags) {
      const pill = el(doc, 'span', 'tm-omni-tag-pill');
      const textSpan = el(doc, 'span', 'tm-omni-tag-text', tag);
      const delBtn = el(doc, 'button', 'tm-omni-tag-del', '×') as HTMLButtonElement;
      delBtn.type = 'button';
      delBtn.title = l('remove', 'Remove');
      delBtn.addEventListener('click', (e: MouseEvent) => {
        e.stopPropagation();
        removeTag(tag);
      });
      pill.appendChild(textSpan);
      pill.appendChild(delBtn);
      pillsContainer.appendChild(pill);
    }
  };

  const addTag = (tag: string) => {
    const clean = tag.trim();
    if (!clean || selectedTags.includes(clean)) return;
    selectedTags.push(clean);
    renderTagPills();
  };

  const removeTag = (tag: string) => {
    const idx = selectedTags.indexOf(tag);
    if (idx >= 0) {
      selectedTags.splice(idx, 1);
      renderTagPills();
    }
  };

  const addTagFromInput = () => {
    for (const part of splitTagInput(String(tagInput.value || ''))) addTag(part);
    tagInput.value = '';
  };

  // combobox DOM：内联 chips 输入框 + 下方建议弹出层
  const combobox = el(doc, 'div', 'tm-omni-combobox');
  combobox.setAttribute('aria-expanded', 'false');
  const tagbox = el(doc, 'div', 'tm-omni-tagbox');
  const tagInput = el(doc, 'input', 'tm-omni-tag-input') as HTMLInputElement;
  tagInput.type = 'text';
  tagInput.placeholder = l('creator.field.tags.placeholder', 'Search or create tags...');
  tagInput.setAttribute('autocomplete', 'off');
  const popup = el(doc, 'div', 'tm-omni-tag-popup');
  popup.setAttribute('role', 'listbox');
  tagbox.appendChild(pillsContainer);
  tagbox.appendChild(tagInput);
  combobox.appendChild(tagbox);
  combobox.appendChild(popup);
  fieldTags.appendChild(combobox);
  modal.appendChild(fieldTags);

  type TagRow = { tag: string; indices: number[]; kind: 'recent' | 'all' | 'create' };
  let popupOpen = false;
  let activeIdx = 0;
  let rows: TagRow[] = [];

  const buildRows = (query: string): TagRow[] => {
    const q = query.trim();
    const out: TagRow[] = [];
    if (!q) {
      const seen = new Set<string>();
      for (const t of readRecentTags()) {
        if ((tagSet.has(t) || selectedTags.includes(t)) && !seen.has(t) && out.length < 5) {
          seen.add(t);
          out.push({ tag: t, indices: [], kind: 'recent' });
        }
      }
      for (const t of availableTags) {
        if (!seen.has(t)) {
          seen.add(t);
          out.push({ tag: t, indices: [], kind: 'all' });
        }
      }
      return out;
    }
    const hits: { tag: string; indices: number[]; score: number }[] = [];
    for (const t of availableTags) {
      const m = fuzzyMatchTag(q, t);
      if (m) hits.push({ tag: t, indices: m.indices, score: m.score });
    }
    // 同分 tie-break 用码点序而非 localeCompare：中文碰撞排序随平台 ICU 变化，
    // 会让同一查询在 Windows/Linux 上给出不同建议顺序（曾致 CI 假失败）
    hits.sort((a, b) => b.score - a.score || (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0));
    for (const h of hits.slice(0, 20)) out.push({ tag: h.tag, indices: h.indices, kind: 'all' });
    const parts = splitTagInput(q);
    if (parts.length === 1 && !tagSet.has(parts[0])) {
      out.push({ tag: parts[0], indices: [], kind: 'create' });
    }
    return out;
  };

  const activateRow = (row: TagRow) => {
    if (row.kind === 'create') {
      addTag(row.tag);
      // 新标签回填标签池：同一查询不再重复 offer「创建」，且列表可显示 ✓ 选中态
      if (!tagSet.has(row.tag)) tagSet.add(row.tag);
      if (!availableTags.includes(row.tag)) availableTags.push(row.tag);
    } else if (selectedTags.includes(row.tag)) removeTag(row.tag);
    else addTag(row.tag);
    tagInput.value = '';
    activeIdx = 0;
    renderTagPills();
    renderPopup(); // 列表保持打开：连续点选免重开（GitHub/Linear 式）
  };

  const wireOption = (btn: any, row: TagRow, idx: number) => {
    btn.addEventListener('mousedown', (e: MouseEvent) => e.preventDefault()); // 输入框不失焦，点选后列表保持
    // hover 只切高亮类（增量），不整棵重建弹层
    btn.addEventListener('mouseenter', () => moveActive(idx));
    btn.addEventListener('click', () => {
      activateRow(row);
      tagInput.focus();
    });
  };

  /** 活动行迁移（增量）：只切换 --active 类与 aria，不重建弹层 */
  const moveActive = (idx: number) => {
    if (idx === activeIdx || idx < 0 || idx >= rows.length) return;
    const btns = popup.querySelectorAll('.tm-omni-tag-option');
    const prev = btns[activeIdx];
    if (prev) prev.classList.remove('tm-omni-tag-option--active');
    activeIdx = idx;
    const next = btns[idx];
    if (next) {
      next.classList.add('tm-omni-tag-option--active');
      popup.setAttribute('aria-activedescendant', next.id);
    }
  };

  const renderPopup = () => {
    rows = buildRows(tagInput.value || '');
    if (activeIdx >= rows.length) activeIdx = Math.max(0, rows.length - 1);
    popup.textContent = '';
    const queryEmpty = !String(tagInput.value || '').trim();
    let lastKind = '';
    let optSeq = 0;
    rows.forEach((row, idx) => {
      if (queryEmpty && row.kind !== 'create' && row.kind !== lastKind) {
        popup.appendChild(
          el(doc, 'div', 'tm-omni-tag-section', row.kind === 'recent' ? l('creator.tags.recent', 'Recent') : l('creator.tags.all', 'All tags')),
        );
        lastKind = row.kind;
      }
      const isActive = idx === activeIdx;
      if (row.kind === 'create') {
        const btn = el(doc, 'button', 'tm-omni-tag-option tm-omni-tag-option--create' + (isActive ? ' tm-omni-tag-option--active' : ''));
        btn.type = 'button';
        btn.id = `tm-omni-tag-opt-${++optSeq}`;
        btn.setAttribute('role', 'option');
        btn.appendChild(el(doc, 'span', '', `＋ ${l('creator.tags.create', 'Create new tag')} `));
        btn.appendChild(el(doc, 'b', 'tm-omni-tag-opt-name', `「${row.tag}」`));
        wireOption(btn, row, idx);
        popup.appendChild(btn);
        return;
      }
      const isSelected = selectedTags.includes(row.tag);
      const btn = el(
        doc,
        'button',
        'tm-omni-tag-option' + (isActive ? ' tm-omni-tag-option--active' : '') + (isSelected ? ' tm-omni-tag-option--selected' : ''),
      );
      btn.type = 'button';
      btn.id = `tm-omni-tag-opt-${++optSeq}`;
      btn.setAttribute('role', 'option');
      btn.setAttribute('aria-selected', isSelected ? 'true' : 'false');
      const name = el(doc, 'span', 'tm-omni-tag-opt-name');
      const hit = new Set(row.indices);
      for (let i = 0; i < row.tag.length; i++) {
        if (hit.has(i)) name.appendChild(el(doc, 'mark', 'tm-omni-tag-mark', row.tag[i]));
        else name.appendChild(doc.createTextNode(row.tag[i]));
      }
      btn.appendChild(name);
      btn.appendChild(el(doc, 'span', 'tm-omni-tag-count', String(tagCount(row.tag))));
      if (isSelected) btn.appendChild(el(doc, 'span', 'tm-omni-tag-check', '✓'));
      wireOption(btn, row, idx);
      popup.appendChild(btn);
    });
    if (!rows.length) {
      popup.appendChild(el(doc, 'div', 'tm-omni-tag-empty', l('creator.tags.empty', 'No matching tags')));
    } else {
      // aria：活动项跟随（fake DOM 无 querySelectorAll 时静默跳过）
      const active = popup.querySelector && popup.querySelector('.tm-omni-tag-option--active');
      if (active) popup.setAttribute('aria-activedescendant', active.id);
    }
  };

  const setOpen = (open: boolean) => {
    popupOpen = open;
    // 显隐唯一机制 = --open class（styles.tid 单点控制）；不再叠加 inline style 双真相源
    combobox.classList.toggle('tm-omni-combobox--open', open);
    combobox.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) renderPopup();
  };

  const openPopup = () => {
    if (!popupOpen) {
      activeIdx = 0;
      setOpen(true);
    }
  };

  tagbox.addEventListener('click', () => {
    openPopup();
    tagInput.focus();
  });
  tagInput.addEventListener('focus', openPopup);
  tagInput.addEventListener('input', () => {
    activeIdx = 0;
    setOpen(true);
  });

  tagInput.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      if (!popupOpen) {
        openPopup();
        return;
      }
      if (!rows.length) return;
      const dir = e.key === 'ArrowDown' ? 1 : -1;
      activeIdx = (activeIdx + dir + rows.length) % rows.length;
      renderPopup();
      return;
    }
    if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      e.stopPropagation();
      const parts = splitTagInput(tagInput.value || '');
      if (parts.length > 1) {
        // 逗号批量添加（一次贴入多个标签）
        for (const p of parts) addTag(p);
        tagInput.value = '';
        activeIdx = 0;
        renderPopup();
        return;
      }
      if (!popupOpen) {
        openPopup();
        return;
      }
      const row = rows[activeIdx];
      if (row) activateRow(row);
      return;
    }
    if (e.key === 'Tab' && popupOpen && rows.length) {
      e.preventDefault();
      e.stopPropagation();
      const row = rows[activeIdx];
      if (row) activateRow(row);
      return;
    }
    if (e.key === 'Backspace' && !tagInput.value && selectedTags.length) {
      e.preventDefault();
      removeTag(selectedTags[selectedTags.length - 1]);
      activeIdx = 0;
      renderPopup();
      return;
    }
    if (e.key === 'Escape' && popupOpen) {
      // 先关列表；列表已关时放行给弹窗级 Esc 关闭
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      return;
    }
  });

  // 点击 combobox 外关闭建议列表（随弹窗关闭注销）
  let onDocPointerDown: ((e: any) => void) | null = null;
  if (typeof doc.addEventListener === 'function') {
    onDocPointerDown = (e: any) => {
      const t = e && e.target;
      if (t && typeof combobox.contains === 'function' && combobox.contains(t)) return;
      setOpen(false);
    };
    doc.addEventListener('pointerdown', onDocPointerDown);
  }

  renderTagPills();

  // 4. 动态表单容器
  const fieldsContainer = el(doc, 'div', 'tm-omni-fields-container');
  modal.appendChild(fieldsContainer);

  let qEditor: TidmeLiveEditor | null = null;
  let aEditor: TidmeLiveEditor | null = null;
  let qInput: HTMLTextAreaElement | null = null;
  let aInput: HTMLTextAreaElement | null = null;
  let clozeInput: HTMLTextAreaElement | null = null;
  let conceptInput: HTMLTextAreaElement | null = null;

  const cleanupEditors = () => {
    if (qEditor) {
      try {
        qEditor.destroy();
      } catch { /* 容错 */ }
      qEditor = null;
    }
    if (aEditor) {
      try {
        aEditor.destroy();
      } catch { /* 容错 */ }
      aEditor = null;
    }
    qInput = null;
    aInput = null;
    clozeInput = null;
    conceptInput = null;
  };

  // 聚焦微任务延迟：等新挂载节点完成布局，避免 focus 被本轮 render 吞掉。
  // 接受 HTMLElement 或带 .focus() 的编辑器包装（TidmeLiveEditor）——
  // 此前 renderFields 与 keep-open 提交各有一份内联拷贝，已收敛于此
  const focusEl = (target: HTMLElement | { focus(): void } | null | undefined) => {
    if (!target || typeof (target as any).focus !== 'function') return;
    if (typeof queueMicrotask === 'function') {
      queueMicrotask(() => (target as any).focus());
    } else {
      (target as any).focus();
    }
  };

  const renderFields = () => {
    cleanupEditors();
    fieldsContainer.innerHTML = '';
    if (currentType === 'qa') {
      // 问答卡：Q + A（优先 CodeMirror 6 Live Preview 容器，无头环境降级 textarea）
      const fQ = el(doc, 'div', 'tm-card-modal-field');
      fQ.appendChild(el(doc, 'label', '', `${l('creator.field.question', 'Question')}:`));
      const qContainer = el(doc, 'div', 'tm-omni-cm-container');
      const qPlaceholder = l('creator.field.question.placeholder', 'Enter question or prompt (Markdown / Images supported)...');

      let qSuccess = false;
      if (canUseCodeMirror(doc)) {
        try {
          qEditor = new TidmeLiveEditor({
            parent: qContainer,
            initialText: opts.defaultQuestion || '',
            placeholder: qPlaceholder,
            onSubmit: () => submit(),
          });
          qSuccess = true;
        } catch (err) {
          console.warn('[Tidme] Question LiveEditor init error, fallback to textarea:', err);
          qEditor = null;
        }
      }
      if (!qSuccess) {
        qInput = el(doc, 'textarea', 'tm-card-modal-textarea') as HTMLTextAreaElement;
        qInput.placeholder = qPlaceholder;
        if (opts.defaultQuestion) qInput.value = opts.defaultQuestion;
        qContainer.appendChild(qInput);
      }
      fQ.appendChild(qContainer);

      const fA = el(doc, 'div', 'tm-card-modal-field');
      fA.appendChild(el(doc, 'label', '', `${l('creator.field.answer', 'Answer')}:`));
      const aContainer = el(doc, 'div', 'tm-omni-cm-container');
      const aPlaceholder = l('creator.field.answer.placeholder', 'Enter answer or key explanation...');

      let aSuccess = false;
      if (canUseCodeMirror(doc)) {
        try {
          aEditor = new TidmeLiveEditor({
            parent: aContainer,
            initialText: opts.defaultAnswer || '',
            placeholder: aPlaceholder,
            onSubmit: () => submit(),
          });
          aSuccess = true;
        } catch (err) {
          console.warn('[Tidme] Answer LiveEditor init error, fallback to textarea:', err);
          aEditor = null;
        }
      }
      if (!aSuccess) {
        aInput = el(doc, 'textarea', 'tm-card-modal-textarea') as HTMLTextAreaElement;
        aInput.placeholder = aPlaceholder;
        if (opts.defaultAnswer) aInput.value = opts.defaultAnswer;
        aContainer.appendChild(aInput);
      }
      fA.appendChild(aContainer);

      fieldsContainer.appendChild(fQ);
      fieldsContainer.appendChild(fA);

      focusEl(qEditor || qInput);
    } else if (currentType === 'cloze') {
      // 挖空卡：Toolbar + Text
      const fC = el(doc, 'div', 'tm-card-modal-field');
      const clozeHead = el(doc, 'div', 'tm-omni-cloze-header');
      clozeHead.appendChild(el(doc, 'label', '', `${l('creator.field.cloze', 'Cloze Text')}:`));
      const insertClozeBtn = el(doc, 'button', 'tm-omni-btn-sm', `+ ${l('creator.btn.insertcloze', 'Add Cloze {{C}}')}`);
      insertClozeBtn.type = 'button';
      insertClozeBtn.addEventListener('click', () => {
        if (!clozeInput) return;
        const start = clozeInput.selectionStart || 0;
        const end = clozeInput.selectionEnd || 0;
        const sel = (String(clozeInput.value || '').slice(start, end) || 'cloze text').replace(/"/g, '\\"');
        // 自动编号：按正文已有挖空取下一个空 id（c1、c2…），一次多挖即成型
        const replacement = `<<C "${sel}" "${cardFactory.nextClozeId(clozeInput.value || '')}" "">>`;
        clozeInput.setRangeText(replacement, start, end, 'select');
        // setRangeText('select') 会选中所插入文本：不折叠选区，连续插入会整体替换上一个挖空
        clozeInput.selectionStart = clozeInput.selectionEnd = start + replacement.length;
        clozeInput.focus();
      });
      clozeHead.appendChild(insertClozeBtn);
      fC.appendChild(clozeHead);

      clozeInput = el(doc, 'textarea', 'tm-card-modal-textarea tm-omni-cloze-textarea') as HTMLTextAreaElement;
      clozeInput.placeholder = l('creator.field.cloze.placeholder', 'e.g. A computer system consists of <<C "hardware">> and <<C "software">>...');
      if (opts.defaultContent) clozeInput.value = opts.defaultContent;
      fC.appendChild(clozeInput);
      fieldsContainer.appendChild(fC);
      focusEl(clozeInput);
    } else {
      // 概念卡：Content (Topic)
      const fN = el(doc, 'div', 'tm-card-modal-field');
      fN.appendChild(el(doc, 'label', '', `${l('creator.field.note', 'Note Content')}:`));
      conceptInput = el(doc, 'textarea', 'tm-card-modal-textarea tm-omni-concept-textarea') as HTMLTextAreaElement;
      conceptInput.placeholder = l('creator.field.note.placeholder', 'Enter concept definition, notes or thoughts...');
      if (opts.defaultContent) conceptInput.value = opts.defaultContent;
      fN.appendChild(conceptInput);
      fieldsContainer.appendChild(fN);
      focusEl(conceptInput);
    }
  };

  const close = () => {
    cleanupEditors();
    if (onDocPointerDown && typeof doc.removeEventListener === 'function') {
      doc.removeEventListener('pointerdown', onDocPointerDown);
      onDocPointerDown = null;
    }
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
  };

  const submit = () => {
    addTagFromInput();
    const selectedDeck = String(deckSelect.value || cardFactory.STANDALONE_DECK_TOKEN || '').trim();
    const userTitle = String(titleInput.value || '').trim();
    const cardTags = selectedTags.length ? [...selectedTags] : undefined;

    let draft: Record<string, any> | null = null;
    let clozeFamily: { note: Record<string, any> | null; cards: Record<string, any>[] } | null = null;

    if (currentType === 'qa') {
      const q = String(qEditor ? qEditor.getText() : (qInput?.value || '')).trim();
      const a = String(aEditor ? aEditor.getText() : (aInput?.value || '')).trim();
      if (!q) {
        if (qEditor) qEditor.focus();
        else focusEl(qInput);
        return;
      }
      draft = cardFactory.buildStandaloneCard(wiki, {
        type: 'qa',
        title: userTitle,
        deck: selectedDeck,
        tags: cardTags,
        question: q,
        answer: a,
      });
    } else if (currentType === 'cloze') {
      const c = String(clozeInput?.value || '').trim();
      if (!c) {
        focusEl(clozeInput);
        return;
      }
      // 一次多挖（Anki 式）：按挖空 id 拆成 N 张兄弟卡（共享笔记 → 挂现有兄弟搁置调度）
      const family = cardFactory.buildClozeFamily(wiki, {
        type: 'cloze',
        title: userTitle,
        deck: selectedDeck,
        tags: cardTags,
        clozeContent: c,
      });
      clozeFamily = family;
      draft = family.cards[0] || null;
    } else {
      const content = String(conceptInput?.value || '').trim();
      if (!content) {
        focusEl(conceptInput);
        return;
      }
      draft = cardFactory.buildStandaloneCard(wiki, {
        type: 'concept',
        title: userTitle,
        deck: selectedDeck,
        tags: cardTags,
        conceptContent: content,
      });
    }

    if (draft) {
      if (clozeFamily) cardFactory.commitClozeFamily(wiki, clozeFamily);
      else cardFactory.commitCard(wiki, draft);
      if (cardTags && cardTags.length) pushRecentTags(cardTags); // 记录最近使用（combobox 置顶展示）
      dom.showToast(doc, doc.body, `${l('creator.toast.success', 'Card created:')} ${draft.caption || draft.title}`, 'ok', 2500);
      opts.onSuccess?.(draft);

      if (keepOpen) {
        // 连续录入：清空内容并重新聚焦
        titleInput.value = '';
        selectedTags.length = 0;
        tagInput.value = '';
        activeIdx = 0;
        renderTagPills();
        renderPopup();
        if (qEditor) qEditor.setText('');
        if (aEditor) aEditor.setText('');
        if (qInput) qInput.value = '';
        if (aInput) aInput.value = '';
        if (clozeInput) clozeInput.value = '';
        if (conceptInput) conceptInput.value = '';
        if (currentType === 'qa') {
          focusEl(qEditor || qInput);
        } else if (currentType === 'cloze') {
          focusEl(clozeInput);
        } else {
          focusEl(conceptInput);
        }
      } else {
        close();
      }
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
  const keepLabel = el(doc, 'span', '', l('creator.keepopen', 'Keep Open (Add another)'));
  keepWrap.appendChild(keepCheckbox);
  keepWrap.appendChild(keepLabel);
  bottomRow.appendChild(keepWrap);

  const btnGroup = el(doc, 'div', 'tm-omni-btn-group');
  const cancelBtn = el(doc, 'button', 'tm-card-modal-btn tm-card-modal-cancel', `${l('creator.btn.cancel', 'Cancel')} (Esc)`);
  const submitBtn = el(doc, 'button', 'tm-card-modal-btn tm-card-modal-submit', `${l('creator.btn.submit', 'Create Card')} (Ctrl+Enter)`);
  btnGroup.appendChild(cancelBtn);
  btnGroup.appendChild(submitBtn);
  bottomRow.appendChild(btnGroup);
  modal.appendChild(bottomRow);

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

/** 注册全局制卡快捷键（Alt+K），模块加载或启动时仅绑定一次 */
let _shortcutRegistered = false;
function initGlobalCardShortcut(wiki: any, win: any = globalThis) {
  if (_shortcutRegistered && win === globalThis) return;
  const doc = win?.document;
  if (!doc || typeof doc.addEventListener !== 'function') return;
  if (win === globalThis) _shortcutRegistered = true;

  doc.addEventListener('keydown', (e: KeyboardEvent) => {
    // Alt+K：全局独立新建卡片
    if (e.altKey && !e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'k') {
      const activeEl = doc.activeElement as HTMLElement | null;
      const tag = String(activeEl?.tagName || '').toLowerCase();
      // 若当前在普通输入框内且已输入文字，避免打断输入（但若在只读或背景时随时唤起）
      if (activeEl?.isContentEditable) return;
      if (doc.querySelector('.tm-omni-creator-overlay')) return; // 已打开时不重复唤出
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
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
      const btnText = `${lingoMod.lingo(wiki, 'creator.title', 'Card Creator')} (Alt+K)`;
      const btn = el(doc, 'button', 'tm-card-modal-btn tm-card-modal-submit', btnText);
      btn.addEventListener('click', () => {
        openOmniCardModal(doc, wiki);
      });
      container.appendChild(btn);

      parent.insertBefore(container, nextSibling);
      this.domNodes.push(container);

      // 尝试挂载全局快捷键
      initGlobalCardShortcut(wiki, doc.defaultView || globalThis);
    }
    refresh(changedTiddlers: Record<string, any>) {
      const changed = Object.keys(changedTiddlers || {});
      const needRefresh = changed.some((t) =>
        t.startsWith('$:/language/') ||
        t.startsWith('$:/Deck/') ||
        t.startsWith(nsMod.CONFIG_TITLE_PREFIX)
      );
      if (needRefresh) {
        this.refreshSelf();
        return true;
      }
      return false;
    }
  }
  return OmniCreatorWidget;
}

exports['tidme-card-creator'] = makeOmniCreatorWidget();
exports.openOmniCardModal = openOmniCardModal;
exports.initGlobalCardShortcut = initGlobalCardShortcut;
exports.listAvailableDecks = listAvailableDecks;
exports.listDeckOptions = listDeckOptions;
exports.listAvailableTags = listAvailableTags;
