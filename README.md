[中文](./README.zh-CN.md)

# TT Design Brew Studio Skill

`tt-brew-studio-skill` is an Agent Skill for design education. It organizes
multiple TT Design Academy expert personas around the same student design
process. Each expert contributes from a specific domain, research method, and
design judgment style, while the agent creates design drafts, canvas scaffolds,
method templates, feedback, reviews, and project-specific widgets.

This is not a generic visual delivery tool. It is a design mentor canvas for
teaching design judgment. The canvas turns explicit methods and tacit expert
taste into traceable expert opinions, actionable CanvasIR method templates, and
interactive widgets.

## Core Features

- **Multi-expert design mentoring**: expert personas collaborate around one
  student project. Expert opinions live in the left expert bar and connect back
  to concrete canvas objects.
- **Persistent project canvas**: runtime data is stored under
  `.visual-delivery/`. By default, all stages, method templates, expert
  opinions, student responses, and widgets stay on one working Page.
- **Design method scaffolds**: experts can add frames, prompts, method
  templates, connectors, draft examples, and next-step discussion areas. Runtime
  layout keeps scaffolds within the stage area and repairs overlap, overflow,
  and proportion issues on insert.
- **Resizable sticky notes**: sticky notes are implemented with tldraw notes and
  `props.scale`. They can scale with a scaffold or be resized individually by
  dragging their edges.
- **Canvas-native feedback and co-creation**: students can submit annotations
  on canvas objects, draw purple annotation arrows, or create purple completion
  regions.
- **Interactive widgets**: experts can add sandboxed HTML widgets through
  widget templates, such as voting, rubrics, bar charts, word clouds, timers,
  and alignment scales.
- **CanvasIR commands**: agents write semantic canvas commands instead of
  directly hand-authoring tldraw snapshots.
- **Local-first runtime**: the service runs on `localhost:3847` by default, with
  optional remote access through runtime settings.

## Installation

Clone or copy this repository into an Agent framework's skills directory:

```bash
# Claude Code
cp -r tt-brew-studio-skill your-project/.claude/skills/

# Codex
cp -r tt-brew-studio-skill your-project/.codex/skills/
```

The Agent will discover and load the skill automatically.

## Usage

Ask the Agent to start the design mentor canvas:

```text
Start the design mentor canvas
```

The Agent will:

1. Start the local TT Design Brew Studio service.
2. Open or initialize the project design canvas.
3. Return `http://localhost:3847/canvas`.
4. Continue mentoring by reading from and writing to the canvas context.

## Canvas Collaboration Rules

- The default workflow uses one project canvas document and one working Page;
  tldraw Pages remain only as a low-level compatibility layer.
- A new visual scaffold's root frame name uses the scaffold title, so selection,
  navigation, and expert attribution remain clear.
- When a scaffold is inserted, runtime layout controls size according to stage
  space and teaching value. If direct children overlap, overflow, or become too
  small to read, they are reflowed into non-overlapping rows.
- When the user drags the edge of a scaffold root frame, inner frames, text,
  shapes, sticky notes, and images scale proportionally.
- Expert-agent comments do not create extra canvas cards or avatar chips. They
  live in the left expert bar and connect to target canvas objects on hover or
  selection.

## Architecture

```text
tt-brew-studio-skill/
├── SKILL.md                  # Agent instructions
├── scripts/
│   ├── start.js              # Start service and build frontend
│   ├── reinitialize.js       # Reset runtime data after backup
│   └── stop.js               # Stop local service
├── references/
│   ├── api.md                # API reference
│   ├── canvas-ir.md          # CanvasIR and template command model
│   ├── canvas-widgets.md     # Widget contract
│   ├── canvas-workspace-model.md
│   └── design-system.md
└── templates/
    ├── server/               # Express + WebSocket backend
    ├── ui/                   # React + Vite canvas frontend
    ├── locales/              # Built-in locale files
    └── design/               # Default design tokens
```

## Technical Foundation

- **Canvas engine**: built on top of `tldraw`, using its native frame, note,
  geo, arrow, image, selection, and resize primitives, with custom behavior for
  visual scaffolds, the expert bar, region annotations, widget anchors, and
  state synchronization.
- **Frontend runtime**: `React` + `Vite`, responsible for canvas UI, expert bar,
  feedback panels, HTML widget containers, and tldraw shape behavior
  extensions.
- **Backend runtime**: `Express` + `ws`, providing local APIs, WebSocket update
  broadcasts, CanvasIR compilation, snapshot persistence, feedback threads, and
  runtime template synchronization.
- **Semantic protocol**: CanvasIR commands and semantic indexes describe design
  scaffolds, widgets, expert opinions, user feedback, and region completion
  requests, so agents do not need to hand-author tldraw snapshots.

## Project Dependencies

The main dependencies live in the runtime templates. `scripts/start.js` syncs
these templates into `.visual-delivery/` and installs them there.

| Location | Dependency | Version | Purpose |
| --- | --- | --- | --- |
| `templates/ui/package.json` | `tldraw` | `^5.1.1` | Canvas engine; provides frame, note, geo, arrow, image, selection, and resize primitives |
| `templates/ui/package.json` | `react` / `react-dom` | `^18.3.1` | Frontend UI, expert bar, feedback panel, and canvas workspace |
| `templates/ui/package.json` | `vite` / `@vitejs/plugin-react` | `^6.0.0` / `^4.3.4` | Frontend development and build |
| `templates/server/package.json` | `express` | `^4.21.0` | Local HTTP API and static asset serving |
| `templates/server/package.json` | `ws` | `^8.18.0` | WebSocket state broadcasts |

## Runtime

On first launch, `start.js` copies `templates/` into `.visual-delivery/`,
installs dependencies, builds the frontend, and starts the service. Later
launches preserve existing canvas data while syncing updated templates and
restarting the service.

To reinitialize a clean runtime, use `scripts/reinitialize.js`. It backs up the
old `.visual-delivery/` directory before generating a fresh runtime directory.
The runtime directory is gitignored and can be regenerated as needed.

## License

This project is released under the [MIT License](./LICENSE).
