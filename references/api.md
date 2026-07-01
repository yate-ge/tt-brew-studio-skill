# API Reference

## Table of Contents

- [Base URL](#base-url)
- [Health](#health)
- [Delivery APIs](#delivery-apis)
- [Feedback APIs](#feedback-apis)
- [Settings APIs](#settings-apis)
- [Locale APIs](#locale-apis)
- [Report APIs](#report-apis)
- [Scaffold APIs](#scaffold-apis)
- [Canvas Workspaces](#canvas-workspaces)
- [Harness and Documents APIs](#harness-and-documents-apis)
- [File View](#file-view)
- [Design Tokens](#design-tokens)
- [WebSocket Events](#websocket-events)
- [Error Format](#error-format)

## Base URL

`http://localhost:3847`

## Health

### `GET /health`

### `GET /api/health`

Both endpoints return the same health payload. `/api/health` exists for API
namespace checks used by self-dev instructions and clients.

Response:

```json
{ "status": "ok", "uptime": 120, "version": "2.0.0" }
```

## Delivery APIs

### `POST /api/deliveries`

Create a task delivery.

Request body:

```json
{
  "mode": "task_delivery",
  "title": "string",
  "metadata": {
    "project_name": "string",
    "task_name": "string",
    "generated_at": "ISO datetime",
    "audience": "string"
  },
  "content": {
    "type": "generated_html",
    "html": "<!DOCTYPE html><html><head>...</head><body>...</body></html>"
  }
}
```

Response:

```json
{
  "id": "d_1771000000_001",
  "url": "http://localhost:3847/d/d_1771000000_001"
}
```

### `GET /api/deliveries`

Query params:

- `mode` = `task_delivery`
- `status` = `normal|pending_feedback`
- `limit` (default 50)
- `offset` (default 0)

Response:

```json
{
  "deliveries": [
    {
      "id": "d_...",
      "mode": "task_delivery",
      "status": "pending_feedback",
      "title": "...",
      "created_at": "...",
      "updated_at": "...",
      "metadata": {"project_name":"...","task_name":"..."}
    }
  ],
  "total": 1
}
```

### `GET /api/deliveries/:id`

Returns delivery with `feedback`, `drafts`, `execution_events`, and `pending_feedback_count`.

Response fields:

- delivery core (`id`, `mode`, `status`, `title`, `content`, `metadata`)
- `feedback[]`
- `drafts[]`
- `execution_events[]`
- `pending_feedback_count`

### `GET /api/deliveries/:id/execution-events`

Get execution timeline events for this delivery.

Response:

```json
{
  "delivery_id": "d_...",
  "events": [
    {
      "id": "e_...",
      "feedback_id": "f_...",
      "stage": "queued|in_progress|completed|failed|info",
      "message": "string",
      "actor": "user|agent|system",
      "meta": {},
      "created_at": "ISO datetime"
    }
  ]
}
```

### `POST /api/deliveries/:id/execution-events`

Append execution timeline event(s).

```json
{
  "events": [
    {
      "feedback_id": "f_...",
      "stage": "in_progress",
      "message": "Applying requested changes to content.md",
      "actor": "agent",
      "meta": {}
    }
  ]
}
```

## Feedback APIs

V4 uses a project-level feedback pool. Legacy delivery feedback remains for old
delivery pages.

### `GET /api/feedback`

Query params:

- `status = tracked|addressed|confirmed|archived`

Returns project-level feedback.

### `POST /api/feedback`

Creates global project feedback.

```json
{
  "content": "Feedback text",
  "source": { "type": "report", "report_id": "r_..." },
  "author": "user"
}
```

Project feedback creation writes a transparency log entry. The log uses the
harness-selected external log target when available and falls back to managed
`.visual-delivery/data/logs.json`.

### `POST /api/feedback/:id/resolve`

Marks feedback as `addressed` and stores a change record.

### `POST /api/feedback/:id/confirm`

Marks feedback as `confirmed`.

### `POST /api/feedback/:id/archive`

Marks feedback as `archived`. If the feedback originated from a report, the
report feedback mirror is updated too.

Resolve, confirm, and archive operations also write transparency log entries.

### `GET /api/deliveries/:id/feedback`

Lightweight endpoint — returns feedback items only, no delivery content.

Response:

```json
{
  "delivery_id": "d_...",
  "status": "pending_feedback",
  "feedback": [...all items...],
  "pending_count": 2,
  "pending_feedback": [...only unhandled items...]
}
```

### `POST /api/deliveries/:id/feedback/draft`

Store sidebar drafts (no status change).

```json
{
  "items": [
    {
      "id": "optional",
      "kind": "annotation|interactive",
      "payload": {},
      "target": null
    }
  ]
}
```

### `POST /api/deliveries/:id/feedback/commit`

Commit drafts to feedback entries. Delivery status recalculates to `pending_feedback`.

```json
{
  "items": [
    {
      "kind": "annotation|interactive",
      "payload": {},
      "target": null
    }
  ]
}
```

Response:

```json
{
  "delivery_id": "d_...",
  "feedback_ids": ["f_...", "f_..."],
  "status": "pending_feedback"
}
```

### `POST /api/deliveries/:id/feedback/resolve`

Mark feedback entries handled.

```json
{
  "feedback_ids": ["f_..."],
  "handled_by": "agent"
}
```

If all feedback is handled, status becomes `normal`.

### `POST /api/deliveries/:id/feedback/revoke`

Revoke (undo) unhandled feedback entries. Only removes items where `handled === false`.

```json
{
  "feedback_ids": ["f_..."]
}
```

Response:

```json
{
  "delivery_id": "d_...",
  "revoked_count": 1,
  "status": "normal"
}
```

### `PUT /api/deliveries/:id/content`

Update delivery content (for agent post-processing after feedback).

```json
{
  "content": {
    "type": "generated_html",
    "html": "<!DOCTYPE html>..."
  },
  "title": "Optional new title"
}
```

Response:

```json
{
  "delivery_id": "d_...",
  "updated_at": "ISO datetime"
}
```

### `POST /api/deliveries/:id/annotate`

Compatibility endpoint to quickly append annotation draft.

```json
{
  "content": "comment text",
  "target": {
    "component_id": "component-1",
    "target_type": "selected_text",
    "anchor": "..."
  }
}
```

## Settings APIs

### `GET /api/settings`

Returns platform configuration:

```json
{
  "language": "en",
  "language_explicit": true,
  "trigger_mode": "smart",
  "port": 3847,
  "remote": false,
  "access_key_enabled": false,
  "access_key": "vdk_...",
  "platform": {
    "name": "Task Delivery Center",
    "slogan": "Make feedback clear. Let agents work easier."
  }
}
```

`trigger_mode` values: `"auto"` | `"smart"` (default) | `"manual"`

`remote=true` is read by `scripts/start.js` on the next restart and binds the
server to `0.0.0.0`; `remote=false` binds to localhost. `access_key_enabled`
activates access-key protection for pages and APIs. Clients can provide the key
with `?vd_key=...`, `x-vd-access-key`, or the `vd_access_key` cookie.

### `PUT /api/settings`

```json
{
  "trigger_mode": "auto",
  "remote": true,
  "access_key_enabled": true,
  "access_key": "vdk_...",
  "rotate_access_key": false,
  "platform": {
    "name": "My Delivery Hub",
    "slogan": "..."
  }
}
```

Use `"rotate_access_key": true` to generate a new key server-side.

## Locale APIs

### `GET /api/locale`

Returns the current UI locale object injected into the app shell.

### `PUT /api/locale`

Replaces the current UI locale object.

```json
{
  "appTitle": "Visual Delivery",
  "settings": "Settings"
}
```

## Report APIs

V4 reports are project-scoped records stored under
`.visual-delivery/data/reports/{report_id}/`. A report owns its template
content and report-level feedback files, while committed feedback is also
mirrored into the project-level feedback pool.

### `POST /api/reports`

Creates a canonical report.

Request:

```json
{
  "title": "Design direction review",
  "structure": "standard-report|complex-review",
  "presentation": "document_report",
  "routing_reason": "Why the agent selected this template",
  "content": {
    "type": "document_report",
    "sections": []
  }
}
```

If `content` is omitted, the server creates a default `document_report`.
For `standard-report`, the default contains one focused document section. For
`complex-review`, the default contains multiple document sections for context,
core delivery content, decisions, and next steps.

`table` and `slides` are not first-class presentation values. Tables may be
rendered inside the document body. Canvas collaboration uses
`canvas_workspace`, described below.
Legacy `document`, `table`, `slides`, and `report_template` values normalize to
`document_report`. Legacy `canvas` normalizes to `canvas_workspace`; new canvas
collaboration should use the Canvas Workspaces APIs below.

Response: the hydrated report, including `feedback`, `drafts`, and
`pending_feedback_count`.

### `GET /api/reports`

Query params:

- `status`
- `search`
- `limit`
- `offset`

Returns canonical reports plus legacy deliveries mapped as read-compatible
reports.

### `GET /api/reports/:id`

Returns a hydrated report.

Important fields:

- `structure`
- `presentation`
- `content.type = "document_report"` for current reports (`report_template` is legacy-compatible)
- `content.sections[]`
- `content.change_records[]` for visible feedback-loop summaries
- `feedback[]`
- `drafts[]`
- `pending_feedback_count`

### `PUT /api/reports/:id`

Updates report metadata and content. The `id` is immutable.

### `PUT /api/reports/:id/canvas` legacy

Persists a tldraw snapshot for a legacy canvas section. New work should use
`/api/canvas-workspaces/:id/snapshot`.

Request:

```json
{
  "sectionId": "sec_...",
  "snapshot": {
    "document": { "store": {} },
    "session": {}
  }
}
```

## Scaffold APIs

Scaffolds are project-private collaboration packages. A scaffold can be a
template or widget and may include structure, seed content, interaction slots,
next actions, and an agent note explaining why it fits the current stage.

### `GET /api/scaffolds`

Query params:

- `type = template|widget`
- `stage = exploration|definition|concept|creation|review|delivery`

Response:

```json
{
  "type": "project_scaffold_library",
  "scope": "project",
  "scaffolds": [
    {
      "id": "scaffold_inspiration_wall",
      "type": "template",
      "scope": "project",
      "title": "灵感墙",
      "stage": "exploration",
      "description": "用于头脑风暴...",
      "agent_note": "当前处于探索阶段...",
      "structure": [],
      "seed_content": [],
      "interaction_slots": [],
      "next_actions": []
    }
  ],
  "total": 1
}
```

### `POST /api/scaffolds`

Creates or replaces a project-private scaffold.

```json
{
  "type": "template",
  "title": "需求定义板",
  "stage": "definition",
  "description": "string",
  "agent_note": "string",
  "structure": [],
  "seed_content": [],
  "interaction_slots": [],
  "next_actions": []
}
```

Widget scaffolds use `type = "widget"` and may include:

```json
{
  "html": "<section style=\"background:transparent\">...</section>",
  "state": {},
  "input_schema": {},
  "output_schema": {},
  "sizing": {
    "mode": "content_intrinsic",
    "min_width": 260,
    "max_width": 520,
    "min_height": 140,
    "max_height": 320
  }
}
```

First-version widgets use transparent-background HTML iframe rendering plus
JSON-style state/schema metadata. They do not require a full widget SDK.

## Canvas Workspaces

Canvas workspaces are project-scoped persistent collaboration spaces stored
under `.visual-delivery/data/canvas-workspaces/{workspace_id}/`.

### `POST /api/canvas-workspaces/select`

Selects the most relevant active canvas workspace, or creates a new one when no
related workspace exists.

```json
{
  "title": "Design collaboration",
  "purpose": "moodboard, image annotation, architecture alignment",
  "tags": ["design"],
  "context": {
    "task_name": "Current task",
    "prompt": "Current user request"
  },
  "force_new": false
}
```

### `GET /api/canvas-workspaces/:id/context`

Agent-facing inspect endpoint. Agents must read this before writing to a canvas.

Response:

```json
{
  "type": "canvas_workspace_agent_context",
  "inspect_required_before_write": true,
  "workspace": { "id": "cw_...", "title": "协作画布" },
  "snapshot": { "document": { "store": {} }, "session": {} },
  "semantic_index": {},
  "events": [],
  "open_feedback": [],
  "open_completion_requests": [
    {
      "kind": "completion_request",
      "shape_id": "shape:...",
      "status": "open",
      "prompt": "请在这里补充三种视觉方向",
      "bounds": { "x": 0, "y": 0, "w": 640, "h": 360 }
    }
  ]
}
```

### `PUT /api/canvas-workspaces/:id/snapshot`

Persists the tldraw snapshot and an agent-readable semantic index.
Visual Delivery treats tldraw `frame` shapes as canvas sections: they are named
containers, their child shapes are section content, and the semantic index
records both section summaries and `contains` relationships.

```json
{
  "snapshot": {
    "document": { "store": {} },
    "session": {}
  },
  "semantic_index": {
    "version": 2,
    "sections": [
      {
        "kind": "canvas_section",
        "shape_id": "shape:section",
        "title": "Agent 工作区",
        "child_shape_ids": ["shape:node"],
        "bounds": { "x": 0, "y": 0, "w": 960, "h": 640 }
      }
    ],
    "nodes": [
      {
        "kind": "html_component",
        "shape_id": "shape:html-component",
        "component_id": "shape:html-component",
        "title": "Priority picker",
        "description": "Interactive widget rendered on the canvas.",
        "html": "<section><button data-vd-feedback-action=\"prioritize\" data-vd-feedback-label=\"Priority A\" data-vd-feedback-item-id=\"priority-a\">Prioritize A</button></section>",
        "section_id": "shape:section",
        "bounds": { "x": 64, "y": 96, "w": 520, "h": 340 }
      }
    ],
    "assets": [
      {
        "shape_id": "shape:image",
        "asset_id": "asset:...",
        "alt_text": "Image description",
        "section_id": "shape:section"
      }
    ],
    "annotations": [],
    "completion_requests": [],
    "scaffold_instances": [],
    "widget_instances": [],
    "artifact_links": [],
    "layout_reviews": [],
    "relationships": [
      { "type": "contains", "from": "shape:section", "to": "shape:node" }
    ],
    "edit_summary": null
  }
}
```

The request may include an `event` object. Use it to record an agent command
batch whenever the agent writes to the canvas. The server stores the event in
`.visual-delivery/data/canvas-workspaces/{workspace_id}/events.json`; future
agent turns can inspect it together with the snapshot and semantic index.

```json
{
  "snapshot": { "document": { "store": {} }, "session": {} },
  "semantic_index": { "version": 2, "sections": [], "nodes": [] },
  "event": {
    "type": "agent_command_batch",
    "actor": "agent",
    "summary": "Added a decision section and three sticky notes.",
    "target": {
      "kind": "canvas_workspace",
      "workspace_id": "cw_..."
    },
    "commands": [
      {
        "op": "create_section",
        "client_id": "decision-section",
        "title": "Decision",
        "bounds": { "x": 0, "y": 0, "w": 960, "h": 640 }
      },
      {
        "op": "add_sticky",
        "client_id": "sticky-1",
        "section_client_id": "decision-section",
        "text": "Use the self-built tldraw canvas as the core runtime.",
        "color": "yellow",
        "bounds": { "x": 64, "y": 120, "w": 240, "h": 240 }
      },
      {
        "op": "review_scaffold_layout",
        "scaffold_id": "scaffold_inspiration_wall",
        "status": "passed",
        "checks": {
          "overlap_count": 0,
          "out_of_section_count": 0,
          "unreadable_count": 0,
          "sticky_note_wrong_type_count": 0
        },
        "repairs": []
      }
    ],
    "created_shape_ids": ["shape:..."],
    "mutated_shape_ids": [],
    "meta": {
      "scaffold_review": {
        "type": "scaffold_layout_review",
        "status": "passed",
        "checks": {
          "overlap_count": 0,
          "out_of_section_count": 0,
          "unreadable_count": 0,
          "sticky_note_wrong_type_count": 0
        }
      }
    }
  }
}
```

Recommended command operations:

| Operation | Purpose |
| --- | --- |
| `create_section` | Create a named tldraw frame as a container |
| `rename_section` | Update a section's navigational name |
| `duplicate_section` | Copy a section and its children |
| `organize_section` | Reflow section children into lanes or grids |
| `add_text` | Add titles, instructions, analysis, captions, or labels |
| `add_sticky` | Add one participant idea, feedback item, concern, or decision |
| `add_shape` | Add a diagram node, option, process step, or state |
| `add_connector` | Link two nodes and mirror the relationship in `semantic_index.relationships` |
| `add_html_component` | Add a sandboxed iframe-backed HTML widget anchored by a tldraw placeholder shape |
| `add_collaboration_scaffold` | Add a reusable project scaffold with structure, seed content, slots, widgets, and next actions |
| `review_scaffold_layout` | Record the scaffold layout review result and mirror it into `semantic_index.layout_reviews` |
| `add_completion_request` | Add a purple bounded user request and mirror it into `semantic_index.completion_requests` |
| `add_table` | Add row-column data as a first-class semantic object |
| `add_code_block` | Add code content with language metadata |
| `add_label` | Add a numbered or lettered callout marker |
| `add_image_asset` | Add an image with required `alt_text` |
| `set_image_alt_text` | Update image accessibility metadata |

The event command batch is an audit trail, not a separate source of truth. The
same request must still persist the actual `snapshot` and `semantic_index`.

For `add_html_component`, create or update a tldraw placeholder shape in the
snapshot with `meta.vd_kind = "html_component"`, `meta.vd_title`, and
`meta.vd_html`. Mirror the same content into `semantic_index.nodes[]` with
`kind = "html_component"`. The canvas page renders the HTML in a sandboxed
iframe overlay aligned to the placeholder shape's bounds.

When the server receives a new semantic index, it compares it with the previous
index and stores a semantic diff in `semantic_index.edit_summary`. If the
request includes an event, the same diff is mirrored into `event.semantic_diff`.

Completion requests are represented as special canvas nodes and mirrored into
`semantic_index.completion_requests[]`:

```json
{
  "kind": "completion_request",
  "shape_id": "shape:...",
  "status": "open",
  "prompt": "请在这里补全方案卡",
  "bounds": { "x": 64, "y": 96, "w": 520, "h": 300 }
}
```

Scaffold layout reviews are recorded after scaffold insertion or mutation. The
review checks overlap, section containment, minimum readable sizes, and whether
sticky-note content used real sticky-note shapes. Store the review both in the
event command batch and in `semantic_index.layout_reviews[]`; if screenshot
tooling is available, inspect the rendered scaffold and adjust before reporting
completion.

### `POST /api/reports/:id/feedback/draft`

Saves report feedback drafts for the sidebar.

```json
{ "items": [{ "kind": "interactive", "payload": {} }] }
```

### `POST /api/reports/:id/feedback/commit`

Commits feedback drafts. New feedback entries are written to both
`reports/{id}/feedback.json` and `.visual-delivery/data/feedback.json`, and a
transparency log entry records that the report feedback entered the project
feedback pool.

Common V4 template feedback targets:

```json
{
  "target": {
    "kind": "document_paragraph",
    "section_id": "sec-doc",
    "paragraph_line": 12,
    "quote": "Paragraph excerpt"
  }
}
```

```json
{
  "target": {
    "kind": "canvas_workspace",
    "workspace_id": "cw_..."
  }
}
```

```json
{
  "target": {
    "kind": "canvas_section",
    "workspace_id": "cw_...",
    "section_id": "shape:section",
    "section_title": "Agent 工作区",
    "shape_ids": ["shape:section"],
    "bounds": { "x": 0, "y": 0, "w": 960, "h": 640 }
  }
}
```

```json
{
  "target": {
    "kind": "canvas_node",
    "workspace_id": "cw_...",
    "node_id": "agent-zone",
    "section_id": "shape:section",
    "shape_id": "shape:..."
  }
}
```

```json
{
  "target": {
    "kind": "html_component",
    "workspace_id": "cw_...",
    "shape_id": "shape:html-component",
    "component_id": "shape:html-component",
    "component_title": "Priority picker",
    "bounds": { "x": 64, "y": 96, "w": 520, "h": 340 }
  }
}
```

```json
{
  "target": {
    "kind": "canvas_selection",
    "workspace_id": "cw_...",
    "section_id": "shape:section",
    "shape_ids": ["shape:..."],
    "bounds": { "x": 0, "y": 0, "w": 320, "h": 180 }
  }
}
```

### `POST /api/reports/:id/feedback/revoke`

Removes unhandled feedback entries from the report and project feedback pool,
then writes a transparency log entry.

### `POST /api/reports/:id/feedback/:feedbackId/resolve`

Marks feedback as `addressed`, sets `handled=true` for legacy UI compatibility,
stores a `changeRecord`, mirrors the state into the project feedback pool, and
writes a transparency log entry.

### `POST /api/reports/:id/feedback/:feedbackId/confirm`

Marks addressed feedback as `confirmed`, mirrors the state into the project
feedback pool, and writes a transparency log entry.

## Harness and Documents APIs

These APIs connect the platform to the project workspace itself. External project
documents are indexed in `.visual-delivery/data/document-index.json`; they are
not copied into the runtime directory.

### `GET /api/harness`

Returns the discovered project harness and document-index summary.

```json
{
  "harness": {
    "version": 1,
    "project_root": "/path/to/project",
    "strategy": "external-first",
    "managed_fallback": {
      "logs_path": ".visual-delivery/data/logs",
      "documents_path": ".visual-delivery/data/documents"
    },
    "sources": [
      {
        "id": "src_...",
        "path": "docs",
        "kind": "project_documentation",
        "source": "external",
        "writable": true,
        "document_count": 3
      }
    ],
    "discovered_at": "ISO datetime",
    "updated_at": "ISO datetime"
  },
  "document_index": {
    "project_root": "/path/to/project",
    "scanned_at": "ISO datetime",
    "total": 5
  }
}
```

### `POST /api/harness/rescan`

Rescans the project root for external documents and rewrites
`harness.json` / `document-index.json`.

### `POST /api/harness/sources`

Adds a manual harness source. The path must stay inside the project root.

```json
{
  "path": "docs",
  "title": "Project docs",
  "kind": "project_documentation",
  "log_target": false
}
```

### `PUT /api/harness/sources/:id`

Updates a source display name, kind, enabled state, or log-target state.

```json
{
  "title": "Work log",
  "kind": "work_log",
  "enabled": true,
  "log_target": true
}
```

When `log_target=true`, the source becomes the preferred transparency log target.

### `DELETE /api/harness/sources/:id`

Disables a source without deleting project files.

### `GET /api/documents`

Query params:

- `kind`
- `search`
- `limit` (default 100)
- `offset` (default 0)

Response:

```json
{
  "documents": [
    {
      "id": "doc_...",
      "source": "external",
      "kind": "agent_instructions",
      "path": "AGENTS.md",
      "title": "AGENTS.md",
      "writable": true,
      "size": 3200,
      "updated_at": "ISO datetime",
      "last_seen_at": "ISO datetime",
      "last_indexed_at": "ISO datetime"
    }
  ],
  "total": 1,
  "scanned_at": "ISO datetime"
}
```

### `GET /api/documents/:id`

Returns indexed document content for text-sized files. Large files remain
indexed but are not loaded into the browser.

```json
{
  "document": { "id": "doc_...", "path": "AGENTS.md" },
  "content": "# AGENTS.md\n...",
  "truncated": false
}
```

## File View

### `GET /api/files/view?path=...`

Serves local project files for viewing in generated pages. Restricted to the project directory (parent of DATA_DIR).

Query params:

- `path` (required) — absolute or relative file path

Response: file content with detected MIME type.

Error codes:

- `INVALID_REQUEST` (400) — missing path
- `FORBIDDEN` (403) — path outside project directory
- `NOT_FOUND` (404) — file does not exist

## Design Tokens

### `GET /api/design-tokens`

Returns `tokens.json`.

## WebSocket Events

Server-to-client events:

- `connected`
- `new_delivery`
- `update_delivery`
- `feedback_received`
- `settings_updated`
- `design_updated`
- `content_updated`
- `feedback_revoked`
- `harness_updated`
- `harness_rescanned`
- `locale_updated`

Event payload shape:

```json
{
  "event": "update_delivery",
  "data": { "id": "d_...", "status": "pending_feedback" }
}
```

## Error Format

```json
{
  "error": {
    "code": "INVALID_REQUEST",
    "message": "..."
  }
}
```

Common codes:

- `INVALID_REQUEST` (400)
- `NOT_FOUND` (404)
- `INTERNAL_ERROR` (500)
