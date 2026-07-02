# 交互组件（Canvas Widgets）

交互组件（Widget）是锚定在画板上的状态化微型设计工具。它不同于方法模板：方法模板
（CanvasIR Template）负责承载静态设计方法脚手架；Widget 负责承载原生画板节点无法完成的
动态设计动作，例如输入、提交请求、投票、评分、排序、筛选、实时计算、结果可视化或
结构化输出。

本文是 Widget 合约：什么是 Widget，何时应该创建 Widget，agent 写什么，运行时保证什么，
以及 Widget 数据如何在学生、画板和 agent 之间流动。本文和内置模板只提供规则与示例；
具体 Widget 由智能体根据当前项目、阶段、画板证据和用户目标自行决定、生成或组合。

设计目标：只要 agent 能生成普通 HTML fragment，就能可靠生成 Widget。透明背景、intrinsic
sizing、等比例缩放、状态持久化等 Widget 专属问题都由运行时负责，而不是由生成 HTML 自己
解决。

## 1. Widget 是什么，不是什么

Widget 是画板原生的交互对象，也可以表现为一个微型 App：

- 渲染为沙箱化透明 iframe，并锚定在一个 tldraw placeholder shape 上
  （`meta.vd_kind = "html_component"`）。
- 当画布缩放或用户调整锚点 shape 尺寸时，像图片一样等比例缩放，不重新排版。
- 拥有实例级 JSON `state`；state 持久化在 snapshot 中，学生可通过交互写入，
  agent 可通过命令读取和更新。
- 可以通过 `vd.emit` 提交结构化请求或结果。Widget 不直接调用智能体；智能体在下一轮读取
  widget output / feedback / state 后处理请求，并用 `update_widget` 回写结果，或把稳定结果
  物化为画板 artifact。

边界规则（借鉴 FigJam：不允许把 sticky / shape / connector 嵌进 widget）：Widget 不应该吞掉
本该作为画板原生节点存在的内容。词云 Widget 可以读取 sticky notes；但头脑风暴本身仍应作为
stickies 留在画板上。当 Widget 产出持久 artifact（如最终调色板、最终排序）时，优先把结果
物化为画板原生节点，让 Widget 保持可丢弃。

## 2. 什么时候创建 Widget（触发 Rubric）

只有至少满足以下条件之一时才创建 Widget：

1. **交互会产生需要留在画板上的状态**，例如投票、选择、评分。
2. **呈现依赖实时计算**，例如加权矩阵、参数模拟器、计算器。
3. **画板内容需要交互式聚合**，例如对 sticky notes 生成可 hover / filter 的词云或图表。
   静态图表应优先用原生 shape 绘制。
4. **agent 需要结构化、机器可读的输入**，例如 rubric 评分、结构化投票。
5. **交互形态超出原生画板能力**，例如拖拽排序、翻卡、滑杆、前后对比。
6. **用户需要向智能体提交一个带结构的数据请求**，例如 persona 生成、竞品调研、海报方向
   生成、主题分析或设计检查；Widget 负责收集输入和保存请求状态，智能体负责异步处理。

否则使用 CanvasIR 原生节点或方法模板。静态说明、可自由编辑的材料，以及学生应该移动、连接、
编辑的内容，都属于原生画板节点。

## 项目化 Widget 工程协议

以下约束用于让后续智能体稳定理解 Widget 请求、画板变化和用户反馈。它们不是固定组件菜单，
而是项目化 Widget 的生成和读取协议。

- **主输入不在 Widget 内完成**：复杂材料来自用户对话、文件上传或已有画板内容；Widget 只做
  轻量确认、点选、筛选、参数调整、补充一句话和结构化提交。
- **请求型 Widget 同时写 state 和 emit event**：用户点击提交时，Widget 应先
  `vd.state.set({ status: "submitted", request_id, request })`，再
  `vd.emit("*_requested", { request_id, request })`。state 是持续状态，emit 是给智能体的
  显式处理信号。
- **智能体读取聚合上下文**：`agent-context` 会暴露 `widget_instances`、
  `pending_widget_outputs`、`pending_widget_requests`、`open_feedback`、
  `open_region_annotations`、`recent_events` 和 `edit_summary`。智能体应优先处理这些字段中
  与当前用户目标相关的变化。
- **智能体回写状态**：处理请求前先用 `update_widget` 把 Widget 置为
  `agent_processing`；完成后回写 `result_ready`，材料不足或失败时回写 `error`。
- **稳定结果要物化**：被用户确认的稳定结果应物化为 CanvasIR 原生画板内容，例如 Persona
  方法模板、洞察 sticky、竞品墙、海报 artifact、决策记录或关系图。Widget 可以保留为控制台，
  但不应成为长期设计知识的唯一载体。
- **Widget 不决定专家介入**：Widget 只提供状态和事件。专家是否、何时、以什么身份介入，
  由智能体根据当前阶段、风险、用户意图和专家路由自行判断。

推荐项目化 Widget state：

```json
{
  "status": "idle|drafting|submitted|agent_processing|result_ready|user_reviewing|accepted|rejected|needs_revision|materialized|error",
  "request_id": "string|null",
  "request": {},
  "result": {},
  "selected_items": [],
  "user_notes": "",
  "error": null,
  "materialized_shape_ids": []
}
```

推荐事件命名：

```text
*_requested              用户请求智能体处理
*_updated                本地状态或参数变化
*_selected               用户选择某个项
*_accepted               用户确认某个结果
*_materialize_requested  用户请求物化到画板
```

## 3. 三层生成策略

稳定性来自缩小生成面，优先级如下：

- **Tier 1 — 参数化交互组件模板**：agent 只发送
  `{ "template_id": "...", "params": {...} }`。`params` 按该交互组件模板的
  `params_schema` 校验；HTML 与交互逻辑来自内置模板。生成自由 HTML 前，必须先检查
  `GET /api/canvas-widget-templates`（也会出现在 agent-context 中）。
- **Tier 2 — 交互组件模板 + 内容覆盖**：仍走 `template_id` + `params`，但由 agent
  提供文案、选项、标签或初始状态。交互组件模板可以接收带内容的参数。
- **Tier 3 — 自由 HTML fragment**：只用于现有交互组件模板无法覆盖的形态。agent 写
  HTML *fragment*（不能包含 `<html>`、`<head>`、`<body>`），并提供
  state / schema / sizing metadata；挂载前必须通过校验管线。

注意：这里的“交互组件模板”只是 Widget 的参数化外壳，不是方法模板。方法模板只指
CanvasIR Template。

示例不是限制。`vote`、`rubric`、`word_cloud`、`bar_chart`、`timer` 等内置模板是通用
交互原语；项目需要更具体的工具时，智能体应生成自由 HTML fragment，并遵守本合约。
Widget 示例模式见 [widget-examples.md](widget-examples.md)。示例用于说明生成思路，不是固定
组件菜单。

## 4. Widget 规格（agent 写什么）

```json
{
  "op": "add_widget",
  "id": "vote-directions",
  "stage": "develop",
  "template_id": "vote",
  "params": {
    "question": "哪个视觉方向继续深化？",
    "options": ["方向 A：极简", "方向 B：拟物", "方向 C：编辑风"]
  }
}
```

Tier 3 形式：

```json
{
  "op": "add_widget",
  "id": "pricing-simulator",
  "stage": "develop",
  "title": "定价模拟器",
  "description": "拖动价格滑块查看收入曲线",
  "html": "<section class=\"sim\">...fragment only...</section>",
  "state": { "price": 49 },
  "output_schema": {
    "type": "object",
    "properties": {
      "event_type": { "enum": ["price_committed"] },
      "price": { "type": "number" }
    }
  },
  "sizing": { "mode": "content_intrinsic", "min_width": 280, "max_width": 720 }
}
```

标准 Widget 字段如下。除 `template_id` / `html` 必须二选一外，其余字段可选：

| 字段 | 含义 |
| --- | --- |
| `template_id` + `params` | Tier 1/2 的交互组件模板实例化 |
| `html` | Tier 3 的 HTML fragment；不能包含 `<html>/<head>/<body>` |
| `title`, `description` | 展示文字与 semantic index 文本 |
| `state` | 实例级初始 JSON state |
| `input_schema` | agent 可 patch 的 state 结构说明（文档级） |
| `output_schema` | `vd.emit` payload 结构；运行时会校验 emit |
| `sizing` | `{ mode, min_width, max_width, min_height, max_height }` |

`update_widget` patches an existing instance:

```json
{ "op": "update_widget", "id": "vote-directions", "state_patch": { "closed": true } }
{ "op": "update_widget", "id": "pricing-simulator", "html": "<section>v2...</section>" }
```

`state_patch` 只 shallow-merge 顶层 keys。替换 `html` 会递增 `widget_version`，
但保留 `state`（state 与 HTML 按设计分开存储）。旧的 `add_html_component` 仍作为
原始 Tier 3 路径的 alias 保留。

## 5. 运行时组装合约（agent 不需要写什么）

At render time the runtime assembles the final iframe document:

```text
final document =
  reset CSS        html,body { background: transparent; margin: 0 }
+ design tokens    CSS variables from the project design spec
+ widget prelude   window.__VD_WIDGET__ = { instance, state, output_schema, sizing }
+ widget root      <div id="vd-widget-root" style="width:fit-content">FRAGMENT</div>
+ bridge script    window.vd API, ResizeObserver, feedback, error trap
```

agent 可以依赖以下保证，不要在 HTML 里重复实现：

- 背景透明；不要给 `html/body` 涂底色，只样式化自己的组件卡片。
- intrinsic size 会自动从 `#vd-widget-root` 测量；不要给根元素写固定像素宽高。
- 缩放由外部承担；Widget HTML 始终按 intrinsic size 渲染。
- `window.vd` 始终存在；脚本可在 `DOMContentLoaded` 后使用它。

## 6. `window.vd` API 与消息协议

```js
vd.instance                 // { component_id, shape_id, workspace_id, title }
vd.state.get()              // current state object (deep copy)
vd.state.set(patch)         // shallow-merge patch -> host persists -> re-broadcast
vd.state.subscribe(fn)      // fn(state, { actor }) on external updates (agent writes)
vd.emit(type, payload)      // structured output event, validated vs output_schema
```

postMessage protocol (iframe -> host):

```text
vd:widget:ready        { }
vd:widget:size         { w, h }                    intrinsic content size
vd:widget:state-patch  { patch, state }            user interaction wrote state
vd:widget:event        { event_type, payload }     vd.emit output
vd:widget:error        { message }                 uncaught script error
```

Host -> iframe:

```text
vd:widget:state        { state, actor }            external (agent) state update
vd:tokens-update       { css }                     design token refresh
```

反馈属性（`data-vd-feedback-action`）在 Widget 内仍然有效，并路由到既有 feedback
管线。

## 7. 尺寸与缩放模型

每个 Widget 实例都会记录：

- `intrinsic`：内容自然尺寸，单位为 CSS px，由 bridge 上报并存入
  `meta.vd_intrinsic_size`。
- `scale`：`anchor_shape.w / intrinsic.w`。

渲染时，iframe 以 `intrinsic` 尺寸布局，并用 `scale × canvas_zoom` 做 transform，
origin 为左上角。因此无论画布缩放，还是用户调整锚点 shape，内容都像图片一样等比例缩放。
编辑结束后，锚点 shape 的高度会吸附到 `w × intrinsic.h / intrinsic.w`，以维持比例。

当内容变大（intrinsic size 改变）时，host 会把锚点 shape 调整为 `intrinsic × scale`，
并受 `sizing` min/max 限制，同时保持 scale 稳定。

### 选择与拖拽

Widget 的行为应像画板对象，接近 FigJam 的使用方式：

- **边缘环**：Widget 边缘有一圈很细的可抓取区域（host 侧覆盖在虚线 placeholder
  边框上），点击选择锚点 shape，拖动移动它。
- **背景区**：在 Widget 内部非交互背景区域 pointerdown（Widget root、fragment root
  自身的 padding / gaps，或 `[data-vd-drag-handle]` 内元素）也会选择并拖拽。bridge
  转发 iframe px 单位的 `vd:widget:drag {phase, dx, dy}`；host 用
  `shape.w / intrinsic.w` 换算为 page units，与缩放无关。
- **排除拖拽的区域**：button、link、input、select、textarea、label、form、
  `[contenteditable]`、feedback 元素和嵌套文本内容。这些区域保留组件内交互、文本选择
  与标注能力。
- 没有移动的 click 是普通选择。Widget fragment 可用 `data-vd-drag-handle` 把额外区域
  加入可拖拽范围。

## 8. 状态模型与数据流

State 是一个 JSON object，存储在锚点 shape 的 `meta.vd_widget_state` 中，并镜像到
`semantic_index.widget_instances[]`。合并语义：顶层 key shallow merge；每个 key
last-write-wins；同时写入 `vd_state_version`（单调递增计数）和 `vd_state_actor`
（`user` | `agent`）。

`vd_state_version` / `vd_widget_version` 在两个写入方向都生效：CanvasIR 重新编译前会
先从 snapshot hydrate 更新的 state，再生成 shapes；客户端 full-snapshot PUT 时会保留
服务器端更新的 widget state / html（见 canvas-workspace-model.md 的 Snapshot Write
Protection）。因此，过期客户端既不能删除 agent 写入的 Widget，也不能回滚它的 state。

```text
user loop:   interaction -> vd.state.set(patch) -> host merges into shape meta
             -> debounced snapshot save -> semantic_index.widget_instances
             -> agent reads via agent-context next turn

agent loop:  update_widget command -> server merges state in IR + snapshot
             -> project canvas update event -> host pushes vd:widget:state into
             live iframes -> vd.state.subscribe fires

output loop: vd.emit(type, payload) -> validated vs output_schema ->
             canvas feedback entry (kind widget_output) + canvas event ->
             agent handles it like any structured feedback
```

路由规则：连续状态变化只进入 snapshot；显式 `vd.emit` 事件进入 feedback pool。这样可以
避免 feedback pool 被交互噪音淹没。

## 9. 校验与修复阶梯

每个 Widget 挂载前都要通过校验。同一套管线用于 `add_widget` / `update_widget`、
`POST /api/canvas-widgets/validate`（dry run），并在浏览器中检查挂载结果。

静态检查（服务器端，接受前）：

- fragment 可解析；不能包含 `<html>/<head>/<body>`（自动修复：unwrap body content）。
- document root 不能绘制不透明背景。
- inline `<script>` 内容必须通过语法检查（`new Function`）。
- 不允许外部 script / frame sources；外部图片允许但给 warning。
- `sizing` 受全局边界限制（min 160×80，max 1200×900）；HTML 有体积上限。

挂载检查（浏览器端，渲染后；记录为实例的 `widget_review`）：

- iframe 已挂载，bridge 已发送 `vd:widget:ready`。
- intrinsic size 已上报，在边界内且非退化。
- 前几秒没有 `vd:widget:error`。

失败时的修复阶梯：

1. 自动修复（unwrap wrappers、移除禁用样式、clamp sizing）。
2. 带结构化错误拒绝，让 agent 可重新生成一次。
3. 降级为静态卡片（title + description + 通用 feedback buttons）：Widget 回落到
   plain-HTML 能力底线，不阻塞协作。

`widget_review` record (stored in `meta.vd_widget_review`, surfaced through
`semantic_index.widget_instances[].review`):

```json
{
  "id": "widget_review_...",
  "status": "passed|needs_adjustment|failed",
  "checks": { "static_ok": true, "mounted": true, "size_reported": true, "script_error_count": 0 },
  "errors": [],
  "warnings": [],
  "repairs": ["unwrapped_body"],
  "reviewed_at": "ISO timestamp"
}
```

## 10. 命令与端点

```text
GET  /api/canvas-widget-templates                 交互组件模板目录 + params_schema
POST /api/canvas-widgets/validate                 dry-run 一个 Widget 规格
POST /api/canvas-workspaces/{ID}/commands         add_widget / update_widget ops
GET  /api/canvas-workspaces/{ID}/agent-context    包含 widget_templates 和带 state 的
                                                  widget_instances
```

## 11. 内置交互组件模板目录（Tier 1）

| id | 用途 | 关键 params |
| --- | --- | --- |
| `vote` | 点投选项，实时计票 | `question`, `options[]`, `max_votes_per_user` |
| `alignment_scale` | 1–5 同意度 / 信心量表，显示平均值 | `statement`, `min_label`, `max_label` |
| `rubric` | criteria × 1–5 评分，提交时 emit scores | `title`, `criteria[]` |
| `bar_chart` | 比较数量 / 数值，支持 hover highlight | `title`, `data[{label,value}]`, `unit` |
| `word_cloud` | 加权词云，点击 emit term | `title`, `words[{text,weight}]` |
| `timer` | 工作坊倒计时，支持 start / pause / reset | `label`, `duration_sec` |

交互组件模板可以被 seed：带内容的 params（`options`、`criteria`、`data`、`words`）可以
接收 agent 从画板内容中分析出的结果。

## 12. 安全与版本

- Widget iframe 以 sandbox 运行，且**不带** `allow-same-origin`：opaque origin，
  不能访问 host DOM 或 storage；postMessage bridge 是唯一通道。
- 不允许外部 scripts。网络访问不属于 v1 合约。
- 替换 HTML 时 `vd_widget_version` 递增；前一个 HTML 保存在 `vd_html_prev` 中，支持
  单步回滚。State 会跨 HTML 更新保留。

## 13. 渲染器说明

v1 renderer 是锚定在 placeholder shape 上的 viewport overlay。上面的合约（spec、
vd API、尺寸 / 缩放、state）与具体渲染器无关；未来迁移到自定义 tldraw shape
（`HTMLContainer`）时，只改变锚定 / 渲染内部实现。这是获得原生选择、z-order 和导出行为的
计划路径。
