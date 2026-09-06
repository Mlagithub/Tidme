/*
widgets/settings.ts — 设置页（Tidme 选项集中配置）

产品约定：低频、设一次用很久的选项集中在「设置」页；每次操作都要调整的高频参数
（导入字数覆盖、复习评分、阅读条栏动作等）保留在各功能页，不在此重复。
UI 骨架与「今天」页同源（tm-today-section 标题体系 + --tm-* 令牌）。
配置读写唯一收口 = core/config；widget 只做表单组装与写入触发（控件 change 即写）。
*/

declare function require(module: string): any;
const config = require('$:/plugins/keepone/tidme/core/config.js');
const dom = require('$:/plugins/keepone/tidme/core/dom.js');
const Widget = require('$:/core/modules/widgets/widget.js').widget;

const el = dom.el;

function makeSettings(): any {
  class SettingsWidget extends Widget {
    _root: any = null;

    render(parent: any, nextSibling: any) {
      this.parentDomNode = parent;
      this.computeAttributes();
      this.execute();
      this._root = el(this.document, 'div', 'tm-set');
      this.build();
      parent.insertBefore(this._root, nextSibling);
      this.domNodes.push(this._root);
    }

    refresh() {
      // 配置变化由本页自己写入触发，无需嗅探重建；返回 false 把变化留给其它组件
      return false;
    }

    build() {
      const doc = this.document;
      const wiki = this.wiki;
      const root = this._root;
      root.textContent = '';

      const section = (title: string, subtitle = '') => {
        const sec = el(doc, 'div', 'tm-today-section');
        const head = el(doc, 'div', 'tm-today-section-head');
        head.appendChild(el(doc, 'span', 'tm-today-section-title', title));
        if (subtitle) head.appendChild(el(doc, 'span', 'tm-today-sub', subtitle));
        sec.appendChild(head);
        const body = el(doc, 'div', 'tm-set-body');
        sec.appendChild(body);
        root.appendChild(sec);
        return body;
      };

      const row = (body: any, label: string, control: any, hint = '') => {
        const r = el(doc, 'div', 'tm-set-row');
        r.appendChild(el(doc, 'label', 'tm-set-label', label));
        control.classList.add('tm-set-input');
        r.appendChild(control);
        if (hint) r.appendChild(el(doc, 'span', 'tm-set-hint', hint));
        body.appendChild(r);
        return control;
      };

      const checkbox = (checked: boolean, onChange: (v: boolean) => void) => {
        const input = doc.createElement('input');
        input.type = 'checkbox';
        input.checked = checked;
        input.addEventListener('change', () => onChange(input.checked));
        return input;
      };
      const numberInput = (value: number, min: number, max: number, step: number, onChange: (v: number) => void) => {
        const input = doc.createElement('input');
        input.type = 'number';
        input.min = String(min);
        input.max = String(max);
        input.step = String(step);
        input.value = String(value);
        input.addEventListener('change', () => {
          const v = Number(input.value);
          if (Number.isFinite(v)) onChange(v);
          else input.value = String(value); // 非法输入回滚为上次有效值
        });
        return input;
      };
      const textInput = (value: string, type: string, onChange: (v: string) => void) => {
        const input = doc.createElement('input');
        input.type = type;
        input.value = value;
        input.addEventListener('change', () => onChange(input.value.trim()));
        return input;
      };
      const select = (value: string, options: [string, string][], onChange: (v: string) => void) => {
        const input = doc.createElement('select');
        for (const [v, label] of options) {
          const opt = doc.createElement('option');
          opt.value = v;
          opt.textContent = label;
          input.appendChild(opt);
        }
        input.value = value;
        input.addEventListener('change', () => onChange(input.value));
        return input;
      };

      // —— 复习调度（默认牌组 + 自动顺延） ——
      const ap = config.readAutoPostpone(wiki);
      const deckParams = config.readDefaultDeckParams(wiki);
      const queueOpts = config.readQueueOptions(wiki);
      const queueMixText = `${queueOpts.itemRatio}:${queueOpts.topicRatio}`;
      const schedule = section('复习调度', '默认牌组 · 自动顺延');
      row(
        schedule,
        '出题顺序',
        select(deckParams.order, [['due-new', '到期优先'], ['new-due', '新卡优先'], ['random', '随机']], (v) => config.writeDefaultDeckParams(wiki, { order: v })),
        '学习队列里到期卡与新卡的交错方式',
      );
      row(
        schedule,
        '学习流构成',
        select(queueOpts.topics ? (queueOpts.mode === 'strict' ? 'strict' : 'interleaved') : 'items', [['items', '纯测试卡（不混入）'], ['interleaved', '混入阅读材料并交错'], [
          'strict',
          '混入但三段式',
        ]], (v) => config.writeQueueOptions(wiki, { topics: v !== 'items', mode: v === 'strict' ? 'strict' : 'interleaved' })),
        '「开始学习」的队列构成；阅读材料=节卡/摘录',
      );
      row(
        schedule,
        '交错比（测试:阅读）',
        select(queueMixText, [['4:1', '4:1（默认）'], ['3:1', '3:1'], ['2:1', '2:1'], ['1:1', '1:1']], (v) => {
          const parts = v.split(':');
          config.writeQueueOptions(wiki, { itemRatio: Number(parts[0]), topicRatio: Number(parts[1]) });
        }),
        '混入阅读材料时，每 N 张测试卡插入 1 张阅读卡（SuperMemo 靠统一优先级自然混合，此为本地化调节）',
      );
      row(
        schedule,
        '随机打乱学习步',
        checkbox(deckParams.learn_random === true, (v) => config.writeDefaultDeckParams(wiki, { learn_random: v })),
        '对应 SuperMemo 的 Randomize final drill：学习中的卡默认按到期前置，开启后改为随机顺序',
      );
      row(schedule, '每日自动顺延', checkbox(ap.enable === true, (v) => config.writeAutoPostpone(wiki, { enable: v })), '启动时与每小时自动顺延低优先级逾期卡，防队列积压');
      row(
        schedule,
        '顺延优先级上限',
        numberInput(Number(ap.maxPriority), 0, 100, 1, (v) => config.writeAutoPostpone(wiki, { maxPriority: v })),
        '优先级数值大于该值的逾期卡才会被顺延（0 最高）',
      );
      row(schedule, '顺延天数', numberInput(Number(ap.postponeDays), 1, 365, 1, (v) => config.writeAutoPostpone(wiki, { postponeDays: v })));
      row(schedule, '保留高优卡数', numberInput(Number(ap.keepTop), 0, 999, 1, (v) => config.writeAutoPostpone(wiki, { keepTop: v })), '顺延时始终保护优先级最高的前 N 张');
      row(
        schedule,
        '过载触发阈值',
        numberInput(Number(ap.maxOverdueThreshold), 0, 9999, 1, (v) => config.writeAutoPostpone(wiki, { maxOverdueThreshold: v })),
        '逾期卡超过该数量才触发顺延（0 = 无门槛）',
      );
      row(
        schedule,
        '复习日志保留天数',
        numberInput(config.readLogRetentionDays(wiki), 0, 3650, 1, (v) => config.writeLogRetentionDays(wiki, v)),
        '超过该天数的复习日志启动时自动清理（0 = 永久保留）',
      );

      // —— PDF 导入与 LLM-OCR ——
      const pdfOpts = config.readPdfOptions(wiki);
      const ocr = config.readOcrConfig(wiki);
      const pdfSection = section('PDF 与 OCR', '导入 · 扫描页识别');
      row(
        pdfSection,
        'PDF 导入方式',
        select(pdfOpts.split, [['outline', '按大纲切分（无大纲则整本）'], ['none', '整本不切分']], (v) => config.writePdfOptions(wiki, { split: v as 'outline' | 'none' })),
        '仅对后续导入生效；阅读器内可随时翻页',
      );
      row(
        pdfSection,
        '启用 LLM-OCR',
        checkbox(ocr.enable === true, (v) => config.writeOcrConfig(wiki, { enable: v })),
        '扫描版 PDF 页面转图片后用视觉模型转写为 Markdown（需支持图片输入的模型）',
      );
      row(pdfSection, 'OCR 模型', textInput(String(ocr.model || ''), 'text', (v) => config.writeOcrConfig(wiki, { model: v })));
      row(pdfSection, 'OCR Base URL', textInput(String(ocr.baseUrl || ''), 'text', (v) => config.writeOcrConfig(wiki, { baseUrl: v })), '留空 = https://api.openai.com/v1');
      row(pdfSection, 'OCR API Key', textInput(String(ocr.apiKey || ''), 'password', (v) => config.writeOcrConfig(wiki, { apiKey: v })), '留空 = 复用「语义切分」的 API Key');

      // —— 记忆参数（默认牌组 FSRS） ——
      const memory = section('记忆参数', '默认牌组 FSRS');
      row(
        memory,
        '目标记忆率',
        numberInput(Number(deckParams.request_retention), 0.5, 1, 0.01, (v) => config.writeDefaultDeckParams(wiki, { request_retention: v })),
        '0.9 为标准；越高遗忘越慢、每日负担越重',
      );
      row(memory, '最大间隔天数', numberInput(Number(deckParams.maximum_interval), 1, 9999, 1, (v) => config.writeDefaultDeckParams(wiki, { maximum_interval: v })));
      row(
        memory,
        '难以度阈值',
        numberInput(Number(deckParams.leech_threshold), 1, 99, 1, (v) => config.writeDefaultDeckParams(wiki, { leech_threshold: v })),
        '累计遗忘达到该值的卡标记为难以度',
      );

      // —— 语义切分（导入） ——
      const ss = config.readSemanticSplit(wiki);
      const semantic = section('语义切分', '导入 · LLM 二次切分');
      row(semantic, '启用语义切分', checkbox(ss.enable === true, (v) => config.writeSemanticSplit(wiki, { enable: v })), '对无结构散文按语义断点二次切分（需 API Key）');
      row(semantic, 'API Key', textInput(String(ss.apiKey || ''), 'password', (v) => config.writeSemanticSplit(wiki, { apiKey: v })));
      row(semantic, 'Base URL', textInput(String(ss.baseUrl || ''), 'text', (v) => config.writeSemanticSplit(wiki, { baseUrl: v })), 'OpenAI 兼容地址，可指向自建服务');
      row(semantic, '模型', textInput(String(ss.model || ''), 'text', (v) => config.writeSemanticSplit(wiki, { model: v })));
    }
  }
  return SettingsWidget as any;
}

exports['tidme-settings'] = makeSettings();
