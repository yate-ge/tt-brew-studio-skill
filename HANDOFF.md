# HANDOFF — TT 设计精酿 Studio（2026-07-03）

历史交接备注。**当前开发状态以 `git status`、`README`、`SKILL.md` 和 `references/` 的
最新内容为准；本文件只保留当时的设计决策脉络。**

## 一句话现状

视觉脚手架的核心方向已确定：脚手架=专家思考框架、内层给坐标、外层横向、
画布只放"说明+提问+留白"、样式字段、框架级画布图库。专家坝到脚手架归属连线和使用说明浮层
已经进入实现；后续开发仍应以当前代码和验收用例为准。

## Git / 运行

- 当前分支与工作区状态请以 `git branch --show-current` 和 `git status --short` 为准。
- 起服务：`node scripts/start.js --data-dir .visual-delivery --lang zh` → `localhost:3847/canvas`。
- 改前端后 `start.js` 会重建；**浏览器常缓存旧 bundle → 硬刷新 `ctrl+shift+r`**。改后端
  （`templates/server/lib/canvas-ir.js`）要重启服务。

## 权威规格（先读这三份）

1. `references/case-playable-city.md` — **权威 case**（小雷《老年人可玩城市》Discover，4 叙事）。
2. `references/collaboration-model.md` — 协同机制：专家加内容/批注、Widget 四类、**§3.1 配色两套**、
   **§7 待建亮点表（A 已补归属连线；剩余主要是 E/F/G）**。
3. `examples/test-usecase-playable-city.md` — 逐轮交互测试用例，验收点标 ✅当前可测 / 🔨待建。
   另：`references/scaffold-gallery.md`（框架级画布配方）、`canvas-templates.md §4.5/§6`（坐标+规范）。

## 已定决策（别再纠结）

- **专家 5 位**：马谨(方法论锚点·问题拆解·红批注) / 刘洋(城市数据·行为观察·黄批注) /
  魏佛兰(参与式观察·紫批注) / 吴端(空间线索·黄批注) / 王受之(文献·词云叙事2)。
- **脚手架 = 专家思考框架**：内层智能体给坐标画母型形状，外层后端横向铺开占满阶段高度。
  画布只放"一句话说明(xl sans 标题 + 灰色 s '你要做什么') + 每分区一句引导问题 + 留白"。
  **画布上无署名、无 AI 元信息**；scaffold.root frame 的可见名称使用脚手架 title，便于选择和导航。
- **配色两套，不能混**（详见 collaboration-model §3.1）：
  - **关联颜色**：**专家关联=黄 / 用户目标=紫**，**只描边、极淡填充、
    不覆盖内容**。区域批注工具=紫框 + 高透明度紫填充（**已做**：`STYLES.highlightOverlay`/
    `regionAnnotationOverlay` fill 已降到 .04–.05）。
- **归属 = 连线到左侧专家 bar，不在画布上放头像/署名**（最新方向，关键！见下 A）。

## 剩余工作：亮点 E / F / G（前端为主）

### A — 脚手架归属"连线到左侧专家 bar"（已实现）
- **已做**：不在 frame 上放头像；hover/选中左侧专家 bar 里的某专家 → 画虚线连到该专家的
  脚手架 frame（并高亮 frame），同时显示 `vd_usage_note` 使用说明浮层。
- **⚠️ 我先写过 on-canvas 头像 chip 版本，用户否决，已 `git checkout` 回退**。别再走画布头像。
- **数据已就绪**：scaffold frame 的 `meta.vd_method_source.experts`（`[{name,domain,virtual}]`）
  和 `meta.vd_usage_note`。
- **可直接复用**：
  - `FeedbackConnectorOverlay`（CanvasWorkspace.jsx:2635）：从一个 source DOM 元素画虚线贝塞尔到
    canvas shape 矩形。就是你要的"左侧元素 → 画布 frame"连线。
  - `ExpertOpinionOverviewOverlay`（:2693）：把一组 item 映射成多条 FeedbackConnectorOverlay，
    source 是某个 DOM 元素（现在用 `overviewButtonRef`）。
  - `isAgentScaffoldRootShape(shape)`（:193）判 scaffold root；`getShapePageBounds` + 
    `pagePointToViewport`（:718/:729）算 frame 的视口矩形；`normalizeExpertCandidate`（:357）名字→
    {avatar,color,domain}；`DESIGN_EXPERTS`（:80）。
  - `refreshHtmlComponents`（:3742）在相机变化时重算 overlay 列表——把 scaffold→expert 的连线数据
    也在这里刷新。
- **实现位置**：`scaffoldAttributionItemsFromEditor` 抽取 `meta.vd_method_source.experts` 和 `vd_usage_note`；
  `ActiveExpertsDock` 给每个专家按钮注册 ref；`focusedScaffoldAttributionItems` 根据 hover/selected 专家
  过滤后复用 `FeedbackConnectorOverlay`，说明浮层由 `feedbackConnectorNote` 渲染。

### E — 左侧专家栏统一承载专家意见（简化版，基本可）
- **目标**（叙事3）：专家智能体的批注不再额外生成画布批注卡或 floating UI；统一进入左侧专家栏。
  左侧专家头像显示意见数量；点头像打开专家意见流；悬停/选中某条意见时复用连线指向目标内容。
- **现状**：`author=expert & direction=expert_to_content` 的 feedback 已进入专家意见栏，已有数量 badge、
  专家筛选、意见 hover/click 连线。
- **不要做**：不要再实现“画布彩色批注卡 / 右下角头像 / 卡片 ✅”这一层额外画布 UI。

### F — 左侧专家可追溯档案（未实现）
- 调后端 `POST /feedback/:fid/status`（已存在，`api.js`）标 resolved → 该意见在左侧专家记录里标为
  已回应 / 已解决。点左侧专家头像 → 展开该专家档案：原批注 / 小雷修改 / 修改时间 / 专家二次反馈——数据都在
  `feedback.thread[]`（有 role/name/text/at）+ resolve 状态里。做一个档案面板即可。

### G — zoom-out Discover 整理视图（未实现）
- 一个"整理/收束"动作：zoomToFit + 汇总面板（已完成 Frame / 已回应批注 / 高频关键词 / 洞察 /
  机会）。可轻量实现（先 zoomToFit + 一个聚合侧栏）。

## 文档对齐待办（小，随手做）

- `design-experts.md:9,24` 和 `design-mentor-protocol.md:48,237` 写"最多 5 位"——已定 5 位，
  措辞可保留（不用再纠结 8）。
- `design-mentor-protocol.md §5` 继续保持"专家评论统一入左侧专家栏"，不要补额外画布批注 UI。
- `widget-examples.md` 标注"Widget 四类"框架，点名 case 两类（词云=可视化型、HMW=请求型）。

## 关键代码地图（`templates/ui/src/pages/CanvasWorkspace.jsx`，约 5000+ 行）

- **overlay 管线**：`pagePointToViewport`(:729) 页→视口坐标；`refreshHtmlComponents`(:3742) 相机变化
  重算并 set 各 overlay state；渲染层 `htmlOverlayLayer`（搜 `ref={overlayLayerRef}`，约 :5934）。
- **专家**：`DESIGN_EXPERTS`(:80)、`ExpertAvatar`(:2126)、`ActiveExpertsDock`(:2143)、
  `normalizeExpertCandidate`(:357)、`collectDiscussionExperts`(:376)、`selectedExpertName`(:3778)。
- **连线**：`FeedbackConnectorOverlay`(:2635)、`ExpertOpinionOverviewOverlay`(:2693)。
- **scaffold 判定**：`isAgentScaffoldRootShape`(:193)。frame label 压掉在
  `templates/server/lib/canvas-ir.js` 的 `createFrameRecord`。
- **样式**：`STYLES.highlightOverlay`（专家黄/用户紫，fill .04）、`regionAnnotationOverlay`
  （紫框 .86 / fill .05）、`pendingChangeOverlay`（fill .04）。
- **后端 feedback**：`templates/server/routes/api.js` — `POST /feedback`(:1649)、
  `/feedback/:fid/reply`(:1715)、`/feedback/:fid/status`。
- **节点样式字段**（本次新增）：`add_node` 支持 `text_size/font/text_align/fill/dash`
  （canvas-ir.js `normalizeIRNode` + `createTextRecord`/`createGeoRecord`）。

## Gotchas

- **另一位在做** "专家意见总览连线" WIP（`expertBarOverviewButton` / `ExpertOpinionOverviewOverlay`
  / `expertBarOverviewButtonRef`），就在同一文件——A/E 的连线尽量复用它，别重复造轮子、别冲突。
- 硬刷新解决旧 bundle 缓存（否则会看到 `X is not a function` 之类的旧报错）。
- 布局：外层横向单排、阶段横向加宽（`layoutStageScaffolds` in canvas-ir.js）；内层坐标不被重排。

## 如何跑现有 example / 测试

```bash
node scripts/start.js --data-dir .visual-delivery --lang zh
node examples/gallery-demo.mjs         # 3 个框架级观感样板（设计画布/心形/放射）
node examples/case-walk.mjs setup      # 5 专家小雷 case
node examples/case-walk.mjs scene1     # …scene2 / scene3 / scene4
# 打开 localhost:3847/canvas，逐轮验收见 examples/test-usecase-playable-city.md
```
