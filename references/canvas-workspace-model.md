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
    "version": 1,
    "zones": [
      { "id": "agent-zone", "role": "agent", "title": "Agent 工作区" },
      { "id": "user-zone", "role": "user", "title": "用户反馈区" },
      { "id": "shared-zone", "role": "shared", "title": "共享决策区" }
    ],
    "nodes": [
      {
        "shape_id": "shape:...",
        "type": "geo|text|image|arrow",
        "title": "节点标题",
        "text": "agent-readable text",
        "x": 0,
        "y": 0,
        "w": 320,
        "h": 180,
        "asset_id": null
      }
    ],
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
