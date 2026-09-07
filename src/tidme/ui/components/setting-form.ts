/*
manager/widgets/setting-form.ts — 通用设置卡片与表单构建器
声明式 Schema 驱动，提供现代化卡片式分组、左信息右控件布局与动态开关联动。
*/

declare function require(module: string): any;
const dom = require('$:/plugins/keepone/tidme/ui/base/dom.js');
const el = dom.el;

export type SettingType = 'switch' | 'select' | 'number' | 'text' | 'password';

export interface SettingItem {
  id: string;
  title: string;
  desc?: string;
  type: SettingType;
  options?: [string, string][];
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  visibleIf?: () => boolean;
  getValue: () => any;
  setValue: (val: any) => void;
}

export interface SettingGroup {
  id: string;
  title: string;
  subtitle?: string;
  items: SettingItem[];
}

export function renderSettingGroups(
  doc: Document,
  container: HTMLElement,
  groups: SettingGroup[],
  onFieldChange?: (id: string, val: any) => void,
): { updateVisibility: () => void } {
  container.textContent = '';
  const rowsWithConditions: { rowEl: HTMLElement; item: SettingItem }[] = [];

  const updateVisibility = () => {
    for (const { rowEl, item } of rowsWithConditions) {
      if (item.visibleIf) {
        const isVisible = item.visibleIf();
        if (isVisible) {
          rowEl.classList.remove('tm-setting-row--hidden');
          rowEl.style.display = 'flex';
        } else {
          rowEl.classList.add('tm-setting-row--hidden');
          rowEl.style.display = 'none';
        }
      }
    }
  };

  for (const group of groups) {
    const groupEl = el(doc, 'div', 'tm-setting-group');

    // 组标题行
    const headEl = el(doc, 'div', 'tm-setting-head');
    headEl.appendChild(el(doc, 'div', 'tm-setting-group-title', group.title));
    if (group.subtitle) {
      headEl.appendChild(el(doc, 'div', 'tm-setting-group-sub', group.subtitle));
    }
    groupEl.appendChild(headEl);

    // 卡片容器
    const cardEl = el(doc, 'div', 'tm-setting-card');

    for (const item of group.items) {
      const rowEl = el(doc, 'div', 'tm-setting-row');

      // 左侧信息区（标题 + 描述垂直排列，彻底消除横向视线拉扯）
      const infoEl = el(doc, 'div', 'tm-setting-info');
      infoEl.appendChild(el(doc, 'div', 'tm-setting-title', item.title));
      if (item.desc) {
        infoEl.appendChild(el(doc, 'div', 'tm-setting-desc', item.desc));
      }
      rowEl.appendChild(infoEl);

      // 右侧控件区
      const controlEl = el(doc, 'div', 'tm-setting-control');
      const val = item.getValue();

      if (item.type === 'switch') {
        const switchLabel = el(doc, 'label', 'tm-switch');
        const input = doc.createElement('input');
        input.type = 'checkbox';
        input.checked = Boolean(val);
        input.addEventListener('change', () => {
          item.setValue(input.checked);
          updateVisibility();
          onFieldChange?.(item.id, input.checked);
        });
        switchLabel.appendChild(input);
        switchLabel.appendChild(el(doc, 'span', 'tm-switch-slider'));
        controlEl.appendChild(switchLabel);
      } else if (item.type === 'select') {
        const select = doc.createElement('select');
        for (const [optVal, optLabel] of item.options || []) {
          const opt = doc.createElement('option');
          opt.value = optVal;
          opt.textContent = optLabel;
          select.appendChild(opt);
        }
        select.value = String(val);
        select.addEventListener('change', () => {
          item.setValue(select.value);
          updateVisibility();
          onFieldChange?.(item.id, select.value);
        });
        controlEl.appendChild(select);
      } else if (item.type === 'number') {
        const input = doc.createElement('input');
        input.type = 'number';
        if (item.min !== undefined) input.min = String(item.min);
        if (item.max !== undefined) input.max = String(item.max);
        if (item.step !== undefined) input.step = String(item.step);
        input.value = String(val ?? 0);
        input.addEventListener('change', () => {
          const n = Number(input.value);
          if (Number.isFinite(n)) {
            item.setValue(n);
            updateVisibility();
            onFieldChange?.(item.id, n);
          } else {
            input.value = String(item.getValue());
          }
        });
        controlEl.appendChild(input);
      } else if (item.type === 'text' || item.type === 'password') {
        const input = doc.createElement('input');
        input.type = item.type;
        input.value = String(val || '');
        if (item.placeholder) input.placeholder = item.placeholder;
        input.addEventListener('change', () => {
          const trimmed = input.value.trim();
          item.setValue(trimmed);
          updateVisibility();
          onFieldChange?.(item.id, trimmed);
        });
        controlEl.appendChild(input);
      }

      rowEl.appendChild(controlEl);
      cardEl.appendChild(rowEl);

      if (item.visibleIf) {
        rowsWithConditions.push({ rowEl, item });
      }
    }

    groupEl.appendChild(cardEl);
    container.appendChild(groupEl);
  }

  // 初始应用条件显隐
  updateVisibility();

  return { updateVisibility };
}
