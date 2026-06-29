---
name: visual-delivery
description: >
  Delivers task outcomes through a project-scoped visual workspace. Creates
  structured reports, review pages, canvas/table/document/slides templates, logs,
  and feedback loops for agent-user collaboration. Use when the agent should
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

### Step 3: Route Report Template

Before generating the report, choose a template and briefly state the reason.
The agent chooses by default; the user may override.

Structure layer:

- `standard-report`: one focused report, short-cycle or single artifact
- `complex-review`: multi-section review with artifacts, reasoning, decisions,
  and feedback prompts

Complex-review routing:

- Use mixed sections instead of repeating one presentation layer.
- Use `document` for context, rationale, and conclusions.
- Use `table` for comparisons, decision matrices, risks, and structured checks.
- Use `canvas` for design creativity, brainstorming, inspiration collection, and
  product/design co-creation.
- Use `slides` for step-by-step stakeholder review and decision walkthroughs.
- When `content` is omitted, `/api/reports` creates a default mixed-section
  `report_template` based on the requested primary presentation.

Presentation layer:

- `document`: analysis, rationale, proposals, prose-heavy reports
- `table`: data, comparisons, evaluation matrices, structured rows
- `canvas`: design ideation, brainstorming, inspiration collection, product
  design thinking, spatial/visual collaboration
- `slides`: multi-step narrative, stakeholder walkthrough, pitch/review deck

Canvas mode:

- Use for design creativity, brainstorming, inspiration collection, product
  design direction, and visual collaboration.
- Treat it as a project co-creation workspace, not a static image report or a
  one-off canvas screenshot.
- The implementation uses `tldraw` and follows the local infinite-canvas
  collaboration direction of Cowart.
- Agent can continuously add material, organize ideas, place options, explain
  decisions, and advance product/design thinking on the canvas.
- User can annotate, add material, select regions, and submit feedback in the
  same canvas space.
- Persist canvas state in the current project workspace. Later reports may
  reference the canvas page, selected nodes, or snapshots as artifacts.

Template feedback targets:

- Document templates should expose `document_paragraph` targets with paragraph
  line and quote metadata.
- Table templates should expose sortable/filterable views plus `table_row` and
  `table_field` targets.
- Canvas templates should expose `canvas_node` and `canvas_selection` targets.
- Slides templates should expose `slide_page` targets and `slide_decision`
  targets for pages that need confirmation.

Routing explanation example:

```text
这次汇报包含多个方案、设计推理和待确认点，我会使用 complex-review；
其中视觉方案部分用 canvas，决策对比用 table，结论用 document。
```

### Step 4: Create Report

Create reports through `/api/reports`, not `/api/deliveries`.

Minimal report:

```bash
curl -s -X POST http://localhost:3847/api/reports \
  -H 'Content-Type: application/json' \
  -d '{
    "title": "REPORT TITLE",
    "structure": "standard-report",
    "presentation": "document",
    "routing_reason": "Why this template was selected"
  }'
```

Rich report with sections:

```json
{
  "title": "REPORT TITLE",
  "structure": "complex-review",
  "presentation": "canvas",
  "routing_reason": "Canvas is appropriate because this is a design ideation review.",
  "content": {
    "type": "report_template",
    "version": 1,
    "structure": "complex-review",
    "presentation": "canvas",
    "sections": [
      {
        "id": "sec-direction",
        "title": "方向探索",
        "status": "draft",
        "narrative": "What the agent explored and why.",
        "presentation": "canvas",
        "artifact": {
          "type": "canvas",
          "mode": "tldraw",
          "tldraw_snapshot": null,
          "seed_nodes": [
            { "id": "agent-brief", "title": "Agent 工作区", "body": "放置方案和推理。" },
            { "id": "inspiration", "title": "灵感与素材", "body": "收集参考和截图。" },
            { "id": "feedback", "title": "用户反馈区", "body": "用户批注和补充。" }
          ]
        }
      }
    ]
  }
}
```

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
2. Modify the actual artifact, code, document, table, canvas, or slides.
3. Update the existing report or create the next report.
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

### Step 7: Update Canvas Reports

For canvas reports, persist tldraw snapshots:

```bash
curl -s -X PUT http://localhost:3847/api/reports/{REPORT_ID}/canvas \
  -H 'Content-Type: application/json' \
  -d '{
    "sectionId": "sec-...",
    "snapshot": { "document": { "store": {} }, "session": {} }
  }'
```

When the agent adds canvas content, ensure the content is meaningful:

- place idea clusters, references, options, constraints, and decision points
- separate agent work areas, user feedback areas, and shared decision areas
- keep user feedback areas visible
- connect canvas nodes and selected regions to feedback targets when possible

Canvas feedback targets should identify the reviewed object:

```json
{
  "kind": "canvas_node|canvas_selection",
  "section_id": "sec-...",
  "node_id": "agent-zone",
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
- Generative UI guide: [references/generative-ui-guide.md](references/generative-ui-guide.md)
- Feedback payload model: [references/feedback-schema.md](references/feedback-schema.md)
- Design tokens: [references/design-system.md](references/design-system.md)
