# CanvasIR and Templates

CanvasIR is the agent-facing intermediate representation for Visual Delivery
canvas work. It lets agents describe a thinking scaffold with semantic hierarchy
and grid layout without writing tldraw snapshot records directly.

## Core Rule

Ordinary agents should use CanvasIR or canvas commands. Direct writes to
`snapshot.document.store` are reserved for runtime debugging, migration, or
front-end editor persistence.

The agent's role on the canvas is like a mentor providing a visual thinking
scaffold. Agents should express the learning/design intent: questions,
sections, slots, seed ideas, tradeoffs, and next discussion spaces. The runtime
owns stable execution details: wrapping new generated structures, preserving
user-authored canvas marks, placing content from the top-left, growing
containers to fit content, and keeping template geometry stable under scaling.

```text
Agent intent
  -> CanvasIR / commands
  -> server compiler
  -> valid tldraw snapshot + semantic_index
  -> canvas event
```

## CanvasIR Shape

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

## Hierarchy

CanvasIR hierarchy is explicit and stable:

```text
board
  section
    slot
      sticky / text / shape / widget
```

Use `parent` to place a node inside a section or slot. The compiler maps visible
container nodes to tldraw frame shapes and records the same containment in
`semantic_index.relationships`.

Container kinds:

- `section`: large navigational region, compiled to a tldraw frame.
- `slot`: semantic area inside a pattern, visible by default as a nested frame.
- `cluster`: loose group of related nodes, visible as a frame when needed.
- `pattern`: reusable top-level thinking construct.

Content kinds:

- `sticky`: one participant-style idea or hypothesis.
- `text`: structural guidance, heading, question, or analysis.
- `shape`: diagram option, state, process, or decision.
- `connector`: represented as a semantic relationship in v1.
- `html_component`: embedded interactive widget (`widget` is accepted as an
  alias); keep local to a slot or section. Create through `add_widget`, not by
  hand-writing node meta. Contract: [canvas-widgets.md](canvas-widgets.md).

## Grid Layout

Agents describe layout with grid areas instead of pixels:

```json
{ "col": 1, "row": 1, "colSpan": 4, "rowSpan": 3 }
```

Areas are relative to the node's parent grid. A top-level section uses the board
grid. A slot inside a section uses that section's derived grid unless it defines
its own `grid`.

Nodes may also specify `bounds` when a command or template needs stable
geometry. Child `bounds` are interpreted relative to the parent container's
top-left corner; root `bounds` are page coordinates. This is mainly used by the
server for generated scaffold wrappers and template scaling.

When a content node has no `area`, the compiler auto-places it inside the parent
from the top-left with a readable size. Containers grow to fit their children
instead of shrinking or evenly distributing children across the frame. This keeps
agent prompts small while preserving section containment and leaving room for
user collaboration.

When generated CanvasIR has multiple root nodes, the compiler wraps them in a
single `section` with `role = "scaffold.root"`. A single mature template with
its own root frame is not wrapped again.

## Templates

Templates are PatternSpec / CanvasIR fragments, not fixed work processes. A
template defines slots, relationships, and a grid structure that agents can
seed, rewrite, duplicate, and combine.

Current built-in template:

- `business_model_canvas`

Use templates through commands:

```json
{
  "commands": [
    {
      "op": "insert_template",
      "template_id": "business_model_canvas",
      "title": "AI 桌面机器人商业模式画布",
      "scale": 1.25,
      "anchor": { "x": 320, "y": 240 },
      "seed": {
        "value_propositions": ["实体 AI presence 降低工具抽象感"],
        "customer_segments": ["远程办公者", "创作者"]
      }
    }
  ]
}
```

## Commands

Use node ids from CanvasIR, not tldraw shape ids.

Supported v1 commands:

- `insert_template`
- `add_node`
- `edit_node`
- `delete_node`
- `move_node`
- `locate_node`
- `add_widget` (widget from `template_id` + `params`, or freeform `html`)
- `update_widget` (`state_patch` / `state` / `html` / `title` / `description`)

`insert_template` accepts optional `scale` and `anchor` / `position` / `x` +
`y`. Scaling keeps the template root frame and child frames in proportion while
preserving non-frame seeded content offsets and sizes from the container
top-left.

Examples:

```json
{
  "op": "add_node",
  "parent": "value_propositions",
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
  "parent": "decision_zone",
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

Widget commands run the static validation ladder from
[canvas-widgets.md](canvas-widgets.md); a failed review rejects only that
command. Live widget state in the snapshot is hydrated back into the IR before
commands apply, so recompiles never wipe user interaction data.

## Validation

Before saving, the server checks:

- unique IR ids
- parent existence
- grid area overflow
- sibling grid area overlap
- sibling bounds overlap
- generated snapshot structure
- semantic hierarchy and containment
- user-authored non-CanvasIR shapes are preserved across CanvasIR writes

The API returns `layout_report` with counts, extents, warnings, and repairs.
