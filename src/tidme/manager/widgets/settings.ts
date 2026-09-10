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
const lingoMod = require('$:/plugins/keepone/tidme/core/lingo.js');
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
      const ocr = () => config.readOcrConfig(wiki);
      const ss = () => config.readSemanticSplit(wiki);
      const l = (key: string, fallback: string) => lingoMod.lingo(wiki, key, fallback);

      const groups: form.SettingGroup[] = [
        {
          id: 'schedule',
          title: l('settings.review.title', 'Review Scheduling'),
          subtitle: l('settings.review.subtitle', 'Default Deck & Auto-Postpone'),
          items: [
            {
              id: 'order',
              title: l('settings.review.order', 'Study Order'),
              desc: l('settings.review.order.desc', 'Interleaving order of due and new cards in study queue'),
              type: 'select',
              options: [
                ['due-new', l('settings.review.order.duenew', 'Due cards first')],
                ['new-due', l('settings.review.order.newdue', 'New cards first')],
                ['random', l('random', 'Random')],
              ],
              getValue: () => deckParams().order,
              setValue: (v: string) => config.writeDefaultDeckParams(wiki, { order: v }),
            },
            {
              id: 'queue-stream',
              title: l('settings.reading.ratio', 'Study Stream Composition'),
              desc: l('settings.reading.ratio.desc', 'Queue stream composition; topics = section cards / extracts'),
              type: 'select',
              options: [
                ['items', l('settings.reading.ratio.none', 'Knowledge cards only (No topics)')],
                ['interleaved', l('settings.reading.ratio.interleaved', 'Interleaved (4 items : 1 topic)')],
                ['strict', l('settings.reading.ratio.strict', 'Strict (Items first, then Topics)')],
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
              title: l('settings.reading.mix', 'Interleaving Ratio (Items:Topics)'),
              desc: l('settings.reading.mix.desc', 'When topics are mixed in, insert 1 topic card per N item cards'),
              type: 'select',
              options: [
                // 默认值来自单一产地（config.QUEUE_MIX_DEFAULT），改默认比例不必再来这里改
                [config.QUEUE_MIX_DEFAULT, `${config.QUEUE_MIX_DEFAULT} (Default)`],
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
              title: l('settings.review.learnrandom', 'Randomize Learning Steps'),
              desc: l('settings.review.learnrandom.desc', 'Randomize final drill: cards in learning steps default to due-first, enable to randomize order'),
              type: 'switch',
              getValue: () => deckParams().learn_random === true,
              setValue: (v: boolean) => config.writeDefaultDeckParams(wiki, { learn_random: v }),
            },
            {
              id: 'auto-postpone-enable',
              title: l('settings.review.autopostpone', 'Daily Auto-Postpone'),
              desc: l('settings.review.autopostpone.desc', 'Automatically postpone lower priority overdue cards to prevent backlog'),
              type: 'switch',
              getValue: () => ap().enable === true,
              setValue: (v: boolean) => config.writeAutoPostpone(wiki, { enable: v }),
            },
            {
              id: 'auto-postpone-max-priority',
              title: l('settings.review.maxpriority', 'Postpone Priority Ceiling'),
              desc: l('settings.review.maxpriority.desc', 'Only cards with priority value greater than this will be postponed (0 is highest)'),
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
              title: l('settings.review.postponedays', 'Postpone Days'),
              desc: l('settings.review.postponedays.desc', 'Number of days to postpone low priority overdue cards'),
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
              title: l('settings.review.topn', 'Retained High-Priority Cards'),
              desc: l('settings.review.topn.desc', 'Always protect top N priority cards from being postponed'),
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
              title: l('settings.review.threshold', 'Overload Trigger Threshold'),
              desc: l('settings.review.threshold.desc', 'Only trigger auto-postpone when overdue cards exceed this count (0 = no threshold)'),
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
              title: l('settings.review.logretention', 'Review Log Retention Days'),
              desc: l('settings.review.logretention.desc', 'Review logs older than this will be cleaned on startup (0 = keep forever)'),
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
          title: l('settings.pdf.title', 'PDF & OCR'),
          subtitle: l('settings.pdf.subtitle', 'Import & Scanned Page Recognition'),
          items: [
            {
              id: 'ocr-enable',
              title: l('settings.ocr.enable', 'Enable LLM-OCR'),
              desc: l('settings.ocr.enable.desc', 'Render scanned PDF pages as images and transcribe with vision models'),
              type: 'switch',
              getValue: () => ocr().enable === true,
              setValue: (v: boolean) => config.writeOcrConfig(wiki, { enable: v }),
            },
            {
              id: 'ocr-model',
              title: l('settings.ocr.model', 'OCR Model Name'),
              desc: l('settings.ocr.model.desc', 'Multimodal vision model for text transcription'),
              type: 'text',
              placeholder: 'gpt-4o-mini',
              visibleIf: () => ocr().enable === true,
              getValue: () => String(ocr().model || ''),
              setValue: (v: string) => config.writeOcrConfig(wiki, { model: v }),
            },
            {
              id: 'ocr-base-url',
              title: l('settings.ocr.baseurl', 'OCR Base URL'),
              desc: l('settings.ocr.baseurl.desc', 'Leave empty for https://api.openai.com/v1'),
              type: 'text',
              placeholder: 'https://api.openai.com/v1',
              visibleIf: () => ocr().enable === true,
              getValue: () => String(ocr().baseUrl || ''),
              setValue: (v: string) => config.writeOcrConfig(wiki, { baseUrl: v }),
            },
            {
              id: 'ocr-api-key',
              title: l('settings.ocr.apikey', 'OCR API Key'),
              desc: l('settings.ocr.apikey.desc', 'Leave empty to reuse AI Semantic Split key'),
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
          title: l('settings.memory.title', 'Memory Parameters'),
          subtitle: l('settings.memory.subtitle', 'Default Deck FSRS'),
          items: [
            {
              id: 'request-retention',
              title: l('settings.memory.retention', 'Target Retention'),
              desc: l('settings.memory.retention.desc', '0.9 is standard; higher retention means slower forgetting but heavier daily load'),
              type: 'number',
              min: 0.5,
              max: 1,
              step: 0.01,
              getValue: () => Number(deckParams().request_retention),
              setValue: (v: number) => config.writeDefaultDeckParams(wiki, { request_retention: v }),
            },
            {
              id: 'maximum-interval',
              title: l('settings.memory.maxinterval', 'Maximum Interval (Days)'),
              desc: l('settings.memory.maxinterval.desc', 'Maximum interval ceiling for a single card review'),
              type: 'number',
              min: 1,
              max: 9999,
              step: 1,
              getValue: () => Number(deckParams().maximum_interval),
              setValue: (v: number) => config.writeDefaultDeckParams(wiki, { maximum_interval: v }),
            },
            {
              id: 'leech-threshold',
              title: l('leechthreshold', 'Leech Threshold'),
              desc: l('settings.memory.leech.desc', 'Cards with lapse count reaching this value are marked as leeches'),
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
          title: l('settings.ai.title', 'AI Semantic Split'),
          subtitle: l('settings.ai.subtitle', 'LLM-assisted document structure analysis'),
          items: [
            {
              id: 'semantic-enable',
              title: l('settings.ai.enable', 'Enable AI Split'),
              desc: l('settings.ai.enable.desc', 'Split unstructured prose into sections using LLM semantic boundaries'),
              type: 'switch',
              getValue: () => ss().enable === true,
              setValue: (v: boolean) => config.writeSemanticSplit(wiki, { enable: v }),
            },
            {
              id: 'semantic-api-key',
              title: l('settings.ai.key', 'API Key'),
              desc: l('settings.ai.key.desc', 'API key for semantic splitting LLM service'),
              type: 'password',
              placeholder: 'sk-...',
              visibleIf: () => ss().enable === true,
              getValue: () => String(ss().apiKey || ''),
              setValue: (v: string) => config.writeSemanticSplit(wiki, { apiKey: v }),
            },
            {
              id: 'semantic-base-url',
              title: l('settings.ai.endpoint', 'Base URL'),
              desc: l('settings.ai.endpoint.desc', 'OpenAI-compatible endpoint, can point to self-hosted service'),
              type: 'text',
              placeholder: 'https://api.openai.com/v1',
              visibleIf: () => ss().enable === true,
              getValue: () => String(ss().baseUrl || ''),
              setValue: (v: string) => config.writeSemanticSplit(wiki, { baseUrl: v }),
            },
            {
              id: 'semantic-model',
              title: l('settings.ai.model', 'Model Name'),
              desc: l('settings.ai.model.desc', 'LLM model name for boundary detection'),
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
