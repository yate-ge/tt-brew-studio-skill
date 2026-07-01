# Canvas Workspace Model

Visual Delivery now uses two first-class delivery surfaces:

- `document_report`: an interactive delivery document.
- `canvas_workspace`: a persistent project collaboration canvas.

`table` and `slides` are not first-class delivery surfaces. Tables may appear
inside a document report. Slide-like sequencing may be represented as document
sections.

## Document Report

Reports are stored under:

```text
.visual-delivery/data/reports/{REPORT_ID}/report.json
.visual-delivery/data/reports/{REPORT_ID}/feedback.json
.visual-delivery/data/reports/{REPORT_ID}/drafts.json
```

Core shape:

```json
{
  "id": "r_...",
  "type": "document_report",
  "title": "交付汇报",
  "structure": "standard-report|complex-review",
  "presentation": "document_report",
  "content": {
    "type": "document_report",
    "surface_type": "document_report",
    "sections": [
      {
        "id": "sec-...",
        "title": "核心交付内容",
        "presentation": "document_report",
        "artifact": {
          "type": "document",
          "body": "# Markdown document"
        }
      }
    ]
  }
}
```

## Canvas Workspace

Canvas workspaces are stored under:

```text
.visual-delivery/data/canvas-workspaces/index.json
.visual-delivery/data/canvas-workspaces/{WORKSPACE_ID}/workspace.json
.visual-delivery/data/canvas-workspaces/{WORKSPACE_ID}/snapshot.json
.visual-delivery/data/canvas-workspaces/{WORKSPACE_ID}/events.json
.visual-delivery/data/canvas-workspaces/{WORKSPACE_ID}/feedback.json
.visual-delivery/data/canvas-workspaces/{WORKSPACE_ID}/assets/
```

Core shape:

```json
{
  "id": "cw_...",
  "type": "canvas_workspace",
  "title": "协作画布",
  "purpose": "moodboard、图片标注、结构图和设计决策协作",
  "status": "active",
  "tags": ["design"],
  "context": {},
  "semantic_index": {
    "version": 2,
    "zones": [
      { "id": "agent-zone", "role": "agent", "title": "Agent 工作区" },
      { "id": "user-zone", "role": "user", "title": "用户反馈区" },
      { "id": "shared-zone", "role": "shared", "title": "共享决策区" }
    ],
    "sections": [],
    "nodes": [
      {
        "shape_id": "shape:...",
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
    "relationships": [],
    "updated_at": "ISO timestamp"
  },
  "selection_policy": {
    "default": "reuse_related_active_workspace",
    "create_when": [
      "user_explicitly_requests_new_canvas",
      "no_active_canvas_exists",
      "task_context_is_unrelated_to_existing_canvases",
      "existing_canvas_is_archived_or_too_crowded"
    ]
  }
}
```

## Canvas Selection Policy

By default, reuse a canvas if it is active, recent, and semantically related to
the current task title, purpose, tags, or prompt. Create a new canvas when:

- the user explicitly asks for a new canvas,
- no active canvas exists,
- the task belongs to a clearly different design/problem space,
- the existing canvas is archived or too crowded,
- context separation is important.

## Technology Choice

Use `tldraw` as the embedded canvas SDK. It provides React integration,
editor APIs, shapes, assets, snapshots, local persistence, and optional sync.
Store `getSnapshot(editor.store)` as the source of truth and store a parallel
`semantic_index` for agent reasoning.

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
- resize sections to encompass children unless the section is intentionally a
  participatory zone
- represent relationships explicitly instead of relying only on visual
  proximity
- validate with screenshots or semantic index reads after meaningful writes

These rules are agent-facing prompts. The current executable write path remains
`PUT /api/canvas-workspaces/{WORKSPACE_ID}/snapshot`: the agent writes the
tldraw snapshot and semantic index, and includes a command batch in the optional
`event` payload.

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

`add_html_component`
: Add an interactive HTML widget to the canvas. Required fields: `html`,
`bounds`. Optional fields: `title`, `description`, `section_id`,
`component_id`. Create a tldraw placeholder shape with
`meta.vd_kind = "html_component"` and mirror the same `html` into
`semantic_index.nodes[]` as `kind = "html_component"`.

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

Use semantic kinds consistently even when the renderer uses a tldraw fallback:

| Semantic kind | Default renderer | Use |
| --- | --- | --- |
| `canvas_section` | `frame` | Named container and navigation unit |
| `text` | `text` or `geo` | Titles, instructions, analysis, captions |
| `sticky_note` | `note` or styled `geo` | One participant idea or feedback item |
| `shape` | `geo` | Diagram nodes, states, options, decisions |
| `connector` | `arrow` | Flow, dependency, evidence, reference link |
| `html_component` | tldraw placeholder + iframe overlay | Interactive HTML widget anchored on the canvas |
| `table` | grouped shapes / future table renderer | Row-column data |
| `code_block` | styled text / future code renderer | Code with language metadata |
| `label` | ellipse/geo | Short callout marker |
| `image` | `image` | Visual asset with required alt text |

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
