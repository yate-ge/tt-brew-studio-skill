---
name: visual-delivery
description: >
  Design mentor studio on a project-scoped interactive canvas. Assembles a
  small team of design expert agents that coach the user through design work
  with visual scaffolds (templates + widgets), reviews, and discussion. Use
  when the user starts or advances a design project, or asks for design
  discussion, direction, critique, methods, or guidance. Also use for general
  visual collaboration: canvas, brainstorm, moodboard, annotation, diagrams,
  interactive widgets.
---

## Visual Delivery

Visual Delivery is now a canvas-first collaboration workspace. A single runtime
serves the current project through `{CWD}/.visual-delivery`, and the product UI
opens directly into the canvas workspace.

The core loop is:

```text
Project canvas opened -> agent adds visual scaffolding / widgets on the current tldraw Page
-> user edits, annotates, or creates completion requests on the canvas
-> agent reads canvas context and continues in the same workspace
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

- the user starts, continues, or plans a design project of any kind
- the user asks for design discussion, direction, critique, method advice, or
  guidance on how to move design work forward
- the task benefits from a visual shared workspace
- the user asks for a canvas, brainstorm, moodboard, diagram, scaffold, widget,
  annotation, region completion, or structured visual collaboration
- the agent should keep context in a persistent project canvas

Use this skill when the user wants shared visual thinking rather than a plain
text answer.

### Design Mentor Mode

When the work is a design project (first trigger group above), run this skill
as a **design mentor studio**: expert agents coach; the user designs.

- **Intake** (once per project or per new feature): confirm the brief in one
  question round → assemble the expert team (default 1 lead + 2 support, one
  seat always a methodology anchor; virtual experts for out-of-roster domains)
  → announce the team. Routing and profile cards:
  [references/design-experts.md](references/design-experts.md).
- **Canvas**: initialize the vertical stage spine — four full-width stage
  bands stacked top-to-bottom (发现 Discover → 定义 Define → 发展 Develop →
  交付 Deliver, roles `stage.*`) plus a project header card. Run stage
  recognition for projects already in flight and confirm the stage with the
  user in one sentence; completed stages get archive summary cards, the
  current stage gets its scaffold package. A new feature inside a mature
  project gets its own canvas page (tldraw Page) and runs all four stages
  there. Full protocol:
  [references/design-mentor-protocol.md](references/design-mentor-protocol.md).
- **Methods**: scaffolds are **generated on demand** from the stage-organized
  method library — the specs are knowledge, not prefabs; the agent decides
  template vs widget per the judgment rules and generates the artifact for the
  project's context. B-class cross-domain methods load by default, A-class
  domain methods when the matching expert is on the team, C-class ad-hoc
  synthesis for anything beyond the catalog; good instances are archived to
  the project scaffold library. Every scaffold carries an expert signature;
  ⚠️ methods carry a mandatory precondition-check slot that triggers an expert
  warning when skipped. Library:
  [references/design-methods.md](references/design-methods.md).
- **Red lines**: experts only build scaffolds, review, warn, and discuss.
  They never fill the user's content slots with final answers and never
  overwrite user work; AI drafts are always labeled. The user's decision
  always wins.

### Language Model

- `conversation_lang`: follows the user's current message every turn.
- `platform_lang`: language used by the Visual Delivery web UI.
- On first initialization, set `platform_lang = conversation_lang`.
- Later turns do not auto-switch `platform_lang`; change it only when the user
  explicitly asks or changes Settings.
- Agent chat replies, canvas labels, and user-visible canvas content use
  `conversation_lang` unless the user asks otherwise.

### Step 1: Ensure Service Is Running

Detect interaction language first:

- Chinese -> `zh`
- English -> `en`
- Japanese -> `ja`
- Korean -> `ko`
- otherwise use the closest appropriate language code

Tell the user briefly:

- `zh`: `正在启动画布服务...`
- `en`: `Starting the canvas workspace...`

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

- `zh`: `画布服务已就绪：{local_url}/canvas`
- `en`: `Canvas workspace ready at {local_url}/canvas`.

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

### Step 2: Use The Project Canvas Document

The user-facing canvas manager is tldraw's internal Page manager. The backend
`canvas_workspace` is a project document container, not a visible multi-canvas
switcher. Reuse the active project canvas document by default; create a new
workspace only when no project canvas document exists or the user explicitly
asks for a separate project-level document.

Do not create a new `canvas_workspace` to represent a new canvas. New canvases
inside the product are tldraw Pages and should be created, renamed, switched,
and deleted through tldraw's built-in Page manager.

Use:

```bash
curl -s -X POST http://localhost:3847/api/canvas-workspaces/select \
  -H 'Content-Type: application/json' \
  -d '{
    "title": "TASK TITLE",
    "purpose": "What this canvas is for",
    "tags": ["design", "collaboration"],
    "context": {
      "task_name": "TASK NAME",
      "prompt": "Current user request"
    },
    "make_active": true
  }'
```

The selection response includes `workspace` and `selection.reason`. Open the
project canvas URL:

```text
{local_url}/canvas
```

### Step 3: Read Before Writing

Before writing, read the active project canvas document:

```bash
curl -s http://localhost:3847/api/canvas-workspaces/{WORKSPACE_ID}/agent-context
```

Inspect:

- current CanvasIR summary and semantic hierarchy
- `active_page_id` and `pages` from the tldraw document
- existing sections, nodes, relationships, assets, annotations, and widgets
- open canvas feedback and open completion requests
- available templates and available widget templates
- recent canvas events and layout reviews

### Step 4: Write Canvas Content

For agent-generated canvas structure, use CanvasIR or canvas commands by
default. Ordinary agents should not write `snapshot.document.store` directly.
CanvasIR and commands write to the current tldraw Page from the saved snapshot
session. Other Pages in the same document must be preserved.

Use CanvasIR or commands:

```bash
curl -s -X POST http://localhost:3847/api/canvas-workspaces/{WORKSPACE_ID}/commands \
  -H 'Content-Type: application/json' \
  -d '{
    "commands": [
      {
        "op": "add_node",
        "id": "idea-1",
        "kind": "sticky",
        "parent": "discussion-section",
        "content": "One user-editable idea"
      }
    ]
  }'
```

Supported command operations include:

- `insert_template`
- `add_node`
- `edit_node`
- `delete_node`
- `move_node`
- `locate_node`
- `add_widget`
- `update_widget`

Use `POST /api/canvas-workspaces/{WORKSPACE_ID}/ir/validate` for dry runs and
`PUT /api/canvas-workspaces/{WORKSPACE_ID}/ir` to save a complete CanvasIR.

### Canvas Discipline

Treat agent canvas output as mentor-provided visual scaffolding. The agent
supplies thinking structure, prompts, seed content, tradeoffs, and next
discussion areas; the runtime handles stable frames, layout, scaling, and
preservation of user-authored canvas marks.

Guidelines:

- inspect the existing workspace before writing
- treat tldraw Pages as the user's multiple canvases
- plan the board narrative left-to-right, top-to-bottom
- use tldraw frame shapes as named sections
- keep section names short and navigational
- distinguish structural text from user/participant input
- place related canvas objects inside named sections
- use connector relationships for dependency, flow, and evidence links
- keep every write small enough to validate
- record created or mutated shape ids in the canvas event
- leave useful blank space for user collaboration

Generated scaffold content should default to top-left flow inside sections,
grow containers to fit content, and wrap multi-section new generations in a
single `scaffold.root` section. Template inserts may use `scale` and `anchor`
while preserving root frame proportions, child frame proportions, and non-frame
content offsets from each container's top-left corner.

### Canvas Feedback And Annotation

All feedback is canvas-native.

- Selecting a canvas element (frame, shape, image, sticky note, widget, arrow,
  or text) opens an in-canvas annotation popover.
- Submitted annotations are stored on the target shape, mirrored into
  `semantic_index.annotations`, and written to the canvas workspace feedback
  pool.
- Users can draw purple `annotation_arrow` shapes from the canvas toolbar.
- Users can create a purple glowing rectangular `completion_request` with a
  prompt; the agent should fulfill content inside that bounded region, then
  mark or remove the request after saving the result.
- Canvas workspaces include a bottom-right in-canvas feedback button. It opens a
  floating panel that aggregates annotations, annotation arrows, completion
  requests, widget outputs, and other workspace feedback.

### Canvas Widgets

Use canvas widgets (`html_component` nodes) only when native canvas nodes cannot
support the needed interaction:

- interaction produces durable state
- presentation needs live computation
- canvas content needs interactive aggregation
- the agent needs schema-shaped user input
- the interaction form exceeds native canvas ability

Create widgets through `add_widget` using the three-tier strategy:

1. Check `available_widget_templates` in agent-context or
   `GET /api/canvas-widget-templates`.
2. Prefer `template_id` + `params`.
3. Use a freeform HTML fragment only when no template fits.

Freeform fragments must not contain `<html>`, `<head>`, `<body>`, or fixed root
sizes. The runtime owns transparency, intrinsic sizing, proportional scaling,
and the `window.vd` state bridge. Validate uncertain fragments first with:

```bash
curl -s -X POST http://localhost:3847/api/canvas-widgets/validate \
  -H 'Content-Type: application/json' \
  -d '{ "template_id": "word_cloud", "params": { "words": [] } }'
```

Widget state lives in shape meta and `semantic_index.widget_instances[].state`.
Patch state with `update_widget`. `vd.emit` outputs arrive as `widget_output`
feedback. Full contract: [references/canvas-widgets.md](references/canvas-widgets.md).

### Canvas Node Semantics

- `section`: rendered as a tldraw `frame`; use it as the parent/container for
  related content.
- `sticky_note`: individual user ideas, brainstorm items, concerns, or
  decisions. Keep one idea per sticky.
- `text`: board titles, section headings, prompts, captions, and analysis.
- `shape`: diagram nodes, states, options, and process steps.
- `connector`: spatial relationships; record `from`, `to`, direction, line
  type, and optional label in `semantic_index.relationships`.
- `html_component`: embedded interactive HTML widget with backing shape id,
  HTML, title, description, bounds, and state mirrored into the semantic index.
- `completion_request`: user-created purple request region with `prompt`,
  `status`, `bounds`, and `shape_id`.
- `table`, `code_block`, and `label`: first-class semantic kinds even when the
  renderer falls back to grouped tldraw shapes.

### Validation

After creating or modifying a scaffold, run a layout review before presenting
the canvas as done. The review should check overlap, section containment,
sticky note shape types, readable sizes, viewport focus, and semantic
consistency. Record the result in the canvas event and
`semantic_index.layout_reviews`.

If a rendered browser or screenshot tool is available, inspect a screenshot of
the focused scaffold before telling the user it is ready. If the screenshot
shows overlap, unreadable text, clipped content, off-screen placement, or a
semantic mismatch, adjust or reflow the scaffold and verify again.

### References

- Design mentor protocol: [references/design-mentor-protocol.md](references/design-mentor-protocol.md)
- Expert roster and routing: [references/design-experts.md](references/design-experts.md)
- Design method library: [references/design-methods.md](references/design-methods.md)
- API endpoints: [references/api.md](references/api.md)
- Canvas workspace model: [references/canvas-workspace-model.md](references/canvas-workspace-model.md)
- CanvasIR and templates: [references/canvas-ir.md](references/canvas-ir.md)
- Canvas widgets contract: [references/canvas-widgets.md](references/canvas-widgets.md)
- Design tokens: [references/design-system.md](references/design-system.md)
