# CanvasIR 与方法模板

CanvasIR 是 Visual Delivery 面向 agent 的中间表达。agent 用它描述设计方法脚手架的语义层级
和布局，不直接手写 tldraw snapshot records。

在本 skill 中，**CanvasIR Template 就是方法模板的运行时表达**。设计方法库中的静态脚手架
（如 Persona、用户旅程、HMW、服务蓝图）应落地为 CanvasIR Template 或 CanvasIR commands。
不要把 CanvasIR Template 理解成独立于设计方法之外的通用模板系统，也不要把它暴露成学生
直接选择的方法市场。学生看见的是 agent 按项目语境放到画布上的具体视觉脚手架。

## 核心规则

Ordinary agents should use CanvasIR or canvas commands. Direct writes to
`snapshot.document.store` are reserved for runtime debugging, migration, or
front-end editor persistence.

agent 在画板上的角色是导师，负责提供视觉思考脚手架。agent 应表达学习 / 设计意图：
问题、section、slot、种子想法、取舍点和下一步讨论区。运行时负责稳定执行细节：包裹新生成
结构、保留学生亲手写下的画板痕迹、从左上角放置内容、让容器随内容增长，并在缩放时保持
方法模板几何稳定。

```text
agent 意图
  -> CanvasIR / commands
  -> server compiler
  -> valid tldraw snapshot + semantic_index
  -> canvas event
```

## CanvasIR 结构

```json
{
  "version": 1,
  "board": {
    "title": "AI 桌面机器人商业模式画布",
    "purpose": "评估产品路线和商业可行性",
    "reading_order": "left_to_right"
  },
  "layout_policy": {
    "flow": "top_left",
    "container_sizing": "content_fit",
    "wrap_new_generation": true,
    "preserve_user_content": true
  },
  "grid": {
    "cols": 12,
    "cellWidth": 168,
    "rowHeight": 104,
    "gap": 24,
    "padding": 48
  },
  "nodes": [
    {
      "id": "business_model_canvas",
      "kind": "section",
      "title": "商业模式画布",
      "role": "pattern.business_model_canvas",
      "area": { "col": 1, "row": 1, "colSpan": 12, "rowSpan": 7 }
    },
    {
      "id": "value_propositions",
      "kind": "slot",
      "title": "价值主张",
      "role": "bmc.value_propositions",
      "parent": "business_model_canvas",
      "visible": true,
      "area": { "col": 5, "row": 1, "colSpan": 2, "rowSpan": 4 }
    },
    {
      "id": "vp-1",
      "kind": "sticky",
      "title": "可见 AI presence",
      "role": "hypothesis",
      "parent": "value_propositions",
      "content": "用实体存在感降低 AI 工具的抽象感"
    }
  ],
  "relationships": [
    {
      "from": "value_propositions",
      "to": "customer_segments",
      "type": "fit",
      "label": "价值匹配"
    }
  ]
}
```

## 层级

CanvasIR 层级是显式且稳定的：

```text
board
  section
    slot
      text / sticky / shape / image / widget
```

用 `parent` 把节点放进 section 或 slot。compiler 会把可见容器节点映射为 tldraw frame
shapes，并把同样的包含关系记录到 `semantic_index.relationships`。

容器类型：

- `section`: large navigational region, compiled to a tldraw frame.
- `slot`: semantic area inside a pattern, visible by default as a nested frame.
- `cluster`: loose group of related nodes, visible as a frame when needed.
- `pattern`: reusable top-level thinking construct.

内容类型：每个 kind 映射到一个 tldraw 原生工具。按“意图”选 kind，运行时映射到对应原生
shape —— 不要用一种形状（实心矩形）承载文字、想法和图示节点。

- `text` → tldraw **文字** shape（无框、无填充）：结构性说明、标题、tips、frame 内说明、
  问题、caption、分析。**不要为了摆放文字而画一个形状当文本框。**
- `sticky` → tldraw **便签** `note`：一条参与者风格的想法或假设，一张便签只放一个想法。
- `shape` → tldraw **形状** `geo`，**仅用于 diagram**，形状本身承载语义：矩形 = 流程步骤，
  菱形 = 决策，椭圆 = 起止 / 状态，云 = 模糊区。用可选 `shape_type` 指定，未指定按 `role`
  推断。不要拿 `geo` 当文本底板或容器。
- `connector` → tldraw **箭头 / 连线** `arrow` / `line`：通过 `relationships` 声明 `from` /
  `to`，编译为真实连线并绑定到两端 shape，带可选 `label`，同时记录进
  `semantic_index.relationships`。用于 diagram 的依赖、流程和证据流向。
- `image` → tldraw **图片** `image` shape + `asset`：仅两种用途——**智能体 artifact 产出**
  （海报 / 版式 / 视觉稿 / UI 稿等最终视觉产物，由智能体本体生成，`meta.vd_artifact = true`，
  署名 `AI 草稿，待确认`）或 **图片资料**（参考图 / 素材 / 场域照片 / 已有材料，
  `meta.vd_reference_material = true`，作为输入不带专家署名，默认落入 Discover 阶段）。
  两者都需要 `alt_text`。
- `html_component`：嵌入式交互组件（`widget` 可作为 alias）；应放在某个 slot 或 section
  内。通过 `add_widget` 创建，不要手写 node meta。合约见：[canvas-widgets.md](canvas-widgets.md)。

标注工具（对象批注、区域批注矩形、紫色标注箭头）是用户表达反馈的专属交互，agent 永不用它
在画布上作图；专家评审以 annotation 数据形式发布（`author = 专家名`），是对反馈的回应，
不是用标注工具画东西。

### 节点样式字段（可选）

`text` 和 `shape` 节点可带以下可选样式字段（`add_node` 直接传，或写在 IR 节点上），用来做出
框架级画布观感（见 canvas-templates.md §4.5 / §6）：

- `text_size`：`s` / `m` / `l` / `xl`（不传时按 bounds 自动 s/m）。大标题 `xl`、引导问题 `s`。
- `font`：`draw` / `sans` / `serif` / `mono`（默认 `draw`）。正式画布标题常用 `sans`。
- `text_align`：`start` / `middle` / `end`（text 映射 textAlign，geo 映射 align）。
- `fill`（geo）：`none` / `semi` / `solid` / `pattern`（默认 `solid`）。`none` = 只描边不填充，
  用于放射圈、双钻圆、系统椭圆等**包围形**，不遮住内部内容。
- `dash`（geo）：`draw` / `solid` / `dashed` / `dotted`（默认 `draw`）。

## Grid Layout

agent 用 grid areas 描述布局，而不是直接写 pixels：

```json
{ "col": 1, "row": 1, "colSpan": 4, "rowSpan": 3 }
```

area 相对于节点父级 grid。顶层 section 使用 board grid；section 内部 slot 默认使用该 section
派生出的 grid，除非自己定义 `grid`。

Nodes may also specify `bounds` when a command or template needs stable
geometry. Child `bounds` are interpreted relative to the parent container's
top-left corner; root `bounds` are page coordinates.

**脚手架内部布局由 agent 用 `bounds` 显式设计**（见 canvas-templates.md §4.5）：给每个内部
子节点相对根 frame 左上角的 `{x,y,w,h}`，画出该框架的形状（时间轴横排、网格、放射…）。
编译器**尊重这些坐标，不再对脚手架内部自动流式重排**，因此不同框架不会被挤成雷同竖条。
只有当子节点完全没给 `bounds`/`area` 时，才退化为自动流（兜底）。

**外层（阶段带内的脚手架摆放）由后端硬写死**：每个阶段是一排**横向**脚手架，从左到右排；
脚手架宽度按其内部内容自适应，高度**占满阶段可用高度**（多出的空白 = 学生工作区）；阶段
随脚手架增多**向右加宽**（单排不换行），四个阶段带纵向堆叠不重叠。过大的脚手架会按阶段
可用高度和最大宽度**等比例缩小**；root `meta.vd_scaffold_scale` / `meta.vd_template_scale` 可给
建议缩放，但仍受可用区域约束。agent 不需要给脚手架根 frame 的外层坐标——只设计内部。

`scaffold.root` frame 的可见名称使用节点 `title`，便于画布选择、导航和专家归属定位。

When a content node has no `area` and no `bounds`, the compiler auto-places it
inside the parent from the top-left with a readable size. Containers grow to fit
their children 而不是缩小内容或把子节点平均分散到 frame 中。

当生成的 CanvasIR 有多个 root nodes 时，compiler 会把它们包进一个
`role = "scaffold.root"` 的 `section`。如果一个成熟方法模板已经有自己的 root frame，则不再
二次包裹。

视觉状态语义由编译器和前端共同维护：方法模板 / 生成脚手架只把最外层
`scaffold.root` frame 设为黄色边框，内部 slot 和内容保持各自语义颜色；`html_component`
Widget 由 agent 创建时为黄色正常框。用户在 Widget 内输入或提交后写入 `pending_feedback`，
Widget 转为紫色待处理框；显式 `vd.emit` 进入“我的反馈”并按紫色反馈主题呈现；专家意见
UI 和关联连线按黄色主题呈现。

## 方法模板（CanvasIR Templates）

方法模板是 PatternSpec / CanvasIR fragments，不是固定工作流程。一个方法模板定义 slots、
relationships 和 grid structure，agent 可以按项目语境 seed、rewrite、duplicate 和 combine。

当前内置方法模板：

- `business_model_canvas`

通过 commands 使用方法模板：

```json
{
  "commands": [
    {
      "op": "insert_template",
      "template_id": "business_model_canvas",
      "title": "AI 桌面机器人商业模式画布",
      "stage": "define",
      "scale": 1.25,
      "seed": {
        "value_propositions": ["实体 AI presence 降低工具抽象感"],
        "customer_segments": ["远程办公者", "创作者"]
      }
    }
  ]
}
```

## Commands

使用 CanvasIR node ids，不使用 tldraw shape ids。

默认项目画布初始化为四个阶段 frame：

| `stage` | role | 用途 |
| --- | --- | --- |
| `discover` | `stage.discover` | 发现、资料、观察、问题打开 |
| `define` | `stage.define` | 收束、定义问题、判断标准 |
| `develop` | `stage.develop` | 方案生成、原型、比较和迭代 |
| `deliver` | `stage.deliver` | 交付、导则、验收和复盘 |

`insert_template`、`add_node`、`add_widget` 可传 `stage`。当没有显式 `parent` 时，server 会把
内容放入对应阶段 frame，从阶段左上工作区开始按加入顺序排列；如果当前行放不下，会换到下一行。
需要精确落进某个已有 section 时，传 `parent` 覆盖 `stage`。`anchor` / `position` 仍可用于
精确局部放置，但普通 agent 应优先使用 `stage`。

v1 支持的 commands：

- `insert_template`：插入方法模板（CanvasIR Template）
- `add_node`
- `edit_node`
- `delete_node`
- `move_node`
- `locate_node`
- `add_connector`：在两个已有节点之间创建关系箭头：
  `{ "op": "add_connector", "from": "node-a", "to": "node-b", "label": "证据流向", "type": "supports" }`。
  编译为绑定两端 shape 的 tldraw arrow，并记入 `semantic_index.relationships`。
- `add_widget`：添加交互组件，可来自交互组件模板（`template_id` + `params`）或自由 `html`
- `update_widget`：更新交互组件（`state_patch` / `state` / `html` / `title` / `description`），并在
  成功写回时清除 Widget 的 `pending_feedback` 状态。

`insert_template` 接受可选 `stage`、`parent`、`scale` 和 `anchor` / `position` / `x` + `y`。
缩放会保持方法模板 root frame、child frames、文本、形状、便签、图片等内容的比例，同时保留
非 frame seed 内容相对容器左上角的偏移与尺寸。自由 `add_node` 创建的 `scaffold.root` 可用
`meta.vd_scaffold_scale` 指定初始缩放。

示例：

```json
{
  "op": "add_node",
  "stage": "discover",
  "kind": "sticky",
  "content": "桌面机器人把 AI 从抽象工具变成可见伙伴"
}
```

```json
{
  "op": "edit_node",
  "id": "vp-1",
  "content": "把抽象 AI 能力转成可见、可陪伴的桌面存在"
}
```

```json
{
  "op": "delete_node",
  "id": "cost-risk-2"
}
```

```json
{
  "op": "add_widget",
  "id": "vote-directions",
  "stage": "develop",
  "template_id": "vote",
  "params": {
    "question": "哪个视觉方向继续深化？",
    "options": ["方向 A", "方向 B", "方向 C"]
  }
}
```

```json
{
  "op": "update_widget",
  "id": "vote-directions",
  "state_patch": { "closed": true }
}
```

Widget commands 会运行 [canvas-widgets.md](canvas-widgets.md) 中的静态 validation ladder；
review 失败只拒绝该 command。commands 应用前，snapshot 中的 live widget state 会 hydrate 回 IR，
因此重新编译不会抹掉学生交互数据。

## Validation

保存前，server 会检查：

- unique IR ids
- parent existence
- grid area overflow
- sibling grid area overlap
- sibling bounds overlap
- generated snapshot structure
- semantic hierarchy and containment
- user-authored non-CanvasIR shapes are preserved across CanvasIR writes

API 返回 `layout_report`，包含 counts、extents、warnings 和 repairs。
