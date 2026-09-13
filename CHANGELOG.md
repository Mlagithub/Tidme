# [1.1.0](https://github.com/Mlagithub/Tidme/compare/v1.0.1...v1.1.0) (2026-09-13)


### Features

* 新建卡片时支持对标 Linear 的标签选择器 ([d18282d](https://github.com/Mlagithub/Tidme/commit/d18282d4cdae8ce944ae75173819000dd26b63c3))

## [1.0.1](https://github.com/Mlagithub/Tidme/compare/v1.0.0...v1.0.1) (2026-09-13)


### Bug Fixes

* pdf.js 解码部分字体文本时必须加载外部 CMap 二进制数据 ([6b16f6b](https://github.com/Mlagithub/Tidme/commit/6b16f6b5f64d199d9d597cd23d12249cd8d38e96))

# 1.0.0 (2026-09-13)


### Bug Fixes

* **`<<C>>` macro :** ids of tiddlers interact with each other ([2a9fa05](https://github.com/Mlagithub/Tidme/commit/2a9fa053ac853b56ce8d23cb0d647e012a39c8e6))
* **annotate:** buttons are not in order ([67531ef](https://github.com/Mlagithub/Tidme/commit/67531ef1ffd068712abbeff53d74f045802c7998))
* **annotate:** buttons are not in order ([70767dc](https://github.com/Mlagithub/Tidme/commit/70767dc14c58bbe46c6bfd1adfb521230a561aa9))
* **annotate:** nested annotations not working ([65d3d1a](https://github.com/Mlagithub/Tidme/commit/65d3d1a6de6b9ea3205f952d14f48b2f16276219))
* **annotation popup:** at the top of the selection ([dfe42d3](https://github.com/Mlagithub/Tidme/commit/dfe42d369d2e9d3e705b368fd000dd0340c0c732))
* **annotation popup:** wrong location ([3a19e90](https://github.com/Mlagithub/Tidme/commit/3a19e90fc9a227ef63515c5bf45555f3a000401f))
* **annotation popup:** wrong location ([28fb230](https://github.com/Mlagithub/Tidme/commit/28fb2300fecc96d2050bb0e9234ecdc1ead5a920))
* **Annotation:** Close popup after rating ([ad81f45](https://github.com/Mlagithub/Tidme/commit/ad81f455d022532da0cc14dc34b24dc1e8a4d086))
* **Annotation:** Recursion errors caused by nesting ([41f28ff](https://github.com/Mlagithub/Tidme/commit/41f28fff3989dca093b91d87cbba2e1caffb3f7f))
* **annotations:** invalid when Sticky titles is yes ([9a57a12](https://github.com/Mlagithub/Tidme/commit/9a57a1269049972cf6f8c7bbd36ce0c7e02b0156))
* **deck-engine:** 全局学习队列过滤非法与系统伪标题，彻底杜绝语法残渣被当作卡片 ([3cadae8](https://github.com/Mlagithub/Tidme/commit/3cadae82ddb9fb713afb71f7353ad39afc0c3fb6))
* **deck:** M2 稳定性打磨 —— 管理页 default 保护/排序/来源标注 + 子集清理走 deck 模块 ([b01ee84](https://github.com/Mlagithub/Tidme/commit/b01ee84f7c4a7c29ddfc068e1ec645493020539b))
* **deck:** 修复 newPerDay 过滤器 run 外 limit 语法错误 ([0263ef0](https://github.com/Mlagithub/Tidme/commit/0263ef0e02037adce6a124ea59a31ac0debb6806))
* **deck:** 牌组 UI 统一到现有入口 —— 移除独立管理页，新建/删除融入学习中心 ([6117e1d](https://github.com/Mlagithub/Tidme/commit/6117e1db2d7b77dfd38ba15d897d61b0ae72e08a))
* **exclude card:** not working ([527c3ac](https://github.com/Mlagithub/Tidme/commit/527c3ac5ade3f51af573b84b15804df6cd698812))
* **get shared decks:** wrong url ([56e20ca](https://github.com/Mlagithub/Tidme/commit/56e20ca8104868a873991f01d85d9d5fa7a0d0b9))
* **get shared:** wrong url ([c50f466](https://github.com/Mlagithub/Tidme/commit/c50f466c6dd39a9674dfe9660e9ee43d9b19411a))
* **hide title:** wrong title color ([b7ef495](https://github.com/Mlagithub/Tidme/commit/b7ef49539f084f984d490b5314f6d9f146411a36))
* **import:** done semantics across decks + unified card manager ([cfdd731](https://github.com/Mlagithub/Tidme/commit/cfdd7318a14fce47b6633316a3bde70a6d35faca))
* **import:** honest done semantics + document-page read-resume (design fix) ([d11da30](https://github.com/Mlagithub/Tidme/commit/d11da30a4688fb0d6b84ceaabad9d7fed93ffccd))
* **import:** notifications, story-river closing, sidebar card browser ([066c308](https://github.com/Mlagithub/Tidme/commit/066c3083c34cf4759477545e599cdcb182559e82))
* **inconsistency:** unfold ([e8b1332](https://github.com/Mlagithub/Tidme/commit/e8b13326810ff42f54cdfcf4b0cdc556059ed877))
* **Leech:** Threshold not correctly displayed ([b447d7f](https://github.com/Mlagithub/Tidme/commit/b447d7f8ac1cc8706f9dc3387932d4a4e96e6d4c))
* **logging:** 复习日志改单文件布局，旧按天小文件自动迁移清理　根因：repeat.tid 按天写 <deck>/log/<YYYYMMDD> data tiddler，文件系统同步器每天每牌组落 2 个文件（json+meta），日积月累大量小文件（截图所示）。布局 v2：每牌组单一 <deck>/log（type application/json，键 = 17 位复习时刻，值 = review_log 不变），磁盘上每牌组仅 1 个文件。迁移与修剪：启动调度器（启动 + 每小时）将旧按天日志合并进单文件并删除旧 tiddler（键 = 天+时刻防跨天碰撞），再按「设置→复习日志保留天数」（默认 90，0 = 永久保留，新增设置项）修剪超期条目。消费方同步：today 今日计数按日期前缀、stats-panel 保留率读单文件、reactive 精化谓词覆盖新标题、deleteDeck 删除牌组时清理其日志。补测试 5 例（契约/迁移/修剪/随删/今日计数） ([c3a164f](https://github.com/Mlagithub/Tidme/commit/c3a164f7f776e9c70e939a1304d4a3c01baad11f))
* **notify:** no translation ([aca50f7](https://github.com/Mlagithub/Tidme/commit/aca50f74a8c5716dae37e3704364ce584c170bc9))
* **options:** some text missing ([edc5475](https://github.com/Mlagithub/Tidme/commit/edc5475bb71a06c8dc8dc18662122d6af3e16028))
* **options:** wrong text ([36d4ced](https://github.com/Mlagithub/Tidme/commit/36d4ced4623f2ca5761c20ba8a729901f985876f))
* **order:** not working ([8646e67](https://github.com/Mlagithub/Tidme/commit/8646e67422ee145c731ef17c57050a4d47444a83))
* package 写错了远程地址 ([0a12a31](https://github.com/Mlagithub/Tidme/commit/0a12a31edca2b3faecdead0dafdb3179815f56aa))
* **performance:** kale ([f27c816](https://github.com/Mlagithub/Tidme/commit/f27c8166a2b99ec65629a25c87c5d080e2bdd976))
* **performance:** Try to fix performance issue ([fa4df8f](https://github.com/Mlagithub/Tidme/commit/fa4df8f8bbe74843db04f62fdf3492f91e49a222))
* **preview caption:** error after changing preview type ([0ca1926](https://github.com/Mlagithub/Tidme/commit/0ca19264ed9a7527f8595a9e938f5dec7c2de7b0))
* **Read twpub:** Show all chunks ([9fc35b4](https://github.com/Mlagithub/Tidme/commit/9fc35b4dded96d8f23e3f8123d1cacd8c97286e6))
* **reading:** fix reading queue scheduling, stats, selection, dark mode contrast and refactor ui-utils ([5352ddc](https://github.com/Mlagithub/Tidme/commit/5352ddc17c5afde075f37adb1638a504eeaf37bf))
* **read:** Today 最近阅读排序与行内「继续」同源校准 —— ① 最近阅读此前按剩余进度比排序（名不符实，与主 CTA 跟随的全局续读点所在书常不一致）；改为按最近打开时间排序：全局续读点所属书置顶（modified 随每次打开刷新），其余书回退各自续读点写入时间，进度作次级；② 行内「继续」此前用无排序过滤器的第一张未读卡（不查续读点/不按 tidme.order），与主 CTA 口径分叉；改为复用 core/doc-ops.docReadingTarget（续读点在队→续读点，否则本书顺序第一张在队卡），全局入口与单本入口定位口径同源。续读点写入统一携带 modified 时间戳（saveReadPoint/saveGlobalReadPoint）。补测试 4 例：docReadingTarget 三态与出队顺延、续读点 modified 时间戳、today-recent 最近排序与 CTA 同书一致性 ([1cfb502](https://github.com/Mlagithub/Tidme/commit/1cfb5022b9edf9ddb758d877343aab96f327ec60))
* **read:** Today「继续阅读」进入真实阅读队列 —— 修复 globalReadingTarget 两个口径偏差：① 续读点分支此前不校验出队状态，续读点卡已读/忽略/搁置时仍跳回旧位置（即用户报告的进入非真实队列）；现在按本书阅读顺序顺延到下一张在队卡，本书读完回退全局队列；② 无续读点分支此前仅 sort[priority] 取第一张，会选中高优先级但未来排期的卡；现在按真实队列口径（TOPIC_QUEUE_FILTER + 优先级→due→阅读顺序排序，当前可读 isDueNow 优先，全未来排期回退第一张）。队列快照/排序收敛 core/scheduler（collectTopicQueue/sortTopicQueue），阅读列表委托同一实现消除口径分叉；阅读入口决策收敛 core/doc-ops（globalReadingTarget），workflow 委托。补测试：unit 2 例（队列快照兜底过滤/三级排序）+ 集成 4 例（续读点三态顺延/文档读完回退/可读优先/全未来回退） ([6956223](https://github.com/Mlagithub/Tidme/commit/6956223a0e57dcdee8e6727f495624e662a026b2))
* **read:** 工具栏不透明 + 制卡保留阅读焦点 + 阅读导航统一走调度引擎 ([b4389d4](https://github.com/Mlagithub/Tidme/commit/b4389d4e3c30ca252155729b44c9132bbeb05a2d))
* **read:** 文档页摘录收件箱漏问答卡 + 默认折叠致「形成了却看不见」　① 收件箱过滤只认 subkind extract/cloze，制卡按钮形成的问答卡（qa）被排除——文档页显示的「摘录/挖空（10）」里永远没有问答（复习时能看到，因为 qa 本就在复习流）；改为聚合 extract/cloze/qa 并加「问」标记。② 收件箱 details 默认折叠，计数可见但内容不可见；改为默认展开（这是文档页的核心产出列表）。测试盲区修复：收件箱测试从未放入 qa 卡（buildQA 仅有字段级测试）、fake DOM 的 collectText 能看穿折叠内容而真实浏览器不能——补 qa 回归用例 + open 属性断言 ([46c3757](https://github.com/Mlagithub/Tidme/commit/46c37575e1ec97ff6444aea7acdedc7a9857c4c8))
* **read:** 条栏背景彻底不透明（不依赖 var）+ ▶ 下一节走会话调度 ([0410b66](https://github.com/Mlagithub/Tidme/commit/0410b66d7c350b0787039466f3df57293b409861)), closes [#1e293](https://github.com/Mlagithub/Tidme/issues/1e293)
* **read:** 阅读条栏「更多」按钮与下拉菜单改为不透明底色 —— 触发器此前无背景声明（透明 ghost 样式），下拉盒依赖 var(--tm-surface)，二者都会在 TW wikify 破坏 var() 时透出正文；沿用 .tm-section-bar 同款修法：亮色写死 #ffffff、暗色覆盖 [#1](https://github.com/Mlagithub/Tidme/issues/1)e293b；顺带 lint-staged 的 dprint 加 --allow-no-files（bin/ 产物被 dprint excludes 排除，仅暂存产物/模板时此前会报无文件而阻断提交） ([73457ef](https://github.com/Mlagithub/Tidme/commit/73457efac5a2429ca8edc87846a7b3a2b1d4fd03)), closes [#1e293](https://github.com/Mlagithub/Tidme/issues/1e293)
* **Refresh error:** refres & focus card ([2452e51](https://github.com/Mlagithub/Tidme/commit/2452e51388b66c65a34cb257a1d1e9c8c3ff4ce5))
* **RefreshMechanism error:** refres & focus card ([e3bffe1](https://github.com/Mlagithub/Tidme/commit/e3bffe1e078ef032c2502f9b4c244faad654e755))
* **reverse card:** mistakes in Q&A question ([84a1e7a](https://github.com/Mlagithub/Tidme/commit/84a1e7a01a4cdea10882cc749a6d6026d8e9b72e))
* **review:** ▶ 会话推进把当前卡移出会话 —— 修复摘录↔词卡 1:1 死循环 ([ac39b57](https://github.com/Mlagithub/Tidme/commit/ac39b574dc0937962f306a10449e7a44eb6a0e60))
* **review:** fix startstudy button queue filter resolution in viewtemplates ([2658977](https://github.com/Mlagithub/Tidme/commit/26589775cb3c2be60709e32c7f52c1a80b5cfb71))
* **review:** 开始学习默认纯知识卡复习流，阅读材料不再默认混入 ([e203e7e](https://github.com/Mlagithub/Tidme/commit/e203e7e536563a307d4adfe8e49af501475c5cbe))
* **review:** 评分后"下一张"按钮不再依赖脆弱的 deck/study list 匹配 ([8b99afd](https://github.com/Mlagithub/Tidme/commit/8b99afd98eba3ce280429cdaf61dc02f56d49143))
* **review:** 跳转复习卡统一设置折叠态 —— 修复阅读→知识卡首张 unfold ([7f36315](https://github.com/Mlagithub/Tidme/commit/7f36315bce22f1db004879036cacab71733af4b3))
* **runtime:** reading-list refresh 引用未 require 的 reactive 致整页刷新循环崩溃 + TS2304 静态守卫　根因：性能改造给 reading-list.refresh 换用 reactive.hasCardDataChange，但该文件从未 require reactive（旧实现自写循环）——渲染期不触发、页面打开后任一 tiddler 变化即抛 ReferenceError，TW 刷新循环整体挂掉（浏览器报「内部 JavaScript 错误」）。修复：补 require。守卫：新增 tsconfig.typecheck.json（skipLibCheck + types[]，绕开 tw5-typed 自身语法错与缺失的 sass 类型）与 test/unit/typecheck.test.mjs —— 断言 tsc 输出零 TS2304（未定义标识符 = ReferenceError 的静态信号，既存其它类型错误不在此守卫范围）；npm script typecheck。顺带修复同批暴露的真雷：import.ts 语义切分调用未定义的 sem（应为 semMod，控制面板时代既存），并新增 globals.d.ts 声明 TW 运行时全局（exports/$tw）消除假阳性 ([33e8833](https://github.com/Mlagithub/Tidme/commit/33e883367b8e98705c566a86905beab16b54b3bd))
* **shortcuts:** auto focus ([569dce5](https://github.com/Mlagithub/Tidme/commit/569dce5d15df61cc6b652178db1ed8d05070f419))
* **shortcuts:** duplicate info ([6cf41b1](https://github.com/Mlagithub/Tidme/commit/6cf41b1bb1f36767fa530704561894c67ce1d981))
* **stats:** 到期口径/新卡展示 + item 卡补学习数据面板 ([f03493c](https://github.com/Mlagithub/Tidme/commit/f03493cb5be5a5bf27d4a6db2086456f7a6329d4))
* **test:** 气泡类名契约断言改为引号无关正则 —— dprint preferSingle 在提交时改写了 section.ts 源码引号风格，暴露出源码文本断言把引号风格误当契约；断言本意（只查自己的气泡类、不查共享类）不变；test/README.md 补充源码文本断言规则 ([2894828](https://github.com/Mlagithub/Tidme/commit/2894828d5c278f058fb987aab7d89a994f9f1696))
* **test:** 评审问题全量修复 —— P1 wikitext-parser 空断言改为跨度断言（innerText 字段不存在，原断言恒真）；P2 tw-boot 语言包缺失由静默跳过改为 console.warn（zh-Hans 是 git 子模块、CI 不拉取，缺失合法但需显形）+ reset 增加 alsoSystem 前缀清扫并写明边界（deck.test 启用并解除用例 1→3 的链式依赖）+ server-e2e 临时目录 test.after 清理；P2 陈旧引用清理（README browser 例外已失效、CI step 名残留 pipeline、core.test.mjs 指向已删脚本）；P3 死代码清理（fixtures.makeItem/makeTopic 零调用删除、fake-dom 死导入、bin-core/display 未用解构、autopostpone 复用 parseTwDate、widget-manager 函数归位）；CI 合并 test 与 coverage 步骤消除双跑 ([e60d818](https://github.com/Mlagithub/Tidme/commit/e60d81819b81befae3b2714d2609078b5a14fbfc))
* **theme:** fix light mode contrast by scoping dark variables strictly to dark theme ([b135f50](https://github.com/Mlagithub/Tidme/commit/b135f507848c1e1e6d82e81bb631c88ab04ffbf5))
* **theme:** improve badge specificity and adapt tokens to TW5 active palette ([29803af](https://github.com/Mlagithub/Tidme/commit/29803af0ca24ab23e68e46112bff82fcac827860))
* **today:** 待学卡数改按每日上限配额截断显示并提供详细全库明细 ([9a57032](https://github.com/Mlagithub/Tidme/commit/9a570321ee7db8a4350ab4bbc90f00eb8cf125f0))
* **tomorrow action:** don't work for new cards and is deleted ([d48526f](https://github.com/Mlagithub/Tidme/commit/d48526f256801b9c649701b8a07d79d84f008ac4))
* **tools:** deck-to-tid 卡片 .tid 头写入 title 字段 ([bbb32d5](https://github.com/Mlagithub/Tidme/commit/bbb32d5a0a95cd59f437007ec3058323364053c3))
* **twpub:** imported twpub not recognised ([9870e01](https://github.com/Mlagithub/Tidme/commit/9870e0199e0feb202b36f98b1499b324178fb301))
* **uncaught typeError:** can‘t read property ([c6d8884](https://github.com/Mlagithub/Tidme/commit/c6d888416fde2c671b91a56ea1577c3aae8a50e8))
* **unfold:** tm-close-tiddler ([adb85a6](https://github.com/Mlagithub/Tidme/commit/adb85a6a5cd496a6068aa243f99f31695348aae3))
* **word color:** Poor performance, removed ([72b0b63](https://github.com/Mlagithub/Tidme/commit/72b0b63380e2dbb750548a3664e9acdd137e2f6a))
* 删除 import/manager 残留的旧 .tm-btn 定义——统一引用 core 设计系统，确保圆角/主色/阴影真正生效 ([14c4362](https://github.com/Mlagithub/Tidme/commit/14c436204da6b51e9db8faa584e0dcda70e13654))
* 删除范围修正——只删阅读材料，保留知识产物 ([7e56f2c](https://github.com/Mlagithub/Tidme/commit/7e56f2c32e7a20f75cdb2f9bc5e57ea84edbf352))
* 卡片管理器/批量操作区 显示原始 caption 模板 ([4b8c490](https://github.com/Mlagithub/Tidme/commit/4b8c4902452b073131ead1020e13c0dc3bd2faaf))
* 卡片管理器页「牌组批量操作」区渲染修正 ([9ad3af8](https://github.com/Mlagithub/Tidme/commit/9ad3af861add079b8d740815b77de5d77c5e9312))
* 恢复「导入按目录存放」——FileSystemPaths 启动自愈 ([f7d03cb](https://github.com/Mlagithub/Tidme/commit/f7d03cbfb8c60029cd785db353494d6f3a7bc718))
* 文档页已读/摘录表格布局（占满 + 均衡列宽 + 名称可区分） ([7054be0](https://github.com/Mlagithub/Tidme/commit/7054be021dd81e61d4f18199dc8011399b3d3c64))
* 文档页跨文档混淆（sectionsOfDoc 未按文档过滤）+ 删除卡片后自动关闭 ([6e4676f](https://github.com/Mlagithub/Tidme/commit/6e4676fa8ea1f2ec54301e021e48e0787c015808))
* 标题模板 caption 优先改用 $view fallback，不再出现 <currentTiddler> 字面 ([26bb0a0](https://github.com/Mlagithub/Tidme/commit/26bb0a03f113b298a6984992e858d3a6219a1fe0))
* 清理阅读材料——提示文案与按钮语义对齐（删除原文、知识保留） ([4af2e1b](https://github.com/Mlagithub/Tidme/commit/4af2e1bd75a6e6883a6137cee8ff4836126a332d))
* 统一构建产物目录到 bin（修 a19d115 产物不一致）+ 清理死 submodule ([18d9204](https://github.com/Mlagithub/Tidme/commit/18d92045e9226b5a40164c4bdc48306706152428))
* 阅读列表 widget 调用语法 <tidme-reading-list/> → <$reading-list/>（$ 前缀 + exports 键名，否则 TW 当未知 HTML 不执行） ([fb9396b](https://github.com/Mlagithub/Tidme/commit/fb9396b2c00fe861f9b813d5d2c607abf642b55b))


### Features

* $:/Decks 每行计数 Tidme 语义色 ([9ef0150](https://github.com/Mlagithub/Tidme/commit/9ef01506a66e734d3281d1e533bf511d1573c3d5))
* **annotate word:** automatically imported example sentences ([87b9118](https://github.com/Mlagithub/Tidme/commit/87b9118ad838a14af8e3da95950e4c70fab96dff))
* **annotate:** Allow unlimited nesting ([71724b4](https://github.com/Mlagithub/Tidme/commit/71724b4f92cd00f1ac6093973b94f0117aac16b1))
* **annotate:** edited directly in the popup ([3e2ebea](https://github.com/Mlagithub/Tidme/commit/3e2ebea3cb6f54d2caba7aa435453c785cd37915))
* **annotation color:** change with rating ([5acbb9b](https://github.com/Mlagithub/Tidme/commit/5acbb9b465e333e644b9f406bdcc6a50927e639e))
* **Annotation highlight:** read deck's excluded cards are excluded ([f54c89e](https://github.com/Mlagithub/Tidme/commit/f54c89e6065739702c4db4fc17ad57b3cd4372a4))
* **core:** M4 scheduling (priority, auto-postpone, batch ops) ([7aeda15](https://github.com/Mlagithub/Tidme/commit/7aeda1561ea2dd3c9a55af632d4dc3295a47dea3))
* **core:** M5 server importer + stats panel ([4f0dec0](https://github.com/Mlagithub/Tidme/commit/4f0dec09b134d8cd26f703233bcbbb364eccf3f4))
* **core:** tidme/core shared core (M1) ([bfa0c69](https://github.com/Mlagithub/Tidme/commit/bfa0c6935c3bb7d35ef76e10e4693872a8525b77))
* **deck:** M2 牌组子系统 —— core/deck.ts + 管理页（创建/编辑参数/删除） ([8ba3ac0](https://github.com/Mlagithub/Tidme/commit/8ba3ac053227ab225e71d0de96fd351b8b4b5776))
* **deck:** 牌组概念校准 —— 明确「牌组=筛选视图而非容器」　① deck-create 成员来源默认项从「全库测试卡」（与 Default 完全同过滤器，制造重复牌组）改为「自定义过滤器」，全库选项保留但标注与默认牌组相同；新增成员实时预览（core/deck.previewMembership：命中数 + 与其它牌组重叠数，创建前可见，输入防抖）；② Today 牌组区加一行弱化说明（筛选视图/进度共享），Default 行加「全部」角色徽章（兜底视图，tooltip 详解）——说明文字全部走既有 tm-today-sub/tm-badge 弱化样式不添乱；③ architecture.md §2 牌组段补视图语义。补测试 3 例（previewMembership 命中/重叠/多牌组、表单预览可见、行角色徽章） ([2d2272d](https://github.com/Mlagithub/Tidme/commit/2d2272deb06e4439769bf130b5dcad23f674095d))
* **get decks:** open plugin modal ([3440617](https://github.com/Mlagithub/Tidme/commit/3440617ff8dc518b00c0152bfd54407086e97e6a))
* **import:** M1-M3 import pipeline + M0 baseline ([45af631](https://github.com/Mlagithub/Tidme/commit/45af63135227e1590c73e837f7283cb876d0328f))
* **import:** M2 general splitter + unified import center ([d63dd65](https://github.com/Mlagithub/Tidme/commit/d63dd6536be28430158837e85457a27b62fea51f))
* **import:** M3 reading depth (anchor, context jump-back, progress) ([f958688](https://github.com/Mlagithub/Tidme/commit/f958688f92b83b3f3c23f3ddd0bb8f17f56ac34c))
* **languages:** add fr-FR ([1c1e689](https://github.com/Mlagithub/Tidme/commit/1c1e6897808bc6371fac4dcd4ae7f78dfa8e72bf))
* **pdf:** PDF 导入/阅读/制卡 + LLM-OCR　① 导入：import 中心接受 .pdf，浏览器内 pdf.js（Mozilla Apache-2.0，CDN 按需加载不膨胀插件）解析——按大纲切分（booklore 同款交互设计；booklore 为 AGPL-3.0 不拷代码）或整本不切分（设置页可配默认，导入时亦可选）；落库契约：Tidme/PDFs/<书名> 二进制 + Tidme/Books/<书名> 文档页 + 大纲节卡（tidme.pages 起止页，due=now 进入阅读队列）。② 阅读：tidme-pdf-reader widget——canvas 页面渲染 + 文本层（选中文字 → 既有 Alt+X/Z/Q 制卡链路直接复用）+ 翻页/页码跳转/续读点自动保存（$:/state/tidme-pdf/page/<docId>）+ 节卡打开落到起始页。③ 制卡：文本选中摘录/挖空/问答（复用 buildExtract/buildCloze/buildQA/commitCard）+ 框选图片制卡（拖拽矩形 → 裁剪 PNG → buildQA 图片问答卡，答案占位可后补）。④ LLM-OCR：扫描页（文本层缺失）按钮 → 页面 PNG → OpenAI 兼容视觉模型转写 Markdown → 持久化到 <文档页>/ocr-p<页>（清理阅读材料级联删除）；设置页新增「PDF 与 OCR」分区（导入方式/启用/模型/Base URL/API Key，Key 留空复用语义切分）。⑤ 清理：deleteDocContent 级联删除 PDF 二进制与 OCR 页。测试 8 例新增（纯逻辑切分/OCR/扫描判定 + 落库/级联/配置回环 + reader smoke） ([3d5b6e4](https://github.com/Mlagithub/Tidme/commit/3d5b6e4e7d21aec30d7165178e4d0448e2b5de83))
* **pdf:** 阅读器重构为桌面阅读器式界面，修复样式缺失与渲染冲突 ([07a57fe](https://github.com/Mlagithub/Tidme/commit/07a57fe29b85a5ae2ecd3d96f8ba76059b0e1f41))
* **queue:** 交错学习设置项 + 随机发卡修复 + 阅读条栏方向键　① 交错学习进设置页（复习调度分区）：学习流构成（纯测试卡/混入并交错/三段式）+ 交错比（测试:阅读，默认 4:1，可调 3:1/2:1/1:1）——SM 以统一优先级队列自然混合 topic/item（无独立比例旋钮），此比例为其本地化调节；core/config.readQueueOptions/writeQueueOptions 收口（QueueMode 旧值兼容 + 新 QueueMix）；workflow 孤儿勾选框迁出（该 widget 无页面挂载，选项此前不可达）并委托 config、透传比率。② 随机发卡修复：sortrandom 比较器洗牌（sort(() => Math.random()-0.5) 有偏非均匀，部分元素倾向滞留原位）改 Fisher-Yates 均匀洗牌 + 均匀性统计测试（12 卡×3000 次 3σ 断言）；随机模式语义对齐 SM（学习中卡前置=final drill 语义保持，due/新卡均匀随机）+ 新增「随机打乱学习步」开关（默认牌组 random_learn 字段，对应 Randomize final drill，JS composeDeckFilters 与 wikitext 三模板 filter_learn 同步消费）。③ 阅读条栏 ←/→ 方向键（全局键盘框架扩展，故事中校验防陈旧导航）+ help-shortcuts 键盘表同步。补测试 3 例（均匀性/队列选项兼容回环/2:1 队列形状）+ settings smoke 扩充 ([7a37bad](https://github.com/Mlagithub/Tidme/commit/7a37bade26f861252a2831abbefb85c7c444f392))
* **quota:** 实现每日上限配额、评分 Undo 撤销与提前学习放行 ([0f9ce50](https://github.com/Mlagithub/Tidme/commit/0f9ce5056f25d46848d2d0ff6034c146711bf0af))
* **read:** add Incremental Reading plugin ([7877288](https://github.com/Mlagithub/Tidme/commit/787728859e781e9f925db46bbd32d2dfbec6164a))
* **review:** 支持同源兄弟卡分散搁置、日末操练队列与突击 Cram 模式 ([2415ec3](https://github.com/Mlagithub/Tidme/commit/2415ec3d9dd96ca217fa678b1603f69aa8e777dc))
* **scheduler:** 实现 FSRS 间隔模糊（Fuzz）算法与评分写路径集成 ([4fdd70e](https://github.com/Mlagithub/Tidme/commit/4fdd70e99ceb3725f0d0266a763f08c5d595f201))
* **schema:** 实现学习日边界 learningDayOf 与本地时区换天机制 ([237df4b](https://github.com/Mlagithub/Tidme/commit/237df4b5bc9a8edec7a47860ed88784a1c682693))
* **settings:** 参数配置页 —— 选项集中配置（Today 同源 UI）　新增 core/config 配置读写唯一收口（自动顺延/语义切分/默认牌组参数三域：默认值兜底、合并写不抹键、字段覆盖历史兼容、retention clamp）；新增 manager/ui/settings.tid 页面与 tidme-settings widget（tm-today-section 骨架与 Today 统一，表单控件 change 即写）；出题顺序（due-new/new-due/random）与默认牌组 leech/FSRS retention/最大间隔首次获得配置入口；语义切分 enable/apiKey/baseUrl/model 从 TW 控制面板迁入；queue-ops 的自动顺延开关迁入设置页（手动触发保留在牌组页——高频操作不集中）；nav 增设置入口；styles 增 tm-set 表单样式。补集成测试 6 例（三域读写回环/页面 smoke/开关迁移/nav 入口） ([48bd714](https://github.com/Mlagithub/Tidme/commit/48bd714dc6a696230630f94ceaf1051744e3c60b))
* **stats:** 支持成熟卡真实保留率、未来到期负荷预测与卡片管理器 Leech 复查重置 ([ca9c76b](https://github.com/Mlagithub/Tidme/commit/ca9c76bea93588d76d67adacadd6a7d01ed8e489))
* **study:** all cards in deck ([cea2d42](https://github.com/Mlagithub/Tidme/commit/cea2d429cd86ded781cbfdace7a35abde1ea4db0))
* **study:** directly from the decks ([7925733](https://github.com/Mlagithub/Tidme/commit/79257335c5e5f7d93c76ee7211864fd48f0bd8ca))
* SuperMemo 机制对齐 + 代码整理 ([c09a8a7](https://github.com/Mlagithub/Tidme/commit/c09a8a707bef2814f00be491eb4b6b9d8ee65581))
* **suspend & bury card:** view toolbar buttons ([8105c2b](https://github.com/Mlagithub/Tidme/commit/8105c2ba6fbd2f05d45fd4e13e3df26ae8a25f4e))
* **suspend & bury:** customisable ([1ee05a7](https://github.com/Mlagithub/Tidme/commit/1ee05a7540672b3467e7a4c31791de916b7e9dfc))
* **theme:** 移除深色模式，仅保留亮色　删除 tidme-theme-toggle widget（localStorage tm-theme + data-tme-dark 写入）；tokens.tid 移除整段深色 token 覆盖（data-tme-dark/tc-dark-palette/tc-body-dark/data-theme 四套选择器与徽章/阴影/页面底色暗值）；styles.tid 移除 section-bar/study-bar/更多菜单三处暗色覆盖块；today/settings 页移除主题切换挂载。条栏不透明修复的亮色写死值保留——仅亮色一种外观，行为与视觉不再随主题切换 ([9bb0ddb](https://github.com/Mlagithub/Tidme/commit/9bb0ddbd93910596542e2e763ab225d6e6c860dd))
* **timestamp:** same with tw ([cbef9b0](https://github.com/Mlagithub/Tidme/commit/cbef9b0dce03699f7f04cd0d4014a70879842202))
* **tools:** 插件式牌组 → 当前 Tidme item 卡 .tid 转换器 ([af65302](https://github.com/Mlagithub/Tidme/commit/af65302346e01d9846f5f4bc829ecaeefc00ff6c))
* **twpub book:** Install and read directly ([0ac46ec](https://github.com/Mlagithub/Tidme/commit/0ac46ec58be3682a9fe75674f4909f107f57926f))
* **type question:** add ([8525945](https://github.com/Mlagithub/Tidme/commit/85259450f6e74535f5950c194601bf68d603e7ca))
* UI 文案去术语化——移除双轨/topic/item/被动/主动/测试卡等内部概念 ([21f7ed6](https://github.com/Mlagithub/Tidme/commit/21f7ed64032c0c2a9832bf4910c4f40939b98984))
* UI 设计系统——统一 token + 现代化组件基类（卡面/阴影/圆角/主色按钮/徽章/标签页/进度条） ([c36d412](https://github.com/Mlagithub/Tidme/commit/c36d412d061512471daec6952152be7f96c41829))
* **unfold card:** Can be scored to select more schedules ([7103aed](https://github.com/Mlagithub/Tidme/commit/7103aedfebcc3b676bf48c6ff26cc2e2ba67b415))
* **unfold card:** default rating Good -> Easy ([abc42ff](https://github.com/Mlagithub/Tidme/commit/abc42ff15935c95a4ac2e01438a97b8a73cefe01))
* **unfold:** add to view toolbar buttons ([9ffa001](https://github.com/Mlagithub/Tidme/commit/9ffa001e4f85e28b5ab79c3ab4ec984cc7102e5c))
* W1 双轨分流——摘录/节卡=topic（阅读流），挖空/问答=item（复习流） ([c2bda31](https://github.com/Mlagithub/Tidme/commit/c2bda31e2997f717144f0f97094374ff23e5e5c2))
* W2 阅读列表页——topic 队列统一阅读入口（双轨闭环） ([2054c96](https://github.com/Mlagithub/Tidme/commit/2054c966df10b4e1947833aebb8f8f4b821b06fd))
* W3 提炼路径标注 + W5 引导文案——extract→cloze→item 进化链显式化 ([35e9cff](https://github.com/Mlagithub/Tidme/commit/35e9cffe7a6fd82e4b05cbb8277b62b9da18072e))
* **word color:** yellow: don't, Red: need to study ([888bda5](https://github.com/Mlagithub/Tidme/commit/888bda515d6e6fe0b7162f1db9cf13b456fb3d6f))
* **word Highlight:** highlight only on first appearance ([54158ef](https://github.com/Mlagithub/Tidme/commit/54158efbaf28315a8e2e956796250e89d100b609))
* 列表项表格化（列式紧凑，避免竖排条目拉长页面） ([2b70251](https://github.com/Mlagithub/Tidme/commit/2b7025140150cb3f3914decc953003e1e0f36723))
* 卡片管理器主体限高内滚动（大量卡片不撑长页面，工具栏 sticky 固定；styled 滚动条） ([6452b10](https://github.com/Mlagithub/Tidme/commit/6452b10f60ea74ffa8b62c1543361ab25457314b))
* 卡片管理器查找——工具栏加搜索框，按标题/面包屑过滤当前视图（含清空），配合既有表格+列排序 ([942e088](https://github.com/Mlagithub/Tidme/commit/942e0881d255d27322b14b7708e042da529328a2))
* 导入中心/文档页深卡片化 + 页面间导航条 ([ab4e64a](https://github.com/Mlagithub/Tidme/commit/ab4e64aabe1564b014e9946209465b3e931f23e2))
* 导入入口清理 + $:/Decks Tidme 化 ([cc4c474](https://github.com/Mlagithub/Tidme/commit/cc4c474a3b783d2f76d96da52c5344900730fe45))
* 文档页正文节链接列表限高内滚动（章节多的文档不撑长页面） ([2279480](https://github.com/Mlagithub/Tidme/commit/2279480fda75ec025fcb8c2ea8c9bbbc308fcf54))
* 移除侧边栏导入/卡片/阅读 tab + 全局续读点 —— 入口收敛到 $:/Decks 工作流中心 ([c42005b](https://github.com/Mlagithub/Tidme/commit/c42005b78e4a85a0d0da481069ddcf978820a174))
* 统计/阅读列表/卡片管理器 UI 现代化（设计系统应用）+ emoji 清理 ([df9bd7e](https://github.com/Mlagithub/Tidme/commit/df9bd7e9cd0ca473e7ef3e4b0c9f010b91d47145))
* 节卡 title 叶段可读化（A2：可读 caption slug + 稳定 id） ([fc0f909](https://github.com/Mlagithub/Tidme/commit/fc0f9098b4e7dd3675aa720d99a588ee9dcdacd9))
* 长列表区内滚动——tiddler 不撑长，固定高度内滚动浏览 ([e7e62e9](https://github.com/Mlagithub/Tidme/commit/e7e62e95944b45f7eda3369bf6f8fceffa7c371f))
* 阅读列表/文档页新增「删除整本书」——按 docId 清理全部内容 ([076ef4f](https://github.com/Mlagithub/Tidme/commit/076ef4f11a0c16688060b0098c30132f40b252a3))
* 阅读流程体验优化——已读关闭/续读点/sticky/阅读列表折叠 ([9251ba0](https://github.com/Mlagithub/Tidme/commit/9251ba0285fa48614ca87c1123a5e0e033d3efdf))
* 页面标题友好化 + 暗色模式 + 条栏按钮现代化（设计系统全站铺开） ([b62f5d1](https://github.com/Mlagithub/Tidme/commit/b62f5d1395846b3127a915f39dae4dc8358ac8a2))
* 顶部固定（sticky）推广 + 制卡按钮按选中状态置灰 ([ae12636](https://github.com/Mlagithub/Tidme/commit/ae12636d3a1a55949e889598783eefd9fb56630e))


### Performance Improvements

* **reactive:** 大卡片量下的操作卡顿 —— 精化刷新谓词 + 重建合并 + 按需渲染　根因：评分一次连写 4+ 个 tiddler（卡片字段×2/牌组日志/会话），每个写入都触发一轮 refresh，而宽谓词把全部打开面板判为相关（卡片与日志都命中 'Tidme//'\''$:/Deck/' 前缀），每轮又全量重建 DOM（card-manager 3537 行 + O(n²) indexOf 去重）。修复：① reactive 新增列表类精化谓词 hasCardDataChange（复习日志/学习列表/会话写入不重建列表——列表不展示它们）与 rebuildSoon（同宏任务多次登记合并为一次重建，回调 try/catch 防销毁竞态）；card-manager/reading-list/queue-ops 接精化谓词+合并重建，stats-panel/today（需读日志的聚合面板）保留宽谓词+合并重建；② card-manager 移除 O(n²) indexOf 去重（两 run 按 kind 互斥无重复）、折叠牌组/未入组分支按需渲染行；③ reading-list 文档表格按需渲染（折叠态不建行）；④ today-recent 每书一次全库扫描改为 docOps.sectionsProgressByDoc 单次扫描聚合。补集成测试 3 例（精化谓词七态/删除事件/rebuildSoon 合并去重），适配 2 例（stats-panel 断言等待宏任务、reading-list 摘录标记改数据断言） ([02e8139](https://github.com/Mlagithub/Tidme/commit/02e81396999b2721df223cf16538693363f37326))

# [1.18.0](https://github.com/keepone/Tidme/compare/v1.17.2...v1.18.0) (2026-09-12)

### Features & Architecture Overhaul

- **core (architecture):** 全新现代架构重构，解耦领域核心逻辑（`core/`）与 UI 组件层，实现无 DOM 纯函数领域模型，测试覆盖率超 85%。
- **incremental reading:** 彻底升级渐进阅读管线，支持 EPUB、PDF、Markdown 结构化切分入库；新增续读点（Read Point）记忆与精准回跳（`Ctrl+F7` / `Alt+F7`）。
- **scheduler (FSRS):** 全面升级为现代 FSRS 9 参数调度算法（难度、稳定性、留存率）；引入 Fuzz 间隔抖动防复习扎堆，新增可配置学习日换天（Rollover Hour，默认凌晨 4:00）。
- **study modes:** 新增日末操练（Final Drill）、考前突击（Cram）、撤销操作（Undo）与会话状态管理。
- **queues & decks:** 建立正交双轨调度体系——材料阅读流（Topic 队列）与 记忆复习流（Item 队列）互不干扰；系统默认牌组收敛为全部卡片（`$:/Deck/default`）与散卡（`$:/Deck/standalone`）。
- **card creation:** 优化即时制卡体验，支持划词浮动气泡、全局制卡弹窗（`Alt+K`）、摘录（`Alt+X`）、挖空（`Alt+Z`）、问答（`Alt+Q`）与 PDF 框选，全链路自动继承文档来源谱系。
- **manager:** 推出全新统一卡片管理器（`card-manager`），提供多视图、多维度组织（按文档/按牌组/列表）与批量调度操作（顺延/提前/搁置/恢复/重置）。
- **performance & toolchain:** 升级至 Node.js >= 22 与 TypeScript，移除外部繁重打包依赖，内建高效构建与测试套件（484+ 用例全部通过）。

## [1.17.2](https://github.com/oflg/Tidme/compare/v1.17.1...v1.17.2) (2023-12-24)

### Bug Fixes

- **preview caption:** error after changing preview type ([0ca1926](https://github.com/oflg/Tidme/commit/0ca19264ed9a7527f8595a9e938f5dec7c2de7b0))

## [1.17.1](https://github.com/oflg/Tidme/compare/v1.17.0...v1.17.1) (2023-12-18)

### Bug Fixes

- **`<<C>>` macro :** ids of tiddlers interact with each other ([2a9fa05](https://github.com/oflg/Tidme/commit/2a9fa053ac853b56ce8d23cb0d647e012a39c8e6))

# [1.17.0](https://github.com/oflg/Tidme/compare/v1.16.0...v1.17.0) (2023-11-10)

### Features

- **languages:** add fr-FR ([1c1e689](https://github.com/oflg/Tidme/commit/1c1e6897808bc6371fac4dcd4ae7f78dfa8e72bf))

# [1.17.0](https://github.com/oflg/Tidme/compare/v1.16.0...v1.17.0) (2023-11-10)

### Features

- **languages:** add fr-FR ([1c1e689](https://github.com/oflg/Tidme/commit/1c1e6897808bc6371fac4dcd4ae7f78dfa8e72bf))

# [1.17.0](https://github.com/oflg/Tidme/compare/v1.16.0...v1.17.0) (2023-11-10)

### Features

- **languages:** add fr-FR ([1c1e689](https://github.com/oflg/Tidme/commit/1c1e6897808bc6371fac4dcd4ae7f78dfa8e72bf))

# [1.16.0](https://github.com/oflg/Tidme/compare/v1.15.0...v1.16.0) (2023-10-19)

### Features

- **unfold card:** Can be scored to select more schedules ([7103aed](https://github.com/oflg/Tidme/commit/7103aedfebcc3b676bf48c6ff26cc2e2ba67b415))

# [1.15.0](https://github.com/oflg/Tidme/compare/v1.14.2...v1.15.0) (2023-10-18)

### Features

- **unfold card:** default rating Good -> Easy ([abc42ff](https://github.com/oflg/Tidme/commit/abc42ff15935c95a4ac2e01438a97b8a73cefe01))

## [1.14.2](https://github.com/oflg/Tidme/compare/v1.14.1...v1.14.2) (2023-10-17)

### Bug Fixes

- **Read twpub:** Show all chunks ([9fc35b4](https://github.com/oflg/Tidme/commit/9fc35b4dded96d8f23e3f8123d1cacd8c97286e6))

## [1.14.1](https://github.com/oflg/Tidme/compare/v1.14.0...v1.14.1) (2023-10-17)

### Bug Fixes

- **annotation popup:** at the top of the selection ([dfe42d3](https://github.com/oflg/Tidme/commit/dfe42d369d2e9d3e705b368fd000dd0340c0c732))

# [1.14.0](https://github.com/oflg/Tidme/compare/v1.13.7...v1.14.0) (2023-10-17)

### Features

- **Annotation highlight:** read deck's excluded cards are excluded ([f54c89e](https://github.com/oflg/Tidme/commit/f54c89e6065739702c4db4fc17ad57b3cd4372a4))

## [1.13.7](https://github.com/oflg/Tidme/compare/v1.13.6...v1.13.7) (2023-10-17)

### Bug Fixes

- **Leech:** Threshold not correctly displayed ([b447d7f](https://github.com/oflg/Tidme/commit/b447d7f8ac1cc8706f9dc3387932d4a4e96e6d4c))

## [1.13.6](https://github.com/oflg/Tidme/compare/v1.13.5...v1.13.6) (2023-10-17)

### Bug Fixes

- **annotation popup:** wrong location ([3a19e90](https://github.com/oflg/Tidme/commit/3a19e90fc9a227ef63515c5bf45555f3a000401f))

## [1.13.5](https://github.com/oflg/Tidme/compare/v1.13.4...v1.13.5) (2023-10-16)

### Bug Fixes

- **annotation popup:** wrong location ([28fb230](https://github.com/oflg/Tidme/commit/28fb2300fecc96d2050bb0e9234ecdc1ead5a920))

## [1.13.4](https://github.com/oflg/Tidme/compare/v1.13.3...v1.13.4) (2023-10-16)

### Bug Fixes

- **Annotation:** Close popup after rating ([ad81f45](https://github.com/oflg/Tidme/commit/ad81f455d022532da0cc14dc34b24dc1e8a4d086))

## [1.13.3](https://github.com/oflg/Tidme/compare/v1.13.2...v1.13.3) (2023-10-16)

### Bug Fixes

- **Annotation:** Recursion errors caused by nesting ([41f28ff](https://github.com/oflg/Tidme/commit/41f28fff3989dca093b91d87cbba2e1caffb3f7f))

## [1.13.2](https://github.com/oflg/Tidme/compare/v1.13.1...v1.13.2) (2023-10-16)

### Bug Fixes

- **annotate:** buttons are not in order ([67531ef](https://github.com/oflg/Tidme/commit/67531ef1ffd068712abbeff53d74f045802c7998))

## [1.13.1](https://github.com/oflg/Tidme/compare/v1.13.0...v1.13.1) (2023-10-16)

### Bug Fixes

- **annotate:** buttons are not in order ([70767dc](https://github.com/oflg/Tidme/commit/70767dc14c58bbe46c6bfd1adfb521230a561aa9))

# [1.13.0](https://github.com/oflg/Tidme/compare/v1.12.2...v1.13.0) (2023-10-15)

### Bug Fixes

- **annotate:** nested annotations not working ([65d3d1a](https://github.com/oflg/Tidme/commit/65d3d1a6de6b9ea3205f952d14f48b2f16276219))
- **annotations:** invalid when Sticky titles is yes ([9a57a12](https://github.com/oflg/Tidme/commit/9a57a1269049972cf6f8c7bbd36ce0c7e02b0156))

### Features

- **annotation color:** change with rating ([5acbb9b](https://github.com/oflg/Tidme/commit/5acbb9b465e333e644b9f406bdcc6a50927e639e))
- **word Highlight:** highlight only on first appearance ([54158ef](https://github.com/oflg/Tidme/commit/54158efbaf28315a8e2e956796250e89d100b609))

## [1.12.2](https://github.com/oflg/Tidme/compare/v1.12.1...v1.12.2) (2023-10-14)

### Bug Fixes

- **performance:** Try to fix performance issue ([fa4df8f](https://github.com/oflg/Tidme/commit/fa4df8f8bbe74843db04f62fdf3492f91e49a222))

## [1.12.1](https://github.com/oflg/Tidme/compare/v1.12.0...v1.12.1) (2023-10-14)

### Bug Fixes

- **word color:** Poor performance, removed ([72b0b63](https://github.com/oflg/Tidme/commit/72b0b63380e2dbb750548a3664e9acdd137e2f6a))

# [1.12.0](https://github.com/oflg/Tidme/compare/v1.11.0...v1.12.0) (2023-10-14)

### Features

- **annotate:** Allow unlimited nesting ([71724b4](https://github.com/oflg/Tidme/commit/71724b4f92cd00f1ac6093973b94f0117aac16b1))

# [1.11.0](https://github.com/oflg/Tidme/compare/v1.10.0...v1.11.0) (2023-10-14)

### Features

- **word color:** yellow: don't, Red: need to study ([888bda5](https://github.com/oflg/Tidme/commit/888bda515d6e6fe0b7162f1db9cf13b456fb3d6f))

# [1.10.0](https://github.com/oflg/Tidme/compare/v1.9.2...v1.10.0) (2023-10-14)

### Features

- **annotate word:** automatically imported example sentences ([87b9118](https://github.com/oflg/Tidme/commit/87b9118ad838a14af8e3da95950e4c70fab96dff))
- **annotate:** edited directly in the popup ([3e2ebea](https://github.com/oflg/Tidme/commit/3e2ebea3cb6f54d2caba7aa435453c785cd37915))

## [1.9.2](https://github.com/oflg/Tidme/compare/v1.9.1...v1.9.2) (2023-10-13)

### Bug Fixes

- **inconsistency:** unfold ([e8b1332](https://github.com/oflg/Tidme/commit/e8b13326810ff42f54cdfcf4b0cdc556059ed877))

## [1.9.1](https://github.com/oflg/Tidme/compare/v1.9.0...v1.9.1) (2023-10-12)

### Bug Fixes

- **twpub:** imported twpub not recognised ([9870e01](https://github.com/oflg/Tidme/commit/9870e0199e0feb202b36f98b1499b324178fb301))

# [1.9.0](https://github.com/oflg/Tidme/compare/v1.8.2...v1.9.0) (2023-10-11)

### Features

- **twpub book:** Install and read directly ([0ac46ec](https://github.com/oflg/Tidme/commit/0ac46ec58be3682a9fe75674f4909f107f57926f))

## [1.8.2](https://github.com/oflg/Tidme/compare/v1.8.1...v1.8.2) (2023-10-11)

### Bug Fixes

- **tomorrow action:** don't work for new cards and is deleted ([d48526f](https://github.com/oflg/Tidme/commit/d48526f256801b9c649701b8a07d79d84f008ac4))

## [1.8.1](https://github.com/oflg/Tidme/compare/v1.8.0...v1.8.1) (2023-10-11)

### Bug Fixes

- **unfold:** tm-close-tiddler ([adb85a6](https://github.com/oflg/Tidme/commit/adb85a6a5cd496a6068aa243f99f31695348aae3))

# [1.8.0](https://github.com/oflg/Tidme/compare/v1.7.0...v1.8.0) (2023-10-11)

### Bug Fixes

- **reverse card:** mistakes in Q&A question ([84a1e7a](https://github.com/oflg/Tidme/commit/84a1e7a01a4cdea10882cc749a6d6026d8e9b72e))

### Features

- **unfold:** add to view toolbar buttons ([9ffa001](https://github.com/oflg/Tidme/commit/9ffa001e4f85e28b5ab79c3ab4ec984cc7102e5c))

# [1.7.0](https://github.com/oflg/Tidme/compare/v1.6.1...v1.7.0) (2023-10-10)

### Features

- **study:** directly from the decks ([7925733](https://github.com/oflg/Tidme/commit/79257335c5e5f7d93c76ee7211864fd48f0bd8ca))
- **suspend & bury:** customisable ([1ee05a7](https://github.com/oflg/Tidme/commit/1ee05a7540672b3467e7a4c31791de916b7e9dfc))

## [1.6.1](https://github.com/oflg/Tidme/compare/v1.6.0...v1.6.1) (2023-10-10)

### Bug Fixes

- **exclude card:** not working ([527c3ac](https://github.com/oflg/Tidme/commit/527c3ac5ade3f51af573b84b15804df6cd698812))

# [1.6.0](https://github.com/oflg/Tidme/compare/v1.5.0...v1.6.0) (2023-10-10)

### Features

- **suspend & bury card:** view toolbar buttons ([8105c2b](https://github.com/oflg/Tidme/commit/8105c2ba6fbd2f05d45fd4e13e3df26ae8a25f4e))

# [1.5.0](https://github.com/oflg/Tidme/compare/v1.4.3...v1.5.0) (2023-10-09)

### Features

- **read:** add Incremental Reading plugin ([7877288](https://github.com/oflg/Tidme/commit/787728859e781e9f925db46bbd32d2dfbec6164a))

## [1.4.3](https://github.com/oflg/Tidme/compare/v1.4.2...v1.4.3) (2023-10-08)

### Bug Fixes

- **Refresh error:** refres & focus card ([2452e51](https://github.com/oflg/Tidme/commit/2452e51388b66c65a34cb257a1d1e9c8c3ff4ce5))

## [1.4.2](https://github.com/oflg/Tidme/compare/v1.4.1...v1.4.2) (2023-10-08)

### Bug Fixes

- **RefreshMechanism error:** refres & focus card ([e3bffe1](https://github.com/oflg/Tidme/commit/e3bffe1e078ef032c2502f9b4c244faad654e755))

## [1.4.1](https://github.com/oflg/Tidme/compare/v1.4.0...v1.4.1) (2023-10-08)

### Bug Fixes

- **uncaught typeError:** can‘t read property ([c6d8884](https://github.com/oflg/Tidme/commit/c6d888416fde2c671b91a56ea1577c3aae8a50e8))

# [1.4.0](https://github.com/oflg/Tidme/compare/v1.3.0...v1.4.0) (2023-10-07)

### Bug Fixes

- **shortcuts:** auto focus ([569dce5](https://github.com/oflg/Tidme/commit/569dce5d15df61cc6b652178db1ed8d05070f419))

### Features

- **study:** all cards in deck ([cea2d42](https://github.com/oflg/Tidme/commit/cea2d429cd86ded781cbfdace7a35abde1ea4db0))

# [1.3.0](https://github.com/oflg/Tidme/compare/v1.2.0...v1.3.0) (2023-10-06)

### Features

- **get decks:** open plugin modal ([3440617](https://github.com/oflg/Tidme/commit/3440617ff8dc518b00c0152bfd54407086e97e6a))

# [1.2.0](https://github.com/oflg/Tidme/compare/v1.1.6...v1.2.0) (2023-10-06)

### Bug Fixes

- **performance:** kale ([f27c816](https://github.com/oflg/Tidme/commit/f27c8166a2b99ec65629a25c87c5d080e2bdd976))

### Features

- **type question:** add ([8525945](https://github.com/oflg/Tidme/commit/85259450f6e74535f5950c194601bf68d603e7ca))

## [1.1.6](https://github.com/oflg/Tidme/compare/v1.1.5...v1.1.6) (2023-10-05)

### Bug Fixes

- **shortcuts:** duplicate info ([6cf41b1](https://github.com/oflg/Tidme/commit/6cf41b1bb1f36767fa530704561894c67ce1d981))

## [1.1.5](https://github.com/oflg/Tidme/compare/v1.1.4...v1.1.5) (2023-09-23)

### Bug Fixes

- **hide title:** wrong title color ([b7ef495](https://github.com/oflg/Tidme/commit/b7ef49539f084f984d490b5314f6d9f146411a36))

## [1.1.4](https://github.com/oflg/Tidme/compare/v1.1.3...v1.1.4) (2023-09-23)

### Bug Fixes

- **get shared decks:** wrong url ([56e20ca](https://github.com/oflg/Tidme/commit/56e20ca8104868a873991f01d85d9d5fa7a0d0b9))

## [1.1.3](https://github.com/oflg/Tidme/compare/v1.1.2...v1.1.3) (2023-09-22)

### Bug Fixes

- **options:** wrong text ([36d4ced](https://github.com/oflg/Tidme/commit/36d4ced4623f2ca5761c20ba8a729901f985876f))

## [1.1.2](https://github.com/oflg/Tidme/compare/v1.1.1...v1.1.2) (2023-09-22)

### Bug Fixes

- **options:** some text missing ([edc5475](https://github.com/oflg/Tidme/commit/edc5475bb71a06c8dc8dc18662122d6af3e16028))

## [1.1.1](https://github.com/oflg/Tidme/compare/v1.1.0...v1.1.1) (2023-09-22)

### Bug Fixes

- **order:** not working ([b265f63](https://github.com/oflg/Tidme/commit/b265f63808c338eb84746ebe520adde0f98ee74a))

# [1.1.0](https://github.com/oflg/Tidme/compare/v1.0.0...v1.1.0) (2023-09-21)

### Bug Fixes

- **notify:** no translation ([aca50f7](https://github.com/oflg/Tidme/commit/aca50f74a8c5716dae37e3704364ce584c170bc9))

### Features

- **timestamp:** same with tw ([cbef9b0](https://github.com/oflg/Tidme/commit/cbef9b0dce03699f7f04cd0d4014a70879842202))

# 1.0.0 (2023-09-21)

### Bug Fixes

- **get shared:** wrong url ([c50f466](https://github.com/oflg/Tidme/commit/c50f466c6dd39a9674dfe9660e9ee43d9b19411a))
