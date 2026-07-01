---
name: visual-delivery
description: >
  Delivers task outcomes through a project-scoped visual workspace. Creates
  document reports, persistent canvas workspaces, logs, and feedback loops for
  agent-user collaboration. Use when the agent should
  communicate work visually or collect structured feedback. Skip for simple
  inline text answers.
---

## Visual Delivery

Visual Delivery is a project-level visual communication workspace for AI employee
mode. A single runtime serves the current project through `{CWD}/.visual-delivery`.

The core loop is:

```text
Report created -> log recorded -> user gives feedback
-> feedback enters project pool -> agent handles feedback
-> next report shows what changed
```

### Paths

```text
SKILL_DIR = {directory containing this SKILL.md}
DATA_DIR  = {CWD}/.visual-delivery
```

### Activation Rules

When this skill is invoked, immediately run Step 1. Do not describe the skill,
print a capability menu, or ask an open-ended startup question.

Use this skill when:

- the result benefits from visual review, comparison, or structured decisions
- the task is part of an ongoing project
- the user asks for a report, review page, visual delivery, design canvas, log,
  or structured feedback collection

Skip visual delivery for short confirmations, tiny factual answers, or simple
one-off replies unless the user explicitly asks for visual delivery.

### Language Model

- `conversation_lang`: follows the user's current message every turn.
- `platform_lang`: language used by the Visual Delivery web UI.
- On first initialization, set `platform_lang = conversation_lang`.
- Later turns do not auto-switch `platform_lang`; change it only when the user
  explicitly asks or changes Settings.
- Agent chat replies use `conversation_lang`.
- Report content and UI text use `platform_lang`.

### Step 1: Ensure Service Is Running

Detect interaction language first:

- Chinese -> `zh`
- English -> `en`
- Japanese -> `ja`
- Korean -> `ko`
- otherwise use the closest appropriate language code

Tell the user briefly:

- `zh`: `正在启动视觉交付服务...`
- `en`: `Starting Visual Delivery service...`

Run:

```bash
node {SKILL_DIR}/scripts/start.js --data-dir {DATA_DIR} --lang {lang}
```

Parse stdout JSON.

| `status` | Action |
|----------|--------|
| `started` | Continue. If `first_run` is true, mention the initialized design spec path. |
| `already_running` | Continue. |
| `error` | Tell the user the `message` and stop. |

Ready message:

- `zh`: `视觉交付服务已就绪：{local_url}`
- `en`: `Visual Delivery ready at {local_url}`.

If the user asks for remote access, run:

```bash
node {SKILL_DIR}/scripts/start.js --data-dir {DATA_DIR} --remote
```

Or persist the choice for the next restart:

```bash
curl -s -X PUT http://localhost:3847/api/settings \
  -H 'Content-Type: application/json' \
  -d '{ "remote": true }'
```

If the user asks to protect the site with a key, enable the access key in
Settings or through the API:

```bash
curl -s -X PUT http://localhost:3847/api/settings \
  -H 'Content-Type: application/json' \
  -d '{ "access_key_enabled": true }'
```

Then share the key from `GET /api/settings`. Users can access the site with
`?vd_key=...`; API clients can use the `x-vd-access-key` header.

### Step 1b: Initialize Project Workspace

On first run, identify the project and connect existing project knowledge before
creating reports.

1. Read likely project metadata:
   - `package.json`
   - `README.md` / `README.zh-CN.md`
   - `AGENTS.md`, `CLAUDE.md`, docs, references, memory, notes, logs
2. Update project config:

```bash
curl -s -X PUT http://localhost:3847/api/project \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "DETECTED PROJECT NAME",
    "description": "1-2 sentence project summary"
  }'
```

3. Scan or rescan the project harness:

```bash
curl -s -X POST http://localhost:3847/api/harness/rescan
```

Principles:

- Prefer indexing external project documents over copying them.
- Do not create duplicate logs when the project already has a working memory or
  log system.
- Use Visual Delivery managed logs/documents only as fallback.

### Step 1c: Locale Setup

English and Chinese have built-in presets. For all other languages, the agent
may generate or update `{DATA_DIR}/data/locale.json` through:

```bash
curl -s http://localhost:3847/api/locale
curl -s -X PUT http://localhost:3847/api/locale \
  -H 'Content-Type: application/json' \
  -d '{ "appTitle": "...", "settings": "...", "...": "..." }'
```

Generate or update locale when:

- `platform_lang` is not English/Chinese and the current locale is English
- the locale has fewer keys than `{DATA_DIR}/locales/en.json`

### Step 2: Decide Whether To Create A Report

Read settings:

```bash
curl -s http://localhost:3847/api/settings
```

| `trigger_mode` | Behavior |
|----------------|----------|
| `auto` | Always create a visual report for task outcomes. |
| `smart` | Create a report for complex/structured work; respond inline for simple replies. |
| `manual` | Create a report only when explicitly requested. |

### Step 3: Route Delivery Surface

Before generating a visual delivery, choose one of two first-class surfaces and
briefly state the reason. The agent chooses by default; the user may override.

Surface types:

- `document_report`: the delivery itself is an interactive document. Use it for
  reports, implementation summaries, reviews, decisions, evidence, and follow-up
  actions. Tables may appear as Markdown or document blocks, but `table` is not a
  separate delivery mode.
- `canvas_workspace`: the delivery itself is a persistent project canvas. Use it
  for design creativity, moodboards, image annotation, product architecture
  alignment, mind maps, visual planning, and any task that benefits from spatial
  co-creation. `slides` is not a separate delivery mode.

Document report structure:

- `standard-report`: one focused report, short-cycle or single artifact.
- `complex-review`: multi-section document with reasoning, evidence, decisions,
  and feedback prompts.
- Use document sections for context, rationale, conclusions, comparisons,
  decision matrices, risks, and structured checks.
- Legacy `document`, `table`, `slides`, and `report_template` requests normalize
  to `document_report`; do not route new work to those as separate first-class
  delivery modes.
- When `content` is omitted, `/api/reports` creates a `document_report`.

Canvas workspace behavior:

- Treat the canvas as a project co-creation workspace, not a one-off report
  section, screenshot, or embedded artifact.
- Reuse the current related canvas by default. Create a new canvas only when the
  user explicitly asks, no active canvas exists, the task is clearly unrelated,
  or the existing canvas is archived / too crowded.
- The implementation uses `tldraw` and follows Cowart's local infinite-canvas
  direction: project-local persistence, image assets, annotations, selected
  regions, and agent-readable canvas state.
- Agent can continuously add material, organize ideas, place options, explain
  decisions, and advance product/design thinking on the canvas.
- User can annotate, add material, select regions, and submit feedback in the
  same canvas space.
- Use `html_component` canvas nodes when the board needs a localized interactive
  widget: calculators, comparison dashboards, small charts, simulators,
  decision pickers, or custom review controls. The tldraw shape is the
  position/size placeholder; the actual HTML lives in `semantic_index.nodes[]`
  and renders as a sandboxed iframe overlay inside the canvas.
- Use tldraw frame shapes as Visual Delivery canvas sections. A section is a
  named container with a visible top-left title; shapes reparented under that
  frame are treated as the section's children in the semantic index.
- Prefer sections for idea clusters, moodboard lanes, feedback areas, option
  groups, and agent work areas. Keep section names short and navigational.
- Canvas pages must support fullscreen viewing and feedback on selected canvas
  elements through `canvas_selection` targets.
- Canvas pages should support section-level operations when possible: create a
  section around the current selection, duplicate a section, organize a
  section's children, and rename the selected section.
- Use the FigJam-inspired canvas discipline for agent work:
  - inspect the existing workspace before writing
  - plan the board narrative left-to-right, top-to-bottom
  - use sections as short, navigational containers
  - distinguish structural text from user/participant input
  - use connector relationships for dependency, flow, and evidence links
  - keep every write small enough to validate, then save the snapshot and
    semantic index
  - record created or mutated shape ids in the canvas event so future agent turns
    can reference them deterministically
- The report feedback panel is a floating workspace control, independent from
  the report content layout.
- Persist both the raw tldraw snapshot and a semantic index so the agent can
  understand sections, child relationships, shapes, selections, image alt text,
  annotations, and workspace history later.

Canvas node semantics borrowed from FigJam:

- `section`: rendered as a tldraw `frame`; use it as the parent/container for
  related content.
- `sticky_note`: use for individual user ideas, brainstorm items, concerns, or
  decisions. Keep one idea per sticky. Do not use sticky notes for instructions
  or long analysis.
- `text`: use for board titles, section headings, prompts, instructions,
  captions, and analysis.
- `shape`: use for diagram nodes, states, options, and process steps.
- `connector`: use for spatial relationships; record `from`, `to`, direction,
  line type, and optional label in `semantic_index.relationships`.
- `html_component`: use for embedded interactive HTML widgets. Store the
  component `html`, `title`, `description`, `bounds`, and backing `shape_id` in
  `semantic_index.nodes[]`; use a tldraw placeholder shape with
  `meta.vd_kind = "html_component"` as the spatial anchor.
- `table`, `code_block`, and `label`: treat as first-class semantic kinds even
  when their current renderer falls back to grouped tldraw shapes. Do not model
  tables as unrelated rectangles or code as plain body text in the semantic
  index.

Canvas write prompt:

```text
Before writing to a canvas workspace, read the workspace detail and inspect
`semantic_index`. If the task is additive, choose the active related section or
create a new named section. Plan content as an ordered command batch. After
modifying the tldraw snapshot, persist both `snapshot` and `semantic_index` via
`PUT /api/canvas-workspaces/{WORKSPACE_ID}/snapshot`, and include an `event`
with `commands`, `created_shape_ids`, `mutated_shape_ids`, and a short summary.
```

Feedback targets:

- Document reports should expose `document_paragraph` targets with paragraph
  line and quote metadata.
- Canvas workspaces should expose `canvas_workspace`, `canvas_section`,
  `canvas_node`, and `canvas_selection` targets with shape ids and bounds when
  available.

Routing explanation example:

```text
这次主要是实现总结和决策确认，我会使用 document_report；
表格内容会作为文档内的结构化段落呈现。
```

```text
这次涉及 moodboard、图片标注和视觉方向协作，我会复用相关的 canvas_workspace；
如果没有匹配画布，再创建新的项目画布。
```

### Step 4: Create Report

Create document reports through `/api/reports`, not `/api/deliveries`.

Minimal report:

```bash
curl -s -X POST http://localhost:3847/api/reports \
  -H 'Content-Type: application/json' \
  -d '{
    "title": "REPORT TITLE",
    "structure": "standard-report",
    "presentation": "document_report",
    "routing_reason": "Why this template was selected"
  }'
```

Rich report with sections:

```json
{
  "title": "REPORT TITLE",
  "structure": "complex-review",
  "presentation": "document_report",
  "routing_reason": "Document report is appropriate because this is a delivery review.",
  "content": {
    "type": "document_report",
    "version": 1,
    "structure": "complex-review",
    "presentation": "document_report",
    "sections": [
      {
        "id": "sec-summary",
        "title": "交付汇报",
        "status": "draft",
        "narrative": "What the agent delivered and why.",
        "presentation": "document_report",
        "artifact": {
          "type": "document",
          "body": "# 交付汇报\n\n说明产出、证据、影响范围和待确认事项。"
        }
      }
    ]
  }
}
```

### Step 4b: Select Or Create Canvas Workspace

Create or reuse canvas workspaces through `/api/canvas-workspaces/select`.

```bash
curl -s -X POST http://localhost:3847/api/canvas-workspaces/select \
  -H 'Content-Type: application/json' \
  -d '{
    "title": "视觉方向协作",
    "purpose": "moodboard、图片标注、结构图和设计决策协作",
    "tags": ["design", "moodboard"],
    "context": {
      "task_name": "TASK NAME",
      "prompt": "Current user request"
    }
  }'
```

The selection response includes `workspace` and `selection.reason`. Use the
returned workspace URL pattern `/canvas?workspace={WORKSPACE_ID}`.

After creation, tell the user:

```text
{local_url}/reports?report={report_id}
```

### Step 5: Record Work Transparently

Every important action should be recorded, but avoid duplicate project logs.

Use project harness first:

```bash
curl -s http://localhost:3847/api/harness
```

If no appropriate external log/memory exists, use managed logs:

```bash
curl -s -X POST http://localhost:3847/api/logs \
  -H 'Content-Type: application/json' \
  -d '{
    "type": "auto",
    "event": "report_created",
    "title": "Created report: ...",
    "reportId": "r_..."
  }'
```

Log entries should explain:

- what happened
- why it happened
- related report/document/feedback ids
- next action

### Step 6: Process User Feedback

Feedback is project-level work, even when submitted inside a report.

Read report feedback:

```bash
curl -s http://localhost:3847/api/reports/{REPORT_ID}/feedback
```

Read project feedback pool:

```bash
curl -s http://localhost:3847/api/feedback
curl -s 'http://localhost:3847/api/feedback?status=tracked'
```

Feedback states:

```text
tracked -> addressed -> confirmed -> archived
```

When acting on feedback:

1. Read feedback content and target.
2. Modify the actual artifact, code, document report, or canvas workspace.
3. Update the existing report / workspace or create the next report.
4. Resolve feedback with a concrete change record.

Resolve:

```bash
curl -s -X POST http://localhost:3847/api/reports/{REPORT_ID}/feedback/{FEEDBACK_ID}/resolve \
  -H 'Content-Type: application/json' \
  -d '{
    "changeRecord": {
      "addressed_in_report_id": "r_...",
      "change_summary": "What changed",
      "diff_refs": ["sec-...", "file-or-artifact-ref"],
      "needs_confirmation": true
    }
  }'
```

Confirm after user accepts:

```bash
curl -s -X POST http://localhost:3847/api/reports/{REPORT_ID}/feedback/{FEEDBACK_ID}/confirm
```

The report page must show addressed/confirmed feedback as a visible change
record strip so the user can see what changed without searching history.

### Step 7: Update Canvas Workspaces

For canvas workspaces, persist tldraw snapshots and semantic indexes:

```bash
curl -s -X PUT http://localhost:3847/api/canvas-workspaces/{WORKSPACE_ID}/snapshot \
  -H 'Content-Type: application/json' \
  -d '{
    "snapshot": { "document": { "store": {} }, "session": {} },
    "semantic_index": {
      "version": 2,
      "sections": [],
      "nodes": [],
      "assets": [],
      "annotations": [],
      "relationships": []
    }
  }'
```

When the agent adds canvas content, ensure the content is meaningful:

- place idea clusters, references, options, constraints, and decision points
- separate agent work areas, user feedback areas, and shared decision areas
- keep user feedback areas visible
- put related canvas objects inside named sections; section membership should be
  represented as `contains` relationships in `semantic_index.relationships`
- preserve image alt text on image nodes and mirror it into
  `semantic_index.assets[].alt_text`
- for embedded HTML widgets, create a tldraw placeholder shape with
  `meta.vd_kind = "html_component"` and mirror `html`, `title`, `description`,
  `shape_id`, and `bounds` into `semantic_index.nodes[]`
- connect canvas nodes and selected regions to feedback targets when possible

Canvas feedback targets should identify the reviewed object:

```json
{
  "kind": "canvas_workspace|canvas_section|canvas_node|html_component|canvas_selection",
  "workspace_id": "cw_...",
  "section_id": "shape:...",
  "node_id": "agent-zone",
  "component_id": "shape:html-component",
  "shape_ids": ["shape:..."],
  "bounds": { "x": 0, "y": 0, "w": 320, "h": 180 }
}
```

Document reports should expose heading navigation and paragraph-level targets:

```json
{
  "kind": "document_paragraph",
  "section_id": "sec-...",
  "paragraph_line": 12,
  "quote": "Paragraph excerpt..."
}
```

### Step 8: Legacy Delivery Compatibility

`/api/deliveries` remains for old generated HTML deliveries and existing pages.
Do not use it for new V4 reports unless maintaining legacy content. New work
should use `/api/reports`.

### References

- Product design: [docs/product-design-v4.md](docs/product-design-v4.md)
- Implementation plan: [docs/implementation-plan-v4.md](docs/implementation-plan-v4.md)
- API endpoints: [references/api.md](references/api.md)
- Canvas workspace model: [references/canvas-workspace-model.md](references/canvas-workspace-model.md)
- Generative UI guide: [references/generative-ui-guide.md](references/generative-ui-guide.md)
- Feedback payload model: [references/feedback-schema.md](references/feedback-schema.md)
- Design tokens: [references/design-system.md](references/design-system.md)
