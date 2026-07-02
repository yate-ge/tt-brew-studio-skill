const canvasWidgets = require('./canvas-widgets');

const DEFAULT_TLDRAW_SCHEMA = {
  schemaVersion: 2,
  sequences: {
    'com.tldraw.store': 5,
    'com.tldraw.asset': 1,
    'com.tldraw.camera': 1,
    'com.tldraw.document': 2,
    'com.tldraw.instance': 26,
    'com.tldraw.instance_page_state': 5,
    'com.tldraw.page': 1,
    'com.tldraw.instance_presence': 6,
    'com.tldraw.pointer': 1,
    'com.tldraw.shape': 4,
    'com.tldraw.user': 1,
    'com.tldraw.asset.image': 6,
    'com.tldraw.asset.video': 5,
    'com.tldraw.asset.bookmark': 2,
    'com.tldraw.shape.group': 0,
    'com.tldraw.shape.text': 4,
    'com.tldraw.shape.bookmark': 2,
    'com.tldraw.shape.draw': 4,
    'com.tldraw.shape.geo': 11,
    'com.tldraw.shape.note': 12,
    'com.tldraw.shape.line': 5,
    'com.tldraw.shape.frame': 1,
    'com.tldraw.shape.arrow': 8,
    'com.tldraw.shape.highlight': 3,
    'com.tldraw.shape.embed': 4,
    'com.tldraw.shape.image': 5,
    'com.tldraw.shape.video': 4,
    'com.tldraw.binding.arrow': 1,
  },
};

const DEFAULT_GRID = {
  cols: 12,
  cellWidth: 168,
  rowHeight: 104,
  gap: 24,
  padding: 48,
};

const DEFAULT_LAYOUT_POLICY = {
  flow: 'top_left',
  container_sizing: 'content_fit',
  density: 'loose',
  preserve_user_content: true,
  wrap_new_generation: true,
  wrapper_margin: 72,
};

const DEFAULT_NODE_SIZE = {
  sticky: { w: 220, h: 112 },
  text: { w: 360, h: 96 },
  shape: { w: 260, h: 132 },
  html_component: { w: 360, h: 240 },
};

const DESIGN_STAGE_SEQUENCE = [
  {
    key: 'discover',
    id: 'stage-discover',
    role: 'stage.discover',
    title: '发现 Discover',
    rhythm: '发散',
    color: 'yellow',
    guide: '收集观察、资料、场景和早期疑问；先打开可能性，不急着下结论。',
  },
  {
    key: 'define',
    id: 'stage-define',
    role: 'stage.define',
    title: '定义 Define',
    rhythm: '收敛',
    color: 'blue',
    guide: '把混杂信息收束成问题边界、判断标准、约束和待验证假设。',
  },
  {
    key: 'develop',
    id: 'stage-develop',
    role: 'stage.develop',
    title: '发展 Develop',
    rhythm: '发散',
    color: 'green',
    guide: '生成、比较和迭代多个方案；用低精度原型让讨论具体起来。',
  },
  {
    key: 'deliver',
    id: 'stage-deliver',
    role: 'stage.deliver',
    title: '交付 Deliver',
    rhythm: '收敛',
    color: 'violet',
    guide: '整理可交付物、验收标准、导则、未解决问题和可迁移知识。',
  },
];

const DESIGN_STAGE_ALIASES = new Map([
  ['discover', 'discover'],
  ['discovery', 'discover'],
  ['explore', 'discover'],
  ['exploration', 'discover'],
  ['research', 'discover'],
  ['observe', 'discover'],
  ['immersion', 'discover'],
  ['发现', 'discover'],
  ['探索', 'discover'],
  ['调研', 'discover'],
  ['define', 'define'],
  ['definition', 'define'],
  ['framing', 'define'],
  ['synthesis', 'define'],
  ['problem', 'define'],
  ['定义', 'define'],
  ['收束', 'define'],
  ['develop', 'develop'],
  ['development', 'develop'],
  ['ideate', 'develop'],
  ['ideation', 'develop'],
  ['prototype', 'develop'],
  ['prototyping', 'develop'],
  ['create', 'develop'],
  ['review', 'develop'],
  ['发展', 'develop'],
  ['方案', 'develop'],
  ['原型', 'develop'],
  ['评审', 'develop'],
  ['deliver', 'deliver'],
  ['delivery', 'deliver'],
  ['handoff', 'deliver'],
  ['launch', 'deliver'],
  ['implementation', 'deliver'],
  ['final', 'deliver'],
  ['交付', 'deliver'],
  ['落地', 'deliver'],
  ['验收', 'deliver'],
]);

const PROJECT_STAGE_LAYOUT = {
  width: 5200,
  headerHeight: 300,
  stageHeight: 1800,
  stageGap: 96,
  stageStartY: 396,
  contentOrigin: { x: 56, y: 172 },
  contentGap: 56,
  rightPadding: 72,
};

const MIN_NODE_SIZE = {
  sticky: { w: 104, h: 64 },
  sticky_note: { w: 104, h: 64 },
  text: { w: 120, h: 48 },
  shape: { w: 120, h: 72 },
  html_component: { w: 160, h: 80 },
};

function nodeDesiredSize(node) {
  if (node.kind === 'html_component') {
    const sizing = node.meta?.vd_sizing;
    if (sizing && Number.isFinite(sizing.initial_width) && Number.isFinite(sizing.initial_height)) {
      return { w: sizing.initial_width, h: sizing.initial_height };
    }
  }
  return DEFAULT_NODE_SIZE[node.kind] || DEFAULT_NODE_SIZE.shape;
}

const INDEX_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const CONTAINER_KINDS = new Set(['section', 'slot', 'cluster', 'pattern']);
const CONTENT_KINDS = new Set([
  'sticky',
  'sticky_note',
  'text',
  'shape',
  'table',
  'code_block',
  'image',
  'html_component',
  'region_annotation',
  'completion_request',
]);

const COLOR_BY_ROLE = {
  market: 'light-blue',
  customer: 'light-blue',
  value: 'light-violet',
  finance: 'light-green',
  cost: 'light-red',
  capability: 'light-orange',
  operation: 'light-yellow',
  question: 'yellow',
  hypothesis: 'yellow',
  risk: 'red',
  decision: 'violet',
};

// Diagram geo subtypes carry meaning: rectangle = process step, diamond =
// decision, ellipse = start/end or state, cloud = fuzzy area.
const GEO_SUBTYPES = new Set([
  'rectangle', 'ellipse', 'triangle', 'diamond', 'pentagon', 'hexagon',
  'octagon', 'star', 'rhombus', 'oval', 'trapezoid', 'cloud', 'heart',
  'x-box', 'check-box', 'arrow-right', 'arrow-left', 'arrow-up', 'arrow-down',
]);

const GEO_SUBTYPE_ALIASES = new Map([
  ['process', 'rectangle'], ['step', 'rectangle'], ['box', 'rectangle'], ['rect', 'rectangle'],
  ['decision', 'diamond'], ['choice', 'diamond'], ['gateway', 'diamond'], ['branch', 'diamond'],
  ['state', 'ellipse'], ['status', 'ellipse'], ['start', 'ellipse'], ['end', 'ellipse'],
  ['begin', 'ellipse'], ['terminal', 'ellipse'], ['circle', 'ellipse'],
  ['fuzzy', 'cloud'], ['vague', 'cloud'], ['unknown', 'cloud'],
]);

const GEO_ROLE_RULES = [
  [/decision|choice|gateway|branch|判断|决策|分支/i, 'diamond'],
  [/state|status|start|end|begin|finish|terminal|起点|终点|状态|开始|结束/i, 'ellipse'],
  [/fuzzy|unknown|risk|assumption|模糊|不确定|风险|假设|待定/i, 'cloud'],
];

function geoSubtypeForShapeNode(node) {
  const explicit = String(node.shape_type || '').trim().toLowerCase();
  if (GEO_SUBTYPES.has(explicit)) return explicit;
  if (GEO_SUBTYPE_ALIASES.has(explicit)) return GEO_SUBTYPE_ALIASES.get(explicit);
  const role = String(node.role || '');
  for (const [pattern, subtype] of GEO_ROLE_RULES) {
    if (pattern.test(role)) return subtype;
  }
  return 'rectangle';
}

function makeRichText(text) {
  const lines = String(text || '').split('\n');
  return {
    type: 'doc',
    content: lines.map((line) => {
      if (!line) return { type: 'paragraph' };
      return {
        type: 'paragraph',
        content: [{ type: 'text', text: line }],
      };
    }),
  };
}

function compactText(text, max = 80) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function safeId(value, fallback = 'node') {
  const raw = String(value || fallback).trim().toLowerCase();
  const cleaned = raw
    .replace(/[^a-z0-9_\-]+/gi, '-')
    .replace(/^-+|-+$/g, '');
  if (cleaned) return cleaned;
  const hex = Buffer.from(raw || fallback).toString('hex').slice(0, 12);
  return `n-${hex || 'node'}`;
}

function shapeIdFor(nodeId) {
  return `shape:vd-ir-${safeId(nodeId)}`;
}

function connectorShapeId(relId) {
  return `shape:vd-ir-conn-${safeId(relId)}`;
}

function connectorBindingId(relId, terminal) {
  return `binding:vd-ir-conn-${safeId(relId)}-${terminal}`;
}

function assetIdFor(nodeId) {
  return `asset:vd-ir-${safeId(nodeId)}`;
}

function indexKeyAt(index) {
  if (index < INDEX_CHARS.length) return `a${INDEX_CHARS[index]}`;
  const n = index - INDEX_CHARS.length;
  const first = INDEX_CHARS[Math.floor(n / (INDEX_CHARS.length - 1)) % INDEX_CHARS.length];
  const second = INDEX_CHARS[(n % (INDEX_CHARS.length - 1)) + 1];
  return `a${first}${second}`;
}

function normalizeGrid(grid = {}) {
  return {
    cols: positiveInt(grid.cols, DEFAULT_GRID.cols),
    cellWidth: positiveNumber(grid.cellWidth, DEFAULT_GRID.cellWidth),
    rowHeight: positiveNumber(grid.rowHeight, DEFAULT_GRID.rowHeight),
    gap: nonNegativeNumber(grid.gap, DEFAULT_GRID.gap),
    padding: nonNegativeNumber(grid.padding, DEFAULT_GRID.padding),
  };
}

function normalizeLayoutPolicy(policy = {}) {
  const input = policy && typeof policy === 'object' ? policy : {};
  return {
    ...input,
    flow: input.flow || input.auto_flow || DEFAULT_LAYOUT_POLICY.flow,
    container_sizing: input.container_sizing || DEFAULT_LAYOUT_POLICY.container_sizing,
    density: input.density || DEFAULT_LAYOUT_POLICY.density,
    preserve_user_content: input.preserve_user_content !== false,
    wrap_new_generation: input.wrap_new_generation !== false,
    wrapper_margin: nonNegativeNumber(input.wrapper_margin, DEFAULT_LAYOUT_POLICY.wrapper_margin),
  };
}

function positiveInt(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : fallback;
}

function positiveNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function nonNegativeNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function normalizeArea(area) {
  if (!area || typeof area !== 'object') return null;
  return {
    col: positiveInt(area.col, 1),
    row: positiveInt(area.row, 1),
    colSpan: positiveInt(area.colSpan, 1),
    rowSpan: positiveInt(area.rowSpan, 1),
  };
}

function normalizeBounds(bounds) {
  if (!bounds || typeof bounds !== 'object') return null;
  const x = Number(bounds.x ?? bounds.minX ?? 0);
  const y = Number(bounds.y ?? bounds.minY ?? 0);
  const width = Number(bounds.w ?? bounds.width ?? (
    Number.isFinite(bounds.maxX) && Number.isFinite(bounds.minX) ? bounds.maxX - bounds.minX : NaN
  ));
  const height = Number(bounds.h ?? bounds.height ?? (
    Number.isFinite(bounds.maxY) && Number.isFinite(bounds.minY) ? bounds.maxY - bounds.minY : NaN
  ));
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height)) return null;
  if (width <= 0 || height <= 0) return null;
  return {
    x: Math.round(x),
    y: Math.round(y),
    w: Math.round(width),
    h: Math.round(height),
  };
}

function normalizeDesignStageKey(value) {
  if (value && typeof value === 'object') {
    return normalizeDesignStageKey(value.stage || value.phase || value.key || value.id || value.role);
  }
  const raw = String(value || '').trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (lower.startsWith('stage.')) return normalizeDesignStageKey(lower.slice(6));
  if (lower.startsWith('stage-')) return normalizeDesignStageKey(lower.slice(6));
  if (DESIGN_STAGE_ALIASES.has(lower)) return DESIGN_STAGE_ALIASES.get(lower);
  if (DESIGN_STAGE_ALIASES.has(raw)) return DESIGN_STAGE_ALIASES.get(raw);
  const compact = safeId(lower);
  if (DESIGN_STAGE_ALIASES.has(compact)) return DESIGN_STAGE_ALIASES.get(compact);
  return DESIGN_STAGE_SEQUENCE.some((stage) => stage.key === compact) ? compact : null;
}

function designStageByKey(value) {
  const key = normalizeDesignStageKey(value);
  return DESIGN_STAGE_SEQUENCE.find((stage) => stage.key === key) || null;
}

function designStageFromCommand(command = {}) {
  return designStageByKey(
    command.stage
      || command.phase
      || command.target_stage
      || command.targetStage
      || command.meta?.vd_stage
      || command.meta?.stage
  );
}

function stageFrameNodeId(value) {
  const stage = designStageByKey(value);
  return stage?.id || null;
}

function createProjectStageCanvasIR(options = {}) {
  const title = options.title || '项目画布';
  const purpose = options.purpose || '按 Discover / Define / Develop / Deliver 四阶段组织设计导师协作。';
  const currentStage = normalizeDesignStageKey(options.current_stage || options.currentStage) || 'discover';
  const width = positiveNumber(options.width, PROJECT_STAGE_LAYOUT.width);
  const stageHeight = positiveNumber(options.stage_height || options.stageHeight, PROJECT_STAGE_LAYOUT.stageHeight);
  const stageGap = nonNegativeNumber(options.stage_gap || options.stageGap, PROJECT_STAGE_LAYOUT.stageGap);
  const stageStartY = positiveNumber(options.stage_start_y || options.stageStartY, PROJECT_STAGE_LAYOUT.stageStartY);
  const contentOrigin = {
    x: nonNegativeNumber(options.content_origin?.x, PROJECT_STAGE_LAYOUT.contentOrigin.x),
    y: nonNegativeNumber(options.content_origin?.y, PROJECT_STAGE_LAYOUT.contentOrigin.y),
  };
  const nodes = [
    {
      id: 'project-header',
      kind: 'section',
      title: '项目头卡',
      role: 'project.header',
      bounds: { x: 0, y: 0, w: width, h: PROJECT_STAGE_LAYOUT.headerHeight },
      color: 'violet',
      grid: { cols: 12, cellWidth: 180, rowHeight: 84, gap: 24, padding: 48 },
      meta: {
        vd_project_header: true,
        vd_current_stage: currentStage,
      },
    },
    {
      id: 'project-brief-card',
      kind: 'text',
      title: 'Brief 摘要',
      role: 'project.header.brief',
      parent: 'project-header',
      bounds: { x: 56, y: 76, w: 620, h: 124 },
      content: '把项目诉求、目标用户、材料状态放在这里。学生可以直接改写。',
      meta: { vd_editable_prompt: true },
    },
    {
      id: 'project-experts-card',
      kind: 'text',
      title: '专家组',
      role: 'project.header.experts',
      parent: 'project-header',
      bounds: { x: 716, y: 76, w: 620, h: 124 },
      content: '主导专家 + 支持专家。每条判断都保留专家署名和观看方式。',
      meta: { vd_editable_prompt: true },
    },
    {
      id: 'project-stage-card',
      kind: 'text',
      title: '当前阶段',
      role: 'project.header.current_stage',
      parent: 'project-header',
      bounds: { x: 1376, y: 76, w: 620, h: 124 },
      content: `默认从 ${designStageByKey(currentStage)?.title || '发现 Discover'} 开始；阶段可以回跳，但不要重排四个阶段区域。`,
      meta: { vd_current_stage: currentStage },
    },
  ];

  DESIGN_STAGE_SEQUENCE.forEach((stage, index) => {
    const y = stageStartY + index * (stageHeight + stageGap);
    nodes.push({
      id: stage.id,
      kind: 'section',
      title: stage.title,
      role: stage.role,
      bounds: { x: 0, y, w: width, h: stageHeight },
      color: stage.color,
      grid: { cols: 12, cellWidth: 190, rowHeight: 104, gap: 24, padding: 56 },
      meta: {
        vd_stage_key: stage.key,
        vd_stage_role: stage.role,
        vd_stage_order: index + 1,
        vd_stage_rhythm: stage.rhythm,
        vd_stage_content_origin: contentOrigin,
        vd_stage_flow_gap: PROJECT_STAGE_LAYOUT.contentGap,
        vd_stage_right_padding: PROJECT_STAGE_LAYOUT.rightPadding,
        vd_stage_template_dropzone: true,
        vd_current_stage: stage.key === currentStage,
      },
    });
    nodes.push({
      id: `${stage.id}-guide`,
      kind: 'text',
      title: `${stage.rhythm}节奏`,
      role: `${stage.role}.guide`,
      parent: stage.id,
      bounds: { x: 56, y: 56, w: 820, h: 84 },
      content: stage.guide,
      meta: {
        vd_stage_key: stage.key,
        vd_stage_is_guide: true,
        vd_stage_reserved: true,
      },
    });
  });

  return normalizeCanvasIR({
    version: 1,
    board: {
      title,
      purpose,
      reading_order: 'top_to_bottom',
    },
    grid: { cols: 12, cellWidth: 200, rowHeight: 120, gap: 24, padding: 0 },
    layout_policy: {
      flow: 'top_left',
      container_sizing: 'content_fit',
      density: 'loose',
      preserve_user_content: true,
      wrap_new_generation: false,
      wrapper_margin: 72,
    },
    nodes,
    relationships: DESIGN_STAGE_SEQUENCE.slice(0, -1).map((stage, index) => ({
      id: `stage-flow-${stage.key}-${DESIGN_STAGE_SEQUENCE[index + 1].key}`,
      from: stage.id,
      to: DESIGN_STAGE_SEQUENCE[index + 1].id,
      type: 'stage_flow',
      label: 'next stage',
    })),
    metadata: {
      template_id: 'project_stage_spine',
      template_role: 'project.initial_stage_layout',
      current_stage: currentStage,
    },
  });
}

function areaToBounds(area, grid, origin = { x: 0, y: 0 }) {
  const normalizedArea = normalizeArea(area) || { col: 1, row: 1, colSpan: 1, rowSpan: 1 };
  const x = origin.x + grid.padding + (normalizedArea.col - 1) * (grid.cellWidth + grid.gap);
  const y = origin.y + grid.padding + (normalizedArea.row - 1) * (grid.rowHeight + grid.gap);
  const w = normalizedArea.colSpan * grid.cellWidth + Math.max(0, normalizedArea.colSpan - 1) * grid.gap;
  const h = normalizedArea.rowSpan * grid.rowHeight + Math.max(0, normalizedArea.rowSpan - 1) * grid.gap;
  return {
    x: Math.round(x),
    y: Math.round(y),
    w: Math.round(w),
    h: Math.round(h),
  };
}

function normalizeCanvasIR(input = {}) {
  const now = new Date().toISOString();
  const nodes = Array.isArray(input.nodes) ? input.nodes : [];
  const ir = {
    version: input.version || 1,
    board: {
      title: input.board?.title || input.title || '协作画布',
      purpose: input.board?.purpose || input.purpose || '',
      reading_order: input.board?.reading_order || 'left_to_right',
    },
    grid: normalizeGrid(input.grid),
    nodes: nodes.map((node, index) => normalizeIRNode(node, index)),
    relationships: Array.isArray(input.relationships) ? input.relationships.map(normalizeRelationship).filter(Boolean) : [],
    layout_policy: normalizeLayoutPolicy(input.layout_policy),
    metadata: {
      ...(input.metadata || {}),
      normalized_at: now,
    },
  };
  return maybeWrapGeneratedScaffold(ir);
}

function normalizeIRNode(node = {}, index = 0) {
  const rawKind = String(node.kind || 'sticky').trim();
  const kind = rawKind === 'widget' ? 'html_component' : rawKind;
  const id = safeId(node.id || node.title || `node-${index + 1}`, `node-${index + 1}`);
  const title = node.title || node.label || compactText(node.content || node.text || id, 48);
  return {
    id,
    kind,
    title,
    role: node.role || '',
    parent: node.parent ? safeId(node.parent) : null,
    children: Array.isArray(node.children) ? node.children.map((item) => safeId(item)).filter(Boolean) : [],
    visible: node.visible !== false,
    area: normalizeArea(node.area),
    bounds: normalizeBounds(node.bounds),
    grid: node.grid ? normalizeGrid(node.grid) : null,
    content: typeof node.content === 'string' ? node.content : (typeof node.text === 'string' ? node.text : ''),
    color: node.color || null,
    shape_type: typeof node.shape_type === 'string' ? node.shape_type : (typeof node.geo === 'string' ? node.geo : null),
    src: typeof node.src === 'string' ? node.src : (typeof node.image_src === 'string' ? node.image_src : null),
    alt_text: typeof node.alt_text === 'string' ? node.alt_text : (typeof node.alt === 'string' ? node.alt : ''),
    items: Array.isArray(node.items) ? node.items : [],
    meta: node.meta && typeof node.meta === 'object' ? node.meta : {},
  };
}

function normalizeRelationship(rel = {}) {
  const from = rel.from || rel.from_id || rel.from_node_id;
  const to = rel.to || rel.to_id || rel.to_node_id;
  if (!from || !to) return null;
  return {
    id: rel.id || `rel-${safeId(from)}-${safeId(to)}`,
    from: safeId(from),
    to: safeId(to),
    type: rel.type || rel.relationship_type || 'related_to',
    label: rel.label || '',
    meta: rel.meta && typeof rel.meta === 'object' ? rel.meta : {},
  };
}

function maybeWrapGeneratedScaffold(ir) {
  const policy = normalizeLayoutPolicy(ir.layout_policy);
  if (policy.wrap_new_generation === false) return ir;
  const roots = ir.nodes.filter((node) => !node.parent);
  if (roots.length === 0) return ir;
  if (roots.length === 1 && CONTAINER_KINDS.has(roots[0].kind) && roots[0].visible !== false) return ir;
  if (roots.some((node) => String(node.role || '').includes('scaffold.root') || node.meta?.vd_scaffold_root)) return ir;

  const layout = resolveLayout(
    { ...ir, layout_policy: { ...policy, wrap_new_generation: false } },
    new Map(ir.nodes.map((node) => [node.id, node])),
    buildChildrenByParent(ir.nodes)
  );
  const rootBounds = roots.map((node) => layout.get(node.id)?.bounds).filter(Boolean);
  if (rootBounds.length === 0) return ir;

  const margin = policy.wrapper_margin;
  const minX = Math.min(...rootBounds.map((bounds) => bounds.x));
  const minY = Math.min(...rootBounds.map((bounds) => bounds.y));
  const maxX = Math.max(...rootBounds.map((bounds) => bounds.x + bounds.w));
  const maxY = Math.max(...rootBounds.map((bounds) => bounds.y + bounds.h));
  const wrapperBounds = {
    x: Math.round(minX - margin),
    y: Math.round(minY - margin),
    w: Math.round((maxX - minX) + margin * 2),
    h: Math.round((maxY - minY) + margin * 2),
  };
  const wrapperId = uniqueNodeId(ir, 'scaffold-root');
  const wrappedRoots = new Set(roots.map((node) => node.id));
  const nodes = ir.nodes.map((node) => {
    if (!wrappedRoots.has(node.id)) return node;
    const bounds = layout.get(node.id)?.bounds;
    return {
      ...node,
      parent: wrapperId,
      area: null,
      bounds: bounds ? {
        x: bounds.x - wrapperBounds.x,
        y: bounds.y - wrapperBounds.y,
        w: bounds.w,
        h: bounds.h,
      } : node.bounds,
    };
  });
  return {
    ...ir,
    nodes: [
      {
        id: wrapperId,
        kind: 'section',
        title: ir.board.title || '协作脚手架',
        role: 'scaffold.root',
        parent: null,
        children: [],
        visible: true,
        area: null,
        bounds: wrapperBounds,
        grid: deriveChildGrid({ kind: 'section' }, wrapperBounds),
        content: '',
        color: null,
        items: [],
        meta: { vd_scaffold_root: true },
      },
      ...nodes,
    ],
    metadata: {
      ...ir.metadata,
      scaffold_wrap_applied: true,
      scaffold_root_id: wrapperId,
    },
  };
}

function uniqueNodeId(ir, base) {
  const ids = new Set(ir.nodes.map((node) => node.id));
  let candidate = safeId(base);
  let suffix = 2;
  while (ids.has(candidate)) {
    candidate = `${safeId(base)}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function validateCanvasIR(input) {
  const ir = normalizeCanvasIR(input);
  const errors = [];
  const warnings = [];
  const nodesById = new Map();

  for (const node of ir.nodes) {
    if (nodesById.has(node.id)) errors.push({ code: 'DUPLICATE_NODE_ID', node_id: node.id });
    nodesById.set(node.id, node);
    if (!CONTAINER_KINDS.has(node.kind) && !CONTENT_KINDS.has(node.kind)) {
      warnings.push({ code: 'UNKNOWN_NODE_KIND', node_id: node.id, kind: node.kind });
    }
    if (node.area && node.area.col + node.area.colSpan - 1 > ir.grid.cols && !node.parent) {
      errors.push({ code: 'AREA_OVERFLOW', node_id: node.id, message: 'Top-level area exceeds board grid columns.' });
    }
  }

  for (const node of ir.nodes) {
    if (node.parent && !nodesById.has(safeId(node.parent))) {
      errors.push({ code: 'MISSING_PARENT', node_id: node.id, parent: node.parent });
    }
  }

  const byParent = groupBy(ir.nodes.filter((node) => node.area), (node) => node.parent || '__root__');
  for (const [parent, siblings] of byParent.entries()) {
    for (let i = 0; i < siblings.length; i++) {
      for (let j = i + 1; j < siblings.length; j++) {
        if (areasOverlap(siblings[i].area, siblings[j].area)) {
          errors.push({
            code: 'AREA_OVERLAP',
            parent: parent === '__root__' ? null : parent,
            a: siblings[i].id,
            b: siblings[j].id,
          });
        }
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings, ir };
}

function groupBy(items, fn) {
  const map = new Map();
  for (const item of items) {
    const key = fn(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return map;
}

function areasOverlap(a, b) {
  if (!a || !b) return false;
  const aRight = a.col + a.colSpan - 1;
  const bRight = b.col + b.colSpan - 1;
  const aBottom = a.row + a.rowSpan - 1;
  const bBottom = b.row + b.rowSpan - 1;
  return a.col <= bRight && aRight >= b.col && a.row <= bBottom && aBottom >= b.row;
}

function compileCanvasIR(input, options = {}) {
  const validation = validateCanvasIR(input);
  const ir = validation.ir;
  if (!validation.valid) {
    return {
      valid: false,
      errors: validation.errors,
      warnings: validation.warnings,
      ir,
    };
  }

  const now = options.now || new Date().toISOString();
  const previousSnapshot = options.previousSnapshot && typeof options.previousSnapshot === 'object' ? options.previousSnapshot : {};
  const schema = previousSnapshot.document?.schema || DEFAULT_TLDRAW_SCHEMA;
  const previousStore = previousSnapshot.document?.store || {};
  const targetPageId = resolveTargetPageId({
    previousSnapshot,
    store: previousStore,
    pageId: options.page_id || options.pageId,
  });
  const nodesById = new Map(ir.nodes.map((node) => [node.id, node]));
  const childrenByParent = buildChildrenByParent(ir.nodes);
  const layout = resolveLayout(ir, nodesById, childrenByParent);
  const records = buildBaseStoreRecords(previousStore, normalizeLayoutPolicy(ir.layout_policy), targetPageId);

  const tldrawSections = [];
  const tldrawNodes = [];
  const shapeIdsByNodeId = new Map();
  const topLevelNodes = ir.nodes.filter((node) => !node.parent);

  addRecordsForNodes({
    nodes: topLevelNodes,
    parentShapeId: targetPageId,
    childrenByParent,
    layout,
    records,
    tldrawSections,
    tldrawNodes,
    shapeIdsByNodeId,
    now,
  });
  addConnectorRecords({ ir, records, layout, shapeIdsByNodeId, targetPageId, now });
  removeDanglingBindings(records);

  const pages = pagesFromStore(records, targetPageId);
  const snapshot = {
    document: { schema, store: records },
    session: buildSessionState(layout, previousSnapshot.session, targetPageId),
  };
  const semantic_index = buildSemanticIndex({
    ir,
    layout,
    tldrawSections,
    tldrawNodes,
    shapeIdsByNodeId,
    pageId: targetPageId,
    pages,
    now,
  });
  const layout_report = buildLayoutReport({ ir, layout, validation, tldrawSections, tldrawNodes });

  return {
    valid: true,
    errors: [],
    warnings: validation.warnings,
    ir,
    snapshot,
    semantic_index,
    layout_report,
  };
}

function buildChildrenByParent(nodes) {
  const map = new Map();
  for (const node of nodes) {
    if (!node.parent) continue;
    const parent = safeId(node.parent);
    if (!map.has(parent)) map.set(parent, []);
    map.get(parent).push(node);
  }
  return map;
}

function resolveLayout(ir, nodesById, childrenByParent) {
  const layout = new Map();
  const rootNodes = ir.nodes.filter((node) => !node.parent);
  const rootGrid = normalizeGrid(ir.grid);
  const layoutPolicy = normalizeLayoutPolicy(ir.layout_policy);
  const autoState = new Map();

  function resolveNode(node, parent = null) {
    const parentLayout = parent ? layout.get(parent.id) : null;
    const parentGrid = node.parent && parent ? (parent.grid || parentLayout?.grid || rootGrid) : rootGrid;
    const origin = parentLayout ? { x: parentLayout.bounds.x, y: parentLayout.bounds.y } : { x: 0, y: 0 };
    const siblings = parent ? (childrenByParent.get(parent.id) || []) : rootNodes;
    const bounds = node.bounds
      ? boundsToAbsolute(node.bounds, origin)
      : node.area
      ? areaToBounds(node.area, parentGrid, origin)
      : nextAutoBounds(node, parent, parentLayout, parentGrid, autoState, siblings.length, layoutPolicy);
    const grid = node.grid || deriveChildGrid(node, bounds);
    layout.set(node.id, { bounds, grid, parent_id: parent?.id || null });
    const children = childrenByParent.get(node.id) || [];
    for (const child of children) resolveNode(child, node);
  }

  for (const node of rootNodes) resolveNode(node, null);
  for (const node of ir.nodes) {
    if (!layout.has(node.id)) resolveNode(node, node.parent ? nodesById.get(safeId(node.parent)) : null);
  }
  layout.autoRepairs = [];
  growContainersToFitChildren(ir, layout, childrenByParent, layoutPolicy);
  return layout;
}

function boundsToAbsolute(bounds, origin = { x: 0, y: 0 }) {
  return {
    x: Math.round(origin.x + bounds.x),
    y: Math.round(origin.y + bounds.y),
    w: Math.round(bounds.w),
    h: Math.round(bounds.h),
  };
}

function deriveChildGrid(node, bounds) {
  const cols = node.kind === 'pattern' || node.kind === 'section' ? 12 : 4;
  const padding = node.kind === 'slot' ? 28 : 48;
  const gap = node.kind === 'slot' ? 16 : 24;
  const usableWidth = Math.max(160, bounds.w - padding * 2);
  return normalizeGrid({
    cols,
    cellWidth: Math.max(96, Math.floor((usableWidth - gap * (cols - 1)) / cols)),
    rowHeight: node.kind === 'slot' ? 76 : 96,
    gap,
    padding,
  });
}

function nextAutoBounds(node, parent, parentLayout, parentGrid, autoState, siblingCount = 1, layoutPolicy = DEFAULT_LAYOUT_POLICY) {
  const key = parent?.id || '__root__';
  const state = autoState.get(key) || { index: 0 };
  autoState.set(key, state);
  const size = nodeDesiredSize(node);
  const flow = parent
    ? (state.flow || computeAutoFlow(parentLayout.bounds, parentGrid, size, node.kind, siblingCount, layoutPolicy))
    : { cols: 3, cellW: size.w, cellH: size.h, itemW: size.w, itemH: size.h };
  state.flow = flow;
  const cols = Math.max(1, flow.cols);
  const col = state.index % cols;
  const row = Math.floor(state.index / cols);
  state.index += 1;
  const origin = parentLayout ? { x: parentLayout.bounds.x, y: parentLayout.bounds.y } : { x: 0, y: 0 };
  const centerInCell = normalizeLayoutPolicy(layoutPolicy).flow !== 'top_left';
  // Widgets keep their sizing-derived dimensions even when the parent flow
  // was measured from smaller siblings.
  const itemW = node.kind === 'html_component' ? Math.max(flow.itemW, size.w) : flow.itemW;
  const itemH = node.kind === 'html_component' ? Math.max(flow.itemH, size.h) : flow.itemH;
  return {
    x: Math.round(origin.x + parentGrid.padding + col * (flow.cellW + parentGrid.gap) + (centerInCell ? Math.max(0, (flow.cellW - flow.itemW) / 2) : 0)),
    y: Math.round(origin.y + parentGrid.padding + row * (flow.cellH + parentGrid.gap)),
    w: Math.round(itemW),
    h: Math.round(itemH),
  };
}

function computeAutoFlow(parentBounds, parentGrid, desiredSize, kind, siblingCount, layoutPolicy = DEFAULT_LAYOUT_POLICY) {
  const count = Math.max(1, siblingCount);
  const gap = parentGrid.gap;
  const minSize = MIN_NODE_SIZE[kind] || MIN_NODE_SIZE.shape;
  const availableW = Math.max(minSize.w, parentBounds.w - parentGrid.padding * 2);
  const availableH = Math.max(minSize.h, parentBounds.h - parentGrid.padding * 2);

  if (normalizeLayoutPolicy(layoutPolicy).flow === 'top_left') {
    const itemW = Math.max(minSize.w, desiredSize.w);
    const itemH = Math.max(minSize.h, desiredSize.h);
    return {
      cols: Math.max(1, Math.min(count, Math.floor((availableW + gap) / (itemW + gap)) || 1)),
      cellW: itemW,
      cellH: itemH,
      itemW,
      itemH,
    };
  }

  const maxCols = Math.max(1, Math.min(
    count,
    Math.floor((availableW + gap) / (minSize.w + gap))
  ));
  let best = null;

  for (let cols = 1; cols <= maxCols; cols += 1) {
    const rows = Math.ceil(count / cols);
    const cellW = (availableW - gap * (cols - 1)) / cols;
    const cellH = (availableH - gap * (rows - 1)) / rows;
    const fits = cellW >= minSize.w && cellH >= minSize.h;
    const itemW = Math.min(desiredSize.w, cellW);
    const itemH = Math.min(desiredSize.h, cellH);
    const readability = Math.min(itemW / desiredSize.w, itemH / desiredSize.h);
    const density = cols / Math.max(1, rows);
    const score = (fits ? 1000 : 0) + readability * 100 + density;
    if (!best || score > best.score) {
      best = { cols, rows, cellW, cellH, itemW, itemH, score, fits };
    }
  }

  if (!best) {
    best = {
      cols: 1,
      rows: count,
      cellW: availableW,
      cellH: desiredSize.h,
      itemW: Math.min(desiredSize.w, availableW),
      itemH: desiredSize.h,
      score: 0,
      fits: false,
    };
  }

  return {
    cols: best.cols,
    cellW: Math.max(minSize.w, best.cellW),
    cellH: Math.max(minSize.h, best.cellH),
    itemW: Math.max(minSize.w, best.itemW),
    itemH: Math.max(minSize.h, best.itemH),
  };
}

function resolveTargetPageId({ previousSnapshot = {}, store = {}, pageId = null } = {}) {
  if (typeof pageId === 'string' && pageId.startsWith('page:')) return pageId;
  const sessionPageId = previousSnapshot?.session?.currentPageId || null;
  if (typeof sessionPageId === 'string' && store?.[sessionPageId]?.typeName === 'page') return sessionPageId;
  const firstPage = Object.values(store || {}).find((record) => record?.typeName === 'page');
  return firstPage?.id || 'page:page';
}

function makePageRecord(id, name = 'Page 1', index = 'a1') {
  return {
    meta: {},
    id,
    name,
    index,
    typeName: 'page',
  };
}

function recordPageId(record, store = {}) {
  if (!record || typeof record !== 'object') return null;
  if (typeof record.pageId === 'string') return record.pageId;
  if (typeof record.props?.pageId === 'string') return record.props.pageId;

  let parentId = record.parentId;
  const seen = new Set();
  while (typeof parentId === 'string' && parentId && !seen.has(parentId)) {
    if (parentId.startsWith('page:')) return parentId;
    seen.add(parentId);
    const parent = store[parentId];
    if (!parent || typeof parent !== 'object') return null;
    if (parent.typeName === 'page') return parent.id || parentId;
    parentId = parent.parentId;
  }
  return null;
}

function pagesFromStore(store = {}, activePageId = 'page:page') {
  const pages = Object.values(store || {})
    .filter((record) => record?.typeName === 'page' && typeof record.id === 'string')
    .sort((a, b) => String(a.index || '').localeCompare(String(b.index || '')))
    .map((page, index) => ({
      id: page.id,
      name: page.name || page.props?.name || `Page ${index + 1}`,
      is_active: page.id === activePageId,
    }));
  if (pages.length > 0) return pages;
  return [{ id: activePageId, name: 'Page 1', is_active: true }];
}

function buildBaseStoreRecords(previousStore = {}, layoutPolicy = DEFAULT_LAYOUT_POLICY, targetPageId = 'page:page') {
  const policy = normalizeLayoutPolicy(layoutPolicy);
  const records = {};
  for (const [id, record] of Object.entries(previousStore || {})) {
    if (id === 'document:document') continue;
    // IR-managed connector bindings and image assets are rebuilt each compile,
    // so drop the old ones instead of preserving stale copies.
    if (String(id).startsWith('binding:vd-ir-') || String(id).startsWith('asset:vd-ir-')) continue;
    if (record?.typeName === 'page') {
      records[id] = cloneRecord(record);
      continue;
    }

    const pageId = recordPageId(record, previousStore);
    const onTargetPage = pageId === targetPageId;
    if (isIRManagedRecord(id, record)) {
      if (!onTargetPage) records[id] = cloneRecord(record);
      continue;
    }
    if (policy.preserve_user_content || !onTargetPage) {
      records[id] = cloneRecord(record);
    }
  }
  records['document:document'] = cloneRecord(previousStore['document:document']) || {
    gridSize: 10,
    name: '',
    meta: {},
    id: 'document:document',
    typeName: 'document',
  };
  if (!Object.values(records).some((record) => record?.typeName === 'page')) {
    records['page:page'] = cloneRecord(previousStore['page:page']) || makePageRecord('page:page');
  }
  if (!records[targetPageId]) {
    const index = indexKeyAt(Object.values(records).filter((record) => record?.typeName === 'page').length + 1);
    records[targetPageId] = cloneRecord(previousStore[targetPageId]) || makePageRecord(targetPageId, 'Page', index);
  }
  return records;
}

function cloneRecord(record) {
  if (!record || typeof record !== 'object') return null;
  return JSON.parse(JSON.stringify(record));
}

function isIRManagedRecord(id, record) {
  return record?.typeName === 'shape'
    && (record?.meta?.vd_ir_id || String(id || record?.id || '').startsWith('shape:vd-ir-'));
}

function removeDanglingBindings(records) {
  for (const [id, record] of Object.entries(records)) {
    if (!isBindingRecord(record)) continue;
    const refs = bindingReferenceIds(record);
    if (refs.some((shapeId) => shapeId && !records[shapeId])) delete records[id];
  }
}

function isBindingRecord(record) {
  return String(record?.typeName || '').includes('binding');
}

function bindingReferenceIds(record) {
  return [
    record.fromId,
    record.toId,
    record.props?.fromId,
    record.props?.toId,
    record.props?.terminal === 'start' ? record.props?.boundShapeId : null,
    record.props?.terminal === 'end' ? record.props?.boundShapeId : null,
  ].filter((value) => typeof value === 'string' && value.startsWith('shape:'));
}

function growContainersToFitChildren(ir, layout, childrenByParent, layoutPolicy = DEFAULT_LAYOUT_POLICY) {
  const policy = normalizeLayoutPolicy(layoutPolicy);
  if (policy.container_sizing !== 'content_fit' && policy.auto_grow !== true) return;
  const containerNodes = ir.nodes
    .filter((node) => CONTAINER_KINDS.has(node.kind) && node.visible !== false)
    .sort((a, b) => nodeDepth(ir, b.id) - nodeDepth(ir, a.id));
  for (const node of containerNodes) {
    const parentLayout = layout.get(node.id);
    const children = childrenByParent.get(node.id) || [];
    if (!parentLayout || children.length === 0) continue;
    const childBounds = children.map((child) => layout.get(child.id)?.bounds).filter(Boolean);
    if (childBounds.length === 0) continue;
    const grid = node.grid || parentLayout.grid || deriveChildGrid(node, parentLayout.bounds);
    const requiredW = Math.max(
      parentLayout.bounds.w,
      Math.max(...childBounds.map((bounds) => bounds.x + bounds.w)) - parentLayout.bounds.x + grid.padding
    );
    const requiredH = Math.max(
      parentLayout.bounds.h,
      Math.max(...childBounds.map((bounds) => bounds.y + bounds.h)) - parentLayout.bounds.y + grid.padding
    );
    const nextW = Math.ceil(requiredW);
    const nextH = Math.ceil(requiredH);
    if (nextW !== parentLayout.bounds.w || nextH !== parentLayout.bounds.h) {
      const before = { ...parentLayout.bounds };
      parentLayout.bounds = { ...parentLayout.bounds, w: nextW, h: nextH };
      layout.set(node.id, parentLayout);
      layout.autoRepairs.push({
        code: 'GROW_CONTAINER_TO_FIT_CHILDREN',
        node_id: node.id,
        from: before,
        to: parentLayout.bounds,
      });
    }
  }
}

function nodeDepth(ir, nodeId) {
  let depth = 0;
  let current = ir.nodes.find((node) => node.id === safeId(nodeId));
  while (current?.parent) {
    depth += 1;
    current = ir.nodes.find((node) => node.id === safeId(current.parent));
  }
  return depth;
}

function addRecordsForNodes(ctx) {
  const { nodes, parentShapeId, childrenByParent } = ctx;
  nodes.forEach((node, index) => {
    const shapeId = shapeIdFor(node.id);
    const childNodes = childrenByParent.get(node.id) || [];
    const shouldCreateFrame = CONTAINER_KINDS.has(node.kind) && node.visible !== false;
    const absBounds = ctx.layout.get(node.id).bounds;
    const parentBounds = isPageId(parentShapeId)
      ? { x: 0, y: 0 }
      : findParentBounds(parentShapeId, ctx.layout, ctx.shapeIdsByNodeId);
    const localBounds = {
      ...absBounds,
      x: absBounds.x - parentBounds.x,
      y: absBounds.y - parentBounds.y,
    };
    const shape = shouldCreateFrame
      ? createFrameRecord(node, parentShapeId, index, localBounds, ctx.now)
      : createContentRecord(node, parentShapeId, index, localBounds, ctx.now);
    ctx.records[shapeId] = shape;
    if (!shouldCreateFrame && shape.type === 'image') {
      const asset = buildImageAsset(node, shape, ctx.now);
      if (asset) {
        ctx.records[asset.id] = asset;
        shape.props.assetId = asset.id;
      }
    }
    ctx.shapeIdsByNodeId.set(node.id, shapeId);
    if (shouldCreateFrame) ctx.tldrawSections.push({ node, shape, bounds: absBounds });
    else ctx.tldrawNodes.push({ node, shape, bounds: absBounds });
    if (childNodes.length > 0) {
      addRecordsForNodes({
        ...ctx,
        nodes: childNodes,
        parentShapeId: shouldCreateFrame ? shapeId : parentShapeId,
      });
    }
  });
}

function isPageId(id) {
  return typeof id === 'string' && id.startsWith('page:');
}

function findParentBounds(parentShapeId, layout, shapeIdsByNodeId) {
  for (const [irId, shapeId] of shapeIdsByNodeId.entries()) {
    if (shapeId === parentShapeId) return layout.get(irId)?.bounds || { x: 0, y: 0 };
  }
  return { x: 0, y: 0 };
}

function baseShapeRecord(node, parentId, index, bounds, now) {
  return {
    x: bounds.x,
    y: bounds.y,
    rotation: 0,
    isLocked: false,
    opacity: 1,
    meta: {
      vd_ir_id: node.id,
      vd_kind: node.kind,
      vd_role: node.role || '',
      vd_parent_ir_id: node.parent || null,
      vd_created_by: 'agent',
      vd_created_at: now,
      ...(node.meta || {}),
    },
    id: shapeIdFor(node.id),
    parentId,
    index: indexKeyAt(index),
    typeName: 'shape',
  };
}

function createFrameRecord(node, parentId, index, bounds, now) {
  return {
    ...baseShapeRecord(node, parentId, index, bounds, now),
    type: 'frame',
    props: {
      w: bounds.w,
      h: bounds.h,
      name: node.title || node.id,
      color: frameColor(node),
    },
  };
}

// Each content kind maps to its native tldraw tool (see SKILL.md「画板节点语义」).
// text = prose (no box), sticky = real note, shape = meaning-typed geo diagram
// node, image = real image + asset. Widgets / completion / other kinds keep the
// transparent-or-solid geo anchor. Do NOT draw a shape as a text box for words.
function createContentRecord(node, parentId, index, bounds, now) {
  switch (node.kind) {
    case 'text':
      return createTextRecord(node, parentId, index, bounds, now);
    case 'sticky':
    case 'sticky_note':
      return createNoteRecord(node, parentId, index, bounds, now);
    case 'shape':
      return createGeoRecord(node, parentId, index, bounds, now);
    case 'image':
      return createImageRecord(node, parentId, index, bounds, now);
    default:
      return createGeoAnchorRecord(node, parentId, index, bounds, now);
  }
}

function contentText(node) {
  const title = node.title || compactText(node.content || node.id, 48);
  const body = node.content || node.title || '';
  return body && body !== title ? `${title}\n\n${body}` : title;
}

// text tool: prose on the canvas — no border, no fill.
function createTextRecord(node, parentId, index, bounds, now) {
  const width = Math.max(120, Math.round(bounds.w || DEFAULT_NODE_SIZE.text.w));
  return {
    ...baseShapeRecord(node, parentId, index, bounds, now),
    type: 'text',
    props: {
      color: node.color || 'black',
      size: bounds.h < 88 || width < 200 ? 's' : 'm',
      font: 'draw',
      textAlign: 'start',
      w: width,
      richText: makeRichText(node.content || node.title || ''),
      scale: 1,
      autoSize: false,
    },
  };
}

// note tool: a real sticky note — one participant-style idea per note.
function createNoteRecord(node, parentId, index, bounds, now) {
  const scale = Math.max(0.75, Math.min(1.25, Math.round(bounds.w || 200) / 200));
  return {
    ...baseShapeRecord(node, parentId, index, bounds, now),
    type: 'note',
    props: {
      color: node.color || 'yellow',
      labelColor: 'black',
      size: 'm',
      font: 'draw',
      fontSizeAdjustment: null,
      align: 'middle',
      verticalAlign: 'middle',
      growY: 0,
      url: '',
      richText: makeRichText(node.content || node.title || ''),
      scale,
      textFirstEditedBy: null,
    },
  };
}

// geo tool: a diagram node whose shape carries meaning (rectangle = process,
// diamond = decision, ellipse = start/end/state, cloud = fuzzy).
function createGeoRecord(node, parentId, index, bounds, now) {
  const color = node.color || colorForNode(node);
  return {
    ...baseShapeRecord(node, parentId, index, bounds, now),
    type: 'geo',
    props: {
      w: bounds.w,
      h: bounds.h,
      geo: geoSubtypeForShapeNode(node),
      dash: 'draw',
      growY: 0,
      url: '',
      scale: 1,
      color: color === 'black' ? 'blue' : color,
      labelColor: 'black',
      fill: 'solid',
      size: bounds.w < 150 || bounds.h < 88 ? 's' : 'm',
      font: 'draw',
      align: 'middle',
      verticalAlign: 'middle',
      richText: makeRichText(contentText(node)),
    },
  };
}

// image tool: agent artifact output or reference material — a real image shape
// backed by an asset. Without a resolvable source, fall back to a labeled
// placeholder so the snapshot stays valid.
function createImageRecord(node, parentId, index, bounds, now) {
  if (!imageSrc(node)) {
    return createGeoAnchorRecord(node, parentId, index, bounds, now);
  }
  return {
    ...baseShapeRecord(node, parentId, index, bounds, now),
    type: 'image',
    props: {
      w: Math.max(1, bounds.w),
      h: Math.max(1, bounds.h),
      playing: true,
      url: '',
      assetId: null, // attached in addRecordsForNodes once the asset exists
      crop: null,
      flipX: false,
      flipY: false,
      altText: node.alt_text || node.title || '',
    },
  };
}

// Fallback geo anchor: widget anchors stay transparent (the iframe overlay
// renders real content), completion requests use a cloud, everything else is a
// solid rectangle.
function createGeoAnchorRecord(node, parentId, index, bounds, now) {
  const color = node.color || colorForNode(node);
  const title = node.title || compactText(node.content || node.id, 48);
  const isWidget = node.kind === 'html_component';
  const text = isWidget ? title : contentText(node);
  return {
    ...baseShapeRecord(node, parentId, index, bounds, now),
    type: 'geo',
    props: {
      w: bounds.w,
      h: bounds.h,
      geo: node.kind === 'completion_request' ? 'cloud' : 'rectangle',
      dash: isWidget ? 'dotted' : 'draw',
      growY: 0,
      url: '',
      scale: 1,
      color: isWidget ? 'violet' : color,
      labelColor: 'black',
      fill: isWidget ? 'none' : 'solid',
      size: bounds.w < 150 || bounds.h < 88 ? 's' : 'm',
      font: 'draw',
      align: 'middle',
      verticalAlign: 'middle',
      richText: makeRichText(text),
    },
  };
}

function imageSrc(node) {
  const candidate = node.src || node.meta?.vd_src || node.meta?.src || '';
  return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : null;
}

function guessImageMime(src) {
  const value = String(src || '');
  const dataMatch = value.match(/^data:([^;,]+)[;,]/i);
  if (dataMatch) return dataMatch[1];
  const ext = (value.split('?')[0].match(/\.([a-z0-9]+)$/i) || [])[1];
  const map = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml' };
  return map[String(ext || '').toLowerCase()] || 'image/png';
}

function buildImageAsset(node, shape, now) {
  const src = imageSrc(node);
  if (!src) return null;
  return {
    id: assetIdFor(node.id),
    typeName: 'asset',
    type: 'image',
    props: {
      name: node.title || node.alt_text || 'image',
      src,
      w: Math.max(1, shape.props.w),
      h: Math.max(1, shape.props.h),
      mimeType: guessImageMime(src),
      isAnimated: false,
    },
    meta: {
      vd_ir_id: node.id,
      vd_kind: 'image',
      vd_created_at: now,
    },
  };
}

function connectorColor(rel) {
  const type = String(rel.type || '').toLowerCase();
  if (/risk|conflict|block|tension|冲突|风险|阻/.test(type)) return 'red';
  if (/evidence|support|证据|支持/.test(type)) return 'green';
  return 'grey';
}

function connectorArrowheads(rel) {
  const type = String(rel.type || '').toLowerCase();
  if (/relate|related|association|associate|compare|comparison|link|对比|关联|相关/.test(type)) {
    return { start: 'none', end: 'none' };
  }
  return { start: 'none', end: 'arrow' };
}

// Compile IR relationships into real tldraw arrow shapes bound to their from/to
// node shapes, so connectors are visible on the canvas and follow the nodes
// they link. Endpoints fall back to node centers if a binding is dropped.
function addConnectorRecords({ ir, records, layout, shapeIdsByNodeId, targetPageId, now }) {
  const relationships = Array.isArray(ir.relationships) ? ir.relationships : [];
  relationships.forEach((rel, index) => {
    const fromId = safeId(rel.from);
    const toId = safeId(rel.to);
    const fromShapeId = shapeIdsByNodeId.get(fromId);
    const toShapeId = shapeIdsByNodeId.get(toId);
    if (!fromShapeId || !toShapeId || fromShapeId === toShapeId) return;
    const fromBounds = layout.get(fromId)?.bounds;
    const toBounds = layout.get(toId)?.bounds;
    if (!fromBounds || !toBounds) return;

    const fromCenter = { x: fromBounds.x + fromBounds.w / 2, y: fromBounds.y + fromBounds.h / 2 };
    const toCenter = { x: toBounds.x + toBounds.w / 2, y: toBounds.y + toBounds.h / 2 };
    let dx = Math.round(toCenter.x - fromCenter.x);
    let dy = Math.round(toCenter.y - fromCenter.y);
    if (dx === 0 && dy === 0) dx = 1; // avoid a degenerate zero-length arrow

    const arrowId = connectorShapeId(rel.id);
    const heads = connectorArrowheads(rel);
    records[arrowId] = {
      x: Math.round(fromCenter.x),
      y: Math.round(fromCenter.y),
      rotation: 0,
      isLocked: false,
      opacity: 1,
      meta: {
        vd_ir_id: rel.id,
        vd_kind: 'connector',
        vd_rel_type: rel.type || 'related_to',
        vd_from_ir_id: fromId,
        vd_to_ir_id: toId,
        vd_created_by: 'agent',
        vd_created_at: now,
      },
      id: arrowId,
      parentId: targetPageId,
      index: indexKeyAt(900 + index),
      typeName: 'shape',
      type: 'arrow',
      props: {
        kind: 'arc',
        labelColor: 'black',
        color: connectorColor(rel),
        fill: 'none',
        dash: 'draw',
        size: 'm',
        arrowheadStart: heads.start,
        arrowheadEnd: heads.end,
        font: 'draw',
        start: { x: 0, y: 0 },
        end: { x: dx, y: dy },
        bend: 0,
        richText: makeRichText(rel.label || ''),
        labelPosition: 0.5,
        scale: 1,
        elbowMidPoint: 0.5,
      },
    };

    const startId = connectorBindingId(rel.id, 'start');
    const endId = connectorBindingId(rel.id, 'end');
    records[startId] = arrowBindingRecord(startId, arrowId, fromShapeId, 'start');
    records[endId] = arrowBindingRecord(endId, arrowId, toShapeId, 'end');
  });
}

function arrowBindingRecord(id, arrowShapeId, targetShapeId, terminal) {
  return {
    id,
    typeName: 'binding',
    type: 'arrow',
    fromId: arrowShapeId,
    toId: targetShapeId,
    meta: {},
    props: {
      terminal,
      normalizedAnchor: { x: 0.5, y: 0.5 },
      isExact: false,
      isPrecise: false,
      snap: 'none',
    },
  };
}

function frameColor(node) {
  if (node.color) return node.color;
  if (String(node.role || '').includes('business_model_canvas')) return 'violet';
  if (node.kind === 'slot') return 'blue';
  if (node.kind === 'cluster') return 'green';
  return 'violet';
}

function colorForNode(node) {
  const role = String(node.role || '');
  for (const [key, color] of Object.entries(COLOR_BY_ROLE)) {
    if (role.includes(key)) return color;
  }
  if (node.kind === 'sticky' || node.kind === 'sticky_note') return 'yellow';
  if (node.kind === 'text') return 'black';
  return 'light-blue';
}

function buildSessionState(layout, previousSession = {}, pageId = 'page:page') {
  const allBounds = Array.from(layout.values()).map((item) => item.bounds);
  const minX = allBounds.length ? Math.min(...allBounds.map((bounds) => bounds.x)) : 0;
  const minY = allBounds.length ? Math.min(...allBounds.map((bounds) => bounds.y)) : 0;
  const previous = previousSession && typeof previousSession === 'object' ? cloneRecord(previousSession) : {};
  const previousPageStates = Array.isArray(previous.pageStates) ? previous.pageStates : [];
  const existingPageState = previousPageStates.find((state) => state?.pageId === pageId) || {};
  const currentPageState = {
    ...existingPageState,
    pageId,
    camera: { x: Math.round(80 - minX * 0.1), y: Math.round(60 - minY * 0.1), z: 0.42 },
    selectedShapeIds: [],
    focusedGroupId: null,
  };
  const pageStates = [
    ...previousPageStates.filter((state) => state?.pageId && state.pageId !== pageId),
    currentPageState,
  ];
  return {
    ...previous,
    version: 0,
    currentPageId: pageId,
    exportBackground: previous.exportBackground ?? true,
    isFocusMode: previous.isFocusMode ?? false,
    isDebugMode: previous.isDebugMode ?? false,
    isToolLocked: previous.isToolLocked ?? false,
    isGridMode: previous.isGridMode ?? false,
    pageStates,
  };
}

function buildSemanticIndex({ ir, layout, tldrawSections, tldrawNodes, shapeIdsByNodeId, pageId = 'page:page', pages = null, now }) {
  const sections = tldrawSections.map(({ node, shape, bounds }) => ({
    shape_id: shape.id,
    page_id: pageId,
    ir_id: node.id,
    kind: node.kind === 'slot' ? 'canvas_slot' : 'canvas_section',
    type: 'frame',
    title: node.title,
    text: node.title,
    role: node.role || '',
    parent_id: node.parent ? shapeIdsByNodeId.get(safeId(node.parent)) : pageId,
    parent_ir_id: node.parent || null,
    section_id: shape.id,
    section_title: node.title,
    child_shape_ids: ir.nodes.filter((child) => child.parent === node.id).map((child) => shapeIdsByNodeId.get(child.id)).filter(Boolean),
    child_ir_ids: ir.nodes.filter((child) => child.parent === node.id).map((child) => child.id),
    child_count: ir.nodes.filter((child) => child.parent === node.id).length,
    bounds,
    x: bounds.x,
    y: bounds.y,
    w: bounds.w,
    h: bounds.h,
    authorship: { created_by: 'agent', last_edited_by: 'agent', created_at: now, updated_at: now },
    meta: shape.meta,
  }));
  const zones = sections
    .filter((section) => String(section.role || '').startsWith('stage.') || section.meta?.vd_stage_key)
    .map((section) => ({
      id: section.meta?.vd_stage_key ? `zone-stage-${section.meta.vd_stage_key}` : `zone-${safeId(section.ir_id)}`,
      kind: 'design_stage',
      stage: section.meta?.vd_stage_key || normalizeDesignStageKey(section.role),
      role: section.role,
      title: section.title,
      page_id: pageId,
      section_id: section.shape_id,
      ir_id: section.ir_id,
      bounds: section.bounds,
      content_origin: section.meta?.vd_stage_content_origin || PROJECT_STAGE_LAYOUT.contentOrigin,
      flow: 'left_to_right_then_wrap',
      accepts: ['CanvasIR Template', 'Widget', 'sticky_note', 'shape', 'text', 'image'],
    }));
  const nodes = tldrawNodes.map(({ node, shape, bounds }) => ({
    shape_id: shape.id,
    page_id: pageId,
    ir_id: node.id,
    kind: node.kind === 'sticky' ? 'sticky_note' : node.kind,
    type: shape.type,
    title: node.title,
    text: node.content || node.title,
    role: node.role || '',
    parent_id: node.parent ? shapeIdsByNodeId.get(safeId(node.parent)) : pageId,
    parent_ir_id: node.parent || null,
    section_id: node.parent ? nearestSectionShapeId(node.parent, ir, shapeIdsByNodeId) : null,
    section_title: node.parent ? nearestSectionTitle(node.parent, ir) : null,
    child_shape_ids: [],
    child_count: 0,
    bounds,
    x: bounds.x,
    y: bounds.y,
    w: bounds.w,
    h: bounds.h,
    asset_id: shape.props?.assetId || null,
    alt_text: shape.props?.altText || node.alt_text || '',
    authorship: { created_by: 'agent', last_edited_by: 'agent', created_at: now, updated_at: now },
    meta: shape.meta,
  }));
  const containment = ir.nodes
    .filter((node) => node.parent)
    .map((node) => ({
      id: `contains-${safeId(node.parent)}-${safeId(node.id)}`,
      kind: 'contains',
      relationship_type: 'contains',
      from_ir_id: safeId(node.parent),
      to_ir_id: node.id,
      from_shape_id: shapeIdsByNodeId.get(safeId(node.parent)),
      to_shape_id: shapeIdsByNodeId.get(node.id),
      label: 'contains',
      created_at: now,
    }));
  const relationships = [
    ...containment,
    ...ir.relationships.map((rel) => ({
      id: rel.id,
      kind: 'semantic_link',
      relationship_type: rel.type,
      from_ir_id: rel.from,
      to_ir_id: rel.to,
      from_shape_id: shapeIdsByNodeId.get(rel.from),
      to_shape_id: shapeIdsByNodeId.get(rel.to),
      label: rel.label || rel.type,
      meta: rel.meta,
      created_at: now,
    })),
  ];

  return {
    version: 2,
    active_page_id: pageId,
    pages: Array.isArray(pages) && pages.length > 0
      ? pages
      : [{ id: pageId, name: ir.board.title || 'Page 1', is_active: true }],
    zones,
    sections,
    nodes,
    assets: [],
    annotations: [],
    region_annotations: [],
    completion_requests: [],
    scaffold_instances: [{
      id: `canvas_ir_${safeId(ir.board.title || 'board')}`,
      type: 'canvas_ir',
      title: ir.board.title,
      page_id: pageId,
      section_ids: sections.map((section) => section.shape_id),
      ir_node_ids: ir.nodes.map((node) => node.id),
      created_by: 'agent',
      created_at: now,
      next_actions: [],
    }],
    widget_instances: nodes.filter((node) => node.kind === 'html_component').map((node) => ({
      id: node.ir_id,
      kind: 'html_component',
      shape_id: node.shape_id,
      page_id: pageId,
      title: node.title,
      section_id: node.section_id,
      template_id: node.meta?.vd_widget_template || null,
      version: node.meta?.vd_widget_version || 1,
      state: node.meta?.vd_widget_state || {},
      state_version: node.meta?.vd_state_version || 0,
      state_actor: node.meta?.vd_state_actor || 'agent',
      input_schema: node.meta?.vd_input_schema || {},
      output_schema: node.meta?.vd_output_schema || {},
      sizing: node.meta?.vd_sizing || null,
      review: node.meta?.vd_widget_review || null,
      bounds: node.bounds,
    })),
    artifact_links: [],
    layout_reviews: [{
      id: `layout_review_${Date.now()}`,
      type: 'canvas_ir_layout_review',
      status: 'passed',
      checks: {
        overlap_count: 0,
        out_of_section_count: 0,
        unreadable_count: 0,
        section_contains_children: true,
        min_readable_size_ok: true,
      },
      repairs: [],
      reviewed_at: now,
    }],
    relationships,
    canvas_ir: ir,
    ir_node_index: ir.nodes.map((node) => ({
      id: node.id,
      kind: node.kind,
      title: node.title,
      role: node.role,
      parent: node.parent,
      children: ir.nodes.filter((child) => child.parent === node.id).map((child) => child.id),
      shape_id: shapeIdsByNodeId.get(node.id),
      bounds: layout.get(node.id)?.bounds || null,
    })),
    edit_summary: null,
    updated_at: now,
  };
}

function nearestSectionShapeId(parentId, ir, shapeIdsByNodeId) {
  let current = ir.nodes.find((node) => node.id === safeId(parentId));
  while (current) {
    if (CONTAINER_KINDS.has(current.kind) && current.visible !== false) return shapeIdsByNodeId.get(current.id);
    current = current.parent ? ir.nodes.find((node) => node.id === safeId(current.parent)) : null;
  }
  return null;
}

function nearestSectionTitle(parentId, ir) {
  let current = ir.nodes.find((node) => node.id === safeId(parentId));
  while (current) {
    if (CONTAINER_KINDS.has(current.kind) && current.visible !== false) return current.title;
    current = current.parent ? ir.nodes.find((node) => node.id === safeId(current.parent)) : null;
  }
  return null;
}

function buildLayoutReport({ ir, layout, validation, tldrawSections, tldrawNodes }) {
  const bounds = Array.from(layout.values()).map((item) => item.bounds);
  const warnings = [...validation.warnings];
  const childOverflows = [];
  const siblingOverlaps = [];
  for (const node of ir.nodes) {
    if (!node.parent) continue;
    const childLayout = layout.get(node.id);
    const parentLayout = layout.get(safeId(node.parent));
    if (!childLayout || !parentLayout) continue;
    if (!boundsContain(parentLayout.bounds, childLayout.bounds)) {
      childOverflows.push({
        code: 'CHILD_OUT_OF_SECTION',
        node_id: node.id,
        parent: safeId(node.parent),
        bounds: childLayout.bounds,
        parent_bounds: parentLayout.bounds,
      });
    }
  }
  const byParent = groupBy(ir.nodes, (node) => node.parent || '__root__');
  for (const [parent, siblings] of byParent.entries()) {
    for (let i = 0; i < siblings.length; i += 1) {
      for (let j = i + 1; j < siblings.length; j += 1) {
        const a = layout.get(siblings[i].id)?.bounds;
        const b = layout.get(siblings[j].id)?.bounds;
        if (a && b && boundsOverlap(a, b)) {
          siblingOverlaps.push({
            code: 'SIBLING_BOUNDS_OVERLAP',
            parent: parent === '__root__' ? null : parent,
            a: siblings[i].id,
            b: siblings[j].id,
            a_bounds: a,
            b_bounds: b,
          });
        }
      }
    }
  }
  const unreadableNodes = tldrawNodes
    .filter(({ bounds: nodeBounds }) => nodeBounds.w < 96 || nodeBounds.h < 56)
    .map(({ node, bounds: nodeBounds }) => ({
      code: 'NODE_BELOW_READABLE_SIZE',
      node_id: node.id,
      bounds: nodeBounds,
    }));
  warnings.push(...childOverflows, ...siblingOverlaps, ...unreadableNodes);
  return {
    strategy: 'canvas_ir_grid',
    layout_policy: ir.layout_policy,
    board_title: ir.board.title,
    counts: {
      sections: tldrawSections.length,
      nodes: tldrawNodes.length,
      relationships: ir.relationships.length,
      child_overflows: childOverflows.length,
      sibling_overlaps: siblingOverlaps.length,
      unreadable_nodes: unreadableNodes.length,
    },
    extents: bounds.length ? {
      x: Math.min(...bounds.map((item) => item.x)),
      y: Math.min(...bounds.map((item) => item.y)),
      w: Math.max(...bounds.map((item) => item.x + item.w)) - Math.min(...bounds.map((item) => item.x)),
      h: Math.max(...bounds.map((item) => item.y + item.h)) - Math.min(...bounds.map((item) => item.y)),
    } : null,
    warnings,
    auto_repairs: Array.isArray(layout.autoRepairs) ? layout.autoRepairs : [],
  };
}

function boundsOverlap(a, b, tolerance = 2) {
  return a.x < b.x + b.w - tolerance
    && a.x + a.w > b.x + tolerance
    && a.y < b.y + b.h - tolerance
    && a.y + a.h > b.y + tolerance;
}

function boundsContain(parent, child, tolerance = 2) {
  return child.x >= parent.x - tolerance
    && child.y >= parent.y - tolerance
    && child.x + child.w <= parent.x + parent.w + tolerance
    && child.y + child.h <= parent.y + parent.h + tolerance;
}

const BUSINESS_MODEL_CANVAS_TEMPLATE = {
  id: 'business_model_canvas',
  title: '商业模式画布',
  description: '九宫格式商业模式画布，用于评估价值、客户、供给能力和财务逻辑。',
  kind: 'template',
  default_ir: {
    version: 1,
    board: {
      title: '商业模式画布',
      purpose: '评估产品或服务的商业可行性。',
      reading_order: 'left_to_right',
    },
    grid: { cols: 12, cellWidth: 138, rowHeight: 112, gap: 18, padding: 0 },
    nodes: [
      {
        id: 'business_model_canvas',
        kind: 'section',
        title: '商业模式画布',
        role: 'pattern.business_model_canvas',
        area: { col: 1, row: 1, colSpan: 12, rowSpan: 7 },
        grid: { cols: 10, cellWidth: 142, rowHeight: 100, gap: 16, padding: 42 },
      },
      ...[
        ['key_partners', '关键伙伴', 'bmc.key_partners', 1, 1, 2, 3],
        ['key_activities', '关键活动', 'bmc.key_activities', 3, 1, 2, 2],
        ['value_propositions', '价值主张', 'bmc.value_propositions', 5, 1, 2, 4],
        ['customer_relationships', '客户关系', 'bmc.customer_relationships', 7, 1, 2, 2],
        ['customer_segments', '客户细分', 'bmc.customer_segments', 9, 1, 2, 3],
        ['key_resources', '关键资源', 'bmc.key_resources', 3, 3, 2, 2],
        ['channels', '渠道', 'bmc.channels', 7, 3, 2, 2],
        ['cost_structure', '成本结构', 'bmc.cost_structure', 1, 5, 5, 2],
        ['revenue_streams', '收入来源', 'bmc.revenue_streams', 6, 5, 5, 2],
      ].map(([id, title, role, col, row, colSpan, rowSpan]) => ({
        id,
        kind: 'slot',
        title,
        role,
        parent: 'business_model_canvas',
        visible: true,
        area: { col, row, colSpan, rowSpan },
      })),
    ],
    relationships: [
      { from: 'value_propositions', to: 'customer_segments', type: 'fit', label: '价值匹配' },
      { from: 'channels', to: 'customer_segments', type: 'reach', label: '触达' },
      { from: 'key_resources', to: 'cost_structure', type: 'drives_cost', label: '成本来源' },
      { from: 'value_propositions', to: 'revenue_streams', type: 'monetizes', label: '变现' },
    ],
  },
};

function listCanvasTemplates() {
  return [BUSINESS_MODEL_CANVAS_TEMPLATE].map(({ default_ir, ...template }) => ({
    ...template,
    node_count: default_ir.nodes.length,
    relationship_count: default_ir.relationships.length,
  }));
}

function getCanvasTemplate(id) {
  if (id === BUSINESS_MODEL_CANVAS_TEMPLATE.id) return BUSINESS_MODEL_CANVAS_TEMPLATE;
  return null;
}

function boundedScale(value, fallback = 1) {
  const scale = positiveNumber(value, fallback);
  return Math.min(4, Math.max(0.2, scale));
}

function scaleGrid(grid, scale) {
  const normalized = normalizeGrid(grid);
  return normalizeGrid({
    ...normalized,
    cellWidth: normalized.cellWidth * scale,
    rowHeight: normalized.rowHeight * scale,
    gap: normalized.gap * scale,
    padding: normalized.padding * scale,
  });
}

function scaleBounds(bounds, scale) {
  const normalized = normalizeBounds(bounds);
  if (!normalized) return null;
  return {
    x: Math.round(normalized.x * scale),
    y: Math.round(normalized.y * scale),
    w: Math.round(normalized.w * scale),
    h: Math.round(normalized.h * scale),
  };
}

function normalizePoint(input, fallback = null) {
  if (!input || typeof input !== 'object') return fallback;
  const x = Number(input.x);
  const y = Number(input.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return fallback;
  return { x: Math.round(x), y: Math.round(y) };
}

function commandAnchor(options = {}) {
  return normalizePoint(options.anchor)
    || normalizePoint(options.position)
    || (Number.isFinite(Number(options.x)) && Number.isFinite(Number(options.y))
      ? { x: Math.round(Number(options.x)), y: Math.round(Number(options.y)) }
      : null);
}

function applyTemplateTransform(ir, options = {}) {
  const scale = boundedScale(options.scale, 1);
  const anchor = commandAnchor(options);
  const next = {
    ...ir,
    metadata: {
      ...ir.metadata,
      template_scale: scale,
      template_anchor: anchor,
    },
  };
  if (scale !== 1 || anchor) return materializeScaledTree(next, { scale, anchor });
  return normalizeCanvasIR(next);
}

function moveRootNodesToAnchor(ir, anchor) {
  const roots = ir.nodes.filter((node) => !node.parent);
  if (roots.length === 0) return ir;
  const layout = resolveLayout(
    { ...ir, layout_policy: { ...normalizeLayoutPolicy(ir.layout_policy), wrap_new_generation: false } },
    new Map(ir.nodes.map((node) => [node.id, node])),
    buildChildrenByParent(ir.nodes)
  );
  const rootBounds = roots.map((node) => layout.get(node.id)?.bounds).filter(Boolean);
  if (rootBounds.length === 0) return ir;
  const minX = Math.min(...rootBounds.map((bounds) => bounds.x));
  const minY = Math.min(...rootBounds.map((bounds) => bounds.y));
  const rootIds = new Set(roots.map((node) => node.id));
  return {
    ...ir,
    nodes: ir.nodes.map((node) => {
      if (!rootIds.has(node.id)) return node;
      const bounds = layout.get(node.id)?.bounds;
      if (!bounds) return node;
      return {
        ...node,
        area: null,
        bounds: {
          x: anchor.x + (bounds.x - minX),
          y: anchor.y + (bounds.y - minY),
          w: bounds.w,
          h: bounds.h,
        },
      };
    }),
  };
}

function materializeScaledTree(ir, { scale = 1, anchor = null } = {}) {
  const layoutIR = {
    ...ir,
    layout_policy: { ...normalizeLayoutPolicy(ir.layout_policy), wrap_new_generation: false },
  };
  const layout = resolveLayout(
    layoutIR,
    new Map(ir.nodes.map((node) => [node.id, node])),
    buildChildrenByParent(ir.nodes)
  );
  const roots = ir.nodes.filter((node) => !node.parent);
  const rootBounds = roots.map((node) => layout.get(node.id)?.bounds).filter(Boolean);
  if (rootBounds.length === 0) return normalizeCanvasIR(ir);
  const minX = Math.min(...rootBounds.map((bounds) => bounds.x));
  const minY = Math.min(...rootBounds.map((bounds) => bounds.y));
  const target = anchor || { x: minX, y: minY };
  const nodes = ir.nodes.map((node) => {
    const bounds = layout.get(node.id)?.bounds;
    if (!bounds) return node;
    const parentBounds = node.parent ? layout.get(safeId(node.parent))?.bounds : null;
    const shouldScaleSize = CONTAINER_KINDS.has(node.kind);
    const localScale = shouldScaleSize ? scale : 1;
    const x = parentBounds
      ? (bounds.x - parentBounds.x) * localScale
      : target.x + (bounds.x - minX) * scale;
    const y = parentBounds
      ? (bounds.y - parentBounds.y) * localScale
      : target.y + (bounds.y - minY) * scale;
    return {
      ...node,
      area: null,
      bounds: {
        x: Math.round(x),
        y: Math.round(y),
        w: Math.round(shouldScaleSize ? bounds.w * scale : bounds.w),
        h: Math.round(shouldScaleSize ? bounds.h * scale : bounds.h),
      },
      meta: {
        ...(node.meta || {}),
        vd_template_scaled: scale !== 1 ? true : undefined,
        vd_template_scale: scale,
        vd_template_size_policy: shouldScaleSize ? 'scale_frame' : 'preserve_content_offset_and_size',
      },
    };
  });
  return normalizeCanvasIR({
    ...ir,
    grid: scale !== 1 ? scaleGrid(ir.grid, scale) : ir.grid,
    nodes,
    metadata: {
      ...ir.metadata,
      template_scale: scale,
      template_anchor: anchor,
      template_geometry: 'materialized_frame_scaled_content_size_preserved',
    },
  });
}

function canvasIRExtents(ir) {
  if (!ir.nodes.length) return null;
  const layout = resolveLayout(
    { ...ir, layout_policy: { ...normalizeLayoutPolicy(ir.layout_policy), wrap_new_generation: false } },
    new Map(ir.nodes.map((node) => [node.id, node])),
    buildChildrenByParent(ir.nodes)
  );
  const bounds = Array.from(layout.values()).map((item) => item.bounds).filter(Boolean);
  if (bounds.length === 0) return null;
  const minX = Math.min(...bounds.map((item) => item.x));
  const minY = Math.min(...bounds.map((item) => item.y));
  const maxX = Math.max(...bounds.map((item) => item.x + item.w));
  const maxY = Math.max(...bounds.map((item) => item.y + item.h));
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function placeTemplateFragment(fragment, currentIR, command = {}) {
  const explicitAnchor = commandAnchor(command);
  if (explicitAnchor) return moveRootNodesToAnchor(fragment, explicitAnchor);
  const currentExtents = canvasIRExtents(currentIR);
  if (!currentExtents) return fragment;
  const anchor = {
    x: currentExtents.x,
    y: currentExtents.y + currentExtents.h + normalizeGrid(currentIR.grid).rowHeight,
  };
  return moveRootNodesToAnchor(fragment, anchor);
}

function findStageParentId(ir, command = {}) {
  const explicitParent = command.parent ? safeId(command.parent) : null;
  if (explicitParent && ir.nodes.some((node) => node.id === explicitParent)) return explicitParent;
  const stage = designStageFromCommand(command);
  if (!stage) return null;
  const byId = ir.nodes.find((node) => node.id === stage.id);
  if (byId) return byId.id;
  const byRole = ir.nodes.find((node) => node.role === stage.role || node.meta?.vd_stage_key === stage.key);
  return byRole?.id || null;
}

function stageContentOriginFor(parentNode) {
  const origin = parentNode?.meta?.vd_stage_content_origin;
  return {
    x: nonNegativeNumber(origin?.x, PROJECT_STAGE_LAYOUT.contentOrigin.x),
    y: nonNegativeNumber(origin?.y, PROJECT_STAGE_LAYOUT.contentOrigin.y),
  };
}

function nextChildOriginInContainer(ir, parentId, desiredSize = { w: 360, h: 240 }) {
  const parent = ir.nodes.find((node) => node.id === safeId(parentId));
  const origin = stageContentOriginFor(parent);
  const gap = nonNegativeNumber(parent?.meta?.vd_stage_flow_gap, PROJECT_STAGE_LAYOUT.contentGap);
  const rightPadding = nonNegativeNumber(parent?.meta?.vd_stage_right_padding, PROJECT_STAGE_LAYOUT.rightPadding);
  const stageWidth = positiveNumber(parent?.bounds?.w, PROJECT_STAGE_LAYOUT.width);
  const flowChildren = ir.nodes
    .filter((node) => safeId(node.parent) === safeId(parentId) && !node.meta?.vd_stage_reserved && !node.meta?.vd_stage_is_guide)
    .map((node) => normalizeBounds(node.bounds))
    .filter(Boolean);

  if (flowChildren.length === 0) return origin;

  const maxRight = Math.max(...flowChildren.map((bounds) => bounds.x + bounds.w));
  const maxBottom = Math.max(...flowChildren.map((bounds) => bounds.y + bounds.h));
  const minTop = Math.min(...flowChildren.map((bounds) => bounds.y));
  const desiredW = positiveNumber(desiredSize.w, DEFAULT_NODE_SIZE.shape.w);
  let x = maxRight + gap;
  let y = minTop;
  if (x + desiredW > stageWidth - rightPadding) {
    x = origin.x;
    y = maxBottom + gap;
  }
  return { x: Math.round(x), y: Math.round(y) };
}

function reparentFragmentRoots(fragment, currentIR, parentId, command = {}) {
  const parent = currentIR.nodes.find((node) => node.id === safeId(parentId));
  if (!parent) return fragment;
  const layoutIR = {
    ...fragment,
    layout_policy: { ...normalizeLayoutPolicy(fragment.layout_policy), wrap_new_generation: false },
  };
  const layout = resolveLayout(
    layoutIR,
    new Map(fragment.nodes.map((node) => [node.id, node])),
    buildChildrenByParent(fragment.nodes)
  );
  const roots = fragment.nodes.filter((node) => !node.parent);
  const rootBounds = roots.map((node) => layout.get(node.id)?.bounds).filter(Boolean);
  if (rootBounds.length === 0) return fragment;
  const minX = Math.min(...rootBounds.map((bounds) => bounds.x));
  const minY = Math.min(...rootBounds.map((bounds) => bounds.y));
  const maxX = Math.max(...rootBounds.map((bounds) => bounds.x + bounds.w));
  const maxY = Math.max(...rootBounds.map((bounds) => bounds.y + bounds.h));
  const explicitAnchor = commandAnchor(command);
  const origin = explicitAnchor || nextChildOriginInContainer(currentIR, parent.id, {
    w: maxX - minX,
    h: maxY - minY,
  });
  const rootIds = new Set(roots.map((node) => node.id));
  const stageKey = parent.meta?.vd_stage_key || normalizeDesignStageKey(parent.role);
  return {
    ...fragment,
    nodes: fragment.nodes.map((node) => {
      const bounds = layout.get(node.id)?.bounds;
      if (!rootIds.has(node.id) || !bounds) {
        return {
          ...node,
          meta: {
            ...(node.meta || {}),
            vd_stage: stageKey || node.meta?.vd_stage,
            vd_stage_parent_ir_id: parent.id,
          },
        };
      }
      return {
        ...node,
        parent: parent.id,
        area: null,
        bounds: {
          x: Math.round(origin.x + (bounds.x - minX)),
          y: Math.round(origin.y + (bounds.y - minY)),
          w: bounds.w,
          h: bounds.h,
        },
        meta: {
          ...(node.meta || {}),
          vd_stage: stageKey || node.meta?.vd_stage,
          vd_stage_parent_ir_id: parent.id,
          vd_stage_flow_item: true,
        },
      };
    }),
    metadata: {
      ...fragment.metadata,
      stage_parent: parent.id,
      stage_key: stageKey || null,
    },
  };
}

function boundsForStageCommand(ir, parentId, kind, command = {}) {
  if (command.bounds || command.area) return command.bounds || null;
  const meta = command.meta && typeof command.meta === 'object' ? command.meta : {};
  const size = nodeDesiredSize({ kind, meta });
  const origin = nextChildOriginInContainer(ir, parentId, size);
  return {
    x: origin.x,
    y: origin.y,
    w: size.w,
    h: size.h,
  };
}

function instantiateTemplate(templateId, options = {}) {
  const template = getCanvasTemplate(templateId);
  if (!template) throw new Error(`Unknown canvas template: ${templateId}`);
  const instanceId = safeId(options.instance_id || template.id);
  const title = options.title || template.default_ir.board.title;
  const purpose = options.purpose || template.default_ir.board.purpose;
  const seed = options.seed && typeof options.seed === 'object' ? options.seed : {};
  const ir = JSON.parse(JSON.stringify(template.default_ir));
  ir.board.title = title;
  ir.board.purpose = purpose;
  ir.nodes = ir.nodes.map((node) => (!node.parent && node.id === template.id ? { ...node, title } : node));
  if (instanceId !== template.id) {
    ir.nodes = ir.nodes.map((node) => ({
      ...node,
      id: `${instanceId}.${node.id}`,
      parent: node.parent ? `${instanceId}.${node.parent}` : null,
    }));
    ir.relationships = ir.relationships.map((rel) => ({
      ...rel,
      id: `${instanceId}.${rel.id}`,
      from: `${instanceId}.${rel.from}`,
      to: `${instanceId}.${rel.to}`,
    }));
  }
  const seedNodes = [];
  for (const [slotId, items] of Object.entries(seed)) {
    const normalizedSlotId = instanceId !== template.id ? `${instanceId}.${safeId(slotId)}` : safeId(slotId);
    if (!Array.isArray(items)) continue;
    items.forEach((item, index) => {
      const text = typeof item === 'string' ? item : (item.content || item.text || item.title || '');
      if (!text) return;
      seedNodes.push({
        id: `${normalizedSlotId}.seed-${index + 1}`,
        kind: 'sticky',
        title: compactText(text, 36),
        role: item.role || 'hypothesis',
        parent: normalizedSlotId,
        content: text,
        color: item.color || null,
      });
    });
  }
  ir.nodes.push(...seedNodes);
  return applyTemplateTransform(normalizeCanvasIR(ir), options);
}

/**
 * Copy widget runtime state (user votes, intrinsic size, mount review) from
 * the live snapshot back into the IR before a recompile. Without this, any
 * later agent command would regenerate widget shape records from stale IR
 * meta and wipe user interaction state. Per-key rule: the higher
 * vd_state_version wins.
 */
function hydrateWidgetRuntimeState(ir, previousSnapshot) {
  if (!ir || !Array.isArray(ir.nodes) || ir.nodes.length === 0) return ir;
  const store = previousSnapshot?.document?.store || {};
  let changed = false;
  const nodes = ir.nodes.map((node) => {
    if (node.kind !== 'html_component') return node;
    const record = store[shapeIdFor(safeId(node.id))];
    const recMeta = record?.meta;
    if (!recMeta) return node;
    const meta = { ...(node.meta || {}) };
    const irVersion = Number(meta.vd_state_version || 0);
    const snapVersion = Number(recMeta.vd_state_version || 0);
    if (recMeta.vd_widget_state && snapVersion >= irVersion) {
      meta.vd_widget_state = recMeta.vd_widget_state;
      meta.vd_state_version = snapVersion;
      meta.vd_state_actor = recMeta.vd_state_actor || meta.vd_state_actor || 'user';
    }
    if (recMeta.vd_intrinsic_size) meta.vd_intrinsic_size = recMeta.vd_intrinsic_size;
    if (recMeta.vd_widget_review) meta.vd_widget_review = recMeta.vd_widget_review;
    changed = true;
    return { ...node, meta };
  });
  return changed ? { ...ir, nodes } : ir;
}

function applyCanvasIRCommands(currentIR, commands = []) {
  const ir = normalizeCanvasIR(currentIR || {});
  const results = [];
  for (const command of commands) {
    if (!command || typeof command !== 'object') continue;
    const op = command.op;
    if (op === 'insert_template') {
      const fragment = instantiateTemplate(command.template_id || command.template || 'business_model_canvas', command);
      if (ir.nodes.length === 0) {
        ir.board = fragment.board;
        ir.grid = fragment.grid;
        ir.layout_policy = fragment.layout_policy || ir.layout_policy;
        ir.nodes.push(...fragment.nodes);
        ir.relationships.push(...fragment.relationships);
        results.push({ op, status: 'applied', template_id: command.template_id || command.template || 'business_model_canvas' });
        continue;
      }
      const stageParentId = findStageParentId(ir, command);
      const placedFragment = stageParentId
        ? reparentFragmentRoots(fragment, ir, stageParentId, command)
        : placeTemplateFragment(fragment, ir, command);
      const offset = nextRootRow(ir);
      const nodeIdPrefix = safeId(command.instance_id || command.template_id || command.template || 'template');
      const existingIds = new Set(ir.nodes.map((item) => item.id));
      const idMap = new Map();
      for (const node of placedFragment.nodes) {
        idMap.set(node.id, existingIds.has(node.id) ? `${nodeIdPrefix}.${node.id}` : node.id);
      }
      for (const node of placedFragment.nodes) {
        const nextNode = {
          ...node,
          id: idMap.get(node.id),
          parent: node.parent ? (idMap.get(node.parent) || node.parent) : null,
        };
        if (!nextNode.parent && !nextNode.bounds && nextNode.area) nextNode.area = { ...nextNode.area, row: nextNode.area.row + offset };
        ir.nodes.push(nextNode);
      }
      ir.relationships.push(...placedFragment.relationships.map((rel) => ({
        ...rel,
        id: rel.id && idMap.has(rel.from) && idMap.has(rel.to)
          ? `rel-${idMap.get(rel.from)}-${idMap.get(rel.to)}`
          : rel.id,
        from: idMap.get(rel.from) || rel.from,
        to: idMap.get(rel.to) || rel.to,
      })));
      results.push({
        op,
        status: 'applied',
        template_id: command.template_id || command.template || 'business_model_canvas',
        parent: stageParentId || null,
        stage: stageParentId ? ir.nodes.find((node) => node.id === stageParentId)?.meta?.vd_stage_key || null : null,
      });
    } else if (op === 'add_node') {
      const parent = command.parent ? safeId(command.parent) : findStageParentId(ir, command);
      const kind = command.kind || 'sticky';
      const bounds = parent ? boundsForStageCommand(ir, parent, kind, command) : command.bounds;
      const node = normalizeIRNode({
        id: command.id || `${safeId(parent || 'root')}.node-${Date.now()}`,
        kind,
        title: command.title,
        role: command.role,
        parent,
        area: command.area,
        bounds,
        content: command.content || command.text,
        color: command.color,
        meta: {
          ...(command.meta || {}),
          ...(parent ? {
            vd_stage: ir.nodes.find((item) => item.id === parent)?.meta?.vd_stage_key || undefined,
            vd_stage_parent_ir_id: parent,
            vd_stage_flow_item: true,
          } : {}),
        },
      }, ir.nodes.length);
      ir.nodes.push(node);
      results.push({ op, status: 'applied', node_id: node.id, parent: node.parent || null });
    } else if (op === 'edit_node') {
      const node = ir.nodes.find((item) => item.id === safeId(command.id));
      if (!node) {
        results.push({ op, status: 'not_found', node_id: command.id });
        continue;
      }
      Object.assign(node, normalizeIRNode({ ...node, ...command, id: node.id }, 0));
      results.push({ op, status: 'applied', node_id: node.id });
    } else if (op === 'delete_node') {
      const targetId = safeId(command.id);
      const deleteIds = collectDescendantIds(ir, targetId);
      ir.nodes = ir.nodes.filter((item) => !deleteIds.has(item.id));
      ir.relationships = ir.relationships.filter((rel) => !deleteIds.has(rel.from) && !deleteIds.has(rel.to));
      results.push({ op, status: 'applied', deleted_node_ids: Array.from(deleteIds) });
    } else if (op === 'move_node') {
      const node = ir.nodes.find((item) => item.id === safeId(command.id));
      if (!node) {
        results.push({ op, status: 'not_found', node_id: command.id });
        continue;
      }
      node.parent = command.parent ? safeId(command.parent) : null;
      if (command.area) node.area = normalizeArea(command.area);
      results.push({ op, status: 'applied', node_id: node.id, parent: node.parent });
    } else if (op === 'add_widget' || op === 'add_html_component') {
      const { spec, review } = canvasWidgets.prepareWidget(command);
      if (!spec || review.status === 'failed') {
        results.push({ op, status: 'rejected', errors: review.errors, widget_review: review });
        continue;
      }
      const parent = command.parent ? safeId(command.parent) : findStageParentId(ir, command);
      const meta = canvasWidgets.widgetNodeMeta(spec, { actor: 'agent', review, version: 1 });
      const bounds = parent
        ? boundsForStageCommand(ir, parent, 'html_component', {
          ...command,
          meta: {
            vd_sizing: spec.sizing,
          },
        })
        : command.bounds;
      const node = normalizeIRNode({
        id: command.id || `widget-${Date.now()}`,
        kind: 'html_component',
        title: spec.title,
        role: command.role || 'widget',
        parent,
        area: command.area,
        bounds,
        content: spec.description,
        meta: {
          ...meta,
          ...(parent ? {
            vd_stage: ir.nodes.find((item) => item.id === parent)?.meta?.vd_stage_key || undefined,
            vd_stage_parent_ir_id: parent,
            vd_stage_flow_item: true,
          } : {}),
        },
      }, ir.nodes.length);
      ir.nodes.push(node);
      results.push({
        op,
        status: 'applied',
        node_id: node.id,
        parent: node.parent || null,
        template_id: spec.template_id,
        widget_review: review,
      });
    } else if (op === 'update_widget') {
      const node = ir.nodes.find((item) => item.id === safeId(command.id));
      if (!node || node.kind !== 'html_component') {
        results.push({ op, status: 'not_found', node_id: command.id });
        continue;
      }
      const meta = { ...(node.meta || {}) };
      const changes = [];
      const statePatch = command.state_patch && typeof command.state_patch === 'object' ? command.state_patch : null;
      const stateReplace = command.state && typeof command.state === 'object' ? command.state : null;
      if (statePatch || stateReplace) {
        meta.vd_widget_state = stateReplace || { ...(meta.vd_widget_state || {}), ...statePatch };
        meta.vd_state_version = (meta.vd_state_version || 0) + 1;
        meta.vd_state_actor = 'agent';
        changes.push('state');
      }
      let review = null;
      if (typeof command.html === 'string' && command.html.trim()) {
        const prepared = canvasWidgets.prepareWidget({
          title: command.title || meta.vd_title,
          description: command.description || meta.vd_description,
          html: command.html,
          state: meta.vd_widget_state,
          output_schema: command.output_schema || meta.vd_output_schema,
          input_schema: command.input_schema || meta.vd_input_schema,
          sizing: { ...(meta.vd_sizing || {}), ...(command.sizing || {}) },
        });
        review = prepared.review;
        if (!prepared.spec || review.status === 'failed') {
          results.push({ op, status: 'rejected', node_id: node.id, errors: review.errors, widget_review: review });
          continue;
        }
        meta.vd_html_prev = meta.vd_html || null;
        meta.vd_html = prepared.spec.html;
        meta.vd_output_schema = prepared.spec.output_schema;
        meta.vd_input_schema = prepared.spec.input_schema;
        meta.vd_sizing = prepared.spec.sizing;
        meta.vd_widget_version = (meta.vd_widget_version || 1) + 1;
        meta.vd_widget_review = review;
        changes.push('html');
      }
      if (command.title) {
        node.title = command.title;
        meta.vd_title = command.title;
        changes.push('title');
      }
      if (command.description) {
        node.content = command.description;
        meta.vd_description = command.description;
        changes.push('description');
      }
      if (changes.length === 0) {
        results.push({ op, status: 'no_change', node_id: node.id });
        continue;
      }
      node.meta = meta;
      results.push({
        op,
        status: 'applied',
        node_id: node.id,
        changes,
        ...(review ? { widget_review: review } : {}),
      });
    } else if (op === 'locate_node') {
      const query = String(command.query || command.id || '').toLowerCase();
      const matches = ir.nodes.filter((node) => node.id === safeId(command.id)
        || node.title.toLowerCase().includes(query)
        || node.role.toLowerCase().includes(query));
      results.push({ op, status: 'ok', matches: matches.map(({ id, kind, title, role, parent }) => ({ id, kind, title, role, parent })) });
    } else {
      results.push({ op, status: 'unsupported' });
    }
  }
  return { ir: normalizeCanvasIR(ir), results };
}

function nextRootRow(ir) {
  const roots = ir.nodes.filter((node) => !node.parent && node.area);
  if (roots.length === 0) return 0;
  return Math.max(...roots.map((node) => node.area.row + node.area.rowSpan)) + 1;
}

function collectDescendantIds(ir, rootId) {
  const ids = new Set([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of ir.nodes) {
      if (node.parent && ids.has(safeId(node.parent)) && !ids.has(node.id)) {
        ids.add(node.id);
        changed = true;
      }
    }
  }
  return ids;
}

function compactRecentEvents(events = []) {
  return (Array.isArray(events) ? events : []).slice(-20).map((event) => ({
    id: event.id,
    type: event.type,
    actor: event.actor,
    summary: event.summary,
    target: event.target || null,
    commands: Array.isArray(event.commands) ? event.commands : [],
    semantic_diff: event.semantic_diff || null,
    meta: event.meta || {},
    created_at: event.created_at || event.createdAt || null,
  }));
}

function pendingWidgetOutputs(openFeedback = []) {
  return (Array.isArray(openFeedback) ? openFeedback : [])
    .filter((item) => item?.kind === 'widget_output')
    .map((item) => {
      const target = item.target || {};
      const payload = target.payload || {};
      return {
        feedback_id: item.id,
        event_type: payload.event_type || target.action || null,
        widget_id: target.component_id || target.shape_id || null,
        shape_id: target.shape_id || null,
        component_id: target.component_id || null,
        widget_title: target.component_title || null,
        payload,
        schema_valid: target.schema_valid !== false,
        content: item.content || '',
        created_at: item.created_at || item.createdAt || null,
      };
    });
}

function pendingWidgetRequests(widgetInstances = []) {
  const pendingStatuses = new Set(['submitted', 'agent_processing', 'needs_revision']);
  return (Array.isArray(widgetInstances) ? widgetInstances : [])
    .filter((widget) => pendingStatuses.has(String(widget?.state?.status || '')))
    .map((widget) => ({
      widget_id: widget.id,
      shape_id: widget.shape_id,
      component_id: widget.component_id,
      title: widget.title,
      status: widget.state?.status || null,
      request_id: widget.state?.request_id || null,
      request: widget.state?.request || {},
      state_version: widget.state_version || 0,
      state_actor: widget.state_actor || null,
      bounds: widget.bounds || null,
    }));
}

function buildCanvasAgentContext({
  workspace,
  semanticIndex,
  events = [],
  openFeedback = [],
  openRegionAnnotations = [],
  openCompletionRequests = [],
}) {
  const ir = semanticIndex?.canvas_ir || null;
  const nodeIndex = Array.isArray(semanticIndex?.ir_node_index) ? semanticIndex.ir_node_index : [];
  const widgetInstances = Array.isArray(semanticIndex?.widget_instances) ? semanticIndex.widget_instances : [];
  const workspaceContext = workspace?.context && typeof workspace.context === 'object' ? workspace.context : {};
  const zones = Array.isArray(semanticIndex?.zones) ? semanticIndex.zones : [];
  const sections = Array.isArray(semanticIndex?.sections) ? semanticIndex.sections : [];
  const stageSections = DESIGN_STAGE_SEQUENCE.map((stage) => {
    const zone = zones.find((item) => normalizeDesignStageKey(item?.stage || item?.role) === stage.key);
    const section = zone
      ? sections.find((item) => item.shape_id === zone.section_id || item.ir_id === zone.ir_id)
      : sections.find((item) => normalizeDesignStageKey(item?.meta?.vd_stage_key || item?.role) === stage.key);
    return {
      key: stage.key,
      role: stage.role,
      parent_id: stage.id,
      title: stage.title,
      rhythm: stage.rhythm,
      exists: Boolean(zone || section),
      shape_id: zone?.section_id || section?.shape_id || null,
      ir_id: zone?.ir_id || section?.ir_id || stage.id,
      bounds: zone?.bounds || section?.bounds || null,
      content_origin: zone?.content_origin || section?.meta?.vd_stage_content_origin || PROJECT_STAGE_LAYOUT.contentOrigin,
    };
  });
  const activeExperts = Array.isArray(workspaceContext.active_experts)
    ? workspaceContext.active_experts
    : (Array.isArray(workspaceContext.expert_team) ? workspaceContext.expert_team : []);
  const judgmentContract = workspaceContext.judgment_contract || workspaceContext.judgement_contract || null;
  return {
    type: 'canvas_workspace_agent_context_v2',
    preferred_write_api: 'CanvasIR or commands API',
    direct_snapshot_write: 'debug_only',
    stage_routing: {
      default: '当 command 带 stage 且没有显式 parent 时，运行时把 template/widget/node 放入对应阶段 frame。',
      stages: stageSections,
      stage_spine_ready: stageSections.every((stage) => stage.exists),
    },
    workspace: {
      id: workspace.id,
      title: workspace.title,
      purpose: workspace.purpose,
      tags: workspace.tags || [],
      context: workspaceContext,
      updated_at: workspace.updated_at,
      snapshot_rev: workspace.snapshot_rev || 0,
      agent_rev: workspace.agent_rev || 0,
    },
    project_protocol_state: {
      vd_project_document: workspaceContext.vd_project_document === true,
      current_stage: workspaceContext.current_stage || workspaceContext.stage || null,
      expert_team: Array.isArray(workspaceContext.expert_team) ? workspaceContext.expert_team : [],
      active_experts: activeExperts,
      judgment_contract: judgmentContract,
      expert_team_ready: activeExperts.length > 0 && Boolean(judgmentContract),
      stage_spine_ready: stageSections.every((stage) => stage.exists),
      missing_stage_keys: stageSections.filter((stage) => !stage.exists).map((stage) => stage.key),
    },
    current_ir_summary: ir ? {
      board: ir.board,
      node_count: ir.nodes.length,
      relationship_count: ir.relationships.length,
      nodes: nodeIndex,
    } : null,
    edit_summary: semanticIndex?.edit_summary || null,
    recent_events: compactRecentEvents(events),
    open_feedback: openFeedback,
    open_region_annotations: openRegionAnnotations,
    open_completion_requests: openCompletionRequests,
    available_templates: listCanvasTemplates(),
    available_widget_templates: canvasWidgets.listWidgetTemplates(),
    widget_instances: widgetInstances,
    pending_widget_outputs: pendingWidgetOutputs(openFeedback),
    pending_widget_requests: pendingWidgetRequests(widgetInstances),
    command_schema: {
      ops: ['insert_template', 'add_node', 'edit_node', 'delete_node', 'move_node', 'locate_node', 'add_widget', 'update_widget'],
      target_ids: '使用 CanvasIR node id / slot id / 方法模板实例 id，不要使用 tldraw shape id。',
      page_rule: '默认所有内容都写入当前工作 Page；不要主动创建、切换或要求用户切换 tldraw Page，除非用户明确要求多 Page 工作。',
      stage_rule: '默认使用 stage: discover | define | develop | deliver 指定落位。没有 parent 时，insert_template/add_node/add_widget 会自动放入对应阶段区域，从左上开始顺序排列。',
      template_terms: 'available_templates 是方法模板（CanvasIR Template），用于静态设计方法脚手架；available_widget_templates 是交互组件模板，用于参数化创建 Widget。',
      insert_template_options: ['template_id', 'title', 'stage', 'parent', 'seed', 'scale', 'anchor', 'position', 'x', 'y'],
      widget_rule: 'Widget 用于轻交互、状态、异步请求、参数控制、可视化和结构化输出；复杂材料输入应来自对话、文件或画板内容。'
        + '优先复用 available_widget_templates 中的通用原语；项目化微型工具可生成自由 HTML fragment（不能有 <html>/<head>/<body>，不能固定根尺寸，不能有外部 scripts）。'
        + '请求型 Widget 应同时 vd.state.set({status:"submitted",request_id,request}) 和 vd.emit("*_requested",{request_id,request})。'
        + '智能体从 pending_widget_outputs、pending_widget_requests 和 widget_instances 读取待处理请求；处理时先 update_widget 到 agent_processing，再回写 result_ready/error。'
        + '稳定结果应物化为 CanvasIR 原生画板内容；Widget 不决定专家介入，智能体按 skill 判断是否需要专家批注或评审。',
      recommended_widget_state: {
        status: 'idle|drafting|submitted|agent_processing|result_ready|user_reviewing|accepted|rejected|needs_revision|materialized|error',
        request_id: 'string|null',
        request: {},
        result: {},
        selected_items: [],
        user_notes: '',
        error: null,
        materialized_shape_ids: [],
      },
      widget_event_naming: {
        request: '*_requested',
        update: '*_updated',
        selected: '*_selected',
        accepted: '*_accepted',
        materialize_request: '*_materialize_requested',
      },
    },
    minimal_examples: [
      {
        op: 'insert_template',
        template_id: 'business_model_canvas',
        title: 'AI 桌面机器人商业模式画布',
        stage: 'define',
      },
      {
        op: 'add_node',
        stage: 'discover',
        kind: 'sticky',
        content: '用实体存在感降低 AI 工具的抽象感',
      },
      {
        op: 'add_widget',
        stage: 'develop',
        template_id: 'vote',
        params: { question: '哪个方向继续深化？', options: ['方向 A', '方向 B', '方向 C'] },
      },
      {
        op: 'update_widget',
        id: 'vote-directions',
        state_patch: { closed: true },
      },
    ],
  };
}

module.exports = {
  DEFAULT_TLDRAW_SCHEMA,
  DESIGN_STAGE_SEQUENCE,
  normalizeDesignStageKey,
  createProjectStageCanvasIR,
  normalizeCanvasIR,
  validateCanvasIR,
  compileCanvasIR,
  listCanvasTemplates,
  getCanvasTemplate,
  instantiateTemplate,
  applyCanvasIRCommands,
  buildCanvasAgentContext,
  hydrateWidgetRuntimeState,
  listWidgetTemplates: canvasWidgets.listWidgetTemplates,
  prepareWidget: canvasWidgets.prepareWidget,
};
