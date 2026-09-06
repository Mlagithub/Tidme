/*
core/icons.ts — 线性 SVG 图标注册表（设计系统唯一图标产地）

- 24×24 stroke 线性风格（Lucide 风格，跟随 currentColor）
- 组件内禁止直接写 emoji 图标；按钮 = icon + 文字标签
- 用法：icons.iconSvg("trash") 返回 svg 字符串；icons.iconEl(doc, "trash", cls) 返回元素
*/

const INNER: Record<string, string> = {
  trash: '<path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>',
  zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  sparkles: '<path d="M12 3l1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3z"/>',
  scissors: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.12 15.88"/><path d="M14.47 14.48 20 20"/><path d="M8.12 8.12 12 12"/>',
  help: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
  book: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
  chart: '<path d="M12 20V10"/><path d="M18 20V4"/><path d="M6 20v-4"/>',
  save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8"/><path d="M7 3v5h8"/>',
  folder: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
  plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  read: '<path d="M6 3h9a2 2 0 0 1 2 2v16l-6.5-3L6 21V4a1 1 0 0 1 1-1z"/><path d="M6 8h11"/>',
  study: '<path d="M12 4l9 5-9 5-9-5 9-5z"/><path d="M6 14l6 3.5L18 14"/><path d="M6 17l6 3.5L18 17"/>',
};

declare function require(module: string): any;

/** 图标 svg 字符串（线性 stroke，跟随 currentColor） */
export function iconSvg(name: keyof typeof INNER | string): string {
  const inner = INNER[name] || '';
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="tm-icon">${inner}</svg>`;
}

/** 图标元素（插入按钮/行内；cls 追加类名） */
export function iconEl(doc: Document, name: string, cls?: string): HTMLElement {
  const holder = doc.createElement('span');
  holder.className = 'tm-icon' + (cls ? ' ' + cls : '');
  holder.innerHTML = iconSvg(name);
  return holder;
}

/** 带图标 + 文字标签的按钮（设计系统标准按钮构建器） */
export function iconButton(doc: Document, cls: string, name: string, label: string): HTMLElement {
  const b = doc.createElement('button');
  b.className = cls;
  b.appendChild(iconEl(doc, name));
  b.appendChild(doc.createTextNode(' ' + label));
  return b;
}
