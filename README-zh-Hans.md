# Tidme（墨屉）

<div align="center">

**✨ 终身知识，深入脑海 ✨**

_面向 TiddlyWiki 5 的渐进阅读（Incremental Reading）与 FSRS 间隔重复记忆系统_

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Release](https://img.shields.io/badge/Release-v1.18.0-success.svg)](https://github.com/keepone/Tidme/releases)
[![TiddlyWiki 5](https://img.shields.io/badge/TiddlyWiki-5.3%2B-orange.svg)](https://tiddlywiki.com)
[![Tests](https://img.shields.io/badge/Tests-484%20passed-brightgreen.svg)]()

[English](README.md) · [简体中文](README-zh-Hans.md)

</div>

---

## 📖 简介

**Tidme（墨屉）** 是深度整合进 [TiddlyWiki 5](https://tiddlywiki.com) 的终身学习辅助系统。

它融合了 **SuperMemo** 的渐进阅读（Incremental Reading）哲学与最新记忆认知科学成果 **FSRS**（Free Spaced Repetition Scheduler）间隔重复算法，支持在纯本地、去中心化的个人知识库中完成 **「长文切分导入 → 渐进研读摘录 → 原子卡片制作 → 智能间隔复习」** 的完整闭环。

---

## 🌟 核心特性

### 1. 渐进阅读（Incremental Reading）

- **多格式导入切分**：直接将 EPUB 电子书、PDF 文档、Markdown 长文拖入导入中心，系统根据目录结构或标题大纲自动将其切分为连续节卡（Sections），无需手工搬运。
- **续读记忆点（Read Points）**：支持对正在研读的长篇材料打上续读锚点（`Ctrl+F7`），再次打开时一键精准回跳（`Alt+F7`）并高亮当时阅读的段落。
- **节卡交互控制条（Section Bar）**：每篇材料顶部配备控制条，支持「上一节 / 下一节」连续换页，支持「已读完成（Done）」、「顺延稍读（Later，按 A-Factor 调度）」、「提前（Advance）」与「忽略（Ignore）」。

### 2. 沉浸式制卡（In-place Card Creation）

- **划词即时制卡**：在任何阅读文章或笔记中选中文本，立即唤出浮动制卡气泡；亦可通过 `Alt+K` 在任意界面调出全局万能制卡弹窗。
- **丰富的原子卡型**：
  - **摘录卡（Extract, `Alt+X`）**：沉淀材料精华段落，保留上下文与溯源链接；
  - **挖空卡（Cloze, `Alt+Z`）**：支持多空挖空填空记忆（`<<C "文本" "c1">>`）；
  - **问答卡（Q&A, `Alt+Q`）**：正面提问、背面解答的经典双面卡；
  - **图片框选卡**：在 PDF 阅读器中直接框选图表或公式快速制卡。
- **严谨的谱系溯源**：所有从书籍、PDF 或笔记中派生的卡片，均自动记录文档归属与父级标题，点击即可瞬间溯源至原文上下文。

### 3. 现代 FSRS 算法引擎

- **先进的记忆科学模型**：全面告别过时的 SM-2 算法，基于最新 FSRS 调度理论，追踪记忆的**稳定性（Stability）**与**难度（Difficulty）**，提供极其精准的复习周期规划。
- **防扎堆抖动（Fuzz）**：借鉴最新间隔抖动策略，自动分散到期高峰，避免特定日期的卡片堆积雪崩。
- **人性化学习日换天（Rollover Hour）**：支持自定义每日结算临界点（默认凌晨 4:00），保护深夜与跨夜学习者的连续打卡进度与任务配额。
- **多重学习场景**：支持日常到期复习、日末强化操练（Final Drill）、考前突击（Cram），以及评分误触一键撤销（Undo）。

### 4. 双轨队列与统一牌组引擎

- **材料流与复习流彻底正交**：阅读材料队列（Topic 队列）与 记忆考题队列（Item 队列）分流调度，既不会让长篇大论打断刷卡节奏，也不会遗失材料阅读进度。
- **开箱即用的牌组系统**：
  - `$:/Deck/default`：收录全库需要记忆复习的全部知识卡；
  - `$:/Deck/standalone`（散卡）：专用于归集用户日常快速记录、非长文派生的独立记忆卡；
  - 支持按文档、标签或任意 TiddlyWiki 过滤器自定义专属复习牌组。
- **多维度卡片管理器（Card Manager）**：提供抽屉式管理控制台，支持按文档/按牌组/平铺浏览，提供批量顺延、提前、搁置、重置与删除等全套运维能力。

---

## ⌨️ 常用快捷键速查

| 快捷键                | 功能            | 说明                                                                          |
| :-------------------- | :-------------- | :---------------------------------------------------------------------------- |
| **Alt + K**           | 全局制卡器      | 在任何界面弹出万能制卡窗口，快速记录散卡                                      |
| **Alt + X**           | 提取摘录卡      | 将当前选中的文本沉淀为摘录卡片，继承文档溯源                                  |
| **Alt + Z**           | 制作挖空卡      | 将选中文本制作为挖空卡片（Cloze）                                             |
| **Alt + Q**           | 制作问答卡      | 将选中文本制作为问答卡片（Q&A）                                               |
| **Ctrl + F7**         | 标记续读点      | 将当前选中文字锚定为此篇材料的续读进度点                                      |
| **Alt + F7**          | 跳至续读点      | 快速滚动至当前材料的续读位置并高亮段落                                        |
| **Shift + Ctrl + F7** | 清除续读点      | 清除当前文档记录的续读锚点                                                    |
| **← / →**             | 上一节 / 下一节 | 渐进阅读材料时快速前进/后退翻页                                               |
| **Space**             | 翻开答案 / 展开 | 复习时翻转卡片正背面，或展开/折叠折叠项                                       |
| **1 / 2 / 3 / 4**     | 评分打卡        | 复习打分：`1` 重来 (Again)、`2` 困难 (Hard)、`3` 良好 (Good)、`4` 简单 (Easy) |
| **p / n**             | 暂停 / 下一张   | 复习时暂停学习或跳过当前卡片                                                  |

---

## ⬇️ 安装与使用

### 方式一：拖拽安装（推荐）

1. 在 [Releases 发布页面](https://github.com/keepone/Tidme/releases) 下载最新插件产物：
   - **`$__plugins_keepone_tidme.json`**（核心插件包）
   - **`$__tidme_languages_zh-Hans.json`**（简体中文语言包）
2. 打开您的 TiddlyWiki HTML 单文件，直接将这两个 JSON 文件拖入浏览器窗口中；
3. 点击弹窗中的 **导入（Import）** 按钮；
4. 保存 Wiki 并刷新浏览器页面，即可开始使用。

### 方式二：在 Node.js 环境下使用

将构建产物复制到您的 TiddlyWiki `plugins/` 目录：

```json
{
  "plugins": [
    "keepone/tidme",
    "tidme/languages/zh-Hans"
  ]
}
```

---

## 🛠️ 本地开发与构建

本工程基于 Node.js 现代工具链与 TypeScript 构建，支持无外部打包器直跑测试。

### 运行环境

- **Node.js** >= 22（推荐通过 `fnm` 或 `nvm` 管理）

### 常用命令

```bash
# 1. 安装依赖
npm install

# 2. 编译插件包（编译 TS 并打包生成 bin/ 目录下的插件 JSON 产物）
node tools/build-plugins.cjs

# 3. 运行自动化测试套件（含单元测试、集成测试与端到端测试，480+ 用例）
npm test

# 4. 运行测试覆盖率分析
npm run test:coverage

# 5. 启动本地 TiddlyWiki 插件热开发服务器（监听端口 8080）
npm run dev
```

---

## 📄 开源许可与鸣谢

- 本项目基于 [MIT License](LICENSE) 开源发布。
- 本插件基于 [oflg/Tidme](https://github.com/oflg/Tidme) 全面现代化重构升级，特别感谢社区先驱作者 [@oflg](https://github.com/oflg) 及早期贡献者们在 TiddlyWiki 间隔重复领域的开创性探索。
