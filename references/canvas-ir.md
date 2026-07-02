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
      sticky / text / shape / widget
```

用 `parent` 把节点放进 section 或 slot。compiler 会把可见容器节点映射为 tldraw frame
shapes，并把同样的包含关系记录到 `semantic_index.relationships`。

容器类型：

- `section`: large navigational region, compiled to a tldraw frame.
- `slot`: semantic area inside a pattern, visible by default as a nested frame.
- `cluster`: loose group of related nodes, visible as a frame when needed.
- `pattern`: reusable top-level thinking construct.

内容类型：

- `sticky`: one participant-style idea or hypothesis.
- `text`: structural guidance, heading, question, or analysis.
- `shape`: diagram option, state, process, or decision.
- `connector`: represented as a semantic relationship in v1.
- `html_component`：嵌入式交互组件（`widget` 可作为 alias）；应放在某个 slot 或 section
  内。通过 `add_widget` 创建，不要手写 node meta。合约见：[canvas-widgets.md](canvas-widgets.md)。

## Grid Layout

agent 用 grid areas 描述布局，而不是直接写 pixels：

```json
{ "col": 1, "row": 1, "colSpan": 4, "rowSpan": 3 }
```

area 相对于节点父级 grid。顶层 section 使用 board grid；section 内部 slot 默认使用该 section
派生出的 grid，除非自己定义 `grid`。

Nodes may also specify `bounds` when a command or template needs stable
geometry. Child `bounds` are interpreted relative to the parent container's
top-left corner; root `bounds` are page coordinates. This is mainly used by the
server for generated scaffold wrappers and template scaling.

When a content node has no `area`, the compiler auto-places it inside the parent
from the top-left with a readable size. Containers grow to fit their children
而不是缩小内容或把子节点平均分散到 frame 中。这样可以保持 agent prompt 简洁，同时保留
section containment，并给学生协作留出空间。

当生成的 CanvasIR 有多个 root nodes 时，compiler 会把它们包进一个
`role = "scaffold.root"` 的 `section`。如果一个成熟方法模板已经有自己的 root frame，则不再
二次包裹。

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
- `add_widget`：添加交互组件，可来自交互组件模板（`template_id` + `params`）或自由 `html`
- `update_widget`：更新交互组件（`state_patch` / `state` / `html` / `title` / `description`）

`insert_template` 接受可选 `stage`、`parent`、`scale` 和 `anchor` / `position` / `x` + `y`。
缩放会保持方法模板 root frame 和 child frames 的比例，同时保留非 frame seed 内容相对容器
左上角的偏移与尺寸。

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
