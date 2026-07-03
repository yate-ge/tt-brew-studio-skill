# Visual Delivery API

Visual Delivery is canvas-only. New work should use the project canvas
document, CanvasIR, scaffold, widget, and design-token endpoints listed here.
The backend `canvas_workspace` resource is a storage container. 默认协作模型是
一个项目画板文档中的一个当前工作 Page；所有阶段、方法模板、专家批注、学生回应和交互组件
默认都写入这个 Page。tldraw Pages 只作为底层兼容能力保留，agent 不应主动创建或切换 Page，
除非用户明确要求多 Page 工作。

## Service

### `GET /health`

Returns service health.

```json
{ "status": "ok", "uptime": 12, "version": "3.0.0" }
```

### `GET /api/settings`

Reads runtime settings such as language, remote access, and access-key state.

### `PUT /api/settings`

Updates runtime settings.

```json
{
  "remote": true,
  "access_key_enabled": true
}
```

## Design

### `GET /api/design-tokens`

Returns the active design tokens used by the canvas UI and widget iframe
runtime.

### `GET /api/locale`

Returns the runtime locale object injected into the UI shell.

### `PUT /api/locale`

Updates the runtime locale object and broadcasts `locale_updated`.

```json
{
  "appTitle": "Visual Delivery Canvas",
  "canvas": {
    "newPage": "New page"
  }
}
```

## Project Canvas Documents

Project canvas documents are stored under:

```text
.visual-delivery/data/canvas-workspaces/index.json
.visual-delivery/data/canvas-workspaces/{WORKSPACE_ID}/workspace.json
.visual-delivery/data/canvas-workspaces/{WORKSPACE_ID}/snapshot.json
.visual-delivery/data/canvas-workspaces/{WORKSPACE_ID}/events.json
.visual-delivery/data/canvas-workspaces/{WORKSPACE_ID}/feedback.json
.visual-delivery/data/canvas-workspaces/{WORKSPACE_ID}/assets/
```

### `GET /api/canvas-workspaces`

Lists stored project canvas document summaries. The product UI does not expose
this as a user-facing multi-canvas switcher.

Query params:

- `status`
- `search`

Response:

```json
{
  "workspaces": [
    {
      "id": "cw_...",
      "type": "canvas_workspace",
      "title": "协作画布",
      "status": "active",
      "tags": ["design"],
      "updated_at": "ISO timestamp",
      "last_used_at": "ISO timestamp",
      "snapshot_rev": 3,
      "agent_rev": 2
    }
  ],
  "active_workspace_id": "cw_...",
  "total": 1
}
```

### `POST /api/canvas-workspaces`

Creates a project canvas document container.

```json
{
  "title": "学生设计项目画板",
  "purpose": "承载设计方法模板、专家批注、学生回应和交互组件共创",
  "tags": ["design", "mentor-board"],
  "context": {
    "task_name": "视觉方向",
    "prompt": "Current user request"
  },
  "make_active": true
}
```

### `GET /api/canvas-workspaces/project-document`

Ensures and returns the canonical project canvas document. This is the UI's
default loading endpoint and returns full detail including snapshot, semantic
index, events, and feedback.

This endpoint returns the project canvas document and its current work Page state.
It does not imply that agents should create or switch Pages during normal work.

### `POST /api/canvas-workspaces/select`

Selects the related project canvas document or creates one when no document
exists. This is a compatibility endpoint for old clients. Agents should use
`GET /api/canvas-workspaces/project-document` for normal design mentor work.

Do not use this endpoint to create a new user-facing canvas. Normal design mentor
work should stay in the current project document and current work Page.

```json
{
  "title": "学生设计项目画板",
  "purpose": "承载设计方法模板、专家批注、学生回应和交互组件共创",
  "tags": ["design", "mentor-board"],
  "context": {
    "task_name": "视觉方向",
    "prompt": "Current user request"
  },
  "make_active": true
}
```

Response includes:

```json
{
  "workspace": {},
  "selection": {
    "reason": "reused_related_workspace",
    "score": 10,
    "candidates": []
  }
}
```

### `GET /api/canvas-workspaces/:id`

Returns a project canvas document with snapshot, semantic index, events, and
feedback.

### `PUT /api/canvas-workspaces/:id`

Updates project canvas document metadata such as title, purpose, tags, context,
or status. The `id` and resource `type` are preserved by the server.

```json
{
  "title": "协作画布",
  "purpose": "视觉协作、标注和设计决策",
  "tags": ["design", "design-stage-canvas"],
  "make_active": true
}
```

### `GET /api/canvas-workspaces/:id/context`

Returns raw context for runtime maintenance.

### `GET /api/canvas-workspaces/:id/agent-context`

Returns the preferred agent-facing context. The `semantic_index.active_page_id`
field identifies the current work Page. `semantic_index.pages` may be present for
compatibility and orientation, but agents should not create or switch Pages unless
the user explicitly asks for multi Page work. The response mirrors
`workspace.context` and adds `project_protocol_state` so agents can check the
expert-team gate, judgment contract, current stage, and four-stage frame status
before writing diagnosis content:

```json
{
  "type": "canvas_workspace_agent_context",
  "inspect_required_before_write": true,
  "workspace": {
    "id": "cw_...",
    "title": "协作画布",
    "context": {
      "vd_project_document": true,
      "current_stage": "develop",
      "expert_team": [],
      "judgment_contract": {}
    },
    "snapshot_rev": 3,
    "agent_rev": 2
  },
  "project_protocol_state": {
    "vd_project_document": true,
    "current_stage": "develop",
    "expert_team_ready": true,
    "stage_spine_ready": true,
    "missing_stage_keys": []
  },
  "stage_routing": {
    "stage_spine_ready": true,
    "stages": [
      {
        "key": "discover",
        "parent_id": "stage-discover",
        "exists": true,
        "shape_id": "shape:vd-ir-stage-discover",
        "ir_id": "stage-discover"
      }
    ]
  },
  "current_ir_summary": {},
  "edit_summary": {},
  "recent_events": [],
  "widget_instances": [
    {
      "id": "rubric-widget",
      "shape_id": "shape:...",
      "title": "专家评估 Rubric",
      "state": {},
      "pending_feedback": true,
      "pending_at": "2026-07-03T00:00:00.000Z"
    }
  ],
  "pending_widget_outputs": [],
  "pending_widget_requests": [],
  "open_feedback": [],
  "open_region_annotations": [],
  "open_completion_requests": [],
  "available_templates": [],
  "available_widget_templates": [],
  "command_schema": {
    "ops": [
      "insert_template",
      "add_node",
      "edit_node",
      "delete_node",
      "move_node",
      "locate_node",
      "add_connector",
      "add_widget",
      "update_widget"
    ]
  }
}
```

If `project_protocol_state.expert_team_ready` is false, assemble and write the
expert team before diagnosis, templates, widgets, or review. If
`stage_spine_ready` is false, create or repair the four-stage workspace before
adding project content.

### `POST /api/canvas-workspaces/:id/ir/validate`

Dry-runs a CanvasIR write or template insert without saving.

```json
{
  "template_id": "business_model_canvas",
  "title": "AI 桌面机器人商业模式画布",
  "stage": "define",
  "scale": 1.25,
  "seed": {
    "value_propositions": ["实体 AI presence 降低工具抽象感"]
  }
}
```

### `PUT /api/canvas-workspaces/:id/ir`

Compiles and saves a complete CanvasIR or template instance. The server writes
the tldraw snapshot, semantic index, layout review, and canvas event. The write
targets the current work Page in the saved snapshot session. Default work keeps
all content on that Page; other Pages, if present from legacy or explicit user
action, are preserved.

### `POST /api/canvas-workspaces/:id/commands`

Applies semantic CanvasIR commands. Agents should reference CanvasIR node ids
and slot ids, not tldraw shape ids. Commands operate on the current work Page.
Default work keeps all content on that Page; other Pages, if present from legacy
or explicit user action, are preserved. For normal design mentor work, pass
`stage: "discover" | "define" | "develop" | "deliver"`; when `parent` is omitted,
the runtime places `insert_template`, `add_node`, and `add_widget` into that stage
frame from the top-left flow area. Use `parent` only when targeting a specific
existing section or slot.

```json
{
  "commands": [
    {
      "op": "add_node",
      "id": "idea-1",
      "stage": "discover",
      "kind": "sticky",
      "content": "桌面机器人把 AI 从抽象工具变成可见伙伴"
    },
    {
      "op": "add_widget",
      "id": "word-cloud",
      "stage": "develop",
      "template_id": "word_cloud",
      "params": {
        "title": "主题词云",
        "words": [{ "text": "人机协同", "weight": 98 }]
      }
    }
  ]
}
```

Supported ops:

- `insert_template`
- `add_node`
- `edit_node`
- `delete_node`
- `move_node`
- `locate_node`
- `add_connector` — creates a relationship arrow between two existing nodes:
  `{ "op": "add_connector", "from": "node-a", "to": "node-b", "label": "证据", "type": "supports" }`
- `add_widget`
- `update_widget` — agent 回写 Widget 状态 / 结果 / HTML；成功更新后会清除该 Widget 的
  `pending_feedback`，Widget 边框保持黄色正常框。

### `PUT /api/canvas-workspaces/:id/snapshot`

Persists a tldraw snapshot and semantic index from the editor. This endpoint is
primarily used by the canvas UI. Agents should prefer CanvasIR or commands.

The client should send `base_rev` with the snapshot. The server protects
agent-written IR shapes from stale client writes and returns
`write_protection` details when it restores shapes or preserves widget state.

```json
{
  "snapshot": { "document": { "store": {} }, "session": {} },
  "semantic_index": { "version": 2, "sections": [], "nodes": [] },
  "base_rev": 3,
  "event": {
    "type": "canvas_editor_save",
    "actor": "user"
  }
}
```

### `POST /api/canvas-workspaces/:id/activate`

Marks a project canvas document container as active. This is not a user-facing
canvas/page switcher. Normal design mentor work should continue on the current
work Page in the active project document.

### `POST /api/canvas-workspaces/:id/events`

Appends a canvas event.

### `POST /api/canvas-workspaces/:id/feedback`

Adds canvas-native feedback such as annotations, widget outputs, and component
feedback. Annotation feedback is created from the in-canvas annotation tool or
from an annotation arrow's post-draw popover, and may include `meta.mentions`
when the user types `@专家名` in the canvas annotation popover.

Widget `vd.emit` submissions create `kind: "widget_output"` feedback items.
They are user feedback, appear in the left “我的反馈” entry, and count as pending
until an agent/expert flow handles them. Ordinary Widget state changes do not
create a feedback item for every interaction, but they mark the Widget as
`pending_feedback` until `update_widget` writes back; the Widget frame itself
remains yellow.

```json
{
  "kind": "canvas_annotation",
  "content": "这里需要补充证据",
  "author": "user",
  "target": {
    "kind": "canvas_node",
    "workspace_id": "cw_...",
    "shape_ids": ["shape:..."],
    "bounds": { "x": 0, "y": 0, "w": 320, "h": 180 }
  },
  "meta": {
    "mentions": [
      { "type": "expert", "name": "孙效华", "domain": "智能交互设计", "virtual": false }
    ]
  }
}
```

Expert opinions and expert dialog use the extended thread fields. `author` may
be an object with `kind`; `targets` links the item to one or more canvas
elements (granularity is derived from the referenced shape's meta — template
root frame = template, widget anchor = widget, stage frame = stage, primitive
shape = element). Every item seeds a `thread` with its first message. For
`direction: "expert_to_content"`, `content` should contain only the opinion
itself; do not include display labels such as `专家：`, `指向：`, `观察：`, or
`建议：`. Put identity in `author`, target in `targets`, and optional reasoning in
`meta`. Expert-authored `expert_to_content` items are opinions for the student,
not user feedback awaiting agent work; they default to `status: "shared"` and
`handled: true`, and the UI surfaces them under the expert bar rather than in
the feedback queue.

```json
{
  "kind": "expert_review",
  "content": "这张便签现在还停在感受层。先补一个真实场景里的观察证据，再决定它是不是问题。",
  "author": { "kind": "expert", "name": "孙效华" },
  "direction": "expert_to_content",
  "status": "shared",
  "handled": true,
  "targets": [
    { "shape_id": "shape:vd-ir-d-s1" },
    { "shape_id": "shape:vd-ir-stage-discover" }
  ],
  "meta": {
    "rationale": "该判断需要真实使用场景支撑。",
    "next_action": "补一条带场景、人物和行为的观察记录。"
  }
}
```

`direction` is one of `expert_to_content`（专家对内容的意见）、`user_to_expert`
（用户找专家）、`other`。Only user-submitted items, or threads whose last message
is from the user and whose status is unresolved, count as pending feedback.
Expert opinions can still show an opinion count on the expert avatar, but that
count is not a pending badge.

### `POST /api/canvas-workspaces/:id/feedback/:fid/reply`

Appends a message to a feedback item's conversation thread. A user reply keeps
the item pending (`status: "tracked"`); an expert reply resolves it by default
(`status: "resolved"`), or keeps it open with `"resolve": false`.

```json
{
  "text": "先观察，后访谈。把排队时长和临时行为记下来就是一手证据。",
  "role": "expert",
  "author": { "kind": "expert", "name": "马谨" },
  "resolve": true
}
```

### `POST /api/canvas-workspaces/:id/feedback/:fid/status`

Explicitly sets a feedback item's status: `tracked` | `addressed` | `resolved`.

## Scaffolds

### `GET /api/scaffolds`

Lists project-private scaffold packages.

### `POST /api/scaffolds`

Creates a scaffold package.

## 方法模板（CanvasIR Templates）

### `GET /api/canvas-templates`

列出 agent 可用的内置 CanvasIR 方法模板。这里的 template 与设计方法库中的“方法模板”
同义：它是静态设计方法脚手架的运行时表达。

### `GET /api/canvas-templates/:id`

按 id 返回一个内置 CanvasIR 方法模板。

## 交互组件模板（Widget Templates）

### `GET /api/canvas-widget-templates`

返回 Tier 1/2 交互组件模板目录。这里的 template 只表示“交互组件的参数化外壳”，不要与
CanvasIR 方法模板混淆。

Built-in templates include:

- `vote`
- `alignment_scale`
- `rubric`
- `bar_chart`
- `word_cloud`
- `timer`

### `POST /api/canvas-widgets/validate`

Dry-runs widget validation. Accepts the same body as an `add_widget` command
minus `op`.

```json
{
  "template_id": "word_cloud",
  "params": {
    "title": "主题词云",
    "words": [{ "text": "人机协同", "weight": 98 }]
  }
}
```

Response:

```json
{
  "review": {
    "status": "passed",
    "errors": [],
    "warnings": [],
    "repairs": []
  },
  "spec": {}
}
```
