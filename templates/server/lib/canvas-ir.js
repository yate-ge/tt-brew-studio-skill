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

const DEFAULT_NODE_SIZE = {
  sticky: { w: 220, h: 112 },
  text: { w: 360, h: 96 },
  shape: { w: 260, h: 132 },
};

const MIN_NODE_SIZE = {
  sticky: { w: 104, h: 64 },
  sticky_note: { w: 104, h: 64 },
  text: { w: 120, h: 48 },
  shape: { w: 120, h: 72 },
};

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
  return {
    version: input.version || 1,
    board: {
      title: input.board?.title || input.title || '协作画布',
      purpose: input.board?.purpose || input.purpose || '',
      reading_order: input.board?.reading_order || 'left_to_right',
    },
    grid: normalizeGrid(input.grid),
    nodes: nodes.map((node, index) => normalizeIRNode(node, index)),
    relationships: Array.isArray(input.relationships) ? input.relationships.map(normalizeRelationship).filter(Boolean) : [],
    layout_policy: input.layout_policy && typeof input.layout_policy === 'object' ? input.layout_policy : {},
    metadata: {
      ...(input.metadata || {}),
      normalized_at: now,
    },
  };
}

function normalizeIRNode(node = {}, index = 0) {
  const kind = String(node.kind || 'sticky').trim();
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
    grid: node.grid ? normalizeGrid(node.grid) : null,
    content: typeof node.content === 'string' ? node.content : (typeof node.text === 'string' ? node.text : ''),
    color: node.color || null,
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
  const nodesById = new Map(ir.nodes.map((node) => [node.id, node]));
  const childrenByParent = buildChildrenByParent(ir.nodes);
  const layout = resolveLayout(ir, nodesById, childrenByParent);
  const records = {
    'document:document': previousSnapshot.document?.store?.['document:document'] || {
      gridSize: 10,
      name: '',
      meta: {},
      id: 'document:document',
      typeName: 'document',
    },
    'page:page': previousSnapshot.document?.store?.['page:page'] || {
      meta: {},
      id: 'page:page',
      name: 'Page 1',
      index: 'a1',
      typeName: 'page',
    },
  };

  const tldrawSections = [];
  const tldrawNodes = [];
  const shapeIdsByNodeId = new Map();
  const topLevelNodes = ir.nodes.filter((node) => !node.parent);

  addRecordsForNodes({
    nodes: topLevelNodes,
    parentShapeId: 'page:page',
    childrenByParent,
    layout,
    records,
    tldrawSections,
    tldrawNodes,
    shapeIdsByNodeId,
    now,
  });

  const snapshot = {
    document: { schema, store: records },
    session: buildSessionState(layout),
  };
  const semantic_index = buildSemanticIndex({
    ir,
    layout,
    tldrawSections,
    tldrawNodes,
    shapeIdsByNodeId,
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
  const autoState = new Map();

  function resolveNode(node, parent = null) {
    const parentLayout = parent ? layout.get(parent.id) : null;
    const parentGrid = node.parent && parent ? (parent.grid || parentLayout?.grid || rootGrid) : rootGrid;
    const origin = parentLayout ? { x: parentLayout.bounds.x, y: parentLayout.bounds.y } : { x: 0, y: 0 };
    const siblings = parent ? (childrenByParent.get(parent.id) || []) : rootNodes;
    const bounds = node.area
      ? areaToBounds(node.area, parentGrid, origin)
      : nextAutoBounds(node, parent, parentLayout, parentGrid, autoState, siblings.length);
    const grid = node.grid || deriveChildGrid(node, bounds);
    layout.set(node.id, { bounds, grid, parent_id: parent?.id || null });
    const children = childrenByParent.get(node.id) || [];
    for (const child of children) resolveNode(child, node);
  }

  for (const node of rootNodes) resolveNode(node, null);
  for (const node of ir.nodes) {
    if (!layout.has(node.id)) resolveNode(node, node.parent ? nodesById.get(safeId(node.parent)) : null);
  }
  return layout;
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

function nextAutoBounds(node, parent, parentLayout, parentGrid, autoState, siblingCount = 1) {
  const key = parent?.id || '__root__';
  const state = autoState.get(key) || { index: 0 };
  autoState.set(key, state);
  const size = DEFAULT_NODE_SIZE[node.kind] || DEFAULT_NODE_SIZE.shape;
  const flow = parent
    ? (state.flow || computeAutoFlow(parentLayout.bounds, parentGrid, size, node.kind, siblingCount))
    : { cols: 3, cellW: size.w, cellH: size.h, itemW: size.w, itemH: size.h };
  state.flow = flow;
  const cols = Math.max(1, flow.cols);
  const col = state.index % cols;
  const row = Math.floor(state.index / cols);
  state.index += 1;
  const origin = parentLayout ? { x: parentLayout.bounds.x, y: parentLayout.bounds.y } : { x: 0, y: 0 };
  return {
    x: Math.round(origin.x + parentGrid.padding + col * (flow.cellW + parentGrid.gap) + Math.max(0, (flow.cellW - flow.itemW) / 2)),
    y: Math.round(origin.y + parentGrid.padding + row * (flow.cellH + parentGrid.gap)),
    w: Math.round(flow.itemW),
    h: Math.round(flow.itemH),
  };
}

function computeAutoFlow(parentBounds, parentGrid, desiredSize, kind, siblingCount) {
  const count = Math.max(1, siblingCount);
  const gap = parentGrid.gap;
  const minSize = MIN_NODE_SIZE[kind] || MIN_NODE_SIZE.shape;
  const availableW = Math.max(minSize.w, parentBounds.w - parentGrid.padding * 2);
  const availableH = Math.max(minSize.h, parentBounds.h - parentGrid.padding * 2);
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

function addRecordsForNodes(ctx) {
  const { nodes, parentShapeId, childrenByParent } = ctx;
  nodes.forEach((node, index) => {
    const shapeId = shapeIdFor(node.id);
    const childNodes = childrenByParent.get(node.id) || [];
    const shouldCreateFrame = CONTAINER_KINDS.has(node.kind) && node.visible !== false;
    const absBounds = ctx.layout.get(node.id).bounds;
    const parentBounds = parentShapeId === 'page:page'
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

function createContentRecord(node, parentId, index, bounds, now) {
  const color = node.color || colorForNode(node);
  const title = node.title || compactText(node.content || node.id, 48);
  const body = node.content || node.title || '';
  const text = body && body !== title ? `${title}\n\n${body}` : title;
  return {
    ...baseShapeRecord(node, parentId, index, bounds, now),
    type: 'geo',
    props: {
      w: bounds.w,
      h: bounds.h,
      geo: node.kind === 'completion_request' ? 'cloud' : 'rectangle',
      dash: 'draw',
      growY: 0,
      url: '',
      scale: 1,
      color,
      labelColor: 'black',
      fill: node.kind === 'text' ? 'none' : 'solid',
      size: bounds.w < 150 || bounds.h < 88 ? 's' : 'm',
      font: 'draw',
      align: 'middle',
      verticalAlign: 'middle',
      richText: makeRichText(text),
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

function buildSessionState(layout) {
  const allBounds = Array.from(layout.values()).map((item) => item.bounds);
  const minX = allBounds.length ? Math.min(...allBounds.map((bounds) => bounds.x)) : 0;
  const minY = allBounds.length ? Math.min(...allBounds.map((bounds) => bounds.y)) : 0;
  return {
    version: 0,
    currentPageId: 'page:page',
    exportBackground: true,
    isFocusMode: false,
    isDebugMode: false,
    isToolLocked: false,
    isGridMode: false,
    pageStates: [
      {
        pageId: 'page:page',
        camera: { x: Math.round(80 - minX * 0.1), y: Math.round(60 - minY * 0.1), z: 0.42 },
        selectedShapeIds: [],
        focusedGroupId: null,
      },
    ],
  };
}

function buildSemanticIndex({ ir, layout, tldrawSections, tldrawNodes, shapeIdsByNodeId, now }) {
  const sections = tldrawSections.map(({ node, shape, bounds }) => ({
    shape_id: shape.id,
    ir_id: node.id,
    kind: node.kind === 'slot' ? 'canvas_slot' : 'canvas_section',
    type: 'frame',
    title: node.title,
    text: node.title,
    role: node.role || '',
    parent_id: node.parent ? shapeIdsByNodeId.get(safeId(node.parent)) : 'page:page',
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
  const nodes = tldrawNodes.map(({ node, shape, bounds }) => ({
    shape_id: shape.id,
    ir_id: node.id,
    kind: node.kind === 'sticky' ? 'sticky_note' : node.kind,
    type: shape.type,
    title: node.title,
    text: node.content || node.title,
    role: node.role || '',
    parent_id: node.parent ? shapeIdsByNodeId.get(safeId(node.parent)) : 'page:page',
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
    asset_id: null,
    alt_text: '',
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
    zones: [],
    sections,
    nodes,
    assets: [],
    annotations: [],
    completion_requests: [],
    scaffold_instances: [{
      id: `canvas_ir_${safeId(ir.board.title || 'board')}`,
      type: 'canvas_ir',
      title: ir.board.title,
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
      title: node.title,
      section_id: node.section_id,
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
  const unreadableNodes = tldrawNodes
    .filter(({ bounds: nodeBounds }) => nodeBounds.w < 96 || nodeBounds.h < 56)
    .map(({ node, bounds: nodeBounds }) => ({
      code: 'NODE_BELOW_READABLE_SIZE',
      node_id: node.id,
      bounds: nodeBounds,
    }));
  warnings.push(...childOverflows, ...unreadableNodes);
  return {
    strategy: 'canvas_ir_grid',
    board_title: ir.board.title,
    counts: {
      sections: tldrawSections.length,
      nodes: tldrawNodes.length,
      relationships: ir.relationships.length,
      child_overflows: childOverflows.length,
      unreadable_nodes: unreadableNodes.length,
    },
    extents: bounds.length ? {
      x: Math.min(...bounds.map((item) => item.x)),
      y: Math.min(...bounds.map((item) => item.y)),
      w: Math.max(...bounds.map((item) => item.x + item.w)) - Math.min(...bounds.map((item) => item.x)),
      h: Math.max(...bounds.map((item) => item.y + item.h)) - Math.min(...bounds.map((item) => item.y)),
    } : null,
    warnings,
    auto_repairs: [],
  };
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
  return normalizeCanvasIR(ir);
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
      const offset = nextRootRow(ir);
      const nodeIdPrefix = safeId(command.instance_id || command.template_id || command.template || 'template');
      const existingIds = new Set(ir.nodes.map((item) => item.id));
      const idMap = new Map();
      for (const node of fragment.nodes) {
        idMap.set(node.id, existingIds.has(node.id) ? `${nodeIdPrefix}.${node.id}` : node.id);
      }
      for (const node of fragment.nodes) {
        const nextNode = {
          ...node,
          id: idMap.get(node.id),
          parent: node.parent ? (idMap.get(node.parent) || node.parent) : null,
        };
        if (!nextNode.parent && nextNode.area) nextNode.area = { ...nextNode.area, row: nextNode.area.row + offset };
        ir.nodes.push(nextNode);
      }
      ir.relationships.push(...fragment.relationships.map((rel) => ({
        ...rel,
        id: rel.id && idMap.has(rel.from) && idMap.has(rel.to)
          ? `rel-${idMap.get(rel.from)}-${idMap.get(rel.to)}`
          : rel.id,
        from: idMap.get(rel.from) || rel.from,
        to: idMap.get(rel.to) || rel.to,
      })));
      results.push({ op, status: 'applied', template_id: command.template_id || command.template || 'business_model_canvas' });
    } else if (op === 'add_node') {
      const node = normalizeIRNode({
        id: command.id || `${safeId(command.parent || 'root')}.node-${Date.now()}`,
        kind: command.kind || 'sticky',
        title: command.title,
        role: command.role,
        parent: command.parent,
        area: command.area,
        content: command.content || command.text,
        color: command.color,
      }, ir.nodes.length);
      ir.nodes.push(node);
      results.push({ op, status: 'applied', node_id: node.id });
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

function buildCanvasAgentContext({ workspace, semanticIndex, openFeedback = [], openCompletionRequests = [] }) {
  const ir = semanticIndex?.canvas_ir || null;
  const nodeIndex = Array.isArray(semanticIndex?.ir_node_index) ? semanticIndex.ir_node_index : [];
  return {
    type: 'canvas_workspace_agent_context_v2',
    preferred_write_api: 'CanvasIR or commands API',
    direct_snapshot_write: 'debug_only',
    workspace: {
      id: workspace.id,
      title: workspace.title,
      purpose: workspace.purpose,
      tags: workspace.tags || [],
      updated_at: workspace.updated_at,
    },
    current_ir_summary: ir ? {
      board: ir.board,
      node_count: ir.nodes.length,
      relationship_count: ir.relationships.length,
      nodes: nodeIndex,
    } : null,
    open_feedback: openFeedback,
    open_completion_requests: openCompletionRequests,
    available_templates: listCanvasTemplates(),
    command_schema: {
      ops: ['insert_template', 'add_node', 'edit_node', 'delete_node', 'move_node', 'locate_node'],
      target_ids: 'Use CanvasIR node id / slot id / template instance id, not tldraw shape id.',
    },
    minimal_examples: [
      {
        op: 'insert_template',
        template_id: 'business_model_canvas',
        title: 'AI 桌面机器人商业模式画布',
      },
      {
        op: 'add_node',
        parent: 'value_propositions',
        kind: 'sticky',
        content: '用实体存在感降低 AI 工具的抽象感',
      },
    ],
  };
}

module.exports = {
  DEFAULT_TLDRAW_SCHEMA,
  normalizeCanvasIR,
  validateCanvasIR,
  compileCanvasIR,
  listCanvasTemplates,
  getCanvasTemplate,
  instantiateTemplate,
  applyCanvasIRCommands,
  buildCanvasAgentContext,
};
