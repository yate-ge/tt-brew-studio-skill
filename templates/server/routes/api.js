const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { generateId } = require('../lib/ids');
const { writeJSON, readJSONArray, readJSONObject, updateJSON } = require('../lib/store');
const { broadcast } = require('../lib/ws');
const {
  compileCanvasIR,
  createProjectStageCanvasIR,
  validateCanvasIR,
  listCanvasTemplates,
  getCanvasTemplate,
  instantiateTemplate,
  applyCanvasIRCommands,
  buildCanvasAgentContext,
  hydrateWidgetRuntimeState,
  listWidgetTemplates,
  prepareWidget,
} = require('../lib/canvas-ir');

const DEFAULT_SETTINGS = {
  language: 'en',
  language_explicit: false,
  trigger_mode: 'smart',
  port: 3847,
  remote: false,
  access_key_enabled: false,
  access_key: '',
  platform: {
    name: 'Visual Delivery',
    logo_url: '',
    slogan: 'Think together on a canvas.',
    visual_style: 'canvas-workspace',
  },
};

function generateAccessKey() {
  return `vdk_${crypto.randomBytes(18).toString('base64url')}`;
}

function normalizeSettings(stored = {}) {
  const port = Number.parseInt(stored.port, 10);
  const normalizedPort = port >= 1024 && port <= 65535 ? port : DEFAULT_SETTINGS.port;
  const triggerMode = ['auto', 'smart', 'manual'].includes(stored.trigger_mode)
    ? stored.trigger_mode
    : DEFAULT_SETTINGS.trigger_mode;

  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    trigger_mode: triggerMode,
    port: normalizedPort,
    remote: stored.remote === true,
    access_key_enabled: stored.access_key_enabled === true,
    access_key: typeof stored.access_key === 'string' && stored.access_key.trim()
      ? stored.access_key.trim()
      : generateAccessKey(),
    platform: {
      ...DEFAULT_SETTINGS.platform,
      ...(stored.platform || {}),
    },
  };
}

function setupRoutes(app, dataDir) {
  const dataRoot = path.join(dataDir, 'data');
  const settingsPath = path.join(dataRoot, 'settings.json');
  const projectCanvasWorkspacesPath = path.join(dataRoot, 'canvas-workspaces');
  const projectScaffoldsPath = path.join(dataRoot, 'scaffolds');

  fs.mkdirSync(dataRoot, { recursive: true });
  fs.mkdirSync(projectCanvasWorkspacesPath, { recursive: true });
  fs.mkdirSync(projectScaffoldsPath, { recursive: true });

  function readSettings() {
    const stored = readJSONObject(settingsPath);
    return normalizeSettings(stored || {});
  }

  function safeReadDir(dirPath) {
    try {
      return fs.readdirSync(dirPath, { withFileTypes: true });
    } catch {
      return [];
    }
  }

  // Health
  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      uptime: Math.floor(process.uptime()),
      version: '3.0.0',
    });
  });

  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      uptime: Math.floor(process.uptime()),
      version: '3.0.0',
    });
  });

  // Runtime settings
  app.get('/api/settings', async (req, res) => {
    try {
      const settings = readSettings();
      await writeJSON(settingsPath, settings);
      res.status(200).json(settings);
    } catch (err) {
      console.error('Error reading settings:', err);
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: err.message },
      });
    }
  });

  app.put('/api/settings', async (req, res) => {
    try {
      const current = readSettings();
      const input = req.body || {};
      const nextPort = Number.parseInt(input.port, 10);
      const hasValidPort = nextPort >= 1024 && nextPort <= 65535;
      const nextTriggerMode = ['auto', 'smart', 'manual'].includes(input.trigger_mode)
        ? input.trigger_mode
        : current.trigger_mode;

      const next = {
        ...current,
        language: input.language || current.language,
        language_explicit: input.language_explicit === undefined ? current.language_explicit : !!input.language_explicit,
        trigger_mode: nextTriggerMode,
        port: hasValidPort ? nextPort : current.port,
        remote: input.remote === undefined ? current.remote : !!input.remote,
        access_key_enabled: input.access_key_enabled === undefined ? current.access_key_enabled : !!input.access_key_enabled,
        access_key: input.rotate_access_key
          ? generateAccessKey()
          : (typeof input.access_key === 'string' && input.access_key.trim() ? input.access_key.trim() : current.access_key),
        platform: {
          ...current.platform,
          ...(input.platform || {}),
        },
      };

      await writeJSON(settingsPath, next);
      broadcast('settings_updated', next);

      res.status(200).json(next);
    } catch (err) {
      console.error('Error updating settings:', err);
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: err.message },
      });
    }
  });

  // Design tokens
  app.get('/api/design-tokens', (req, res) => {
    const tokensPath = path.join(dataDir, 'design', 'tokens.json');
    try {
      const tokens = JSON.parse(fs.readFileSync(tokensPath, 'utf8'));
      res.status(200).json(tokens);
    } catch (err) {
      console.error('Error reading tokens.json:', err.message);
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: 'Invalid design tokens' },
      });
    }
  });

  // Locale strings injected into the UI shell.
  app.get('/api/locale', (req, res) => {
    const localePath = path.join(dataRoot, 'locale.json');
    try {
      const locale = readJSONObject(localePath) || {};
      res.status(200).json(locale);
    } catch (err) {
      console.error('Error reading locale.json:', err.message);
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: 'Invalid locale file' },
      });
    }
  });

  app.put('/api/locale', async (req, res) => {
    const localePath = path.join(dataRoot, 'locale.json');
    try {
      const locale = req.body;
      if (!locale || Array.isArray(locale) || typeof locale !== 'object') {
        return res.status(400).json({
          error: { code: 'INVALID_REQUEST', message: 'locale must be an object' },
        });
      }
      await writeJSON(localePath, locale);
      broadcast('locale_updated', locale);
      res.status(200).json(locale);
    } catch (err) {
      console.error('Error updating locale.json:', err.message);
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: err.message },
      });
    }
  });

  // V4: Canvas workspaces (persistent project collaboration spaces)
  const CANVAS_WORKSPACE_STATUSES = new Set(['active', 'archived']);

  function canvasIndexPath() {
    return path.join(projectCanvasWorkspacesPath, 'index.json');
  }

  function canvasWorkspaceDir(workspaceId) {
    return path.join(projectCanvasWorkspacesPath, workspaceId);
  }

  function canvasWorkspaceFile(workspaceId) {
    return path.join(canvasWorkspaceDir(workspaceId), 'workspace.json');
  }

  function canvasSnapshotFile(workspaceId) {
    return path.join(canvasWorkspaceDir(workspaceId), 'snapshot.json');
  }

  function canvasEventsFile(workspaceId) {
    return path.join(canvasWorkspaceDir(workspaceId), 'events.json');
  }

  function canvasFeedbackFile(workspaceId) {
    return path.join(canvasWorkspaceDir(workspaceId), 'feedback.json');
  }

  function canvasAssetsDir(workspaceId) {
    return path.join(canvasWorkspaceDir(workspaceId), 'assets');
  }

  function readCanvasIndex() {
    const stored = readJSONObject(canvasIndexPath());
    return {
      version: 1,
      active_workspace_id: stored?.active_workspace_id || null,
      workspaces: Array.isArray(stored?.workspaces) ? stored.workspaces : [],
      updated_at: stored?.updated_at || null,
    };
  }

  async function writeCanvasIndex(index) {
    const next = {
      version: 1,
      active_workspace_id: index.active_workspace_id || null,
      workspaces: Array.isArray(index.workspaces) ? index.workspaces : [],
      updated_at: new Date().toISOString(),
    };
    await writeJSON(canvasIndexPath(), next);
    return next;
  }

  function defaultCanvasSemanticIndex() {
    return {
      version: 2,
      active_page_id: null,
      pages: [],
      zones: [],
      sections: [],
      nodes: [],
      assets: [],
      annotations: [],
      region_annotations: [],
      completion_requests: [],
      scaffold_instances: [],
      widget_instances: [],
      artifact_links: [],
      layout_reviews: [],
      relationships: [],
      edit_summary: null,
      updated_at: null,
    };
  }

  function normalizeCanvasSemanticIndex(index) {
    const base = defaultCanvasSemanticIndex();
    if (!index || typeof index !== 'object') return base;
    return {
      ...base,
      ...index,
      version: index.version || base.version,
      active_page_id: index.active_page_id || base.active_page_id,
      pages: Array.isArray(index.pages) ? index.pages : base.pages,
      zones: Array.isArray(index.zones) ? index.zones : base.zones,
      sections: Array.isArray(index.sections) ? index.sections : [],
      nodes: Array.isArray(index.nodes) ? index.nodes : [],
      assets: Array.isArray(index.assets) ? index.assets : [],
      annotations: Array.isArray(index.annotations) ? index.annotations : [],
      region_annotations: Array.isArray(index.region_annotations) ? index.region_annotations : [],
      completion_requests: Array.isArray(index.completion_requests) ? index.completion_requests : [],
      scaffold_instances: Array.isArray(index.scaffold_instances) ? index.scaffold_instances : [],
      widget_instances: Array.isArray(index.widget_instances) ? index.widget_instances : [],
      artifact_links: Array.isArray(index.artifact_links) ? index.artifact_links : [],
      layout_reviews: Array.isArray(index.layout_reviews) ? index.layout_reviews : [],
      relationships: Array.isArray(index.relationships) ? index.relationships : [],
      edit_summary: index.edit_summary && typeof index.edit_summary === 'object' ? index.edit_summary : null,
    };
  }

  function snapshotShapeIds(snapshot) {
    const ids = new Set();
    const store = snapshot?.document?.store || {};
    Object.entries(store).forEach(([id, record]) => {
      if (record?.typeName === 'shape') ids.add(String(id));
    });
    return ids;
  }

  function semanticTargetShapeIds(item = {}) {
    const ids = [];
    const target = item.target || {};
    if (Array.isArray(target.shape_ids)) ids.push(...target.shape_ids);
    else if (target.shape_ids) ids.push(target.shape_ids);
    if (target.shape_id) ids.push(target.shape_id);
    if (target.section_id) ids.push(target.section_id);
    if (item.shape_id) ids.push(item.shape_id);
    return Array.from(new Set(ids.filter(Boolean).map(String)));
  }

  function pruneDanglingSemanticAnnotations(index, snapshot) {
    if (!index || typeof index !== 'object') return index;
    const ids = snapshotShapeIds(snapshot);
    const annotations = Array.isArray(index.annotations)
      ? index.annotations.filter((annotation) => {
        const targetIds = semanticTargetShapeIds(annotation);
        return targetIds.length > 0 && targetIds.some((shapeId) => ids.has(shapeId));
      })
      : [];
    return { ...index, annotations };
  }

  const PENDING_USER_META_KEYS = [
    'vd_user_pending_change',
    'vd_user_pending_at',
    'vd_widget_pending_feedback',
    'vd_widget_pending_at',
    'vd_widget_feedback_event_type',
  ];

  function clearPendingUserMeta(meta) {
    if (!meta || typeof meta !== 'object') return meta || {};
    let changed = false;
    const next = { ...meta };
    PENDING_USER_META_KEYS.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(next, key)) {
        delete next[key];
        changed = true;
      }
    });
    return changed ? next : meta;
  }

  function clearPendingUserCanvasState(snapshot) {
    const store = snapshot?.document?.store;
    if (!store || typeof store !== 'object') return snapshot;
    let changed = false;
    const nextStore = {};
    Object.entries(store).forEach(([id, record]) => {
      if (record?.typeName !== 'shape' || !record.meta) {
        nextStore[id] = record;
        return;
      }
      const nextMeta = clearPendingUserMeta(record.meta);
      let nextProps = record.props;
      if (record.meta?.vd_kind === 'html_component'
        && record.meta?.vd_widget_pending_feedback
        && nextProps?.color === 'violet') {
        nextProps = { ...nextProps, color: 'yellow' };
      }
      if (nextMeta !== record.meta || nextProps !== record.props) {
        nextStore[id] = { ...record, meta: nextMeta, props: nextProps };
        changed = true;
      } else {
        nextStore[id] = record;
      }
    });
    if (!changed) return snapshot;
    return {
      ...snapshot,
      document: {
        ...snapshot.document,
        store: nextStore,
      },
    };
  }

  function clearPendingUserSemanticState(index) {
    if (!index || typeof index !== 'object') return index;
    const clearMetaList = (list) => (Array.isArray(list)
      ? list.map((item) => {
        const nextMeta = clearPendingUserMeta(item?.meta);
        return nextMeta !== item?.meta ? { ...item, meta: nextMeta } : item;
      })
      : list);
    const widgetInstances = Array.isArray(index.widget_instances)
      ? index.widget_instances.map((item) => ({
        ...item,
        meta: clearPendingUserMeta(item?.meta),
        pending_feedback: false,
        pending_at: null,
      }))
      : index.widget_instances;
    const canvasIr = index.canvas_ir && typeof index.canvas_ir === 'object'
      ? {
        ...index.canvas_ir,
        nodes: Array.isArray(index.canvas_ir.nodes)
          ? index.canvas_ir.nodes.map((node) => ({
            ...node,
            meta: clearPendingUserMeta(node?.meta),
          }))
          : index.canvas_ir.nodes,
      }
      : index.canvas_ir;
    return {
      ...index,
      sections: clearMetaList(index.sections),
      nodes: clearMetaList(index.nodes),
      assets: clearMetaList(index.assets),
      widget_instances: widgetInstances,
      canvas_ir: canvasIr,
    };
  }

  function carryCanvasAgentFields(previousIndex = {}, nextIndex = {}) {
    const next = { ...nextIndex };
    if (!Object.prototype.hasOwnProperty.call(next, 'canvas_ir') && previousIndex?.canvas_ir) {
      next.canvas_ir = previousIndex.canvas_ir;
    }
    if (!Object.prototype.hasOwnProperty.call(next, 'ir_node_index') && Array.isArray(previousIndex?.ir_node_index)) {
      next.ir_node_index = previousIndex.ir_node_index;
    }
    return next;
  }

  function mergeCanvasLayoutReviews(...reviewLists) {
    const byId = new Map();
    for (const list of reviewLists) {
      const items = Array.isArray(list) ? list : (list ? [list] : []);
      for (const review of items) {
        if (review && typeof review === 'object' && review.id) {
          byId.set(review.id, review);
        }
      }
    }
    return Array.from(byId.values()).slice(-20);
  }

  function boundsChanged(prev = {}, next = {}) {
    return ['x', 'y', 'w', 'h'].some((key) => Math.round(Number(prev?.[key] || 0)) !== Math.round(Number(next?.[key] || 0)));
  }

  function semanticTrackables(index) {
    const normalized = normalizeCanvasSemanticIndex(index);
    return [
      ...(normalized.sections || []),
      ...(normalized.nodes || []),
    ].filter((item) => item?.shape_id);
  }

  function summarizeSemanticDiff(previousIndex, nextIndex) {
    const previous = normalizeCanvasSemanticIndex(previousIndex);
    const next = normalizeCanvasSemanticIndex(nextIndex);
    const previousNodes = new Map(semanticTrackables(previous).map((node) => [node.shape_id, node]));
    const nextNodes = new Map(semanticTrackables(next).map((node) => [node.shape_id, node]));
    const added = [];
    const modified = [];
    const moved_or_resized = [];
    const deleted = [];

    for (const [shapeId, node] of nextNodes.entries()) {
      const before = previousNodes.get(shapeId);
      if (!before) {
        added.push({
          shape_id: shapeId,
          kind: node.kind,
          title: node.title,
          authored_by: node.meta?.vd_created_by || node.meta?.vd_author || 'unknown',
        });
        continue;
      }
      const contentChanged = (before.text || '') !== (node.text || '')
        || (before.title || '') !== (node.title || '');
      const kindChanged = before.kind !== node.kind;
      const parentChanged = before.parent_id !== node.parent_id
        || before.parent_ir_id !== node.parent_ir_id
        || before.section_id !== node.section_id;
      const stateChanged = JSON.stringify(before.meta?.vd_widget_state || null)
        !== JSON.stringify(node.meta?.vd_widget_state || null);
      if (contentChanged || kindChanged || parentChanged || stateChanged) {
        modified.push({
          shape_id: shapeId,
          kind: node.kind,
          title: node.title,
          authored_by: node.meta?.vd_last_edited_by || node.meta?.vd_created_by || 'unknown',
          changed: [
            contentChanged ? 'content' : null,
            kindChanged ? 'kind' : null,
            parentChanged ? 'parent' : null,
            stateChanged ? 'widget_state' : null,
          ].filter(Boolean),
        });
      }
      if (boundsChanged(before.bounds || before, node.bounds || node)) {
        moved_or_resized.push({
          shape_id: shapeId,
          kind: node.kind,
          title: node.title,
        });
      }
    }

    for (const [shapeId, node] of previousNodes.entries()) {
      if (!nextNodes.has(shapeId)) {
        deleted.push({
          shape_id: shapeId,
          kind: node.kind,
          title: node.title,
        });
      }
    }

    return {
      version: 1,
      generated_at: new Date().toISOString(),
      previous_updated_at: previous.updated_at || null,
      next_updated_at: next.updated_at || null,
      counts: {
        added: added.length,
        modified: modified.length,
        moved_or_resized: moved_or_resized.length,
        deleted: deleted.length,
      },
      added,
      modified,
      moved_or_resized,
      deleted,
    };
  }

  function uniqueShapeIds(items = []) {
    return Array.from(new Set(
      items
        .map((item) => item?.shape_id)
        .filter((shapeId) => typeof shapeId === 'string' && shapeId.trim())
    ));
  }

  function hasSemanticDiff(diff) {
    const counts = diff?.counts || {};
    return ['added', 'modified', 'moved_or_resized', 'deleted'].some((key) => Number(counts[key] || 0) > 0);
  }

  function normalizeCanvasWorkspace(workspace) {
    if (!workspace || typeof workspace !== 'object') return null;
    const now = new Date().toISOString();
    const createdAt = workspace.created_at || workspace.createdAt || now;
    const updatedAt = workspace.updated_at || workspace.updatedAt || createdAt;
    return {
      id: workspace.id,
      type: 'canvas_workspace',
      title: workspace.title || '未命名画布',
      purpose: workspace.purpose || '',
      status: CANVAS_WORKSPACE_STATUSES.has(workspace.status) ? workspace.status : 'active',
      tags: Array.isArray(workspace.tags) ? workspace.tags : [],
      context: workspace.context || {},
      source_task_id: workspace.source_task_id || workspace.context?.task_id || null,
      semantic_index: normalizeCanvasSemanticIndex(workspace.semantic_index),
      selection_policy: workspace.selection_policy || {
        default: 'reuse_related_active_workspace',
        create_when: [
          'user_explicitly_requests_separate_project_document',
          'no_project_canvas_document_exists',
        ],
      },
      created_at: createdAt,
      updated_at: updatedAt,
      createdAt,
      updatedAt,
      last_used_at: workspace.last_used_at || workspace.lastUsedAt || updatedAt,
      // Optimistic-concurrency revs: snapshot_rev bumps on every snapshot
      // write; agent_rev records the snapshot_rev of the latest agent (IR)
      // write. Clients echo snapshot_rev back as base_rev so the server can
      // tell "never saw the agent's shapes" apart from "deleted them".
      snapshot_rev: Number.isFinite(workspace.snapshot_rev) ? workspace.snapshot_rev : 0,
      agent_rev: Number.isFinite(workspace.agent_rev) ? workspace.agent_rev : 0,
    };
  }

  function canvasWorkspaceSummary(workspace) {
    const normalized = normalizeCanvasWorkspace(workspace);
    if (!normalized) return null;
    return {
      id: normalized.id,
      type: normalized.type,
      title: normalized.title,
      purpose: normalized.purpose,
      status: normalized.status,
      tags: normalized.tags,
      context: normalized.context,
      source_task_id: normalized.source_task_id,
      created_at: normalized.created_at,
      updated_at: normalized.updated_at,
      last_used_at: normalized.last_used_at,
      snapshot_rev: normalized.snapshot_rev,
      agent_rev: normalized.agent_rev,
    };
  }

  function listCanvasWorkspaces() {
    const index = readCanvasIndex();
    const summaries = [];
    for (const entry of safeReadDir(projectCanvasWorkspacesPath)) {
      if (!entry.isDirectory()) continue;
      const workspace = normalizeCanvasWorkspace(readJSONObject(canvasWorkspaceFile(entry.name)));
      if (workspace) summaries.push(canvasWorkspaceSummary(workspace));
    }
    const byId = new Map(summaries.map((item) => [item.id, item]));
    for (const item of index.workspaces) {
      if (item?.id && !byId.has(item.id)) byId.set(item.id, item);
    }
    return Array.from(byId.values())
      .filter(Boolean)
      .sort((a, b) => new Date(b.last_used_at || b.updated_at || b.created_at).getTime()
        - new Date(a.last_used_at || a.updated_at || a.created_at).getTime());
  }

  async function upsertCanvasIndexEntry(workspace, { makeActive = false } = {}) {
    const summary = canvasWorkspaceSummary(workspace);
    const index = readCanvasIndex();
    const entries = index.workspaces.filter((item) => item.id !== summary.id);
    entries.push(summary);
    await writeCanvasIndex({
      ...index,
      active_workspace_id: makeActive ? summary.id : (index.active_workspace_id || summary.id),
      workspaces: entries.sort((a, b) => new Date(b.last_used_at || b.updated_at).getTime()
        - new Date(a.last_used_at || a.updated_at).getTime()),
    });
  }

  async function writeCanvasWorkspace(workspace, { makeActive = false } = {}) {
    const normalized = normalizeCanvasWorkspace(workspace);
    fs.mkdirSync(canvasWorkspaceDir(normalized.id), { recursive: true });
    fs.mkdirSync(canvasAssetsDir(normalized.id), { recursive: true });
    await writeJSON(canvasWorkspaceFile(normalized.id), normalized);
    if (!fs.existsSync(canvasSnapshotFile(normalized.id))) await writeJSON(canvasSnapshotFile(normalized.id), {});
    if (!fs.existsSync(canvasEventsFile(normalized.id))) await writeJSON(canvasEventsFile(normalized.id), []);
    if (!fs.existsSync(canvasFeedbackFile(normalized.id))) await writeJSON(canvasFeedbackFile(normalized.id), []);
    await upsertCanvasIndexEntry(normalized, { makeActive });
    return normalized;
  }

  function readCanvasWorkspace(workspaceId) {
    return normalizeCanvasWorkspace(readJSONObject(canvasWorkspaceFile(workspaceId)));
  }

  function readCanvasSnapshot(workspaceId) {
    return readJSONObject(canvasSnapshotFile(workspaceId)) || {};
  }

  function readCanvasEvents(workspaceId) {
    return readJSONArray(canvasEventsFile(workspaceId));
  }

  function readCanvasFeedback(workspaceId) {
    return readJSONArray(canvasFeedbackFile(workspaceId));
  }

  function canvasSnapshotHasShapes(snapshot = {}) {
    const store = snapshot?.document?.store || {};
    return Object.values(store).some((record) => record?.typeName === 'shape');
  }

  function semanticIndexHasStageSpine(index = {}) {
    const sections = Array.isArray(index?.sections) ? index.sections : [];
    const roles = new Set(sections.map((section) => String(section?.role || '')));
    return ['stage.discover', 'stage.define', 'stage.develop', 'stage.deliver']
      .every((role) => roles.has(role));
  }

  async function initializeProjectStageCanvas(workspace, { reason = 'project_stage_canvas_initialized' } = {}) {
    const ir = createProjectStageCanvasIR({
      title: workspace.title || '项目画布',
      purpose: workspace.purpose || '按 Discover / Define / Develop / Deliver 四阶段组织设计导师协作。',
      current_stage: workspace.context?.current_stage || workspace.context?.stage || 'discover',
    });
    const compiled = compileCanvasIR(ir, { previousSnapshot: readCanvasSnapshot(workspace.id) });
    if (!compiled.valid) {
      throw new Error(`Failed to initialize project stage canvas: ${compiled.errors?.[0]?.message || compiled.errors?.[0]?.code || 'invalid CanvasIR'}`);
    }
    return saveCompiledCanvasIR(workspace, compiled, {
      summary: '初始化四阶段设计导师画布：Discover / Define / Develop / Deliver。',
      commands: [{ op: 'initialize_project_stage_canvas', reason }],
      meta: {
        template_id: 'project_stage_spine',
        stage_count: 4,
        reason,
      },
    });
  }

  function pickProjectCanvasWorkspace(workspaces = []) {
    const projectMarked = workspaces.find((workspace) => workspace?.context?.vd_project_document === true);
    if (projectMarked) return projectMarked;
    const index = readCanvasIndex();
    const active = workspaces.find((workspace) => workspace.id === index.active_workspace_id);
    if (active) return active;
    return workspaces[0] || null;
  }

  async function ensureProjectCanvasWorkspace() {
    const workspaces = listCanvasWorkspaces()
      .map((summary) => readCanvasWorkspace(summary.id))
      .filter(Boolean)
      .filter((workspace) => workspace.status === 'active');

    if (workspaces.length === 0) {
      return createCanvasWorkspace({
        title: '项目画布',
        purpose: '承载本项目的四阶段设计导师协作。',
        tags: ['design-stage-canvas'],
        context: { vd_project_document: true },
        make_active: true,
      });
    }

    let target = pickProjectCanvasWorkspace(workspaces);
    if (target.context?.vd_project_document !== true) {
      const now = new Date().toISOString();
      target = await writeCanvasWorkspace({
        ...target,
        title: target.title || '项目画布',
        purpose: target.purpose || '承载本项目的四阶段设计导师协作。',
        tags: Array.from(new Set([...(target.tags || []), 'design-stage-canvas'])),
        context: {
          ...(target.context || {}),
          vd_project_document: true,
        },
        updated_at: now,
        updatedAt: now,
        last_used_at: now,
      }, { makeActive: true });
    } else {
      await writeCanvasWorkspace({
        ...target,
        last_used_at: new Date().toISOString(),
      }, { makeActive: true });
    }

    const refreshed = readCanvasWorkspace(target.id);
    const snapshot = readCanvasSnapshot(refreshed.id);
    if (!semanticIndexHasStageSpine(refreshed.semantic_index) && !canvasSnapshotHasShapes(snapshot)) {
      return initializeProjectStageCanvas(refreshed, { reason: 'empty_project_document_without_stage_spine' });
    }
    return refreshed;
  }

  function isExpertOpinionFeedback(item = {}) {
    return item.author_kind === 'expert' || item.direction === 'expert_to_content';
  }

  function lastFeedbackThreadRole(item = {}) {
    const thread = Array.isArray(item.thread) ? item.thread : [];
    return thread.length ? thread[thread.length - 1]?.role : null;
  }

  function isOpenCanvasFeedback(item = {}) {
    if (isExpertOpinionFeedback(item) && lastFeedbackThreadRole(item) !== 'user') return false;
    return item.handled === false || item.status === 'tracked';
  }

  function openCanvasFeedback(workspaceId) {
    return readCanvasFeedback(workspaceId).filter(isOpenCanvasFeedback);
  }

  function openCompletionRequests(workspace) {
    return (normalizeCanvasSemanticIndex(workspace?.semantic_index).completion_requests || [])
      .filter((item) => !item.status || item.status === 'open' || item.status === 'in_progress');
  }

  function openRegionAnnotations(workspace) {
    return (normalizeCanvasSemanticIndex(workspace?.semantic_index).region_annotations || [])
      .filter((item) => !item.status || item.status === 'open' || item.status === 'in_progress' || item.status === 'tracked');
  }

  function isIRManagedShapeRecord(id, record) {
    return record?.typeName === 'shape'
      && (String(id).startsWith('shape:vd-ir-') || Boolean(record?.meta?.vd_ir_id));
  }

  /**
   * Snapshot write protection (stale-client guard).
   *
   * A full-store snapshot PUT from a client that has not seen the latest
   * agent write (base_rev < agent_rev, or no base_rev at all — old bundles)
   * must not silently delete IR-managed shapes it never loaded. Missing
   * IR-managed shapes are merged back from the current store. Widget state
   * and widget html additionally follow per-instance last-write-wins by
   * vd_state_version / vd_widget_version regardless of staleness.
   */
  function protectCanvasSnapshotWrite({ incomingSnapshot, currentSnapshot, baseRev, agentRev }) {
    const result = {
      snapshot: incomingSnapshot,
      restored_page_ids: [],
      restored_shape_ids: [],
      preserved_widget_ids: [],
      stale_base: false,
    };
    const incomingStore = incomingSnapshot?.document?.store;
    const currentStore = currentSnapshot?.document?.store;
    if (!incomingStore || typeof incomingStore !== 'object') return result;
    if (!currentStore || typeof currentStore !== 'object') return result;
    const staleBase = !Number.isFinite(baseRev) || baseRev < (agentRev || 0);
    result.stale_base = staleBase;
    const mergedStore = { ...incomingStore };
    for (const [id, record] of Object.entries(currentStore)) {
      if (record?.typeName === 'page') {
        if (staleBase && !mergedStore[id]) {
          mergedStore[id] = record;
          result.restored_page_ids.push(id);
        }
        continue;
      }
      if (!isIRManagedShapeRecord(id, record)) continue;
      const incoming = mergedStore[id];
      if (!incoming) {
        // Missing from the write. Stale client -> it never saw the shape:
        // restore it. Fresh client -> intentional delete: allow.
        if (staleBase) {
          mergedStore[id] = record;
          result.restored_shape_ids.push(id);
        }
        continue;
      }
      const curMeta = record.meta || {};
      const inMeta = incoming.meta || {};
      if (curMeta.vd_kind !== 'html_component') continue;
      const preservedMeta = {};
      if (Number(curMeta.vd_state_version || 0) > Number(inMeta.vd_state_version || 0)) {
        preservedMeta.vd_widget_state = curMeta.vd_widget_state;
        preservedMeta.vd_state_version = curMeta.vd_state_version;
        preservedMeta.vd_state_actor = curMeta.vd_state_actor;
      }
      if (Number(curMeta.vd_widget_version || 1) > Number(inMeta.vd_widget_version || 1)) {
        preservedMeta.vd_html = curMeta.vd_html;
        preservedMeta.vd_html_prev = curMeta.vd_html_prev;
        preservedMeta.vd_widget_version = curMeta.vd_widget_version;
        preservedMeta.vd_input_schema = curMeta.vd_input_schema;
        preservedMeta.vd_output_schema = curMeta.vd_output_schema;
        preservedMeta.vd_sizing = curMeta.vd_sizing;
      }
      if (curMeta.vd_widget_pending_feedback && !inMeta.vd_widget_pending_feedback) {
        preservedMeta.vd_widget_pending_feedback = curMeta.vd_widget_pending_feedback;
        preservedMeta.vd_widget_pending_at = curMeta.vd_widget_pending_at;
        preservedMeta.vd_widget_feedback_event_type = curMeta.vd_widget_feedback_event_type;
      }
      if (Object.keys(preservedMeta).length > 0) {
        mergedStore[id] = { ...(mergedStore[id] || incoming), meta: { ...inMeta, ...preservedMeta } };
        result.preserved_widget_ids.push(id);
      }
    }
    if (result.restored_page_ids.length > 0
      || result.restored_shape_ids.length > 0
      || result.preserved_widget_ids.length > 0) {
      result.snapshot = {
        ...incomingSnapshot,
        document: { ...incomingSnapshot.document, store: mergedStore },
      };
    }
    return result;
  }

  /**
   * A client that never loaded the restored shapes also could not include
   * them in the semantic index it sent. Re-attach the previous index entries
   * for restored shapes so agent-context stays truthful.
   */
  function appendRestoredSemanticEntries(semanticIndex, previousIndex, restoredShapeIds, restoredPageIds = []) {
    if (!semanticIndex || typeof semanticIndex !== 'object') return semanticIndex;
    const hasRestoredShapes = Array.isArray(restoredShapeIds) && restoredShapeIds.length > 0;
    const hasRestoredPages = Array.isArray(restoredPageIds) && restoredPageIds.length > 0;
    if (!hasRestoredShapes && !hasRestoredPages) return semanticIndex;
    const restored = new Set(restoredShapeIds.map(String));
    const restoredPages = new Set(restoredPageIds.map(String));
    const mergeList = (incomingList, previousList) => {
      const incoming = Array.isArray(incomingList) ? incomingList : [];
      const present = new Set(incoming.map((item) => String(item?.shape_id)));
      const additions = (Array.isArray(previousList) ? previousList : [])
        .filter((item) => restored.has(String(item?.shape_id)) && !present.has(String(item?.shape_id)));
      return additions.length > 0 ? [...incoming, ...additions] : incoming;
    };
    const incomingPages = Array.isArray(semanticIndex.pages) ? semanticIndex.pages : [];
    const presentPages = new Set(incomingPages.map((item) => String(item?.id)));
    const restoredPageEntries = (Array.isArray(previousIndex?.pages) ? previousIndex.pages : [])
      .filter((item) => restoredPages.has(String(item?.id)) && !presentPages.has(String(item?.id)));
    return {
      ...semanticIndex,
      pages: restoredPageEntries.length > 0 ? [...incomingPages, ...restoredPageEntries] : incomingPages,
      sections: mergeList(semanticIndex.sections, previousIndex?.sections),
      nodes: mergeList(semanticIndex.nodes, previousIndex?.nodes),
      widget_instances: mergeList(semanticIndex.widget_instances, previousIndex?.widget_instances),
      region_annotations: mergeList(semanticIndex.region_annotations, previousIndex?.region_annotations),
      completion_requests: mergeList(semanticIndex.completion_requests, previousIndex?.completion_requests),
    };
  }

  async function saveCompiledCanvasIR(workspace, compiled, event = {}) {
    const now = new Date().toISOString();
    const previousIndex = workspace.semantic_index;
    const shouldClearPendingUserState = event?.meta?.preserve_pending_user_changes !== true;
    const snapshotToWrite = shouldClearPendingUserState
      ? clearPendingUserCanvasState(compiled.snapshot)
      : compiled.snapshot;
    const semanticIndexToNormalize = shouldClearPendingUserState
      ? clearPendingUserSemanticState(compiled.semantic_index)
      : compiled.semantic_index;
    const normalizedNextIndexBase = normalizeCanvasSemanticIndex({
      ...semanticIndexToNormalize,
      updated_at: now,
    });
    const eventReview = compiled.layout_report ? {
      id: `canvas_ir_layout_${Date.now()}`,
      type: 'canvas_ir_layout_review',
      status: compiled.layout_report.warnings?.length ? 'passed_with_warnings' : 'passed',
      checks: {
        overlap_count: compiled.layout_report.counts?.sibling_overlaps || 0,
        out_of_section_count: compiled.layout_report.counts?.child_overflows || 0,
        unreadable_count: compiled.layout_report.counts?.unreadable_nodes || 0,
        section_contains_children: (compiled.layout_report.counts?.child_overflows || 0) === 0,
        min_readable_size_ok: (compiled.layout_report.counts?.unreadable_nodes || 0) === 0,
      },
      repairs: compiled.layout_report.auto_repairs || [],
      reviewed_at: now,
    } : null;
    const normalizedNextIndex = {
      ...normalizedNextIndexBase,
      layout_reviews: mergeCanvasLayoutReviews(
        previousIndex?.layout_reviews,
        normalizedNextIndexBase?.layout_reviews,
        eventReview,
      ),
    };
    const semanticDiff = summarizeSemanticDiff(previousIndex, normalizedNextIndex);
    const diffCreatedShapeIds = uniqueShapeIds(semanticDiff.added);
    const diffMutatedShapeIds = uniqueShapeIds([
      ...semanticDiff.modified,
      ...semanticDiff.moved_or_resized,
    ]);
    const nextSemanticIndex = {
      ...normalizedNextIndex,
      edit_summary: hasSemanticDiff(semanticDiff) ? semanticDiff : normalizedNextIndex.edit_summary || null,
    };
    await writeJSON(canvasSnapshotFile(workspace.id), snapshotToWrite);
    const nextRev = (workspace.snapshot_rev || 0) + 1;
    const saved = await writeCanvasWorkspace({
      ...workspace,
      title: compiled.ir?.board?.title || workspace.title,
      purpose: compiled.ir?.board?.purpose || workspace.purpose,
      semantic_index: nextSemanticIndex,
      updated_at: now,
      updatedAt: now,
      last_used_at: now,
      snapshot_rev: nextRev,
      agent_rev: nextRev,
    }, { makeActive: true });
    await appendCanvasEvent(workspace.id, {
      type: 'agent_canvas_ir_write',
      actor: 'agent',
      summary: event.summary || `通过 CanvasIR 更新画布：${saved.title}`,
      target: { kind: 'canvas_workspace', workspace_id: workspace.id },
      commands: Array.isArray(event.commands) ? event.commands : [{ op: 'write_canvas_ir' }],
      created_shape_ids: Array.isArray(event.created_shape_ids) ? event.created_shape_ids : diffCreatedShapeIds,
      mutated_shape_ids: Array.isArray(event.mutated_shape_ids) ? event.mutated_shape_ids : diffMutatedShapeIds,
      semantic_diff: hasSemanticDiff(semanticDiff) ? semanticDiff : undefined,
      meta: {
        canvas_ir: {
          node_count: compiled.ir.nodes.length,
          relationship_count: compiled.ir.relationships.length,
        },
        layout_report: compiled.layout_report,
        ...(event.meta || {}),
      },
    });
    broadcast('canvas_workspace_updated', canvasWorkspaceSummary(saved));
    return saved;
  }

  function publicCanvasWorkspace(workspace, { includeDetail = false } = {}) {
    const normalized = normalizeCanvasWorkspace(workspace);
    if (!normalized) return null;
    const detail = includeDetail
      ? {
        snapshot: readCanvasSnapshot(normalized.id),
        events: readCanvasEvents(normalized.id),
        feedback: readCanvasFeedback(normalized.id),
      }
      : {};
    return {
      ...normalized,
      ...detail,
      pending_feedback_count: includeDetail
        ? detail.feedback.filter(isOpenCanvasFeedback).length
        : undefined,
    };
  }

  async function appendCanvasEvent(workspaceId, event = {}) {
    const now = new Date().toISOString();
    const item = {
      id: event.id || generateId('cwe'),
      type: event.type || 'workspace_event',
      actor: event.actor || 'agent',
      summary: event.summary || '',
      target: event.target || null,
      commands: Array.isArray(event.commands) ? event.commands : undefined,
      created_shape_ids: Array.isArray(event.created_shape_ids) ? event.created_shape_ids : undefined,
      mutated_shape_ids: Array.isArray(event.mutated_shape_ids) ? event.mutated_shape_ids : undefined,
      semantic_diff: event.semantic_diff && typeof event.semantic_diff === 'object' ? event.semantic_diff : undefined,
      meta: event.meta && typeof event.meta === 'object' ? event.meta : undefined,
      created_at: event.created_at || now,
      createdAt: event.createdAt || event.created_at || now,
    };
    await updateJSON(canvasEventsFile(workspaceId), (items) => [...items, item], []);
    return item;
  }

  function tokenizeCanvasQuery(value) {
    return String(value || '')
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((token) => token.length >= 2);
  }

  function scoreCanvasWorkspace(workspace, context = {}) {
    const tokens = tokenizeCanvasQuery([
      context.title,
      context.purpose,
      context.task,
      context.task_name,
      context.prompt,
      ...(Array.isArray(context.tags) ? context.tags : []),
    ].filter(Boolean).join(' '));
    const haystack = [
      workspace.title,
      workspace.purpose,
      workspace.source_task_id,
      ...(workspace.tags || []),
      JSON.stringify(workspace.context || {}),
    ].join(' ').toLowerCase();
    let score = 0;
    for (const token of tokens) {
      if (haystack.includes(token)) score += 2;
    }
    const index = readCanvasIndex();
    if (index.active_workspace_id === workspace.id) score += 5;
    if (workspace.status === 'active') score += 2;
    const lastUsed = new Date(workspace.last_used_at || workspace.updated_at || workspace.created_at).getTime();
    const ageHours = Number.isFinite(lastUsed) ? (Date.now() - lastUsed) / 3600000 : 9999;
    if (ageHours < 24) score += 2;
    if (ageHours < 168) score += 1;
    return score;
  }

  async function createCanvasWorkspace({ title, purpose, tags, context, source_task_id: sourceTaskId, make_active: makeActive }) {
    const now = new Date().toISOString();
    const workspace = await writeCanvasWorkspace({
      id: generateId('cw'),
      type: 'canvas_workspace',
      title: title || '协作画布',
      purpose: purpose || '',
      status: 'active',
      tags: Array.isArray(tags) ? tags : [],
      context: context || {},
      source_task_id: sourceTaskId || context?.task_id || null,
      semantic_index: defaultCanvasSemanticIndex(),
      created_at: now,
      updated_at: now,
      last_used_at: now,
    }, { makeActive: makeActive !== false });
    await appendCanvasEvent(workspace.id, {
      type: 'workspace_created',
      actor: 'agent',
      summary: '创建 canvas_workspace。',
    });
    if (context?.vd_project_document === true || context?.vd_initialize_stage_canvas === true) {
      return initializeProjectStageCanvas(workspace, { reason: 'new_project_document' });
    }
    return workspace;
  }

  const DEFAULT_SCAFFOLDS = [
    {
      id: 'scaffold_inspiration_wall',
      type: 'template',
      scope: 'project',
      title: '灵感墙',
      stage: 'discover',
      description: '用于头脑风暴：包含主题区、灵感 sticky notes、聚类区和用户补充区。',
      agent_note: '当前处于探索阶段，我会先放一个灵感墙和一批启发 sticky notes，方便你删改、移动和继续扩展。',
      structure: [
        { kind: 'section', client_id: 'inspiration', title: '灵感墙', bounds: { x: 0, y: 0, w: 1180, h: 820 } },
      ],
      seed_content: [
        { kind: 'sticky_note', text: '机会点\n\n把模糊想法转成可操作的画布区域。', color: 'yellow', bounds: { x: 56, y: 300, w: 200, h: 200 } },
        { kind: 'sticky_note', text: '参考方向\n\n先给半成品，让用户直接改，而不是只给空模板。', color: 'yellow', bounds: { x: 288, y: 300, w: 200, h: 200 } },
        { kind: 'sticky_note', text: '待验证\n\n哪些内容应该进入正式 artifact？', color: 'yellow', bounds: { x: 520, y: 300, w: 200, h: 200 } },
        { kind: 'shape', text: '用户补充区\n\n把你的想法、素材或反例拖到这里。', color: 'green', bounds: { x: 56, y: 560, w: 520, h: 160 } },
        { kind: 'shape', text: '聚类 / 选择区\n\n把相近便签移动到一起，圈出值得继续展开的方向。', color: 'violet', bounds: { x: 608, y: 560, w: 520, h: 160 } },
      ],
      interaction_slots: [
        { title: '添加你的想法', bounds: { x: 80, y: 600, w: 400, h: 96 } },
      ],
      next_actions: ['补充 sticky notes', '聚类相近想法', '选择 3 个方向继续展开'],
    },
    {
      id: 'scaffold_definition_board',
      type: 'template',
      scope: 'project',
      title: '需求定义板',
      stage: 'define',
      description: '用于把开放需求收束成目标、约束、用户、成功标准和待确认问题。',
      agent_note: '当前需要定义问题边界，我会放一张需求定义板，并预留用户确认与改写的位置。',
      structure: [
        { kind: 'section', client_id: 'definition', title: '需求定义', bounds: { x: 0, y: 0, w: 1180, h: 680 } },
      ],
      seed_content: [
        { kind: 'shape', text: '目标\n\n这次协作最终要帮助用户完成什么？', color: 'blue', bounds: { x: 48, y: 96, w: 240, h: 160 } },
        { kind: 'shape', text: '用户 / 场景\n\n谁会使用？在什么情境下使用？', color: 'green', bounds: { x: 324, y: 96, w: 240, h: 160 } },
        { kind: 'shape', text: '约束\n\n技术、时间、风格、数据边界。', color: 'orange', bounds: { x: 600, y: 96, w: 240, h: 160 } },
        { kind: 'shape', text: '成功标准\n\n怎样判断这次产出是好的？', color: 'violet', bounds: { x: 876, y: 96, w: 240, h: 160 } },
        { kind: 'sticky_note', text: '待确认：优先做 MVP 还是完整系统设计？', color: 'yellow', bounds: { x: 48, y: 340, w: 240, h: 140 } },
        { kind: 'sticky_note', text: '待确认：哪些内容必须进入第一版验收？', color: 'yellow', bounds: { x: 324, y: 340, w: 240, h: 140 } },
      ],
      interaction_slots: [
        { title: '用户改写目标', bounds: { x: 48, y: 520, w: 520, h: 96 } },
      ],
      next_actions: ['确认目标', '标记必须项', '生成实施计划'],
    },
    {
      id: 'widget_priority_picker',
      type: 'widget',
      scope: 'project',
      title: '优先级选择器',
      stage: 'develop',
      description: '透明背景的轻量 HTML widget，用于让用户快速选择下一步优先级。',
      agent_note: '我会放一个可交互的优先级选择器，用户选择会作为 widget 状态和反馈进入上下文。',
      sizing: {
        mode: 'content_intrinsic',
        min_width: 260,
        max_width: 520,
        min_height: 140,
        max_height: 320,
      },
      state: {},
      input_schema: {},
      output_schema: {
        priority: 'string',
        note: 'string',
      },
      html: `<section style="display:inline-block;padding:12px;font-family:var(--vds-typography-font-family,system-ui,sans-serif);color:var(--vds-colors-text,#172033);background:transparent">
  <style>
    html,body{margin:0;background:transparent}
    .picker{display:inline-flex;flex-direction:column;gap:10px;min-width:260px;max-width:520px;padding:14px;border:1px solid rgba(124,58,237,.28);border-radius:8px;background:rgba(255,255,255,.86);box-shadow:0 8px 24px rgba(15,23,42,.12)}
    .title{font-size:14px;font-weight:700;line-height:1.3}
    .actions{display:flex;gap:8px;flex-wrap:wrap}
    button{min-height:32px;border:1px solid rgba(124,58,237,.32);border-radius:7px;background:#fff;color:#6d28d9;font:inherit;font-size:13px;padding:6px 10px;cursor:pointer}
  </style>
  <div class="picker">
    <div class="title">下一步优先做什么？</div>
    <div class="actions">
      <button data-vd-feedback-action="priority_define" data-vd-feedback-label="先定义需求" data-vd-feedback-item-id="priority-picker">定义需求</button>
      <button data-vd-feedback-action="priority_create" data-vd-feedback-label="先做初稿" data-vd-feedback-item-id="priority-picker">做初稿</button>
      <button data-vd-feedback-action="priority_review" data-vd-feedback-label="先评审取舍" data-vd-feedback-item-id="priority-picker">评审取舍</button>
    </div>
  </div>
</section>`,
    },
  ];

  function scaffoldIndexPath() {
    return path.join(projectScaffoldsPath, 'index.json');
  }

  function normalizeScaffold(scaffold) {
    if (!scaffold || typeof scaffold !== 'object') return null;
    const now = new Date().toISOString();
    return {
      id: scaffold.id || generateId('scf'),
      type: scaffold.type === 'widget' ? 'widget' : 'template',
      scope: 'project',
      title: scaffold.title || '未命名脚手架',
      stage: scaffold.stage || 'discover',
      description: scaffold.description || '',
      agent_note: scaffold.agent_note || '',
      structure: Array.isArray(scaffold.structure) ? scaffold.structure : [],
      seed_content: Array.isArray(scaffold.seed_content) ? scaffold.seed_content : [],
      interaction_slots: Array.isArray(scaffold.interaction_slots) ? scaffold.interaction_slots : [],
      next_actions: Array.isArray(scaffold.next_actions) ? scaffold.next_actions : [],
      html: typeof scaffold.html === 'string' ? scaffold.html : '',
      state: scaffold.state && typeof scaffold.state === 'object' ? scaffold.state : {},
      input_schema: scaffold.input_schema && typeof scaffold.input_schema === 'object' ? scaffold.input_schema : {},
      output_schema: scaffold.output_schema && typeof scaffold.output_schema === 'object' ? scaffold.output_schema : {},
      sizing: scaffold.sizing && typeof scaffold.sizing === 'object' ? scaffold.sizing : null,
      created_at: scaffold.created_at || now,
      updated_at: scaffold.updated_at || now,
    };
  }

  function readScaffolds() {
    const stored = readJSONObject(scaffoldIndexPath());
    const projectItems = Array.isArray(stored?.scaffolds) ? stored.scaffolds.map(normalizeScaffold).filter(Boolean) : [];
    const byId = new Map(DEFAULT_SCAFFOLDS.map((item) => [item.id, normalizeScaffold(item)]));
    for (const item of projectItems) byId.set(item.id, item);
    return Array.from(byId.values());
  }

  async function writeScaffolds(scaffolds) {
    const now = new Date().toISOString();
    const normalized = scaffolds.map(normalizeScaffold).filter(Boolean);
    await writeJSON(scaffoldIndexPath(), {
      version: 1,
      scope: 'project',
      scaffolds: normalized,
      updated_at: now,
    });
    return normalized;
  }

  app.get('/api/scaffolds', (req, res) => {
    try {
      let scaffolds = readScaffolds();
      const { type, stage } = req.query;
      if (type) scaffolds = scaffolds.filter((item) => item.type === type);
      if (stage) scaffolds = scaffolds.filter((item) => item.stage === stage);
      res.json({ type: 'project_scaffold_library', scope: 'project', scaffolds, total: scaffolds.length });
    } catch (err) {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message } });
    }
  });

  app.post('/api/scaffolds', async (req, res) => {
    try {
      const body = req.body || {};
      if (!body.title) {
        return res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'title is required' } });
      }
      const scaffolds = readScaffolds().filter((item) => item.id !== body.id);
      const scaffold = normalizeScaffold({
        ...body,
        id: body.id || generateId('scf'),
        created_at: body.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      await writeScaffolds([...scaffolds, scaffold]);
      res.status(201).json(scaffold);
    } catch (err) {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message } });
    }
  });

  app.get('/api/canvas-templates', (req, res) => {
    try {
      res.json({
        type: 'canvas_template_index',
        templates: listCanvasTemplates(),
        total: listCanvasTemplates().length,
      });
    } catch (err) {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message } });
    }
  });

  app.get('/api/canvas-templates/:id', (req, res) => {
    try {
      const template = getCanvasTemplate(req.params.id);
      if (!template) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Canvas template not found' } });
      }
      res.json(template);
    } catch (err) {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message } });
    }
  });

  app.get('/api/canvas-workspaces', (req, res) => {
    try {
      let workspaces = listCanvasWorkspaces();
      const { status, search } = req.query;
      if (status) workspaces = workspaces.filter((workspace) => workspace.status === status);
      if (search) {
        const query = String(search).toLowerCase();
        workspaces = workspaces.filter((workspace) => [
          workspace.title,
          workspace.purpose,
          workspace.source_task_id,
          ...(workspace.tags || []),
        ].join(' ').toLowerCase().includes(query));
      }
      const index = readCanvasIndex();
      res.json({
        type: 'canvas_workspace_index',
        active_workspace_id: index.active_workspace_id,
        workspaces,
        total: workspaces.length,
      });
    } catch (err) {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message } });
    }
  });

  app.get('/api/canvas-workspaces/project-document', async (req, res) => {
    try {
      const workspace = await ensureProjectCanvasWorkspace();
      res.json(publicCanvasWorkspace(workspace, { includeDetail: true }));
    } catch (err) {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message } });
    }
  });

  function canvasIRFromRequest(body = {}) {
    if (body.ir && typeof body.ir === 'object') return body.ir;
    if (body.template_id || body.template) {
      return instantiateTemplate(body.template_id || body.template, body);
    }
    return null;
  }

  app.post('/api/canvas-workspaces', async (req, res) => {
    try {
      const workspace = await createCanvasWorkspace(req.body || {});
      broadcast('canvas_workspace_created', canvasWorkspaceSummary(workspace));
      res.status(201).json(publicCanvasWorkspace(workspace, { includeDetail: true }));
    } catch (err) {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message } });
    }
  });

  app.post('/api/canvas-workspaces/select', async (req, res) => {
    try {
      const body = req.body || {};
      const forceNew = body.force_new === true || body.new_canvas === true;
      const selectionContext = { ...body, ...(body.context || {}) };
      const candidates = listCanvasWorkspaces()
        .filter((workspace) => workspace.status === 'active')
        .map((workspace) => ({
          workspace,
          score: scoreCanvasWorkspace(workspace, selectionContext),
        }))
        .sort((a, b) => b.score - a.score);

      let selected = null;
      let reason = 'created_new_workspace';
      if (!forceNew && candidates.length > 0 && candidates[0].score >= 5) {
        selected = readCanvasWorkspace(candidates[0].workspace.id);
        reason = 'reused_related_workspace';
      }

      if (!selected) {
        selected = await createCanvasWorkspace({
          title: body.title || body.context?.title || '协作画布',
          purpose: body.purpose || body.context?.purpose || '',
          tags: body.tags || body.context?.tags || [],
          context: body.context || {},
          source_task_id: body.source_task_id || body.context?.task_id || null,
          make_active: true,
        });
      } else {
        selected.last_used_at = new Date().toISOString();
        selected.updated_at = selected.last_used_at;
        selected.updatedAt = selected.updated_at;
        await writeCanvasWorkspace(selected, { makeActive: true });
        await appendCanvasEvent(selected.id, {
          type: 'workspace_selected',
          actor: 'agent',
          summary: '根据当前任务上下文复用已有 canvas_workspace。',
        });
      }

      res.json({
        workspace: publicCanvasWorkspace(selected, { includeDetail: true }),
        selection: {
          reason,
          score: candidates[0]?.score || 0,
          candidates: candidates.slice(0, 5).map((item) => ({
            id: item.workspace.id,
            title: item.workspace.title,
            score: item.score,
          })),
        },
      });
    } catch (err) {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message } });
    }
  });

  app.get('/api/canvas-workspaces/:id', (req, res) => {
    try {
      const workspace = readCanvasWorkspace(req.params.id);
      if (!workspace) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Canvas workspace not found' } });
      }
      res.json(publicCanvasWorkspace(workspace, { includeDetail: true }));
    } catch (err) {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message } });
    }
  });

  app.get('/api/canvas-workspaces/:id/context', (req, res) => {
    try {
      const workspace = readCanvasWorkspace(req.params.id);
      if (!workspace) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Canvas workspace not found' } });
      }
      res.json({
        type: 'canvas_workspace_agent_context',
        inspect_required_before_write: true,
        workspace: publicCanvasWorkspace(workspace),
        snapshot: readCanvasSnapshot(workspace.id),
        semantic_index: workspace.semantic_index,
        events: readCanvasEvents(workspace.id),
        open_feedback: openCanvasFeedback(workspace.id),
        open_region_annotations: openRegionAnnotations(workspace),
        open_completion_requests: openCompletionRequests(workspace),
      });
    } catch (err) {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message } });
    }
  });

  app.get('/api/canvas-workspaces/:id/agent-context', (req, res) => {
    try {
      const workspace = readCanvasWorkspace(req.params.id);
      if (!workspace) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Canvas workspace not found' } });
      }
      res.json(buildCanvasAgentContext({
        workspace,
        semanticIndex: workspace.semantic_index,
        events: readCanvasEvents(workspace.id),
        openFeedback: openCanvasFeedback(workspace.id),
        openRegionAnnotations: openRegionAnnotations(workspace),
        openCompletionRequests: openCompletionRequests(workspace),
      }));
    } catch (err) {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message } });
    }
  });

  app.post('/api/canvas-workspaces/:id/ir/validate', (req, res) => {
    try {
      const workspace = readCanvasWorkspace(req.params.id);
      if (!workspace) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Canvas workspace not found' } });
      }
      const ir = canvasIRFromRequest(req.body || {});
      if (!ir) {
        return res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'ir or template_id is required' } });
      }
      const validation = validateCanvasIR(ir);
      if (!validation.valid) {
        return res.json({
          valid: false,
          errors: validation.errors,
          warnings: validation.warnings,
          ir: validation.ir,
        });
      }
      const compiled = compileCanvasIR(validation.ir, { previousSnapshot: readCanvasSnapshot(workspace.id) });
      res.json({
        valid: compiled.valid,
        errors: compiled.errors,
        warnings: compiled.warnings,
        ir: compiled.ir,
        layout_report: compiled.layout_report,
        semantic_counts: compiled.valid ? {
          sections: compiled.semantic_index.sections.length,
          nodes: compiled.semantic_index.nodes.length,
          relationships: compiled.semantic_index.relationships.length,
        } : null,
      });
    } catch (err) {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message } });
    }
  });

  app.put('/api/canvas-workspaces/:id/ir', async (req, res) => {
    try {
      const workspace = readCanvasWorkspace(req.params.id);
      if (!workspace) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Canvas workspace not found' } });
      }
      const ir = canvasIRFromRequest(req.body || {});
      if (!ir) {
        return res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'ir or template_id is required' } });
      }
      const previousSnapshot = readCanvasSnapshot(workspace.id);
      const hydratedIR = hydrateWidgetRuntimeState(ir, previousSnapshot);
      const compiled = compileCanvasIR(hydratedIR, { previousSnapshot });
      if (!compiled.valid) {
        return res.status(400).json({
          error: {
            code: 'INVALID_CANVAS_IR',
            message: 'CanvasIR validation failed',
            details: compiled.errors,
          },
        });
      }
      const saved = await saveCompiledCanvasIR(workspace, compiled, {
        summary: req.body?.event?.summary || `通过 CanvasIR 写入画布：${compiled.ir.board.title}`,
        commands: [{ op: 'write_canvas_ir', node_count: compiled.ir.nodes.length }],
        meta: req.body?.event?.meta || {},
      });
      res.json(publicCanvasWorkspace(saved, { includeDetail: true }));
    } catch (err) {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message } });
    }
  });

  app.get('/api/canvas-widget-templates', (req, res) => {
    res.json({ templates: listWidgetTemplates() });
  });

  // Stateless dry run of the widget validation pipeline (Tier 3 pre-check).
  app.post('/api/canvas-widgets/validate', (req, res) => {
    try {
      const { spec, review } = prepareWidget(req.body || {});
      res.json({
        review,
        spec: spec ? {
          template_id: spec.template_id,
          title: spec.title,
          description: spec.description,
          state: spec.state,
          input_schema: spec.input_schema,
          output_schema: spec.output_schema,
          sizing: spec.sizing,
          html_length: spec.html.length,
        } : null,
      });
    } catch (err) {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message } });
    }
  });

  app.post('/api/canvas-workspaces/:id/commands', async (req, res) => {
    try {
      const workspace = readCanvasWorkspace(req.params.id);
      if (!workspace) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Canvas workspace not found' } });
      }
      const commands = Array.isArray(req.body?.commands) ? req.body.commands : [];
      if (commands.length === 0) {
        return res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'commands is required' } });
      }
      const currentIR = workspace.semantic_index?.canvas_ir || {
        version: 1,
        board: { title: workspace.title, purpose: workspace.purpose, reading_order: 'left_to_right' },
        grid: undefined,
        nodes: [],
        relationships: [],
      };
      // Pull live widget state from the snapshot into the IR so recompiling
      // does not wipe user interaction data (votes, scores, timers).
      const hydratedIR = hydrateWidgetRuntimeState(currentIR, readCanvasSnapshot(workspace.id));
      const { ir, results } = applyCanvasIRCommands(hydratedIR, commands);
      const locateOnly = commands.every((command) => command?.op === 'locate_node');
      if (locateOnly || req.body?.dry_run === true) {
        const compiled = compileCanvasIR(ir, { previousSnapshot: readCanvasSnapshot(workspace.id) });
        return res.json({
          status: 'dry_run',
          results,
          valid: compiled.valid,
          errors: compiled.errors,
          warnings: compiled.warnings,
          layout_report: compiled.layout_report,
        });
      }
      const compiled = compileCanvasIR(ir, { previousSnapshot: readCanvasSnapshot(workspace.id) });
      if (!compiled.valid) {
        return res.status(400).json({
          error: {
            code: 'INVALID_CANVAS_IR',
            message: 'CanvasIR command result is invalid',
            details: compiled.errors,
          },
          results,
        });
      }
      const saved = await saveCompiledCanvasIR(workspace, compiled, {
        summary: req.body?.summary || '通过 CanvasIR commands 更新画布。',
        commands,
        meta: { command_results: results },
      });
      res.json({
        workspace: publicCanvasWorkspace(saved, { includeDetail: true }),
        results,
        layout_report: compiled.layout_report,
      });
    } catch (err) {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message } });
    }
  });

  app.put('/api/canvas-workspaces/:id', async (req, res) => {
    try {
      const workspace = readCanvasWorkspace(req.params.id);
      if (!workspace) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Canvas workspace not found' } });
      }
      const next = {
        ...workspace,
        ...req.body,
        id: workspace.id,
        type: 'canvas_workspace',
        updated_at: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const saved = await writeCanvasWorkspace(next, { makeActive: req.body?.make_active === true });
      broadcast('canvas_workspace_updated', canvasWorkspaceSummary(saved));
      res.json(publicCanvasWorkspace(saved, { includeDetail: true }));
    } catch (err) {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message } });
    }
  });

  app.post('/api/canvas-workspaces/:id/activate', async (req, res) => {
    try {
      const workspace = readCanvasWorkspace(req.params.id);
      if (!workspace) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Canvas workspace not found' } });
      }
      workspace.last_used_at = new Date().toISOString();
      workspace.updated_at = workspace.last_used_at;
      workspace.updatedAt = workspace.updated_at;
      const saved = await writeCanvasWorkspace(workspace, { makeActive: true });
      await appendCanvasEvent(saved.id, {
        type: 'workspace_activated',
        actor: req.body?.actor || 'user',
        summary: '设为当前项目画布文档。',
      });
      broadcast('canvas_workspace_updated', canvasWorkspaceSummary(saved));
      res.json(publicCanvasWorkspace(saved, { includeDetail: true }));
    } catch (err) {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message } });
    }
  });

  app.put('/api/canvas-workspaces/:id/snapshot', async (req, res) => {
    try {
      const { snapshot, semantic_index: semanticIndex, event } = req.body || {};
      if (!snapshot || typeof snapshot !== 'object') {
        return res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'snapshot is required' } });
      }
      const workspace = readCanvasWorkspace(req.params.id);
      if (!workspace) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Canvas workspace not found' } });
      }
      const now = new Date().toISOString();
      const previousIndex = workspace.semantic_index;
      const rawBaseRev = req.body?.base_rev;
      const baseRev = Number.isFinite(rawBaseRev) ? rawBaseRev : Number.parseInt(rawBaseRev, 10);
      const guard = protectCanvasSnapshotWrite({
        incomingSnapshot: snapshot,
        currentSnapshot: readCanvasSnapshot(workspace.id),
        baseRev: Number.isFinite(baseRev) ? baseRev : null,
        agentRev: workspace.agent_rev || 0,
      });
      const guardedIncomingIndex = semanticIndex && typeof semanticIndex === 'object'
        ? appendRestoredSemanticEntries(semanticIndex, previousIndex, guard.restored_shape_ids, guard.restored_page_ids)
        : semanticIndex;
      const normalizedNextIndexBase = guardedIncomingIndex && typeof guardedIncomingIndex === 'object'
        ? carryCanvasAgentFields(
          previousIndex,
          pruneDanglingSemanticAnnotations(
            normalizeCanvasSemanticIndex({ ...guardedIncomingIndex, updated_at: now }),
            guard.snapshot,
          )
        )
        : workspace.semantic_index;
      const eventReview = event?.meta?.scaffold_review || null;
      const normalizedNextIndex = {
        ...normalizedNextIndexBase,
        layout_reviews: mergeCanvasLayoutReviews(
          previousIndex?.layout_reviews,
          normalizedNextIndexBase?.layout_reviews,
          eventReview,
        ),
      };
      const semanticDiff = summarizeSemanticDiff(previousIndex, normalizedNextIndex);
      const nextSemanticIndex = {
        ...normalizedNextIndex,
        edit_summary: hasSemanticDiff(semanticDiff) ? semanticDiff : normalizedNextIndex.edit_summary || null,
      };
      const shouldClearPendingUserState = event?.actor === 'agent' && event?.meta?.preserve_pending_user_changes !== true;
      const snapshotToWrite = shouldClearPendingUserState
        ? clearPendingUserCanvasState(guard.snapshot)
        : guard.snapshot;
      const semanticIndexToSave = shouldClearPendingUserState
        ? clearPendingUserSemanticState(nextSemanticIndex)
        : nextSemanticIndex;
      await writeJSON(canvasSnapshotFile(workspace.id), snapshotToWrite);
      const saved = await writeCanvasWorkspace({
        ...workspace,
        semantic_index: semanticIndexToSave,
        updated_at: now,
        updatedAt: now,
        last_used_at: now,
        snapshot_rev: (workspace.snapshot_rev || 0) + 1,
      }, { makeActive: true });
      if (event) {
        await appendCanvasEvent(workspace.id, {
          ...event,
          semantic_diff: hasSemanticDiff(semanticDiff) ? semanticDiff : event.semantic_diff,
        });
      }
      const writeProtection = {
        stale_base: guard.stale_base,
        base_rev: Number.isFinite(baseRev) ? baseRev : null,
        agent_rev: workspace.agent_rev || 0,
        restored_page_ids: guard.restored_page_ids,
        restored_shape_ids: guard.restored_shape_ids,
        preserved_widget_ids: guard.preserved_widget_ids,
      };
      if (guard.restored_page_ids.length > 0 || guard.restored_shape_ids.length > 0 || guard.preserved_widget_ids.length > 0) {
        await appendCanvasEvent(workspace.id, {
          type: 'snapshot_write_protected',
          actor: 'system',
          summary: `快照写入保护：恢复 ${guard.restored_page_ids.length} 个 page、${guard.restored_shape_ids.length} 个 agent shape，保留 ${guard.preserved_widget_ids.length} 个 widget 状态（客户端 base_rev=${writeProtection.base_rev ?? '无'}）。`,
          target: { kind: 'canvas_workspace', workspace_id: workspace.id },
          meta: { write_protection: writeProtection },
        });
      }
      broadcast('canvas_workspace_updated', canvasWorkspaceSummary(saved));
      res.json({
        ...publicCanvasWorkspace(saved, { includeDetail: true }),
        write_protection: writeProtection,
      });
    } catch (err) {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message } });
    }
  });

  app.post('/api/canvas-workspaces/:id/events', async (req, res) => {
    try {
      const workspace = readCanvasWorkspace(req.params.id);
      if (!workspace) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Canvas workspace not found' } });
      }
      const event = await appendCanvasEvent(workspace.id, req.body || {});
      res.status(201).json(event);
    } catch (err) {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message } });
    }
  });

  app.post('/api/canvas-workspaces/:id/feedback', async (req, res) => {
    try {
      const workspace = readCanvasWorkspace(req.params.id);
      if (!workspace) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Canvas workspace not found' } });
      }
      const content = String(req.body?.content || '').trim();
      if (!content) {
        return res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'content is required' } });
      }
      const now = new Date().toISOString();
      const authorName = typeof req.body?.author === 'object'
        ? String(req.body.author?.name || 'user')
        : String(req.body?.author || 'user');
      const authorKind = String(
        (typeof req.body?.author === 'object' ? req.body.author?.kind : req.body?.author_kind)
        || (authorName === 'user' ? 'user' : 'user'),
      ) === 'expert' ? 'expert' : 'user';
      const targets = normalizeCanvasFeedbackTargets(req.body?.targets, req.body?.target);
      const direction = ['expert_to_content', 'user_to_expert', 'other'].includes(req.body?.direction)
        ? req.body.direction
        : (authorKind === 'expert' ? 'expert_to_content' : 'user_to_expert');
      const isExpertOpinion = authorKind === 'expert' || direction === 'expert_to_content';
      const feedback = {
        id: generateId('fb'),
        kind: req.body?.kind || 'canvas_feedback',
        workspace_id: workspace.id,
        direction,
        target: req.body?.target || {},
        targets,
        status: isExpertOpinion ? 'shared' : 'tracked',
        handled: isExpertOpinion,
        content,
        author: authorName,
        author_kind: authorKind,
        round: Number.isFinite(req.body?.round) ? req.body.round : null,
        thread: [{ role: authorKind, name: authorName, text: content, at: now }],
        meta: req.body?.meta && typeof req.body.meta === 'object' ? req.body.meta : {},
        source: {
          type: 'canvas_workspace',
          workspace_id: workspace.id,
          workspace_title: workspace.title,
        },
        created_at: now,
        updated_at: now,
        createdAt: now,
        updatedAt: now,
      };
      await updateJSON(canvasFeedbackFile(workspace.id), (items) => [...items, feedback], []);
      await appendCanvasEvent(workspace.id, {
        type: 'feedback_received',
        actor: feedback.author,
        summary: content,
        target: feedback.target,
        meta: { ...feedback.meta, direction, targets, author_kind: authorKind },
      });
      broadcast('canvas_workspace_updated', canvasWorkspaceSummary(workspace));
      res.status(201).json(feedback);
    } catch (err) {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message } });
    }
  });

  // Append a reply into a feedback item's conversation thread. A user reply
  // re-opens the item (pending -> awaits the expert's next response); an expert
  // reply can resolve it.
  app.post('/api/canvas-workspaces/:id/feedback/:fid/reply', async (req, res) => {
    try {
      const workspace = readCanvasWorkspace(req.params.id);
      if (!workspace) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Canvas workspace not found' } });
      }
      const text = String(req.body?.text || req.body?.content || '').trim();
      if (!text) {
        return res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'text is required' } });
      }
      const role = String(req.body?.role || req.body?.author_kind) === 'expert' ? 'expert' : 'user';
      const name = typeof req.body?.author === 'object'
        ? String(req.body.author?.name || (role === 'expert' ? 'expert' : 'user'))
        : String(req.body?.author || (role === 'expert' ? 'expert' : 'user'));
      const now = new Date().toISOString();
      const message = { role, name, text, at: now };
      let updated = null;
      await updateJSON(canvasFeedbackFile(workspace.id), (items) => items.map((item) => {
        if (item.id !== req.params.fid) return item;
        const thread = Array.isArray(item.thread) ? [...item.thread, message] : [message];
        const status = role === 'expert'
          ? (req.body?.resolve === false ? 'addressed' : 'resolved')
          : 'tracked';
        updated = {
          ...item,
          thread,
          status,
          handled: status === 'resolved',
          updated_at: now,
          updatedAt: now,
        };
        return updated;
      }), []);
      if (!updated) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Feedback item not found' } });
      }
      await appendCanvasEvent(workspace.id, {
        type: 'feedback_reply',
        actor: name,
        summary: text,
        target: updated.target || {},
        meta: { feedback_id: updated.id, role, status: updated.status },
      });
      broadcast('canvas_workspace_updated', canvasWorkspaceSummary(workspace));
      res.status(201).json(updated);
    } catch (err) {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message } });
    }
  });

  // Explicitly mark a feedback item resolved / reopened.
  app.post('/api/canvas-workspaces/:id/feedback/:fid/status', async (req, res) => {
    try {
      const workspace = readCanvasWorkspace(req.params.id);
      if (!workspace) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Canvas workspace not found' } });
      }
      const status = ['tracked', 'addressed', 'resolved'].includes(req.body?.status)
        ? req.body.status
        : 'resolved';
      const now = new Date().toISOString();
      let updated = null;
      await updateJSON(canvasFeedbackFile(workspace.id), (items) => items.map((item) => {
        if (item.id !== req.params.fid) return item;
        updated = { ...item, status, handled: status === 'resolved', updated_at: now, updatedAt: now };
        return updated;
      }), []);
      if (!updated) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Feedback item not found' } });
      }
      broadcast('canvas_workspace_updated', canvasWorkspaceSummary(workspace));
      res.status(200).json(updated);
    } catch (err) {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message } });
    }
  });

}

// Normalize feedback targets into [{ shape_id, level }]. Accepts an array of
// strings/objects and/or a legacy single `target` with shape_id / shape_ids.
function normalizeCanvasFeedbackTargets(rawTargets, legacyTarget) {
  const out = [];
  const push = (shapeId, level) => {
    const id = String(shapeId || '').trim();
    if (!id || out.some((t) => t.shape_id === id)) return;
    out.push({ shape_id: id, level: typeof level === 'string' && level ? level : null });
  };
  if (Array.isArray(rawTargets)) {
    rawTargets.forEach((t) => {
      if (typeof t === 'string') push(t, null);
      else if (t && typeof t === 'object') push(t.shape_id || t.id, t.level);
    });
  }
  if (legacyTarget && typeof legacyTarget === 'object') {
    if (Array.isArray(legacyTarget.shape_ids)) legacyTarget.shape_ids.forEach((id) => push(id, null));
    if (legacyTarget.shape_id) push(legacyTarget.shape_id, null);
  }
  return out;
}

module.exports = { setupRoutes };
