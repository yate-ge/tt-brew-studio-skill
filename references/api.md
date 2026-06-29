# API Reference

## Table of Contents

- [Base URL](#base-url)
- [Health](#health)
- [Delivery APIs](#delivery-apis)
- [Feedback APIs](#feedback-apis)
- [Settings APIs](#settings-apis)
- [Locale APIs](#locale-apis)
- [Report APIs](#report-apis)
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
  "presentation": "document|table|canvas|slides",
  "routing_reason": "Why the agent selected this template",
  "content": {
    "type": "report_template",
    "sections": []
  }
}
```

If `content` is omitted, the server creates a default `report_template`.
For `standard-report`, the default contains one section using the requested
presentation. For `complex-review`, the default contains mixed sections:

- `document` for context and explanation
- the requested primary presentation for the main artifact
- `table` for structured decisions when useful
- `slides` for step-by-step review when useful

For `canvas` reports, sections include a tldraw artifact with role-aware seed
nodes and regions. The default canvas schema separates:

- `agent` nodes for agent work, reasoning, options, and sources
- `user` nodes for user comments, added material, and annotations
- `shared` nodes for decisions, tradeoffs, and next actions

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
- `content.type = "report_template"` for V4 template reports
- `content.sections[]`
- `content.change_records[]` for visible feedback-loop summaries
- `feedback[]`
- `drafts[]`
- `pending_feedback_count`

### `PUT /api/reports/:id`

Updates report metadata and content. The `id` is immutable.

### `PUT /api/reports/:id/canvas`

Persists a tldraw snapshot for a canvas section.

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
    "kind": "table_field",
    "section_id": "sec-table",
    "column_key": "score",
    "column_label": "评分"
  }
}
```

```json
{
  "target": {
    "kind": "table_row",
    "section_id": "sec-table",
    "row_id": "option-a",
    "row_index": 1,
    "row_label": "方案 A"
  }
}
```

```json
{
  "target": {
    "kind": "canvas_node",
    "section_id": "sec-canvas",
    "node_id": "agent-zone",
    "shape_id": "shape:vd-sec-canvas-agent-zone"
  }
}
```

```json
{
  "target": {
    "kind": "slide_page",
    "section_id": "sec-slides",
    "slide_id": "slide-01",
    "slide_index": 1
  }
}
```

```json
{
  "target": {
    "kind": "slide_decision",
    "section_id": "sec-slides",
    "slide_id": "slide-02",
    "slide_index": 2,
    "decision_id": "decision-template-choice",
    "decision_status": "needs_decision",
    "prompt": "是否采用画布模式作为默认创意评审模板？"
  }
}
```

```json
{
  "target": {
    "kind": "canvas_selection",
    "section_id": "sec-canvas",
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
