# Project Canvas Document Model

Visual Delivery has one product surface:

- `canvas_workspace`: a persistent project canvas document container.

默认产品路径是一个项目画板文档中的一个工作 Page。所有设计阶段、方法模板、专家批注、
学生回应和交互组件默认都写入这个 Page。tldraw Pages 作为底层兼容能力保留，但不是默认
协作模型；agent 不应主动创建、切换或引导用户使用多个 Pages，除非用户明确要求。

## Project Canvas Document

Project canvas documents are stored under:

```text
.visual-delivery/data/canvas-workspaces/index.json
.visual-delivery/data/canvas-workspaces/{WORKSPACE_ID}/workspace.json
.visual-delivery/data/canvas-workspaces/{WORKSPACE_ID}/snapshot.json
.visual-delivery/data/canvas-workspaces/{WORKSPACE_ID}/events.json
.visual-delivery/data/canvas-workspaces/{WORKSPACE_ID}/feedback.json
.visual-delivery/data/canvas-workspaces/{WORKSPACE_ID}/assets/
.visual-delivery/data/scaffolds/index.json
```

Core shape:

```json
{
  "id": "cw_...",
  "type": "canvas_workspace",
  "title": "协作画布",
  "purpose": "承载设计方法模板、专家批注、学生回应和交互组件共创",
  "status": "active",
  "tags": ["design"],
  "context": {},
  "semantic_index": {
    "version": 2,
    "active_page_id": "page:...",
    "pages": [
      { "id": "page:...", "name": "Page 1", "is_active": true }
    ],
    "zones": [],
    "sections": [],
    "nodes": [
      {
        "shape_id": "shape:...",
        "page_id": "page:...",
        "kind": "canvas_node|html_component",
        "type": "geo|text|image|arrow|html_component",
        "title": "节点标题",
        "text": "agent-readable text",
        "html": "<section>Optional HTML when kind is html_component</section>",
        "parent_id": "shape:section",
        "section_id": "shape:section",
        "section_title": "Agent 工作区",
        "child_shape_ids": [],
        "child_count": 0,
        "bounds": { "x": 0, "y": 0, "w": 320, "h": 180 },
        "x": 0,
        "y": 0,
        "w": 320,
        "h": 180,
        "asset_id": null,
        "alt_text": "",
        "meta": {}
      }
    ],
    "assets": [],
    "annotations": [],
    "region_annotations": [],
    "completion_requests": [],
    "scaffold_instances": [],
    "widget_instances": [],
    "artifact_links": [],
    "layout_reviews": [],
    "relationships": [],
    "edit_summary": null,
    "updated_at": "ISO timestamp"
  },
  "page_policy": {
    "manager": "single_default_work_page",
    "default": "write_to_current_work_page",
    "preserve": "do_not_switch_or_create_pages_unless_user_requests_multi_page"
  }
}
```

## Page And Document Policy

By default, reuse the active project canvas document. Create a new
`canvas_workspace` only when no project document exists or the user explicitly
asks for a separate project-level document.

Within that document, the default collaboration model is one current work Page:

- `semantic_index.active_page_id` names the current work Page represented by the
  semantic index. Agents use it for orientation, not as an instruction to switch.
- `semantic_index.pages` may mirror underlying tldraw Pages for compatibility,
  but normal work should not create or switch Pages.
- CanvasIR and command writes target the current work Page from the saved
  snapshot session.
- Recompiling CanvasIR replaces IR-managed shapes on the current work Page.
  Other Pages, if they exist from explicit user action or legacy data, are preserved
  but should not be part of the default workflow.

## Technology Choice

Use `tldraw` as the embedded canvas SDK. It provides React integration,
editor APIs, shapes, assets, snapshots, local persistence, and optional sync.
Store `getSnapshot(editor.store)` as the source of truth and store a parallel
`semantic_index` for agent reasoning.

## Collaboration Scaffolds

Scaffolds are project-private reusable co-creation packages. They are not only
empty templates. A scaffold may include:

- `structure`: sections, lanes, matrices, flows, or other canvas layout.
- `seed_content`: agent-provided sticky notes, prompts, hypotheses, examples,
  draft copy, options, or initial diagrams.
- `interaction_slots`: places reserved for user edits, notes, or decisions.
- `widgets`: embedded tools that support the current creative step.
- `next_actions`: suggested actions such as cluster, vote, expand, review, or
  turn a region into an artifact.
- `agent_note`: a short explanation of why the scaffold fits the current stage.

Scaffolds live under `.visual-delivery/data/scaffolds/` and are scoped to the
current project in the MVP. The canvas UI may expose saved project scaffold
instances from the in-canvas toolbar's Scaffold Library. This is not the design
method library: methods remain agent-facing references, while saved scaffolds
are project-specific reusable artifacts.

## Canvas Tool Boundary

Canvas tools support two kinds of in-canvas action:

- **Student design actions**: native tldraw tools for frame, shape, sticky,
  text, image, connector, selection, editing, and movement on the current work
  Page. Do not guide normal users into Page switching; organize large work with
  sections and spatial regions in the same Page.
- **Collaboration actions**: object annotation tool, purple region annotation
  rectangles, annotation popovers, purple annotation arrows, the bottom-right
  feedback panel, and `@expert` mentions in annotations. These belong to the
  user.
- **Agent authoring**: agents place ordinary content only through CanvasIR,
  following the kind → native-tool mapping in *Canvas Semantic Kinds* — `text`
  for prose, `note` for ideas, meaning-typed `geo` for diagram nodes, `arrow`
  for relationships, `image` for artifacts / reference, `frame` for containers.
  Agents never use the object annotation tool, region annotation rectangles, or
  annotation arrows.

Do not expose the design method library as a student-facing method picker.
Agents read the method library and decide what to add to the current work Page
as a project-specific visual scaffold: CanvasIR Template, Widget, or both.

交互组件脚手架使用 `html_component` nodes，并遵循 [canvas-widgets.md](canvas-widgets.md)
中的 Widget 合约：agent 提供交互组件模板实例（`template_id` + `params`），或提供裸 HTML
fragment 加 `state`、`input_schema`、`output_schema` 和 `sizing`；运行时负责透明背景、
intrinsic sizing、等比例缩放、`window.vd` state bridge，以及 validation/repair ladder。
Widget 实例的 state 持久化在 shape meta 和 `semantic_index.widget_instances` 中。

术语边界：方法模板 = CanvasIR Template，用于静态设计方法脚手架；交互组件 = Widget，
用于原生画板节点无法承载的动态判断动作。

## Region Annotations

A region annotation is a purple glowing rectangle created by the user from the
canvas toolbar. It marks a bounded canvas area that the user wants an expert or
agent to inspect and respond to:

```json
{
  "kind": "region_annotation",
  "shape_id": "shape:...",
  "status": "open|in_progress|completed|dismissed",
  "note": "这里的关系好像不成立，请帮我看一下",
  "bounds": { "x": 0, "y": 0, "w": 640, "h": 360 },
  "page_id": "page:...",
  "contained_in_frame": true,
  "frame_id": "shape:frame",
  "frame_title": "发现 Discover",
  "target_shape_ids": ["shape:..."],
  "screenshot": {
    "status": "pending_agent_capture",
    "asset_id": null,
    "url": null,
    "capture_hint": {
      "kind": "canvas_region_screenshot",
      "shape_id": "shape:...",
      "page_id": "page:...",
      "bounds": { "x": 0, "y": 0, "w": 640, "h": 360 }
    }
  },
  "created_by": "user",
  "resolved_by_event_id": null
}
```

The rectangle form is unchanged from the old completion rectangle, but the
semantics are now annotation-first. Legacy `completion_request` entries may
still be read for compatibility, but new UI-created rectangles should write
`region_annotation`.

## Canvas Annotations

Annotations are canvas-native feedback marks. The user first chooses the canvas
annotation tool, which changes the pointer to a purple comment cursor. Clicking
a frame, shape, image, sticky note, widget, arrow, or text object opens a local
annotation popover near that object. Ordinary selection does not open the
annotation popover. Submitting the popover:

- writes a `canvas_annotation` item into the project canvas feedback pool,
- appends the annotation to each target shape's `meta.vd_annotations`,
- mirrors the entry into `semantic_index.annotations`,
- records whether the user set the submit/track flag,
- records `mentions` when the text contains `@专家名` such as `@马谨`,
  `@孙效华`, or `@虚拟品牌专家`.

Mention records use this shape:

```json
{ "type": "expert", "name": "孙效华", "domain": "智能交互设计", "virtual": false }
```

Mentions are mirrored in feedback `meta.mentions`, shape
`meta.vd_annotations[].mentions`, and `semantic_index.annotations[].mentions`.
Agents should prioritize the mentioned expert in the next design mentor round.

The canvas toolbar also exposes an `annotation_arrow` tool. The pointer down
position is the arrow's pointed end, and the pointer up position is the arrow's
start. During drag, the canvas shows a live purple arrow preview. After release,
the same annotation popover opens for the new arrow so the user can enter the
annotation text. Annotation arrows are stamped with `meta.vd_kind =
"annotation_arrow"` and purple annotation styling. They are stored in the
semantic index as annotations so agents can treat them as feedback marks, not
ordinary diagram connectors.

## Canvas Feedback Panel

Project canvas documents expose an in-canvas “我的反馈” button. Clicking it opens a
floating panel over the canvas. The panel is a readable review queue for content
the user has submitted during collaboration:

- project canvas feedback pool entries such as `canvas_annotation`, `widget_output`,
  and `html_component` feedback,
- `semantic_index.annotations`, including object-targeted annotations and
  purple annotation arrows,
- `semantic_index.region_annotations`, including open purple region annotation
  rectangles.

Panel items are de-duplicated by feedback id when an annotation has already
created a project canvas feedback entry. Items should preserve `target.shape_ids`,
`target.shape_id`, `section_id`, or `component_id` when available so the UI can
select and zoom to the referenced canvas object.

## Scaffold Layout Review

After a scaffold is created or modified, Visual Delivery should review the
rendered layout before treating the scaffold as complete. The MVP records a
programmatic review in both the canvas event and `semantic_index.layout_reviews`:

```json
{
  "id": "layout_review_...",
  "type": "scaffold_layout_review",
  "scaffold_id": "scaffold_inspiration_wall",
  "section_id": "shape:...",
  "status": "passed|needs_adjustment",
  "checks": {
    "overlap_count": 0,
    "out_of_section_count": 0,
    "unreadable_count": 0,
    "sticky_note_wrong_type_count": 0,
    "section_contains_children": true,
    "min_readable_size_ok": true,
    "sticky_note_types_ok": true
  },
  "repairs": []
}
```

When screenshot tooling is available, the agent should also inspect a screenshot
of the focused scaffold and adjust the layout if it is crowded, clipped,
unreadable, off-screen, or semantically mismatched.

## Agent Inspect Requirement

Before any agent writes to a project canvas document, it must read:

```text
GET /api/canvas-workspaces/{PROJECT_CANVAS_ID}/context
```

The debug context payload contains the current `snapshot`, `semantic_index`,
`events`, `open_feedback`, `open_region_annotations`, and legacy
`open_completion_requests`. Ordinary agents
should instead read:

```text
GET /api/canvas-workspaces/{PROJECT_CANVAS_ID}/agent-context
```

Then write through CanvasIR:

```text
POST /api/canvas-workspaces/{PROJECT_CANVAS_ID}/ir/validate
PUT /api/canvas-workspaces/{PROJECT_CANVAS_ID}/ir
POST /api/canvas-workspaces/{PROJECT_CANVAS_ID}/commands
```

Direct `PUT /api/canvas-workspaces/{PROJECT_CANVAS_ID}/snapshot` writes are reserved
for runtime debugging and migration. The server records semantic diffs in
`semantic_index.edit_summary` and in the event when an event is supplied.

## Snapshot Write Protection

Full-store snapshot writes are guarded against stale clients. The project canvas document
tracks two monotonic revisions:

- `snapshot_rev`: bumped on every snapshot write (UI save, IR write, commands).
- `agent_rev`: the `snapshot_rev` of the latest agent (CanvasIR) write.

Clients echo the `snapshot_rev` they loaded back as `base_rev` when saving. On
`PUT /snapshot` the server applies:

1. If `base_rev < agent_rev` (or `base_rev` is missing — old clients), the
   writer has not seen the latest agent write: IR-managed shapes
   (`shape:vd-ir-*` / `meta.vd_ir_id`) missing from the incoming store are
   merged back instead of deleted, and their previous semantic index entries
   are re-attached.
2. If `base_rev >= agent_rev`, missing IR-managed shapes are treated as
   intentional deletions and allowed.
3. Widget 实例始终按实例级 last-write-wins 处理：更高的 `vd_state_version` 保留 state，
   更高的 `vd_widget_version` 保留 html/schemas，不受整体 snapshot 新旧影响。

Protected writes return a `write_protection` summary, append a
`snapshot_write_protected` canvas event, and the canvas UI reloads the merged
snapshot so the editor converges. The client-side rule remains: no tldraw
`persistenceKey` — the server snapshot is the single source of truth.

Use Cowart as a product and workflow reference rather than a runtime dependency.
Cowart validates the direction: local tldraw canvas, project-local persistence,
image holders, annotation screenshots, and agent tools that read selection state
and write assets.

## FigJam-Inspired Agent Protocol

The Visual Delivery canvas should borrow FigJam's operational discipline without
depending on FigJam as the runtime. The transferable patterns are:

- inspect first, then write
- build in small command batches
- return or record every created and mutated shape id
- use sections as navigational containers
- position child nodes in the section's local coordinate system
- treat agent output as a mentor-provided visual thinking scaffold, not a final
  poster or static layout
- place scaffold contents from the top-left and leave unused room for the user
  to continue adding material
- resize sections to encompass children unless the section is intentionally a
  participatory zone
- preserve user-authored shapes and annotations during later agent writes
- represent relationships explicitly instead of relying only on visual
  proximity
- validate with screenshots or semantic index reads after meaningful writes

These rules are agent-facing prompts. The preferred executable write paths are
CanvasIR and commands. The agent writes semantic hierarchy and grid layout; the
server compiles tldraw snapshot records, semantic index entries, and canvas
events.

## Canvas Command Batch

When an agent changes a canvas, include a command batch in the snapshot event.
This makes the write auditable and gives future agent turns deterministic ids to
reference.

```json
{
  "type": "agent_command_batch",
  "actor": "agent",
  "summary": "Added a section for FigJam experiment takeaways.",
  "target": {
    "kind": "canvas_workspace",
    "workspace_id": "cw_..."
  },
  "commands": [
    {
      "op": "create_section",
      "client_id": "figjam-takeaways",
      "title": "FigJam Takeaways",
      "bounds": { "x": 0, "y": 0, "w": 960, "h": 640 }
    },
    {
      "op": "add_sticky",
      "client_id": "sticky-api-limit",
      "section_client_id": "figjam-takeaways",
      "text": "External API limits make FigJam unsuitable as the core runtime.",
      "color": "yellow",
      "bounds": { "x": 64, "y": 120, "w": 240, "h": 240 }
    }
  ],
  "created_shape_ids": ["shape:..."],
  "mutated_shape_ids": []
}
```

### Command Types

`create_section`
: Create a tldraw frame used as a canvas section. Required fields: `title`,
`bounds`. Optional fields: `color`, `role`, `parent_id`.

`rename_section`
: Rename an existing section. Required fields: `section_id`, `title`.

`duplicate_section`
: Duplicate a section and its children. Required fields: `section_id`.
Optional fields: `offset`.

`organize_section`
: Reflow a section's children into meaningful lanes or grids. Required fields:
`section_id`. Optional fields: `strategy`, such as `media_notes_diagram_other`.

`add_text`
: Add structural text, such as a board title, heading, caption, prompt,
instruction, or analysis paragraph. Required fields: `text`, `bounds` or
`position`. Optional fields: `section_id`, `role`.

`add_sticky`
: Add one participant-style idea or feedback item. Required fields: `text`,
`position` or `bounds`. Optional fields: `section_id`, `color`, `author`.
Stickies should not carry long analysis or instructions.

`add_shape`
: Add a diagram node, option, process step, state, or decision node. Required
fields: `text`, `shape`, `bounds`. Optional fields: `section_id`, `color`,
`semantic_role`.

`add_connector`
: Add a relationship between nodes. Required fields: `from_shape_id`,
`to_shape_id`. Optional fields: `label`, `direction`, `line_type`,
`relationship_type`. Mirror the relation into `semantic_index.relationships`.

`add_widget`
: 添加交互组件。优先形式为 `template_id` + `params`，并按交互组件模板目录校验。
自由形式为 `html` fragment，加可选 `state`、`input_schema`、`output_schema`、`sizing`。
server 会运行静态 validation ladder，并用 `widget_review` 拒绝失败规格。见
[canvas-widgets.md](canvas-widgets.md)。

`update_widget`
: 通过 CanvasIR node id 更新已有 Widget 实例。`state_patch` shallow-merge 顶层 state keys
（提升 `vd_state_version`，actor 为 `agent`）；`state` 替换整个 state；`html` 经过校验后
替换 fragment（提升 `vd_widget_version`，保留 previous html 供 rollback）；`title` /
`description` 更新展示文字。Widget state 会跨 html 更新和后续 CanvasIR 重新编译保留
（commands 应用前会从 snapshot hydrate runtime state）。

`add_html_component`
: Legacy alias of the freeform `add_widget` path. Required fields: `html`,
`bounds`. Optional fields: `title`, `description`, `section_id`,
`component_id`. Create a tldraw placeholder shape with
`meta.vd_kind = "html_component"` and mirror the same `html` into
`semantic_index.nodes[]` as `kind = "html_component"`.

`add_collaboration_scaffold`
: Add a scaffold package that may include structure, seed content, interaction
slots, widgets, and next actions. Required fields: `scaffold_id`, `title`,
`stage`, `bounds`. Optional fields: `includes_seed_content`, `agent_note`.

`review_scaffold_layout`
: Record layout review after scaffold creation or mutation. Required fields:
`scaffold_id`, `status`, `checks`. Optional fields: `repairs`.

`add_region_annotation`
: Add the user's purple bounded region annotation. Required fields: `note`,
`bounds`. The semantic index mirrors the request into
`region_annotations[]`, including page/frame containment and screenshot
capture hint when available.

`add_table`
: Add row/column data as a first-class semantic object. Required fields:
`columns`, `rows`, `bounds`. Current renderers may fall back to grouped tldraw
shapes, but the semantic node kind should remain `table`.

`add_code_block`
: Add code with a language hint. Required fields: `code`, `language`, `bounds`.
Current renderers may fall back to a text/shape group, but the semantic node
kind should remain `code_block`.

`add_label`
: Add a numbered or lettered callout marker. Required fields: `label`,
`position`. Optional fields: `target_shape_id`, `legend_text`.

`add_image_asset`
: Add or reference an image asset. Required fields: `asset_id` or `source`,
`bounds`, `alt_text`. The same `alt_text` must appear in
`semantic_index.assets[]`.

`set_image_alt_text`
: Update image alt text. Required fields: `shape_id`, `alt_text`.

## Canvas Semantic Kinds

Each content kind maps to a specific native tldraw tool. Agents pick a kind by
intent and the runtime renders it with the matching tool; do not use one shape
type (a filled rectangle) to carry text, ideas, and diagram nodes alike.

| Semantic kind | Native tool | Use |
| --- | --- | --- |
| `canvas_section` / `slot` | `frame` | Named container / navigation unit — containers only, no body text |
| `text` | `text` (no box, no fill) | Titles, section headings, tips, in-frame instructions, questions, captions, analysis — never draw a shape as a text box |
| `sticky_note` | `note` | One participant-style idea or hypothesis — one idea per note |
| `shape` | `geo`, subtype by meaning | Diagram nodes only: rectangle = process step, diamond = decision, ellipse = start/end or state, cloud = fuzzy area |
| `connector` | `arrow` / `line` | Real connector bound to `from`/`to` shapes with optional label: flow, dependency, evidence |
| `image` | `image` + `asset` | Agent artifact output (`vd_artifact`, labeled AI draft) or reference material (`vd_reference_material`) — see Image Nodes below |
| `html_component` | tldraw placeholder + iframe overlay | Interactive HTML widget anchored on the canvas |
| `region_annotation` | violet geo rectangle | **User-only** annotation tool — user marks a bounded area for feedback |
| `table` | grouped shapes / future table renderer | Row-column data |
| `code_block` | styled text / future code renderer | Code with language metadata |
| `label` | ellipse/geo | Short callout marker |

The object annotation tool, region annotation rectangles, and purple annotation
arrows are the user's feedback channel — agents never author with them. An
agent's response to feedback is expressed through scaffolds, review annotations
(`author = expert name`), and discussion notes, not by drawing with the
annotation tool.

### Image Nodes

An `image` node is the only channel through which agents place bitmap content,
and it serves exactly two purposes:

- **Agent artifact output** — a final visual deliverable (poster, layout, visual
  asset, UI mock) generated by the agent itself. Carries `meta.vd_artifact =
  true`, is signed as `AI 草稿，待确认`, and is never produced under an expert
  identity (experts scaffold, review, and discuss; the agent body produces
  artifacts).
- **Reference material** — source imagery, references, field photos, or existing
  materials brought in as input. Carries `meta.vd_reference_material = true`,
  takes no expert authorship, and defaults into the Discover stage.

Both compile to a tldraw `image` shape plus an `asset` record; `alt_text` is
required.

## Layout Rules

- Reading order is left-to-right, top-to-bottom.
- Context usually belongs on the left, evidence in the middle, decisions or asks
  on the right.
- Tight clusters mean "same thought"; wide gaps mean separate topics.
- Use grids for batches of sticky notes. Do not stagger or overlap them.
- Size sections from content outward, except workshop/feedback sections that are
  intentionally sized for future user input.
- Text that guides or explains belongs in text nodes, not sticky notes.
- Keep section names short. A section name is for navigation; a visible heading
  may be a separate text node inside the section.
