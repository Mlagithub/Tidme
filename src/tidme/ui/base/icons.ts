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
  start: '<polygon points="6 3 20 12 6 21 6 3"/>',
  stop: '<rect width="18" height="18" x="3" y="3" rx="2"/>',
  unfold: '<circle cx="12" cy="12" r="10"/>',
  exclude: '<circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>',
  cloze:
    '<path d="M16 4h3a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-3"/><path d="M8 20H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3"/><text x="8.5" y="15.5" font-size="10" font-family="system-ui, sans-serif" font-weight="bold" fill="currentColor" stroke="none">C</text>',
  type:
    '<path d="M16 4h3a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-3"/><path d="M8 20H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3"/><text x="8" y="15.5" font-size="10" font-family="system-ui, sans-serif" font-weight="bold" fill="currentColor" stroke="none">Q</text>',
  select:
    '<path d="M16 4h3a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-3"/><path d="M8 20H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3"/><text x="8.5" y="15.5" font-size="10" font-family="system-ui, sans-serif" font-weight="bold" fill="currentColor" stroke="none">S</text>',
};

declare function require(module: string): any;

/** 图标 svg 字符串（线性 stroke，跟随 currentColor） */
export function iconSvg(name: keyof typeof INNER | string): string {
  const inner = INNER[name] || '';
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="tm-icon">${inner}</svg>`;
}

/** TiddlyWiki 按钮/工具栏槽位专用 SVG（适配 tc-image-button 与 22pt） */
export function iconTwSvg(name: keyof typeof INNER | string): string {
  const inner = INNER[name] || '';
  return `<svg width="22pt" height="22pt" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="tc-image-button tm-icon">${inner}</svg>`;
}

/** Tidme 官方 Squid 插件徽标 SVG */
export const SQUID_SVG = `<svg width="22pt" height="22pt" class="tc-image-button" viewBox="0 0 128 128">
  <g id="squid" clip-path="url(#clip_1)">
    <g id="Group" transform="matrix(0.70710677 0.70710677 -0.70710677 0.70710677 92.57599 -31)">
      <path d="M92.7453 119.592C77.4668 118.861 70.2677 112.499 67.845 104.467C67.6355 104.493 67.4305 104.514 67.2169 104.514C64.4869 104.514 62.2651 102.288 62.2651 99.5579C62.2651 96.9047 64.3586 94.7385 66.982 94.6146C67.0206 94.1659 67.0676 93.7216 67.1231 93.2731C67.1231 93.2731 72.4765 93.974 72.4765 91.1838C72.4765 88.3895 65.2645 46.5232 65.0296 44.1946C64.7989 41.8704 67.5931 39.7769 68.5204 43.9638C69.4517 48.151 71.5455 60.4772 71.5455 60.4772C71.5455 60.4772 81.3125 60.0115 85.4994 60.4772C88.7679 60.8403 91.5493 59.5499 88.2937 54.893C85.0805 50.3046 47.2133 0 47.2133 0C47.2133 0 9.34616 50.3046 6.13323 54.8932C2.87765 59.5502 5.65909 60.8406 8.92752 60.4775C13.1104 60.0118 22.8815 60.4775 22.8815 60.4775C22.8815 60.4775 24.9749 48.1513 25.9022 43.9641C26.8379 39.7769 29.6278 41.8706 29.397 44.1949C29.1621 46.5235 21.9501 88.3898 21.9501 91.184C21.9501 93.974 27.2995 93.2734 27.2995 93.2734C27.3635 93.7221 27.4064 94.1664 27.449 94.6149C30.0681 94.7388 32.1659 96.905 32.1659 99.5582C32.1659 102.288 29.9442 104.514 27.2098 104.514C27.0003 104.514 26.7911 104.493 26.5861 104.467C24.1637 112.5 16.9642 118.861 1.68162 119.592C-0.104222 119.793 -1.00576 123.66 1.75845 124.681C6.17616 126.308 25.7187 127.005 32.6958 115.606C35.0201 112.35 34.5544 127.47 16.8748 135.845C14.7854 136.772 15.247 140.963 20.1348 139.797C25.8642 138.434 42.5613 131.657 47.2139 114.909C51.8667 131.657 68.5636 138.434 74.293 139.797C79.1764 140.963 79.6423 136.772 77.553 135.845C59.869 127.47 59.4077 112.35 61.7319 115.606C68.7132 127.005 88.2472 126.308 92.6693 124.681C95.4286 123.659 94.5271 119.793 92.7453 119.592L92.7453 119.592Z" id="Shape" fill-rule="evenodd" stroke="none" />
      <path d="M30.7683 99.5581C30.7683 97.5927 29.1704 95.999 27.2092 95.999C25.2396 95.999 23.6501 97.5927 23.6501 99.5581C23.6501 101.524 25.2396 103.117 27.2092 103.117C29.1704 103.117 30.7683 101.523 30.7683 99.5581L30.7683 99.5581Z" id="Shape" fill-rule="evenodd" stroke="none" />
      <path d="M63.6581 99.5581C63.6581 101.524 65.2517 103.117 67.2172 103.117C69.1827 103.117 70.7804 101.524 70.7804 99.5581C70.7804 97.5927 69.1824 95.999 67.2172 95.999C65.252 95.999 63.6581 97.5927 63.6581 99.5581L63.6581 99.5581Z" id="Shape" fill-rule="evenodd" stroke="none" />
      <path d="M7.38505 93.7303C4.69767 98.2807 3.45434 106.834 11.0295 114.2C14.4989 115.528 19.0831 109.526 19.0831 109.526C15.1781 109.449 7.25243 103.929 11.2474 93.5121C11.931 91.9232 10.0681 89.1803 7.38505 93.7303L7.38505 93.7303Z" id="Shape" fill-rule="evenodd" stroke="none" />
      <path d="M75.3436 109.526C75.3436 109.526 79.9237 115.529 83.3972 114.2C90.9723 106.834 89.7249 98.2806 87.0416 93.7306C84.3627 89.1802 82.4957 91.9234 83.1793 93.5126C87.174 103.929 79.2442 109.449 75.3436 109.526L75.3436 109.526Z" id="Shape" fill-rule="evenodd" stroke="none" />
    </g>
  </g>
</svg>`;

/** TW 系统级条目图标映射表（自动注入 $:/tags/Image） */
export const TW_SYSTEM_ICONS: Record<string, string> = {
  '$:/plugins/keepone/tidme/review/icon': SQUID_SVG,
  '$:/plugins/keepone/tidme/review/icons/start': iconTwSvg('start'),
  '$:/plugins/keepone/tidme/review/icons/stop': iconTwSvg('stop'),
  '$:/plugins/keepone/tidme/review/icons/unfold': iconTwSvg('unfold'),
  '$:/plugins/keepone/tidme/review/icons/exclude': iconTwSvg('exclude'),
  '$:/plugins/keepone/tidme/review/icons/cloze': iconTwSvg('cloze'),
  '$:/plugins/keepone/tidme/review/icons/type': iconTwSvg('type'),
  '$:/plugins/keepone/tidme/review/icons/select': iconTwSvg('select'),
};

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
