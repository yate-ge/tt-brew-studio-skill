# Canvas Widgets

Canvas widgets are interactive HTML components anchored on the canvas workspace.
This document is the widget contract: what a widget is, when an agent should
create one, what the agent writes, what the runtime guarantees, and how widget
data flows between user, canvas, and agent.

Design goal: an agent that can generate plain HTML fragments can generate
widgets with the same reliability. Every widget-specific concern (transparent
background, intrinsic sizing, proportional scaling, state persistence) is owned
by the runtime, not by the generated HTML.

## 1. What A Widget Is (And Is Not)

A widget is a canvas-native interactive object:

- rendered as a sandboxed transparent iframe anchored to a tldraw placeholder
  shape (`meta.vd_kind = "html_component"`)
- scaled proportionally like an image, never reflowed, when the canvas zooms or
  the user resizes the anchor shape
- owner of a per-instance JSON `state` that persists in the snapshot and is
  readable/writable by both the user (through interaction) and the agent
  (through commands)

Boundary rule (borrowed from FigJam, which forbids nesting stickies/shapes/
connectors inside widgets): a widget must not swallow content that belongs on
the canvas as native nodes. A word-cloud widget may *read* sticky notes; the
brainstorm itself stays as stickies. When a widget produces a durable artifact
(a chosen palette, a final ranking), prefer materializing the result as native
canvas nodes and keep the widget disposable.

## 2. When To Create A Widget (Trigger Rubric)

Create a widget only when at least one condition holds:

1. **Interaction produces state** that should live on the canvas (votes,
   choices, scores).
2. **Presentation needs live computation** (weighted matrix, simulator,
   calculator).
3. **Canvas content needs interactive aggregation** (word cloud or chart over
   stickies with hover/filter). Static charts may instead be drawn as native
   shapes.
4. **The agent needs machine-readable input** conforming to a schema (rubric
   scoring, structured poll).
5. **The interaction form exceeds native canvas ability** (drag-to-rank, card
   flip, slider, before/after compare).

Otherwise use CanvasIR native nodes. Static statements, freely editable
material, and anything users should move/connect/edit belongs to native nodes.

## 3. Three-Tier Generation Strategy

Stability comes from shrinking the generation surface, in order of preference:

- **Tier 1 — parameterized template**: the agent sends only
  `{ "template_id": "...", "params": {...} }`. Params are validated against the
  template's `params_schema`; HTML and interaction logic come from the curated
  template. Always check `GET /api/canvas-widget-templates` (also included in
  agent-context) before generating HTML.
- **Tier 2 — template + overrides**: a template instance with agent-supplied
  copy, options, labels, or seeded state. Same `params` path; templates accept
  content-bearing params.
- **Tier 3 — freeform fragment**: only for interaction forms no template
  covers. The agent writes an HTML *fragment* (no `<html>`, `<head>`, `<body>`)
  plus state/schema/sizing metadata, and it passes the validation pipeline
  before mounting.

## 4. Widget Spec (What The Agent Writes)

```json
{
  "op": "add_widget",
  "id": "vote-directions",
  "parent": "decision_zone",
  "template_id": "vote",
  "params": {
    "question": "哪个视觉方向继续深化？",
    "options": ["方向 A：极简", "方向 B：拟物", "方向 C：编辑风"]
  }
}
```

Tier 3 form:

```json
{
  "op": "add_widget",
  "id": "pricing-simulator",
  "parent": "business_zone",
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

Canonical widget spec fields (all optional except one of `template_id`/`html`):

| Field | Meaning |
| --- | --- |
| `template_id` + `params` | Tier 1/2 instantiation |
| `html` | Tier 3 fragment; forbidden to contain `<html>/<head>/<body>` |
| `title`, `description` | Display + semantic index text |
| `state` | Initial per-instance JSON state |
| `input_schema` | Shape of state the agent may patch (documentation-level) |
| `output_schema` | Shape of `vd.emit` payloads; runtime validates emits |
| `sizing` | `{ mode, min_width, max_width, min_height, max_height }` |

`update_widget` patches an existing instance:

```json
{ "op": "update_widget", "id": "vote-directions", "state_patch": { "closed": true } }
{ "op": "update_widget", "id": "pricing-simulator", "html": "<section>v2...</section>" }
```

`state_patch` shallow-merges top-level keys. Replacing `html` bumps
`widget_version` and preserves `state` (state and HTML are stored separately by
design). Legacy `add_html_component` remains as an alias for the raw Tier 3
path.

## 5. Runtime Assembly Contract (What The Agent Never Writes)

At render time the runtime assembles the final iframe document:

```text
final document =
  reset CSS        html,body { background: transparent; margin: 0 }
+ design tokens    CSS variables from the project design spec
+ widget prelude   window.__VD_WIDGET__ = { instance, state, output_schema, sizing }
+ widget root      <div id="vd-widget-root" style="width:fit-content">FRAGMENT</div>
+ bridge script    window.vd API, ResizeObserver, feedback, error trap
```

Consequences the agent can rely on and must not re-implement:

- background is transparent; do not paint `html/body`, style your own card
- intrinsic size is measured automatically from `#vd-widget-root`; never set
  fixed pixel width/height on the root element
- scaling is external; widget HTML renders at intrinsic size, always
- `window.vd` is always present; scripts may assume it after `DOMContentLoaded`

## 6. `window.vd` API And Message Protocol

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

Feedback attributes (`data-vd-feedback-action`) keep working inside widgets and
route to the existing feedback pipeline.

## 7. Sizing And Scaling Model

Every widget instance tracks:

- `intrinsic` — natural content size in CSS px, reported by the bridge and
  stored in `meta.vd_intrinsic_size`
- `scale` — `anchor_shape.w / intrinsic.w`

Rendering: the iframe is laid out at `intrinsic` size and transformed with
`scale × canvas_zoom`, origin top-left. Content therefore scales like an image
in both cases required by the spec: canvas zoom and user resize of the anchor
shape. Aspect ratio is enforced by snapping the anchor shape's height to
`w × intrinsic.h / intrinsic.w` after edits settle.

When content grows (intrinsic size changes), the host resizes the anchor shape
to `intrinsic × scale`, clamped by `sizing` min/max, keeping scale stable.

## 8. State Model And Data Flow

State is a JSON object stored in the anchor shape's `meta.vd_widget_state`,
mirrored into `semantic_index.widget_instances[]`. Merge semantics: shallow
merge of top-level keys, last-write-wins per key, with `vd_state_version`
(monotonic counter) and `vd_state_actor` (`user` | `agent`) stamps.

```text
user loop:   interaction -> vd.state.set(patch) -> host merges into shape meta
             -> debounced snapshot save -> semantic_index.widget_instances
             -> agent reads via agent-context next turn

agent loop:  update_widget command -> server merges state in IR + snapshot
             -> workspace update event -> host pushes vd:widget:state into
             live iframes -> vd.state.subscribe fires

output loop: vd.emit(type, payload) -> validated vs output_schema ->
             canvas feedback entry (kind widget_output) + canvas event ->
             agent handles it like any structured feedback
```

Routing rule: continuous state changes go to the snapshot only; explicit
`vd.emit` events go to the feedback pool. This keeps the feedback pool free of
interaction noise.

## 9. Validation And Repair Ladder

Every widget passes validation before mounting. The same pipeline runs in
`add_widget` / `update_widget`, in `POST /api/canvas-widgets/validate` (dry
run), and the mounted result is checked in the browser.

Static checks (server, before accept):

- fragment parses; no `<html>/<head>/<body>` (auto-repair: unwrap body content)
- no opaque background painted on the document root
- inline `<script>` contents pass a syntax check (`new Function`)
- no external script/frame sources; external images allowed with warning
- `sizing` clamped to global bounds (min 160×80, max 1200×900); html size cap

Mount checks (browser, after render — recorded as the instance's
`widget_review`):

- iframe mounted and bridge sent `vd:widget:ready`
- intrinsic size reported within bounds and non-degenerate
- no `vd:widget:error` during the first seconds

Repair ladder on failure:

1. auto-repair (unwrap wrappers, strip forbidden styles, clamp sizing)
2. reject with structured errors so the agent can regenerate once
3. degrade to a static card (title + description + generic feedback buttons) —
   the widget falls back to exactly the plain-HTML capability floor, never
   blocking the collaboration

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

## 10. Commands And Endpoints

```text
GET  /api/canvas-widget-templates                 template catalog + params_schema
POST /api/canvas-widgets/validate                 dry-run a widget spec
POST /api/canvas-workspaces/{ID}/commands         add_widget / update_widget ops
GET  /api/canvas-workspaces/{ID}/agent-context    includes widget_templates and
                                                  widget_instances with state
```

## 11. Built-In Template Catalog (Tier 1)

| id | Purpose | Key params |
| --- | --- | --- |
| `vote` | Dot-vote options, live tally | `question`, `options[]`, `max_votes_per_user` |
| `alignment_scale` | 1–5 agreement/confidence scale with average | `statement`, `min_label`, `max_label` |
| `rubric` | Criteria × 1–5 scoring, submit emits scores | `title`, `criteria[]` |
| `bar_chart` | Compare counts/values, hover highlight | `title`, `data[{label,value}]`, `unit` |
| `word_cloud` | Weighted terms, click emits term | `title`, `words[{text,weight}]` |
| `timer` | Workshop countdown, start/pause/reset | `label`, `duration_sec` |

Templates are seedable: content-bearing params (`options`, `criteria`, `data`,
`words`) accept agent-analyzed canvas content.

## 12. Security And Versioning

- Widget iframes run sandboxed **without** `allow-same-origin`: opaque origin,
  no access to the host DOM or storage; the postMessage bridge is the only
  channel.
- No external scripts. Network access is not part of the v1 contract.
- `vd_widget_version` increments on html replacement; the previous html is kept
  in `vd_html_prev` for one-step rollback. State survives html updates.

## 13. Renderer Note

The v1 renderer is a viewport overlay anchored to a placeholder shape. The
contract above (spec, vd API, sizing/scaling, state) is renderer-independent; a
future migration to a custom tldraw shape (`HTMLContainer`) changes only the
anchoring/rendering internals and is the planned path for native selection,
z-order, and export behavior.
