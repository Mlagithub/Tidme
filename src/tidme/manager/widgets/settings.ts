/*
widgets/settings.ts — 设置页（Tidme 选项集中配置）

产品约定：低频、设一次用很久的选项集中在「设置」页；每次操作都要调整的高频参数保留在各功能页。
架构设计：纯数据 Schema 驱动，委托通用表单构建器 setting-form 组装卡片化、视线集中的现代 UI。
配置读写唯一收口 = core/config。
*/

declare function require(module: string): any;
const config = require('$:/plugins/keepone/tidme/core/config.js');
const dom = require('$:/plugins/keepone/tidme/ui/base/dom.js');
const form = require('$:/plugins/keepone/tidme/ui/components/setting-form.js');
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

      // 实时配置读取器
      const ap = () => config.readAutoPostpone(wiki);
      const deckParams = () => config.readDefaultDeckParams(wiki);
      const queueOpts = () => config.readQueueOptions(wiki);
      const pdfOpts = () => config.readPdfOptions(wiki);
      const ocr = () => config.readOcrConfig(wiki);
      const ss = () => config.readSemanticSplit(wiki);

      const groups: form.SettingGroup[] = [
        {
          id: 'schedule',
          title: '复习调度',
          subtitle: '默认牌组 · 自动顺延',
          items: [
            {
              id: 'order',
              title: '出题顺序',
              desc: '学习队列里到期卡与新卡的交错方式',
              type: 'select',
              options: [
                ['due-new', '到期优先'],
                ['new-due', '新卡优先'],
                ['random', '随机'],
              ],
              getValue: () => deckParams().order,
              setValue: (v: string) => config.writeDefaultDeckParams(wiki, { order: v }),
            },
            {
              id: 'queue-stream',
              title: '学习流构成',
              desc: '「开始学习」的队列构成；阅读材料=节卡/摘录',
              type: 'select',
              options: [
                ['items', '纯测试卡（不混入）'],
                ['interleaved', '混入阅读材料并交错'],
                ['strict', '混入但三段式'],
              ],
              getValue: () => {
                const q = queueOpts();
                return q.topics ? (q.mode === 'strict' ? 'strict' : 'interleaved') : 'items';
              },
              setValue: (v: string) => {
                config.writeQueueOptions(wiki, {
                  topics: v !== 'items',
                  mode: v === 'strict' ? 'strict' : 'interleaved',
                });
              },
            },
            {
              id: 'queue-mix',
              title: '交错比（测试:阅读）',
              desc: '混入阅读材料时，每 N 张测试卡插入 1 张阅读卡（SuperMemo 靠统一优先级自然混合，此为本地化调节）',
              type: 'select',
              options: [
                ['4:1', '4:1（默认）'],
                ['3:1', '3:1'],
                ['2:1', '2:1'],
                ['1:1', '1:1'],
              ],
              getValue: () => {
                const q = queueOpts();
                return `${q.itemRatio}:${q.topicRatio}`;
              },
              setValue: (v: string) => {
                const parts = v.split(':');
                config.writeQueueOptions(wiki, {
                  itemRatio: Number(parts[0]),
                  topicRatio: Number(parts[1]),
                });
              },
            },
            {
              id: 'learn-random',
              title: '随机打乱学习步',
              desc: '对应 SuperMemo 的 Randomize final drill：学习中的卡默认按到期前置，开启后改为随机顺序',
              type: 'switch',
              getValue: () => deckParams().learn_random === true,
              setValue: (v: boolean) => config.writeDefaultDeckParams(wiki, { learn_random: v }),
            },
            {
              id: 'auto-postpone-enable',
              title: '每日自动顺延',
              desc: '启动时与每小时自动顺延低优先级逾期卡，防队列积压',
              type: 'switch',
              getValue: () => ap().enable === true,
              setValue: (v: boolean) => config.writeAutoPostpone(wiki, { enable: v }),
            },
            {
              id: 'auto-postpone-max-priority',
              title: '顺延优先级上限',
              desc: '优先级数值大于该值的逾期卡才会被顺延（0 最高）',
              type: 'number',
              min: 0,
              max: 100,
              step: 1,
              visibleIf: () => ap().enable === true,
              getValue: () => Number(ap().maxPriority),
              setValue: (v: number) => config.writeAutoPostpone(wiki, { maxPriority: v }),
            },
            {
              id: 'auto-postpone-days',
              title: '顺延天数',
              desc: '低优先级逾期卡向后顺延的天数',
              type: 'number',
              min: 1,
              max: 365,
              step: 1,
              visibleIf: () => ap().enable === true,
              getValue: () => Number(ap().postponeDays),
              setValue: (v: number) => config.writeAutoPostpone(wiki, { postponeDays: v }),
            },
            {
              id: 'auto-postpone-keep-top',
              title: '保留高优卡数',
              desc: '顺延时始终保护优先级最高的前 N 张',
              type: 'number',
              min: 0,
              max: 999,
              step: 1,
              visibleIf: () => ap().enable === true,
              getValue: () => Number(ap().keepTop),
              setValue: (v: number) => config.writeAutoPostpone(wiki, { keepTop: v }),
            },
            {
              id: 'auto-postpone-threshold',
              title: '过载触发阈值',
              desc: '逾期卡超过该数量才触发顺延（0 = 无门槛）',
              type: 'number',
              min: 0,
              max: 9999,
              step: 1,
              visibleIf: () => ap().enable === true,
              getValue: () => Number(ap().maxOverdueThreshold),
              setValue: (v: number) => config.writeAutoPostpone(wiki, { maxOverdueThreshold: v }),
            },
            {
              id: 'log-retention',
              title: '复习日志保留天数',
              desc: '超过该天数的复习日志启动时自动清理（0 = 永久保留）',
              type: 'number',
              min: 0,
              max: 3650,
              step: 1,
              getValue: () => config.readLogRetentionDays(wiki),
              setValue: (v: number) => config.writeLogRetentionDays(wiki, v),
            },
          ],
        },
        {
          id: 'pdf-ocr',
          title: 'PDF 与 OCR',
          subtitle: '导入 · 扫描页识别',
          items: [
            {
              id: 'pdf-split',
              title: 'PDF 导入方式',
              desc: '仅对后续导入生效；阅读器内可随时翻页',
              type: 'select',
              options: [
                ['outline', '按大纲切分（无大纲则整本）'],
                ['none', '整本不切分'],
              ],
              getValue: () => pdfOpts().split,
              setValue: (v: string) => config.writePdfOptions(wiki, { split: v as 'outline' | 'none' }),
            },
            {
              id: 'ocr-enable',
              title: '启用 LLM-OCR',
              desc: '扫描版 PDF 页面转图片后用视觉模型转写为 Markdown（需支持图片输入的模型）',
              type: 'switch',
              getValue: () => ocr().enable === true,
              setValue: (v: boolean) => config.writeOcrConfig(wiki, { enable: v }),
            },
            {
              id: 'ocr-model',
              title: 'OCR 模型',
              desc: '用于图像转写的视觉多模态模型名',
              type: 'text',
              placeholder: 'gpt-4o-mini',
              visibleIf: () => ocr().enable === true,
              getValue: () => String(ocr().model || ''),
              setValue: (v: string) => config.writeOcrConfig(wiki, { model: v }),
            },
            {
              id: 'ocr-base-url',
              title: 'OCR Base URL',
              desc: '留空 = https://api.openai.com/v1',
              type: 'text',
              placeholder: 'https://api.openai.com/v1',
              visibleIf: () => ocr().enable === true,
              getValue: () => String(ocr().baseUrl || ''),
              setValue: (v: string) => config.writeOcrConfig(wiki, { baseUrl: v }),
            },
            {
              id: 'ocr-api-key',
              title: 'OCR API Key',
              desc: '留空 = 复用「语义切分」的 API Key',
              type: 'password',
              placeholder: 'sk-...',
              visibleIf: () => ocr().enable === true,
              getValue: () => String(ocr().apiKey || ''),
              setValue: (v: string) => config.writeOcrConfig(wiki, { apiKey: v }),
            },
          ],
        },
        {
          id: 'memory-params',
          title: '记忆参数',
          subtitle: '默认牌组 FSRS',
          items: [
            {
              id: 'request-retention',
              title: '目标记忆率',
              desc: '0.9 为标准；越高遗忘越慢、每日负担越重',
              type: 'number',
              min: 0.5,
              max: 1,
              step: 0.01,
              getValue: () => Number(deckParams().request_retention),
              setValue: (v: number) => config.writeDefaultDeckParams(wiki, { request_retention: v }),
            },
            {
              id: 'maximum-interval',
              title: '最大间隔天数',
              desc: '单卡复习周期的最大天数上限',
              type: 'number',
              min: 1,
              max: 9999,
              step: 1,
              getValue: () => Number(deckParams().maximum_interval),
              setValue: (v: number) => config.writeDefaultDeckParams(wiki, { maximum_interval: v }),
            },
            {
              id: 'leech-threshold',
              title: '难以度阈值',
              desc: '累计遗忘达到该值的卡标记为难以度',
              type: 'number',
              min: 1,
              max: 99,
              step: 1,
              getValue: () => Number(deckParams().leech_threshold),
              setValue: (v: number) => config.writeDefaultDeckParams(wiki, { leech_threshold: v }),
            },
          ],
        },
        {
          id: 'semantic-split',
          title: '语义切分',
          subtitle: '导入 · LLM 二次切分',
          items: [
            {
              id: 'semantic-enable',
              title: '启用语义切分',
              desc: '对无结构散文按语义断点二次切分（需 API Key）',
              type: 'switch',
              getValue: () => ss().enable === true,
              setValue: (v: boolean) => config.writeSemanticSplit(wiki, { enable: v }),
            },
            {
              id: 'semantic-api-key',
              title: 'API Key',
              desc: '用于调用语义切分 LLM 服务的密钥',
              type: 'password',
              placeholder: 'sk-...',
              visibleIf: () => ss().enable === true,
              getValue: () => String(ss().apiKey || ''),
              setValue: (v: string) => config.writeSemanticSplit(wiki, { apiKey: v }),
            },
            {
              id: 'semantic-base-url',
              title: 'Base URL',
              desc: 'OpenAI 兼容地址，可指向自建服务',
              type: 'text',
              placeholder: 'https://api.openai.com/v1',
              visibleIf: () => ss().enable === true,
              getValue: () => String(ss().baseUrl || ''),
              setValue: (v: string) => config.writeSemanticSplit(wiki, { baseUrl: v }),
            },
            {
              id: 'semantic-model',
              title: '模型',
              desc: '用于文本断点识别的 LLM 模型名',
              type: 'text',
              placeholder: 'gpt-4o-mini',
              visibleIf: () => ss().enable === true,
              getValue: () => String(ss().model || ''),
              setValue: (v: string) => config.writeSemanticSplit(wiki, { model: v }),
            },
          ],
        },
      ];

      form.renderSettingGroups(doc, root, groups);
    }
  }
  return SettingsWidget as any;
}

exports['tidme-settings'] = makeSettings();
