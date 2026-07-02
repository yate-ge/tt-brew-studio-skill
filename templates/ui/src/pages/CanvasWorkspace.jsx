import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  DefaultNavigationPanel,
  DefaultToolbar,
  DefaultToolbarContent,
  DefaultColorStyle,
  DefaultFillStyle,
  GeoShapeGeoStyle,
  FrameShapeUtil,
  Tldraw,
  TldrawUiButtonIcon,
  TldrawUiToolbar,
  TldrawUiToolbarButton,
  createShapeId,
  getSnapshot,
  loadSnapshot,
  toRichText,
} from 'tldraw';
import 'tldraw/tldraw.css';
import {
  activateCanvasWorkspace,
  addCanvasWorkspaceFeedback,
  createCanvasWorkspace,
  fetchCanvasWorkspace,
  fetchCanvasWorkspaces,
  fetchScaffolds,
  updateCanvasWorkspaceSnapshot,
} from '../lib/api';
import { useDesignTokens } from '../hooks/useDesignTokens';
import GeneratedContentFrame from '../components/GeneratedContentFrame';

const SECTION_PADDING = 64;
const DEFAULT_SECTION_SIZE = { w: 960, h: 640 };
const SECTION_DUPLICATE_OFFSET = { x: 160, y: 120 };
const DEFAULT_HTML_COMPONENT_SIZE = { w: 360, h: 220 };
const DEFAULT_COMPLETION_SIZE = { w: 520, h: 300 };
const DEFAULT_CANVAS_HTML_COMPONENT = `<section style="display:inline-block;padding:12px;font-family:var(--vds-typography-font-family,system-ui,sans-serif);color:var(--vds-colors-text,#172033);background:transparent">
  <style>
    html,body{margin:0;background:transparent}
    .vd-card{display:inline-flex;flex-direction:column;gap:10px;min-width:260px;max-width:520px;border:1px solid var(--vds-colors-border,#d8e0ea);border-radius:8px;padding:14px;background:rgba(255,255,255,.86);box-shadow:0 8px 24px rgba(15,23,42,.12)}
    .vd-title{margin:0;font-size:16px;line-height:1.25}
    .vd-copy{margin:0 0 14px;color:var(--vds-colors-text-secondary,#667085);font-size:13px;line-height:1.55}
    .vd-actions{display:flex;gap:8px;flex-wrap:wrap;border-top:1px solid var(--vds-colors-border,#d8e0ea);padding-top:12px}
    .vd-input{width:140px;padding:6px 9px;border:1px solid var(--vds-colors-border,#d0d5dd);border-radius:8px;font:inherit;font-size:13px}
    button{min-height:32px;border-radius:7px}
  </style>
  <article class="vd-card">
    <h3 class="vd-title">Widget</h3>
    <p class="vd-copy">透明背景、内容自适应的画布内嵌 widget。</p>
    <div class="vd-actions">
      <button data-vd-feedback-action="accept_component" data-vd-feedback-label="HTML 组件" data-vd-feedback-item-id="canvas-html-component">接受</button>
      <button data-vd-feedback-action="adjust_component" data-vd-feedback-label="HTML 组件" data-vd-feedback-item-id="canvas-html-component">调整</button>
      <form data-vd-feedback-action="other_comment" data-vd-feedback-label="HTML 组件" data-vd-feedback-item-id="canvas-html-component" style="display:inline-flex;gap:6px;margin:0">
        <input class="vd-input" name="text" placeholder="Other...">
        <button type="submit">提交</button>
      </form>
    </div>
  </article>
</section>`;

function formatDate(value) {
  if (!value) return '未更新';
  try {
    return new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch {
    return value;
  }
}

function readSelectedShapeIds(editor) {
  try {
    return editor?.getSelectedShapeIds?.() || [];
  } catch {
    return [];
  }
}

function isCanvasSectionShape(shape) {
  return shape?.type === 'frame';
}

function isHtmlComponentShape(shape) {
  return shape?.meta?.vd_kind === 'html_component';
}

function isCompletionRequestShape(shape) {
  return shape?.meta?.vd_kind === 'completion_request';
}

function shapeAuthorship(shape) {
  const meta = shape?.meta || {};
  return {
    created_by: meta.vd_created_by || meta.vd_author || 'user',
    last_edited_by: meta.vd_last_edited_by || meta.vd_created_by || meta.vd_author || 'user',
    created_at: meta.vd_created_at || null,
    updated_at: meta.vd_updated_at || null,
  };
}

function getShapePageBounds(editor, shapeOrId) {
  try {
    return compactBounds(editor?.getShapePageBounds?.(shapeOrId));
  } catch {
    return null;
  }
}

function currentPageShapes(editor) {
  return editor?.getCurrentPageShapesSorted?.() || editor?.getCurrentPageShapes?.() || [];
}

function shapeIdSet(editor) {
  return new Set(currentPageShapes(editor).map((shape) => String(shape.id)));
}

function boundsContainPoint(bounds, point, padding = 0) {
  if (!bounds || !point) return false;
  return point.x >= bounds.x - padding
    && point.x <= bounds.x + bounds.w + padding
    && point.y >= bounds.y - padding
    && point.y <= bounds.y + bounds.h + padding;
}

function compactBounds(bounds) {
  if (!bounds) return null;
  const result = {
    x: bounds.x ?? bounds.minX,
    y: bounds.y ?? bounds.minY,
    w: bounds.w ?? bounds.width ?? (Number.isFinite(bounds.maxX) && Number.isFinite(bounds.minX) ? bounds.maxX - bounds.minX : undefined),
    h: bounds.h ?? bounds.height ?? (Number.isFinite(bounds.maxY) && Number.isFinite(bounds.minY) ? bounds.maxY - bounds.minY : undefined),
  };
  return Object.fromEntries(Object.entries(result).filter(([, value]) => Number.isFinite(value)));
}

function collectPlainText(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(collectPlainText).filter(Boolean).join(' ');
  if (typeof value === 'object') {
    if (typeof value.text === 'string') return value.text;
    if (typeof value.content === 'string') return value.content;
    if (Array.isArray(value.content)) return collectPlainText(value.content);
    return Object.entries(value)
      .filter(([key]) => !['type', 'attrs', 'marks'].includes(key))
      .map(([, entryValue]) => collectPlainText(entryValue))
      .filter(Boolean)
      .join(' ');
  }
  return '';
}

function shapeText(shape) {
  const props = shape?.props || {};
  const meta = shape?.meta || {};
  return [
    meta.vd_title,
    meta.vd_description,
    props.text,
    props.name,
    props.url,
    props.altText,
    collectPlainText(props.richText),
  ].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

function nearestCanvasSection(editor, shape) {
  if (!editor || !shape) return null;
  if (isCanvasSectionShape(shape)) return shape;
  let parent = editor.getShapeParent?.(shape);
  while (parent) {
    if (isCanvasSectionShape(parent)) return parent;
    parent = editor.getShapeParent?.(parent);
  }
  return null;
}

function describeShape(shape, editor = null) {
  const text = shapeText(shape);
  const section = nearestCanvasSection(editor, shape);
  const childIds = isCanvasSectionShape(shape) && editor?.getSortedChildIdsForParent
    ? editor.getSortedChildIdsForParent(shape.id).map(String)
    : [];
  const meta = shape.meta || {};
  if (isHtmlComponentShape(shape)) {
    return {
      shape_id: String(shape.id),
      kind: 'html_component',
      type: 'html_component',
      title: meta.vd_title || text.split(/\s+/).slice(0, 8).join(' ') || 'HTML 组件',
      text,
      html: typeof meta.vd_html === 'string' ? meta.vd_html : '',
      description: meta.vd_description || '',
      component_id: meta.vd_component_id || String(shape.id),
      parent_id: shape.parentId ? String(shape.parentId) : null,
      section_id: section ? String(section.id) : null,
      section_title: section?.props?.name || null,
      child_shape_ids: [],
      child_count: 0,
      bounds: editor ? getShapePageBounds(editor, shape.id) : null,
      x: shape.x,
      y: shape.y,
      w: shape.props?.w,
      h: shape.props?.h,
      asset_id: null,
      alt_text: '',
      authorship: shapeAuthorship(shape),
      meta,
    };
  }
  if (isCompletionRequestShape(shape)) {
    const metaPrompt = typeof meta.vd_prompt === 'string' ? meta.vd_prompt.trim() : '';
    const promptText = metaPrompt || text;
    return {
      shape_id: String(shape.id),
      kind: 'completion_request',
      type: 'completion_request',
      title: promptText || '补全请求',
      text: promptText,
      prompt: promptText,
      status: meta.vd_status || 'open',
      parent_id: shape.parentId ? String(shape.parentId) : null,
      section_id: section ? String(section.id) : null,
      section_title: section?.props?.name || null,
      child_shape_ids: [],
      child_count: 0,
      bounds: editor ? getShapePageBounds(editor, shape.id) : null,
      x: shape.x,
      y: shape.y,
      w: shape.props?.w,
      h: shape.props?.h,
      asset_id: null,
      alt_text: '',
      authorship: shapeAuthorship(shape),
      meta,
    };
  }
  const semanticKind = isCanvasSectionShape(shape)
    ? 'canvas_section'
    : (shape.type === 'note' || meta.vd_kind === 'sticky_note' ? 'sticky_note' : (meta.vd_kind || 'canvas_node'));
  return {
    shape_id: String(shape.id),
    kind: semanticKind,
    type: shape.type || 'shape',
    title: text.split(/\s+/).slice(0, 8).join(' ') || shape.type || 'shape',
    text,
    parent_id: shape.parentId ? String(shape.parentId) : null,
    section_id: section ? String(section.id) : null,
    section_title: section?.props?.name || null,
    child_shape_ids: childIds,
    child_count: childIds.length,
    bounds: editor ? getShapePageBounds(editor, shape.id) : null,
    x: shape.x,
    y: shape.y,
    w: shape.props?.w,
    h: shape.props?.h,
    asset_id: shape.props?.assetId || null,
    alt_text: shape.props?.altText || shape.meta?.alt_text || '',
    authorship: shapeAuthorship(shape),
    meta: shape.meta || {},
  };
}

function isImageLikeShape(shape) {
  return shape?.type === 'image' || shape?.type === 'video';
}

function htmlComponentPageBounds(editor, shape) {
  const bounds = getShapePageBounds(editor, shape.id);
  if (bounds) return bounds;
  return {
    x: shape.x || 0,
    y: shape.y || 0,
    w: shape.props?.w || DEFAULT_HTML_COMPONENT_SIZE.w,
    h: shape.props?.h || DEFAULT_HTML_COMPONENT_SIZE.h,
  };
}

function pagePointToViewport(editor, point) {
  if (typeof editor?.pageToViewport === 'function') return editor.pageToViewport(point);
  return editor?.pageToScreen?.(point) || point;
}

function htmlComponentOverlaysFromEditor(editor) {
  const shapes = editor?.getCurrentPageShapesSorted?.() || editor?.getCurrentPageShapes?.() || [];
  return shapes.filter(isHtmlComponentShape).map((shape) => {
    const meta = shape.meta || {};
    const bounds = htmlComponentPageBounds(editor, shape);
    const topLeft = pagePointToViewport(editor, { x: bounds.x, y: bounds.y });
    const bottomRight = pagePointToViewport(editor, { x: bounds.x + bounds.w, y: bounds.y + bounds.h });
    const w = Math.max(120, Math.abs(bottomRight.x - topLeft.x));
    const h = Math.max(96, Math.abs(bottomRight.y - topLeft.y));
    return {
      shapeId: String(shape.id),
      componentId: meta.vd_component_id || String(shape.id),
      title: meta.vd_title || 'HTML 组件',
      description: meta.vd_description || '',
      html: typeof meta.vd_html === 'string' ? meta.vd_html : '',
      x: Math.min(topLeft.x, bottomRight.x),
      y: Math.min(topLeft.y, bottomRight.y),
      w,
      h,
      pageBounds: bounds,
      zoom: editor?.getZoomLevel?.() || 1,
      interactive: meta.vd_interactive !== false,
    };
  });
}

function authoredOverlaysFromEditor(editor) {
  const shapes = editor?.getCurrentPageShapesSorted?.() || editor?.getCurrentPageShapes?.() || [];
  return shapes
    .filter((shape) => !isCanvasSectionShape(shape))
    .map((shape) => {
      const bounds = getShapePageBounds(editor, shape.id);
      if (!bounds) return null;
      const topLeft = pagePointToViewport(editor, { x: bounds.x, y: bounds.y });
      const bottomRight = pagePointToViewport(editor, { x: bounds.x + bounds.w, y: bounds.y + bounds.h });
      const authorship = shapeAuthorship(shape);
      return {
        shapeId: String(shape.id),
        kind: shape.meta?.vd_kind || 'canvas_node',
        author: authorship.last_edited_by || authorship.created_by || 'user',
        x: Math.min(topLeft.x, bottomRight.x),
        y: Math.min(topLeft.y, bottomRight.y),
        w: Math.max(12, Math.abs(bottomRight.x - topLeft.x)),
        h: Math.max(12, Math.abs(bottomRight.y - topLeft.y)),
      };
    })
    .filter(Boolean);
}

function semanticIndexFromEditor(editor, workspace) {
  const shapes = editor?.getCurrentPageShapesSorted?.() || editor?.getCurrentPageShapes?.() || [];
  const sections = shapes.filter(isCanvasSectionShape).map((shape) => describeShape(shape, editor));
  const nodes = shapes.map((shape) => describeShape(shape, editor));
  const relationships = [];
  for (const section of sections) {
    for (const childId of section.child_shape_ids || []) {
      relationships.push({
        type: 'contains',
        from: section.shape_id,
        to: childId,
      });
    }
  }
  const layoutReviewsById = new Map();
  (workspace?.semantic_index?.layout_reviews || []).forEach((review) => {
    if (review?.id) layoutReviewsById.set(review.id, review);
  });
  shapes.forEach((shape) => {
    const review = shape?.meta?.vd_layout_review;
    if (review?.id) layoutReviewsById.set(review.id, review);
  });
  return {
    version: 2,
    workspace_id: workspace?.id,
    zones: workspace?.semantic_index?.zones || [],
    sections,
    nodes,
    assets: shapes.filter(isImageLikeShape).map((shape) => ({
      shape_id: String(shape.id),
      asset_id: shape.props?.assetId || null,
      alt_text: shape.props?.altText || '',
      section_id: nearestCanvasSection(editor, shape)?.id || null,
      bounds: getShapePageBounds(editor, shape.id),
    })),
    annotations: workspace?.semantic_index?.annotations || [],
    completion_requests: nodes.filter((node) => node.kind === 'completion_request'),
    scaffold_instances: nodes
      .filter((node) => node.meta?.vd_scaffold_id)
      .map((node) => ({
        shape_id: node.shape_id,
        scaffold_id: node.meta.vd_scaffold_id,
        scaffold_title: node.meta.vd_scaffold_title || '',
        stage: node.meta.vd_stage || '',
        bounds: node.bounds,
      })),
    widget_instances: nodes
      .filter((node) => node.kind === 'html_component')
      .map((node) => ({
        shape_id: node.shape_id,
        component_id: node.component_id,
        title: node.title,
        state: node.meta?.vd_widget_state || {},
        input_schema: node.meta?.vd_input_schema || {},
        output_schema: node.meta?.vd_output_schema || {},
        sizing: node.meta?.vd_sizing || null,
        bounds: node.bounds,
      })),
    artifact_links: nodes
      .filter((node) => node.meta?.vd_artifact_url)
      .map((node) => ({
        shape_id: node.shape_id,
        title: node.title,
        url: node.meta.vd_artifact_url,
        target_type: node.meta.vd_artifact_type || 'visual_delivery_page',
      })),
    layout_reviews: Array.from(layoutReviewsById.values()).slice(-20),
    relationships,
    updated_at: new Date().toISOString(),
  };
}

function summarizeCanvasSections(editor) {
  const shapes = editor?.getCurrentPageShapesSorted?.() || editor?.getCurrentPageShapes?.() || [];
  return shapes.filter(isCanvasSectionShape).map((shape) => {
    const childIds = editor?.getSortedChildIdsForParent?.(shape.id) || [];
    return {
      id: String(shape.id),
      title: shape.props?.name || '未命名 Section',
      child_count: childIds.length,
      bounds: getShapePageBounds(editor, shape.id),
    };
  });
}

function getActiveSection(editor, shapeIds = []) {
  if (!editor) return null;
  for (const shapeId of shapeIds) {
    const shape = editor.getShape?.(shapeId);
    if (isCanvasSectionShape(shape)) return shape;
  }
  for (const shapeId of shapeIds) {
    const shape = editor.getShape?.(shapeId);
    const section = nearestCanvasSection(editor, shape);
    if (section) return section;
  }
  return null;
}

function viewportFallbackBounds(editor) {
  const viewport = editor?.getViewportPageBounds?.();
  if (!viewport) {
    return { x: 0, y: 0, w: DEFAULT_SECTION_SIZE.w, h: DEFAULT_SECTION_SIZE.h };
  }
  return {
    x: viewport.x + 80,
    y: viewport.y + 80,
    w: Math.min(DEFAULT_SECTION_SIZE.w, Math.max(560, viewport.w - 160)),
    h: Math.min(DEFAULT_SECTION_SIZE.h, Math.max(360, viewport.h - 160)),
  };
}

function sectionBoundsFromSelection(editor, shapeIds) {
  const bounds = shapeIds.length > 0 ? compactBounds(editor?.getSelectionPageBounds?.()) : null;
  if (!bounds) return viewportFallbackBounds(editor);
  return {
    x: bounds.x - SECTION_PADDING,
    y: bounds.y - SECTION_PADDING,
    w: Math.max(DEFAULT_SECTION_SIZE.w, bounds.w + SECTION_PADDING * 2),
    h: Math.max(420, bounds.h + SECTION_PADDING * 2),
  };
}

function categorizeSectionChild(shape) {
  if (isImageLikeShape(shape)) return 'media';
  if (shape.type === 'note' || shape.type === 'text') return 'notes';
  if (shape.type === 'arrow' || shape.type === 'geo' || shape.type === 'line' || shape.type === 'draw') return 'diagram';
  return 'other';
}

function localShapeSize(editor, shape) {
  const bounds = getShapePageBounds(editor, shape.id) || {};
  return {
    w: shape.props?.w || bounds.w || 220,
    h: shape.props?.h || bounds.h || 120,
  };
}

function resizablePatch(shape, nextSize) {
  const props = {};
  if (Number.isFinite(shape.props?.w)) props.w = nextSize.w;
  if (Number.isFinite(shape.props?.h)) props.h = nextSize.h;
  return Object.keys(props).length > 0 ? props : undefined;
}

function isTemplateScaleFrame(shape) {
  if (!isCanvasSectionShape(shape)) return false;
  const role = String(shape.meta?.vd_role || '');
  return role.includes('pattern.')
    || role.includes('bmc.')
    || shape.meta?.vd_template_scaled === true
    || Number.isFinite(Number(shape.meta?.vd_template_scale));
}

function collectTemplateDescendantFrames(editor, rootId) {
  const frames = [];
  const visit = (parentId) => {
    const childIds = editor?.getSortedChildIdsForParent?.(parentId) || [];
    childIds.forEach((childId) => {
      const child = editor.getShape?.(childId);
      if (!child) return;
      if (isCanvasSectionShape(child)) {
        frames.push({
          id: child.id,
          type: child.type,
          x: Number(child.x || 0),
          y: Number(child.y || 0),
          w: Number(child.props?.w || 0),
          h: Number(child.props?.h || 0),
          props: { ...(child.props || {}) },
        });
      }
      visit(child.id);
    });
  };
  visit(rootId);
  return frames;
}

function scaledFramePatch(frame, scaleX, scaleY) {
  return {
    id: frame.id,
    type: frame.type,
    x: frame.x * scaleX,
    y: frame.y * scaleY,
    props: {
      ...frame.props,
      w: Math.max(1, frame.w * scaleX),
      h: Math.max(1, frame.h * scaleY),
    },
  };
}

class VisualDeliveryFrameShapeUtil extends FrameShapeUtil {
  constructor(editor) {
    super(editor);
    this.templateResizeSnapshots = new Map();
  }

  canResizeChildren(shape) {
    return false;
  }

  onResizeStart(shape) {
    if (!isTemplateScaleFrame(shape)) return undefined;
    this.templateResizeSnapshots.set(String(shape.id), collectTemplateDescendantFrames(this.editor, shape.id));
    return undefined;
  }

  onResize(shape, info) {
    const resized = super.onResize(shape, info);
    const initial = info?.initialShape || shape;
    if (!resized || !isTemplateScaleFrame(initial)) return resized;

    const initialW = Number(initial.props?.w || 0);
    const initialH = Number(initial.props?.h || 0);
    const nextW = Number(resized.props?.w || initialW);
    const nextH = Number(resized.props?.h || initialH);
    if (initialW <= 0 || initialH <= 0 || nextW <= 0 || nextH <= 0) return resized;

    const scaleX = nextW / initialW;
    const scaleY = nextH / initialH;
    const frames = this.templateResizeSnapshots.get(String(initial.id)) || [];
    const patches = frames
      .filter((frame) => frame.w > 0 && frame.h > 0)
      .map((frame) => scaledFramePatch(frame, scaleX, scaleY));
    if (patches.length > 0) this.editor.updateShapes(patches);
    return resized;
  }

  onResizeEnd(initial, current) {
    this.templateResizeSnapshots.delete(String(initial.id));
    return undefined;
  }

  onResizeCancel(initial) {
    this.templateResizeSnapshots.delete(String(initial.id));
  }
}

const CANVAS_SHAPE_UTILS = [VisualDeliveryFrameShapeUtil];

function insetBounds(bounds, padding = 0) {
  if (!bounds) return null;
  return {
    x: bounds.x + padding,
    y: bounds.y + padding,
    w: Math.max(0, bounds.w - padding * 2),
    h: Math.max(0, bounds.h - padding * 2),
  };
}

function boundsContain(outer, inner, tolerance = 2) {
  if (!outer || !inner) return false;
  return inner.x >= outer.x - tolerance
    && inner.y >= outer.y - tolerance
    && inner.x + inner.w <= outer.x + outer.w + tolerance
    && inner.y + inner.h <= outer.y + outer.h + tolerance;
}

function boundsOverlap(a, b, padding = 10) {
  if (!a || !b) return false;
  return a.x < b.x + b.w + padding
    && a.x + a.w + padding > b.x
    && a.y < b.y + b.h + padding
    && a.y + a.h + padding > b.y;
}

function unionBounds(boundsList) {
  const items = boundsList.filter(Boolean);
  if (items.length === 0) return null;
  const minX = Math.min(...items.map((bounds) => bounds.x));
  const minY = Math.min(...items.map((bounds) => bounds.y));
  const maxX = Math.max(...items.map((bounds) => bounds.x + bounds.w));
  const maxY = Math.max(...items.map((bounds) => bounds.y + bounds.h));
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function readableMinimumForShape(shape) {
  if (shape?.type === 'note') return { w: 150, h: 150 };
  if (shape?.type === 'text') return { w: 120, h: 32 };
  return { w: 96, h: 48 };
}

function auditScaffoldLayout(editor, { sectionId, childIds, scaffold }) {
  const section = editor?.getShape?.(sectionId);
  const sectionBounds = getShapePageBounds(editor, sectionId);
  const innerSectionBounds = insetBounds(sectionBounds, 24);
  const childRecords = (childIds || [])
    .map((shapeId) => {
      const shape = editor?.getShape?.(shapeId);
      const bounds = shape ? getShapePageBounds(editor, shapeId) : null;
      return shape && bounds ? { shapeId: String(shapeId), shape, bounds } : null;
    })
    .filter(Boolean);

  const overlapPairs = [];
  for (let i = 0; i < childRecords.length; i += 1) {
    for (let j = i + 1; j < childRecords.length; j += 1) {
      const a = childRecords[i];
      const b = childRecords[j];
      if (boundsOverlap(a.bounds, b.bounds, 8)) {
        overlapPairs.push([a.shapeId, b.shapeId]);
      }
    }
  }

  const outOfSection = childRecords
    .filter((item) => sectionBounds && !boundsContain(innerSectionBounds || sectionBounds, item.bounds, 4))
    .map((item) => item.shapeId);

  const unreadable = childRecords
    .filter((item) => {
      const minimum = readableMinimumForShape(item.shape);
      return item.bounds.w < minimum.w || item.bounds.h < minimum.h;
    })
    .map((item) => item.shapeId);

  const stickyRecords = childRecords.filter((item) => item.shape?.meta?.vd_kind === 'sticky_note' || item.shape?.type === 'note');
  const stickyNoteWrongType = stickyRecords.filter((item) => item.shape.type !== 'note').map((item) => item.shapeId);
  const childBounds = unionBounds(childRecords.map((item) => item.bounds));
  const passed = !!section
    && overlapPairs.length === 0
    && outOfSection.length === 0
    && unreadable.length === 0
    && stickyNoteWrongType.length === 0;

  return {
    id: `layout_review_${Date.now()}`,
    type: 'scaffold_layout_review',
    scaffold_id: scaffold?.id || null,
    scaffold_title: scaffold?.title || null,
    section_id: sectionId ? String(sectionId) : null,
    status: passed ? 'passed' : 'needs_adjustment',
    created_at: new Date().toISOString(),
    checks: {
      section_exists: !!section,
      child_count: childRecords.length,
      overlap_count: overlapPairs.length,
      out_of_section_count: outOfSection.length,
      unreadable_count: unreadable.length,
      sticky_note_count: stickyRecords.length,
      sticky_note_wrong_type_count: stickyNoteWrongType.length,
      section_contains_children: outOfSection.length === 0,
      min_readable_size_ok: unreadable.length === 0,
      sticky_note_types_ok: stickyNoteWrongType.length === 0,
    },
    details: {
      overlap_pairs: overlapPairs,
      out_of_section_shape_ids: outOfSection,
      unreadable_shape_ids: unreadable,
      sticky_note_wrong_type_shape_ids: stickyNoteWrongType,
      section_bounds: sectionBounds,
      child_bounds: childBounds,
    },
  };
}

function fitSectionToChildren(editor, sectionId, childIds, padding = 56) {
  const section = editor?.getShape?.(sectionId);
  if (!section) return false;
  const sectionBounds = getShapePageBounds(editor, sectionId);
  const childBounds = unionBounds((childIds || []).map((shapeId) => getShapePageBounds(editor, shapeId)));
  if (!sectionBounds || !childBounds) return false;
  const neededRight = childBounds.x + childBounds.w + padding;
  const neededBottom = childBounds.y + childBounds.h + padding;
  const currentRight = sectionBounds.x + sectionBounds.w;
  const currentBottom = sectionBounds.y + sectionBounds.h;
  const nextW = Math.max(section.props?.w || sectionBounds.w, neededRight - sectionBounds.x);
  const nextH = Math.max(section.props?.h || sectionBounds.h, neededBottom - sectionBounds.y);
  if (nextW === section.props?.w && nextH === section.props?.h) return false;
  editor.updateShapes([{
    id: section.id,
    type: 'frame',
    props: {
      ...section.props,
      w: Math.round(nextW),
      h: Math.round(nextH),
    },
    meta: {
      ...(section.meta || {}),
      vd_layout_repaired_at: new Date().toISOString(),
      vd_layout_repair: 'fit_section_to_children',
    },
  }]);
  return true;
}

function scaffoldChildKind(shape) {
  const kind = shape?.meta?.vd_kind || '';
  if (kind) return kind;
  if (shape?.type === 'note') return 'sticky_note';
  return 'shape';
}

function updateShapeLayout(editor, shape, layout, timestamp) {
  if (!shape) return null;
  const nextProps = { ...(shape.props || {}) };
  if (shape.type === 'note') {
    nextProps.scale = Math.max(0.75, Math.min(1.3, Number(layout.w || 200) / 200));
  } else {
    nextProps.w = Math.round(layout.w);
    nextProps.h = Math.round(layout.h);
    if (Object.hasOwn(nextProps, 'growY')) nextProps.growY = 0;
  }
  return {
    id: shape.id,
    type: shape.type,
    x: Math.round(layout.x),
    y: Math.round(layout.y),
    props: nextProps,
    meta: {
      ...(shape.meta || {}),
      vd_layout_reflowed_at: timestamp,
    },
  };
}

function reflowScaffoldChildren(editor, sectionId, childIds) {
  const section = editor?.getShape?.(sectionId);
  if (!section) return [];
  const sectionW = Math.max(1120, Number(section.props?.w || DEFAULT_SECTION_SIZE.w));
  const sectionH = Math.max(760, Number(section.props?.h || DEFAULT_SECTION_SIZE.h));
  const children = (childIds || [])
    .map((shapeId) => editor?.getShape?.(shapeId))
    .filter(Boolean);
  if (children.length === 0) return [];

  const outer = 56;
  const gap = 32;
  const rightColumnW = 240;
  const timestamp = new Date().toISOString();
  const nextActions = children.filter((shape) => scaffoldChildKind(shape) === 'next_action');
  const agentNotes = children.filter((shape) => scaffoldChildKind(shape) === 'agent_note');
  const stickyNotes = children.filter((shape) => scaffoldChildKind(shape) === 'sticky_note');
  const contentShapes = children.filter((shape) => {
    const kind = scaffoldChildKind(shape);
    return kind !== 'next_action' && kind !== 'agent_note' && kind !== 'sticky_note';
  });
  const updates = [];
  let maxBottom = outer;

  const nextColumnX = nextActions.length > 0 ? Math.max(outer, sectionW - rightColumnW - outer) : sectionW;
  agentNotes.forEach((shape, index) => {
    const layout = {
      x: outer,
      y: outer + index * 176,
      w: Math.min(560, Math.max(360, nextColumnX - outer - gap)),
      h: 152,
    };
    updates.push(updateShapeLayout(editor, shape, layout, timestamp));
    maxBottom = Math.max(maxBottom, layout.y + layout.h);
  });

  nextActions.forEach((shape, index) => {
    const layout = {
      x: nextColumnX,
      y: 120 + index * 126,
      w: rightColumnW,
      h: 96,
    };
    updates.push(updateShapeLayout(editor, shape, layout, timestamp));
    maxBottom = Math.max(maxBottom, layout.y + layout.h);
  });

  const stickyStartY = Math.max(agentNotes.length > 0 ? 276 : 128, maxBottom + 36);
  const stickySize = 200;
  const stickyAreaW = Math.max(stickySize, (nextActions.length > 0 ? nextColumnX - gap : sectionW - outer) - outer);
  const stickyCols = Math.max(1, Math.min(3, Math.floor((stickyAreaW + gap) / (stickySize + gap))));
  stickyNotes.forEach((shape, index) => {
    const col = index % stickyCols;
    const row = Math.floor(index / stickyCols);
    const layout = {
      x: outer + col * (stickySize + gap),
      y: stickyStartY + row * (stickySize + gap),
      w: stickySize,
      h: stickySize,
    };
    updates.push(updateShapeLayout(editor, shape, layout, timestamp));
    maxBottom = Math.max(maxBottom, layout.y + layout.h);
  });

  const contentStartY = Math.max(560, maxBottom + 48);
  const contentCols = Math.max(1, Math.min(2, contentShapes.length));
  const contentW = contentCols === 1
    ? Math.min(520, sectionW - outer * 2)
    : Math.max(320, (sectionW - outer * 2 - gap) / 2);
  contentShapes.forEach((shape, index) => {
    const col = index % contentCols;
    const row = Math.floor(index / contentCols);
    const layout = {
      x: outer + col * (contentW + gap),
      y: contentStartY + row * 200,
      w: contentW,
      h: 160,
    };
    updates.push(updateShapeLayout(editor, shape, layout, timestamp));
    maxBottom = Math.max(maxBottom, layout.y + layout.h);
  });

  const neededH = Math.max(sectionH, maxBottom + outer);
  updates.push({
    id: section.id,
    type: section.type,
    props: {
      ...(section.props || {}),
      w: Math.round(sectionW),
      h: Math.round(neededH),
    },
    meta: {
      ...(section.meta || {}),
      vd_layout_repaired_at: timestamp,
      vd_layout_repair: 'reflow_scaffold_children',
    },
  });
  const validUpdates = updates.filter(Boolean);
  editor.updateShapes(validUpdates);
  return validUpdates.map((shape) => String(shape.id));
}

function recordScaffoldReview(editor, sectionId, review) {
  const section = editor?.getShape?.(sectionId);
  if (!section || !review) return false;
  editor.updateShapes([{
    id: section.id,
    type: section.type,
    meta: {
      ...(section.meta || {}),
      vd_layout_review: review,
    },
  }]);
  return true;
}

function reviewAndRepairScaffoldLayout(editor, { sectionId, childIds, scaffold }) {
  const before = auditScaffoldLayout(editor, { sectionId, childIds, scaffold });
  const mutatedShapeIds = [];
  const repairs = [];
  if (before.checks.out_of_section_count > 0) {
    const fitted = fitSectionToChildren(editor, sectionId, childIds);
    if (fitted) {
      repairs.push('fit_section_to_children');
      mutatedShapeIds.push(String(sectionId));
    }
  }
  if (before.checks.overlap_count > 0 || before.checks.unreadable_count > 0) {
    const reflowedIds = reflowScaffoldChildren(editor, sectionId, childIds);
    if (reflowedIds.length > 0) {
      repairs.push('reflow_scaffold_children');
      mutatedShapeIds.push(...reflowedIds);
    }
  }
  const repaired = repairs.length > 0;
  const after = repaired ? auditScaffoldLayout(editor, { sectionId, childIds, scaffold }) : before;
  const review = {
    ...after,
    initial_status: before.status,
    repaired,
    repairs,
    mutated_shape_ids: Array.from(new Set(mutatedShapeIds)),
    before_checks: before.checks,
  };
  recordScaffoldReview(editor, sectionId, review);
  return review;
}

function seedWorkspace(editor) {
  const existingShapes = editor.getCurrentPageShapes?.() || [];
  if (existingShapes.length > 0) return;
  editor.zoomToFit?.();
}

function CanvasHtmlComponentOverlay({ component, tokens, onSelect, onFeedback }) {
  const bodyHeight = Math.max(80, component.h);
  return (
    <div
      data-vd-canvas-html-component={component.componentId}
      style={STYLES.htmlComponentOverlay(component)}
    >
      <button type="button" style={STYLES.htmlComponentSelectButton} onClick={() => onSelect(component)}>
        选中
      </button>
      <div style={STYLES.htmlComponentBody(bodyHeight, component.interactive)}>
        <GeneratedContentFrame
          html={component.html}
          tokens={tokens}
          onAnnotation={(item) => onFeedback(component, item)}
          onInteractive={(item) => onFeedback(component, item)}
          title={component.title}
          defaultHeight={bodyHeight}
          fitContainer
          transparent
        />
      </div>
    </div>
  );
}

const STYLES = {
  page: {
    display: 'grid',
    gridTemplateColumns: 'clamp(220px, 18vw, 300px) minmax(0, 1fr)',
    gap: 'var(--vd-space-4)',
    minHeight: 'calc(100dvh - 32px)',
    width: '100%',
  },
  panel: {
    minHeight: 0,
    border: '1px solid var(--vd-border-subtle)',
    borderRadius: 'var(--vd-radius-md)',
    background: 'var(--vd-surface-bg)',
    overflow: 'hidden',
  },
  navPanel: {
    display: 'flex',
    flexDirection: 'column',
  },
  panelHeader: {
    padding: 'var(--vd-space-4)',
    borderBottom: '1px solid var(--vd-border-subtle)',
  },
  title: {
    fontSize: 'var(--vd-font-size-lg)',
    fontWeight: 'var(--vd-font-weight-semibold)',
    color: 'var(--vd-text-primary)',
    margin: 0,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 'var(--vd-font-size-xs)',
    color: 'var(--vd-text-tertiary)',
    lineHeight: 1.4,
  },
  createButton: {
    width: '100%',
    marginTop: 'var(--vd-space-3)',
    border: 'none',
    borderRadius: 'var(--vd-radius-md)',
    background: 'var(--vd-primary)',
    color: 'var(--vd-text-inverse)',
    padding: '9px 12px',
    fontSize: 'var(--vd-font-size-sm)',
    fontWeight: 'var(--vd-font-weight-medium)',
    cursor: 'pointer',
  },
  list: {
    flex: 1,
    overflowY: 'auto',
    padding: 'var(--vd-space-2)',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  listItem: (active) => ({
    width: '100%',
    border: `1px solid ${active ? 'var(--vd-primary-border)' : 'transparent'}`,
    borderRadius: 'var(--vd-radius-md)',
    background: active ? 'var(--vd-primary-bg)' : 'transparent',
    color: 'var(--vd-text-primary)',
    cursor: 'pointer',
    textAlign: 'left',
    padding: 'var(--vd-space-3)',
  }),
  itemTitle: {
    fontSize: 'var(--vd-font-size-sm)',
    fontWeight: 'var(--vd-font-weight-semibold)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  itemMeta: {
    display: 'flex',
    gap: 6,
    flexWrap: 'wrap',
    marginTop: 6,
    fontSize: 'var(--vd-font-size-xs)',
    color: 'var(--vd-text-tertiary)',
  },
  canvasPanel: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
  },
  canvasPanelFullscreen: {
    position: 'fixed',
    inset: 0,
    zIndex: 50,
    border: 'none',
    borderRadius: 0,
    background: 'var(--vd-surface-bg)',
  },
  canvasHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 'var(--vd-space-4)',
    padding: 'var(--vd-space-4)',
    borderBottom: '1px solid var(--vd-border-subtle)',
    background: 'var(--vd-surface-bg)',
  },
  headerActions: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 'var(--vd-space-2)',
    flexWrap: 'wrap',
  },
  canvasTitle: {
    margin: 0,
    color: 'var(--vd-text-primary)',
    fontSize: 'var(--vd-font-size-xl)',
    fontWeight: 'var(--vd-font-weight-bold)',
  },
  canvasMeta: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 'var(--vd-space-2)',
    marginTop: 8,
    color: 'var(--vd-text-tertiary)',
    fontSize: 'var(--vd-font-size-xs)',
  },
  tag: {
    border: '1px solid var(--vd-border-default)',
    borderRadius: 'var(--vd-radius-xl)',
    padding: '3px 8px',
    background: 'var(--vd-page-bg)',
  },
  ghostButton: {
    border: '1px solid var(--vd-border-default)',
    borderRadius: 'var(--vd-radius-md)',
    background: 'var(--vd-surface-bg)',
    color: 'var(--vd-text-secondary)',
    padding: '7px 10px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  canvasArea: {
    flex: 1,
    minHeight: 560,
    background: 'var(--vd-page-bg)',
    position: 'relative',
    overflow: 'hidden',
  },
  canvasAreaFullscreen: {
    minHeight: 0,
  },
  canvasToolPopover: {
    position: 'absolute',
    bottom: 72,
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 380,
    width: 'min(360px, calc(100% - 24px))',
    maxHeight: 'min(360px, calc(100% - 120px))',
    display: 'flex',
    flexDirection: 'column',
    border: '1px solid rgba(148, 163, 184, .34)',
    borderRadius: 8,
    background: 'rgba(255, 255, 255, .98)',
    boxShadow: '0 16px 36px rgba(15, 23, 42, .18)',
    pointerEvents: 'auto',
    overflow: 'hidden',
  },
  canvasToolPopoverHeader: {
    padding: '10px 12px',
    borderBottom: '1px solid var(--vd-border-subtle)',
  },
  canvasToolPopoverTitle: {
    color: 'var(--vd-text-primary)',
    fontSize: 'var(--vd-font-size-sm)',
    fontWeight: 'var(--vd-font-weight-semibold)',
  },
  canvasToolPopoverMeta: {
    marginTop: 3,
    color: 'var(--vd-text-tertiary)',
    fontSize: 'var(--vd-font-size-xs)',
  },
  canvasToolPopoverList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    padding: 8,
    overflowY: 'auto',
  },
  canvasScaffoldItem: {
    width: '100%',
    border: '1px solid var(--vd-border-default)',
    borderRadius: 8,
    background: 'var(--vd-page-bg)',
    color: 'var(--vd-text-primary)',
    padding: 10,
    textAlign: 'left',
    cursor: 'pointer',
  },
  canvasScaffoldTitle: {
    fontSize: 'var(--vd-font-size-sm)',
    fontWeight: 'var(--vd-font-weight-semibold)',
  },
  canvasScaffoldDescription: {
    marginTop: 5,
    color: 'var(--vd-text-tertiary)',
    fontSize: 'var(--vd-font-size-xs)',
    lineHeight: 1.45,
  },
  canvasScaffoldAction: {
    display: 'inline-flex',
    alignItems: 'center',
    minHeight: 30,
    marginTop: 10,
    padding: '5px 9px',
    border: '1px solid var(--vd-color-primary-border, rgba(37, 99, 235, 0.28))',
    borderRadius: 7,
    color: 'var(--vd-color-primary, #2563eb)',
    background: 'var(--vd-color-primary-soft, rgba(37, 99, 235, 0.08))',
    fontSize: 'var(--vd-font-size-xs)',
    fontWeight: 'var(--vd-font-weight-medium)',
  },
  sourceHighlightPanel: {
    position: 'absolute',
    left: 0,
    bottom: 46,
    zIndex: 'var(--tl-layer-panels)',
    pointerEvents: 'all',
  },
  htmlOverlayLayer: {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
    zIndex: 20,
  },
  htmlComponentOverlay: (component) => ({
    position: 'absolute',
    left: component.x,
    top: component.y,
    width: component.w,
    height: component.h,
    minWidth: 120,
    minHeight: 96,
    pointerEvents: 'auto',
    background: 'transparent',
  }),
  htmlComponentSelectButton: {
    position: 'absolute',
    top: -28,
    right: 0,
    border: '1px solid rgba(37, 99, 235, 0.32)',
    borderRadius: 6,
    background: 'rgba(255,255,255,.92)',
    color: '#2563eb',
    fontSize: 11,
    padding: '3px 7px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  htmlComponentBody: (height, interactive) => ({
    height,
    minHeight: 80,
    background: 'transparent',
    pointerEvents: interactive ? 'auto' : 'none',
  }),
  highlightOverlay: (item) => {
    const isAgent = item.author === 'agent';
    const isMixed = item.author === 'mixed';
    const isCompletion = item.kind === 'completion_request';
    const color = isCompletion || isAgent ? '124, 58, 237' : isMixed ? '14, 165, 233' : '245, 158, 11';
    return {
      position: 'absolute',
      left: item.x,
      top: item.y,
      width: item.w,
      height: item.h,
      border: `2px solid rgba(${color}, .72)`,
      background: `rgba(${color}, .12)`,
      boxShadow: isCompletion ? `0 0 0 4px rgba(${color}, .12), 0 0 22px rgba(${color}, .42)` : 'none',
      borderRadius: 8,
      pointerEvents: 'none',
    };
  },
  completionRequestOverlay: (item) => ({
    position: 'absolute',
    left: item.x,
    top: item.y,
    width: item.w,
    height: item.h,
    border: '2px solid rgba(124, 58, 237, .84)',
    background: 'rgba(124, 58, 237, .12)',
    boxShadow: '0 0 0 4px rgba(124, 58, 237, .12), 0 0 24px rgba(124, 58, 237, .42)',
    borderRadius: 8,
    pointerEvents: 'none',
  }),
  empty: {
    padding: 'var(--vd-space-6)',
    color: 'var(--vd-text-tertiary)',
    textAlign: 'center',
    fontSize: 'var(--vd-font-size-sm)',
  },
};

export default function CanvasWorkspace() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tokens = useDesignTokens();
  const [workspaces, setWorkspaces] = useState([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(null);
  const [selectedId, setSelectedId] = useState(searchParams.get('workspace') || null);
  const [workspace, setWorkspace] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [savingState, setSavingState] = useState('已保存');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [toolMessage, setToolMessage] = useState('');
  const [htmlComponents, setHtmlComponents] = useState([]);
  const [authoredOverlays, setAuthoredOverlays] = useState([]);
  const [previewMode, setPreviewMode] = useState('normal');
  const [scaffolds, setScaffolds] = useState([]);
  const [scaffoldPickerOpen, setScaffoldPickerOpen] = useState(false);
  const [completionToolReady, setCompletionToolReady] = useState(false);
  const editorRef = useRef(null);
  const saveTimer = useRef(null);
  const mounted = useRef(false);
  const completionToolActive = useRef(false);
  const knownShapeIds = useRef(new Set());
  const pendingCanvasEvent = useRef(null);

  function refreshHtmlComponents(editor = editorRef.current) {
    setHtmlComponents(editor ? htmlComponentOverlaysFromEditor(editor) : []);
    setAuthoredOverlays(editor ? authoredOverlaysFromEditor(editor) : []);
  }

  async function loadList(preferredId = selectedId) {
    const data = await fetchCanvasWorkspaces();
    const items = data.workspaces || [];
    setWorkspaces(items);
    setActiveWorkspaceId(data.active_workspace_id || null);
    const nextId = preferredId || data.active_workspace_id || items[0]?.id || null;
    if (nextId) setSelectedId(nextId);
    return nextId;
  }

  useEffect(() => {
    let canceled = false;
    setLoading(true);
    Promise.all([
      loadList(),
      fetchScaffolds().then((data) => {
        if (!canceled) setScaffolds(data.scaffolds || []);
      }),
    ])
      .then(() => {
        if (!canceled) setLoading(false);
      })
      .catch(() => {
        if (!canceled) setLoading(false);
      });
    return () => { canceled = true; };
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setWorkspace(null);
      setHtmlComponents([]);
      setScaffoldPickerOpen(false);
      return;
    }
    let canceled = false;
    setDetailLoading(true);
    fetchCanvasWorkspace(selectedId)
      .then((data) => {
        if (canceled) return;
        setWorkspace(data);
        setSearchParams({ workspace: data.id });
      })
      .catch(() => {
        if (!canceled) setWorkspace(null);
      })
      .finally(() => {
        if (!canceled) setDetailLoading(false);
      });
    return () => { canceled = true; };
  }, [selectedId, setSearchParams]);

  useEffect(() => {
    if (!isFullscreen) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setIsFullscreen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

  useEffect(() => () => {
    window.clearTimeout(saveTimer.current);
  }, []);

  async function handleCreateWorkspace() {
    const created = await createCanvasWorkspace({
      title: '协作画布',
      purpose: '持续承载本项目的视觉协作、标注、moodboard 和结构化设计沟通。',
      tags: ['collaboration', 'design'],
      make_active: true,
    });
    await loadList(created.id);
    setSelectedId(created.id);
  }

  async function handleActivate() {
    if (!workspace) return;
    const saved = await activateCanvasWorkspace(workspace.id);
    setWorkspace(saved);
    await loadList(saved.id);
  }

  async function saveSnapshot(editor, nextWorkspace = workspace, event = null) {
    if (!editor || !nextWorkspace) return;
    setSavingState('保存中...');
    try {
      const saved = await updateCanvasWorkspaceSnapshot(nextWorkspace.id, {
        snapshot: getSnapshot(editor.store),
        semantic_index: (() => {
          const index = semanticIndexFromEditor(editor, nextWorkspace);
          const review = event?.meta?.scaffold_review;
          if (review) {
            index.layout_reviews = [
              ...((index.layout_reviews || []).filter((item) => item.id !== review.id)),
              review,
            ].slice(-20);
          }
          return index;
        })(),
        event,
      });
      setWorkspace(saved);
      setSavingState('已保存');
      setWorkspaces((items) => items.map((item) => (
        item.id === saved.id ? { ...item, updated_at: saved.updated_at, last_used_at: saved.last_used_at } : item
      )));
    } catch {
      setSavingState('待重试');
    }
  }

  function markToolMessage(message) {
    setToolMessage(message);
  }

  function currentViewportOrigin(editor, offset = { x: 96, y: 96 }) {
    const viewport = editor?.getViewportPageBounds?.();
    return {
      x: Math.round((viewport?.x || 0) + offset.x),
      y: Math.round((viewport?.y || 0) + offset.y),
    };
  }

  function nextOpenCanvasOrigin(editor) {
    const shapes = editor?.getCurrentPageShapesSorted?.() || editor?.getCurrentPageShapes?.() || [];
    const contentBounds = shapes
      .map((shape) => getShapePageBounds(editor, shape.id))
      .filter(Boolean);
    if (contentBounds.length === 0) return currentViewportOrigin(editor);
    const maxX = Math.max(...contentBounds.map((bounds) => bounds.x + bounds.w));
    const minY = Math.min(...contentBounds.map((bounds) => bounds.y));
    return {
      x: Math.round(maxX + 160),
      y: Math.round(minY),
    };
  }

  function makeCanvasShape({ id, x, y, w, h, text, color = 'blue', kind = 'shape', scaffold = null }) {
    if (kind === 'sticky_note') {
      return {
        id,
        type: 'note',
        x: Math.round(x),
        y: Math.round(y),
        props: {
          color,
          labelColor: 'black',
          size: 'm',
          font: 'draw',
          fontSizeAdjustment: null,
          align: 'middle',
          verticalAlign: 'middle',
          growY: 0,
          url: '',
          richText: toRichText(text || ''),
          scale: Math.max(0.75, Math.min(1.25, Number(w || 200) / 200)),
          textFirstEditedBy: null,
        },
        meta: {
          vd_kind: 'sticky_note',
          vd_created_by: 'agent',
          vd_created_at: new Date().toISOString(),
          ...(scaffold ? {
            vd_scaffold_id: scaffold.id,
            vd_scaffold_title: scaffold.title,
            vd_stage: scaffold.stage,
          } : {}),
        },
      };
    }
    return {
      id,
      type: 'geo',
      x: Math.round(x),
      y: Math.round(y),
      props: {
        geo: 'rectangle',
        w: Math.round(w),
        h: Math.round(h),
        fill: 'solid',
        color,
        richText: toRichText(text || ''),
      },
      meta: {
        vd_kind: kind,
        vd_created_by: 'agent',
        vd_created_at: new Date().toISOString(),
        ...(scaffold ? {
          vd_scaffold_id: scaffold.id,
          vd_scaffold_title: scaffold.title,
          vd_stage: scaffold.stage,
        } : {}),
      },
    };
  }

  function createHtmlComponentShape({ shapeId, title, description, html, bounds, scaffold = null }) {
    return {
      id: shapeId,
      type: 'geo',
      x: Math.round(bounds.x),
      y: Math.round(bounds.y),
      props: {
        geo: 'rectangle',
        w: Math.round(bounds.w),
        h: Math.round(bounds.h),
        fill: 'none',
        color: 'violet',
        richText: toRichText(`${title}\n\nWidget 占位。真实内容由透明 iframe 渲染。`),
      },
      meta: {
        vd_kind: 'html_component',
        vd_title: title,
        vd_description: description || '画布内嵌 widget',
        vd_component_id: String(shapeId),
        vd_html: html || DEFAULT_CANVAS_HTML_COMPONENT,
        vd_created_by: scaffold ? 'agent' : 'user',
        vd_created_at: new Date().toISOString(),
        vd_interactive: true,
        vd_widget_state: scaffold?.state || {},
        vd_input_schema: scaffold?.input_schema || {},
        vd_output_schema: scaffold?.output_schema || {},
        vd_sizing: scaffold?.sizing || {
          mode: 'content_intrinsic',
          min_width: 240,
          max_width: 720,
          min_height: 120,
          max_height: 640,
        },
        ...(scaffold ? {
          vd_scaffold_id: scaffold.id,
          vd_scaffold_title: scaffold.title,
          vd_stage: scaffold.stage,
        } : {}),
      },
    };
  }

  function htmlComponentPlacementBounds(editor) {
    const selectedIds = readSelectedShapeIds(editor);
    const activeSection = getActiveSection(editor, selectedIds);
    if (activeSection) {
      const sectionBounds = getShapePageBounds(editor, activeSection.id);
      if (sectionBounds) {
        return {
          section: activeSection,
          bounds: {
            x: sectionBounds.x + 64,
            y: sectionBounds.y + 96,
            w: DEFAULT_HTML_COMPONENT_SIZE.w,
            h: DEFAULT_HTML_COMPONENT_SIZE.h,
          },
        };
      }
    }
    const viewport = editor?.getViewportPageBounds?.();
    return {
      section: null,
      bounds: {
        x: viewport ? viewport.x + 120 : 0,
        y: viewport ? viewport.y + 120 : 0,
        w: DEFAULT_HTML_COMPONENT_SIZE.w,
        h: DEFAULT_HTML_COMPONENT_SIZE.h,
      },
    };
  }

  function handleAddHtmlComponent(scaffold = null) {
    const editor = editorRef.current;
    if (!editor || !workspace) return;
    const { section, bounds } = htmlComponentPlacementBounds(editor);
    const shapeId = createShapeId(`vd-html-component-${Date.now()}`);
    const title = scaffold?.title || 'HTML 组件';
    const sizing = scaffold?.sizing || {};
    const finalBounds = {
      ...bounds,
      w: Math.round(Math.min(sizing.max_width || bounds.w, Math.max(sizing.min_width || 240, bounds.w))),
      h: Math.round(Math.min(sizing.max_height || bounds.h, Math.max(sizing.min_height || 120, bounds.h))),
    };
    editor.createShapes([
      createHtmlComponentShape({
        shapeId,
        title,
        description: scaffold?.description || '画布内嵌 HTML 组件',
        html: scaffold?.html || DEFAULT_CANVAS_HTML_COMPONENT,
        bounds: finalBounds,
        scaffold,
      }),
    ]);
    if (section) editor.reparentShapes?.([shapeId], section.id);
    editor.setSelectedShapes?.([shapeId]);
    refreshHtmlComponents(editor);
    markToolMessage(section ? `已在 ${section.props?.name || 'Section'} 中添加 ${title}。` : `已添加 ${title}。`);
    window.clearTimeout(saveTimer.current);
    saveSnapshot(editor, workspace, {
      type: scaffold ? 'agent_command_batch' : 'user_command',
      actor: scaffold ? 'agent' : 'user',
      summary: scaffold ? `从脚手架库添加 widget：${title}。${scaffold.agent_note || ''}` : '添加画布 HTML 组件。',
      target: {
        kind: 'html_component',
        workspace_id: workspace.id,
        shape_id: String(shapeId),
        section_id: section ? String(section.id) : null,
      },
      commands: [
        {
          op: 'add_html_component',
          title,
          shape_id: String(shapeId),
          section_id: section ? String(section.id) : null,
          bounds: finalBounds,
          scaffold_id: scaffold?.id || null,
        },
      ],
      created_shape_ids: [String(shapeId)],
      mutated_shape_ids: [],
    });
  }

  function handleSelectHtmlComponent(component) {
    const editor = editorRef.current;
    if (!editor) return;
    editor.setSelectedShapes?.([component.shapeId]);
    markToolMessage(`已选中 HTML 组件：${component.title}`);
  }

  async function handleHtmlComponentFeedback(component, item) {
    if (!workspace) return;
    const payload = item?.payload || {};
    const target = item?.target || {};
    const action = payload.action || 'html_component_feedback';
    const label = target.anchor || payload.label || component.title;
    const note = payload.text || payload.fields?.text || payload.selected_text || '';
    const content = item?.kind === 'annotation'
      ? `HTML 组件批注：${note || label}`
      : `HTML 组件反馈：${label} / ${action}`;
    try {
      const feedback = await addCanvasWorkspaceFeedback(workspace.id, {
        kind: 'html_component',
        content,
        author: 'user',
        target: {
          kind: 'html_component',
          workspace_id: workspace.id,
          shape_id: component.shapeId,
          component_id: component.componentId,
          component_title: component.title,
          bounds: component.pageBounds,
          action,
          payload,
        },
      });
      setWorkspace((current) => {
        if (!current || current.id !== workspace.id) return current;
        return {
          ...current,
          feedback: [...(current.feedback || []), feedback],
          pending_feedback_count: (current.pending_feedback_count || 0) + 1,
        };
      });
      markToolMessage('已记录 HTML 组件反馈。');
    } catch {
      markToolMessage('HTML 组件反馈保存失败。');
    }
  }

  function setCompletionToolMode(active) {
    completionToolActive.current = active;
    setCompletionToolReady(active);
  }

  function completionRequestDrawnEvent(editor, activeWorkspace, shapeId) {
    if (!activeWorkspace) return null;
    const shape = editor?.getShape?.(shapeId);
    const bounds = getShapePageBounds(editor, shapeId);
    const promptText = shape?.meta?.vd_prompt || shapeText(shape);
    return {
      type: 'completion_request_created',
      actor: 'user',
      summary: promptText ? `绘制补全矩形：${promptText}` : '绘制补全矩形。',
      target: {
        kind: 'completion_request',
        workspace_id: activeWorkspace.id,
        shape_id: String(shapeId),
        bounds,
      },
      commands: [
        {
          op: 'add_completion_request',
          prompt: promptText,
          shape_id: String(shapeId),
          bounds,
        },
      ],
      created_shape_ids: [String(shapeId)],
      mutated_shape_ids: [],
    };
  }

  function queueCanvasSnapshotSave(editor, eventFactory, delay = 800) {
    if (eventFactory !== undefined) pendingCanvasEvent.current = eventFactory;
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      const queuedEvent = pendingCanvasEvent.current;
      pendingCanvasEvent.current = null;
      const event = typeof queuedEvent === 'function'
        ? queuedEvent(editor, workspace)
        : queuedEvent;
      saveSnapshot(editor, workspace, event || null);
    }, delay);
  }

  function completionRequestPatch(shape) {
    const now = new Date().toISOString();
    return {
      id: shape.id,
      type: 'geo',
      props: {
        ...(shape?.props || {}),
        geo: 'rectangle',
        color: 'violet',
        fill: 'semi',
        dash: 'solid',
      },
      meta: {
        ...(shape.meta || {}),
        vd_kind: 'completion_request',
        vd_prompt: shape.meta?.vd_prompt || '',
        vd_status: shape.meta?.vd_status || 'open',
        vd_created_by: shape.meta?.vd_created_by || 'user',
        vd_created_at: shape.meta?.vd_created_at || now,
      },
    };
  }

  function applyNewCompletionRequestShape(editor, shape) {
    if (!editor || !shape || shape.type !== 'geo') return false;
    const shapeId = shape.id;
    setCompletionToolMode(false);
    pendingCanvasEvent.current = (latestEditor, activeWorkspace) => (
      completionRequestDrawnEvent(latestEditor, activeWorkspace, shapeId)
    );
    editor.updateShapes([completionRequestPatch(shape)]);
    editor.setSelectedShapes?.([shapeId]);
    refreshHtmlComponents(editor);
    markToolMessage('已绘制补全矩形。双击矩形即可直接输入批注。');
    return true;
  }

  function processCompletionToolShapeChanges(editor) {
    const shapes = currentPageShapes(editor);
    const previousIds = knownShapeIds.current;
    const nextIds = new Set(shapes.map((shape) => String(shape.id)));
    const createdShapes = shapes.filter((shape) => !previousIds.has(String(shape.id)));
    knownShapeIds.current = nextIds;
    if (!completionToolActive.current || createdShapes.length === 0) return false;
    const geoShape = createdShapes.find((shape) => shape.type === 'geo');
    if (geoShape) return applyNewCompletionRequestShape(editor, geoShape);
    setCompletionToolMode(false);
    return false;
  }

  function handleSelectCompletionRequestTool() {
    const editor = editorRef.current;
    if (!editor || !workspace) return;
    setScaffoldPickerOpen(false);
    setCompletionToolMode(true);
    try {
      editor.run(() => {
        editor.setStyleForNextShapes?.(GeoShapeGeoStyle, 'rectangle');
        editor.setStyleForNextShapes?.(DefaultColorStyle, 'violet');
        editor.setStyleForNextShapes?.(DefaultFillStyle, 'semi');
        editor.setCurrentTool?.('geo');
      });
    } catch {
      editor.setCurrentTool?.('geo');
    }
    markToolMessage('拖拽添加紫色补全矩形，完成后双击添加批注。');
  }

  function handleInsertScaffold(scaffold) {
    const editor = editorRef.current;
    if (!editor || !workspace || !scaffold) return;
    setCompletionToolMode(false);
    setScaffoldPickerOpen(false);
    if (scaffold.type === 'widget') {
      handleAddHtmlComponent(scaffold);
      return;
    }
    const origin = nextOpenCanvasOrigin(editor);
    const sectionSpec = scaffold.structure?.find((item) => item.kind === 'section');
    const sectionBounds = sectionSpec?.bounds || { x: 0, y: 0, w: DEFAULT_SECTION_SIZE.w, h: DEFAULT_SECTION_SIZE.h };
    const sectionId = createShapeId(`vd-scaffold-${scaffold.id}-${Date.now()}`);
    const createdIds = [String(sectionId)];
    const shapes = [
      {
        id: sectionId,
        type: 'frame',
        x: origin.x + Math.round(sectionBounds.x || 0),
        y: origin.y + Math.round(sectionBounds.y || 0),
        props: {
          name: sectionSpec?.title || scaffold.title,
          w: Math.round(sectionBounds.w || DEFAULT_SECTION_SIZE.w),
          h: Math.round(sectionBounds.h || DEFAULT_SECTION_SIZE.h),
          color: 'violet',
        },
        meta: {
          vd_kind: 'section',
          vd_created_by: 'agent',
          vd_created_at: new Date().toISOString(),
          vd_scaffold_id: scaffold.id,
          vd_scaffold_title: scaffold.title,
          vd_stage: scaffold.stage,
        },
      },
    ];

    const childIds = [];
    if (scaffold.agent_note) {
      const noteId = createShapeId(`vd-agent-note-${Date.now()}`);
      childIds.push(noteId);
      createdIds.push(String(noteId));
      shapes.push(makeCanvasShape({
        id: noteId,
        x: origin.x + 40,
        y: origin.y + 40,
        w: 360,
        h: 92,
        text: `Agent 说明\n\n${scaffold.agent_note}`,
        color: 'violet',
        kind: 'agent_note',
        scaffold,
      }));
    }

    (scaffold.seed_content || []).forEach((item, index) => {
      const bounds = item.bounds || { x: 48 + index * 240, y: 160, w: 220, h: 140 };
      const shapeId = createShapeId(`vd-${scaffold.id}-${index}-${Date.now()}`);
      childIds.push(shapeId);
      createdIds.push(String(shapeId));
      shapes.push(makeCanvasShape({
        id: shapeId,
        x: origin.x + Math.round(bounds.x || 0),
        y: origin.y + Math.round(bounds.y || 0),
        w: bounds.w || 220,
        h: bounds.h || 140,
        text: item.text,
        color: item.color || (item.kind === 'sticky_note' ? 'yellow' : 'blue'),
        kind: item.kind || 'canvas_node',
        scaffold,
      }));
    });

    (scaffold.next_actions || []).forEach((action, index) => {
      const shapeId = createShapeId(`vd-next-action-${index}-${Date.now()}`);
      childIds.push(shapeId);
      createdIds.push(String(shapeId));
      shapes.push(makeCanvasShape({
        id: shapeId,
        x: origin.x + 820,
        y: origin.y + 96 + index * 88,
        w: 240,
        h: 64,
        text: `下一步\n${action}`,
        color: 'light-blue',
        kind: 'next_action',
        scaffold,
      }));
    });

    editor.createShapes(shapes);
    if (childIds.length > 0) editor.reparentShapes?.(childIds, sectionId);
    editor.sendToBack?.([sectionId]);
    const scaffoldReview = reviewAndRepairScaffoldLayout(editor, { sectionId, childIds, scaffold });
    editor.setSelectedShapes?.([sectionId]);
    editor.zoomToSelection?.();
    refreshHtmlComponents(editor);
    markToolMessage(scaffoldReview.status === 'passed'
      ? `已添加脚手架：${scaffold.title}，布局检查通过。`
      : `已添加脚手架：${scaffold.title}，布局仍需调整。`);
    window.clearTimeout(saveTimer.current);
    saveSnapshot(editor, workspace, {
      type: 'agent_command_batch',
      actor: 'agent',
      summary: `添加协作脚手架：${scaffold.title}。${scaffold.agent_note || ''} 布局检查：${scaffoldReview.status}。`,
      target: {
        kind: 'canvas_workspace',
        workspace_id: workspace.id,
        scaffold_id: scaffold.id,
      },
      commands: [
        {
          op: 'add_collaboration_scaffold',
          scaffold_id: scaffold.id,
          title: scaffold.title,
          stage: scaffold.stage,
          includes_seed_content: (scaffold.seed_content || []).length > 0,
          bounds: {
            x: origin.x + Math.round(sectionBounds.x || 0),
            y: origin.y + Math.round(sectionBounds.y || 0),
            w: sectionBounds.w || DEFAULT_SECTION_SIZE.w,
            h: sectionBounds.h || DEFAULT_SECTION_SIZE.h,
          },
        },
        {
          op: 'review_scaffold_layout',
          scaffold_id: scaffold.id,
          status: scaffoldReview.status,
          checks: scaffoldReview.checks,
          repairs: scaffoldReview.repairs,
        },
      ],
      created_shape_ids: createdIds,
      mutated_shape_ids: scaffoldReview.mutated_shape_ids || (scaffoldReview.repaired ? [String(sectionId)] : []),
      meta: {
        scaffold_review: scaffoldReview,
      },
    });
  }

  function handleCreateSection() {
    const editor = editorRef.current;
    if (!editor) return;
    const selectedIds = readSelectedShapeIds(editor);
    const childIds = selectedIds.filter((shapeId) => {
      const shape = editor.getShape?.(shapeId);
      return shape && !isCanvasSectionShape(shape);
    });
    const bounds = sectionBoundsFromSelection(editor, childIds);
    const sectionId = createShapeId(`vd-section-${Date.now()}`);
    const nextIndex = summarizeCanvasSections(editor).length + 1;
    editor.createShapes([
      {
        id: sectionId,
        type: 'frame',
        x: Math.round(bounds.x),
        y: Math.round(bounds.y),
        props: {
          name: `Section ${nextIndex}`,
          w: Math.round(bounds.w),
          h: Math.round(bounds.h),
          color: 'blue',
        },
        meta: {
          vd_kind: 'section',
          vd_created_by: 'user',
          vd_created_at: new Date().toISOString(),
        },
      },
    ]);
    if (childIds.length > 0) {
      editor.reparentShapes(childIds, sectionId);
    }
    editor.sendToBack?.([sectionId]);
    editor.setSelectedShapes?.([sectionId]);
    markToolMessage(childIds.length > 0 ? `已创建 Section，并收入 ${childIds.length} 个对象。` : '已创建空 Section。');
  }

  function handleDuplicateSection() {
    const editor = editorRef.current;
    if (!editor) return;
    const selectedSections = readSelectedShapeIds(editor)
      .map((shapeId) => editor.getShape?.(shapeId))
      .filter(isCanvasSectionShape);
    const sectionsToDuplicate = selectedSections.length > 0
      ? selectedSections
      : (() => {
        const activeSection = getActiveSection(editor, readSelectedShapeIds(editor));
        return activeSection ? [activeSection] : [];
      })();
    if (sectionsToDuplicate.length === 0) {
      markToolMessage('请先选择一个 Section。');
      return;
    }
    editor.duplicateShapes?.(sectionsToDuplicate.map((section) => section.id), SECTION_DUPLICATE_OFFSET);
    markToolMessage(`已复制 ${sectionsToDuplicate.length} 个 Section。`);
  }

  function handleOrganizeSection() {
    const editor = editorRef.current;
    const section = getActiveSection(editor, readSelectedShapeIds(editor));
    if (!editor || !section) {
      markToolMessage('请先选择一个 Section 或其中的对象。');
      return;
    }
    const childIds = (editor.getSortedChildIdsForParent?.(section.id) || [])
      .filter((shapeId) => {
        const child = editor.getShape?.(shapeId);
        return child && !isCanvasSectionShape(child);
      });
    if (childIds.length === 0) {
      markToolMessage('这个 Section 里还没有可整理的对象。');
      return;
    }
    const groups = childIds
      .map((shapeId) => editor.getShape?.(shapeId))
      .filter(Boolean)
      .reduce((acc, shape) => {
        const key = categorizeSectionChild(shape);
        acc[key].push(shape);
        return acc;
      }, { media: [], notes: [], diagram: [], other: [] });

    groups.media.sort((a, b) => {
      const sizeA = localShapeSize(editor, a);
      const sizeB = localShapeSize(editor, b);
      return (sizeB.w * sizeB.h) - (sizeA.w * sizeA.h);
    });

    const columns = [
      { key: 'media', x: 56, y: 88, w: 360, maxW: 340, maxH: 220 },
      { key: 'notes', x: 470, y: 88, w: 340, maxW: 320, maxH: 180 },
      { key: 'diagram', x: 860, y: 88, w: 340, maxW: 320, maxH: 160 },
      { key: 'other', x: 1250, y: 88, w: 300, maxW: 280, maxH: 150 },
    ];
    const patches = [];
    let maxBottom = 0;
    for (const column of columns) {
      let y = column.y;
      groups[column.key].forEach((shape, index) => {
        const size = localShapeSize(editor, shape);
        const scale = Math.min(1, column.maxW / size.w, column.maxH / size.h);
        const nextSize = {
          w: Math.max(48, Math.round(size.w * scale)),
          h: Math.max(36, Math.round(size.h * scale)),
        };
        const props = resizablePatch(shape, nextSize);
        patches.push({
          id: shape.id,
          type: shape.type,
          x: column.x,
          y,
          props,
          meta: {
            ...(shape.meta || {}),
            vd_section_id: String(section.id),
            vd_sort_category: column.key,
            vd_sort_index: String(index + 1),
          },
        });
        y += nextSize.h + 28;
      });
      maxBottom = Math.max(maxBottom, y);
    }
    const nextWidth = Math.max(section.props?.w || 0, 1640);
    const nextHeight = Math.max(section.props?.h || 0, maxBottom + 64, 520);
    patches.push({
      id: section.id,
      type: 'frame',
      props: {
        w: Math.round(nextWidth),
        h: Math.round(nextHeight),
        name: section.props?.name || 'Section',
        color: section.props?.color || 'blue',
      },
      meta: {
        ...(section.meta || {}),
        vd_kind: 'section',
        vd_organized_at: new Date().toISOString(),
        vd_organization: 'media_notes_diagram_other_columns',
      },
    });
    editor.updateShapes(patches);
    editor.setSelectedShapes?.([section.id]);
    markToolMessage(`已整理 Section：${section.props?.name || section.id}。`);
  }

  function handleMount(editor) {
    editorRef.current = editor;
    mounted.current = false;
    const snapshot = workspace?.snapshot;
    if (snapshot?.document || snapshot?.store) {
      try {
        loadSnapshot(editor.store, snapshot);
        editor.clearHistory?.();
      } catch {
        seedWorkspace(editor);
      }
    } else {
      seedWorkspace(editor);
    }
    refreshHtmlComponents(editor);
    knownShapeIds.current = shapeIdSet(editor);
    mounted.current = true;
    const handleResize = () => refreshHtmlComponents(editor);
    window.addEventListener('resize', handleResize);
    const container = editor.getContainer?.();
    // 补全矩形的批注走 tldraw 原生双击文字编辑，无需自定义双击拦截。
    const handleToolbarPointerDown = (event) => {
      if (!completionToolActive.current) return;
      const target = event.target;
      if (target?.closest?.('[data-testid="tools.vd-completion-rectangle"]')) return;
      if (target?.closest?.('.tlui-main-toolbar')) setCompletionToolMode(false);
    };
    document.addEventListener('pointerdown', handleToolbarPointerDown, true);
    const unsubscribe = editor.store.listen(() => {
      if (!mounted.current) return;
      processCompletionToolShapeChanges(editor);
      refreshHtmlComponents(editor);
      queueCanvasSnapshotSave(editor);
    });
    return () => {
      window.clearTimeout(saveTimer.current);
      mounted.current = false;
      editorRef.current = null;
      setCompletionToolMode(false);
      knownShapeIds.current = new Set();
      pendingCanvasEvent.current = null;
      setHtmlComponents([]);
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('pointerdown', handleToolbarPointerDown, true);
      unsubscribe?.();
    };
  }

  const tldrawComponents = useMemo(() => {
    function VisualDeliveryToolbar() {
      return (
        <DefaultToolbar>
          <TldrawUiToolbarButton
            type="tool"
            title="补全矩形"
            data-testid="tools.vd-completion-rectangle"
            data-value="vd-completion-rectangle"
            isActive={completionToolReady}
            onClick={handleSelectCompletionRequestTool}
          >
            <TldrawUiButtonIcon icon="geo-rectangle" />
          </TldrawUiToolbarButton>
          <TldrawUiToolbarButton
            type="tool"
            title="脚手架"
            data-testid="tools.vd-scaffold-library"
            data-value="vd-scaffold-library"
            isActive={scaffoldPickerOpen}
            onClick={() => {
              setCompletionToolMode(false);
              setScaffoldPickerOpen((value) => !value);
            }}
          >
            <TldrawUiButtonIcon icon="pack" />
          </TldrawUiToolbarButton>
          <DefaultToolbarContent />
        </DefaultToolbar>
      );
    }

    function VisualDeliveryNavigationPanel() {
      return (
        <>
          <DefaultNavigationPanel />
          <div style={STYLES.sourceHighlightPanel}>
            <TldrawUiToolbar orientation="horizontal" label="来源高亮">
              <TldrawUiToolbarButton
                type="icon"
                title={previewMode === 'highlight' ? '普通预览' : '来源高亮'}
                data-testid="navigation.vd-source-highlight"
                isActive={previewMode === 'highlight'}
                onClick={() => setPreviewMode((mode) => (mode === 'highlight' ? 'normal' : 'highlight'))}
              >
                <TldrawUiButtonIcon small icon="highlight" />
              </TldrawUiToolbarButton>
            </TldrawUiToolbar>
          </div>
        </>
      );
    }

    return {
      Toolbar: VisualDeliveryToolbar,
      NavigationPanel: VisualDeliveryNavigationPanel,
    };
  }, [completionToolReady, previewMode, scaffoldPickerOpen, workspace]);

  if (loading) {
    return <div style={STYLES.empty}>正在读取画布工作区...</div>;
  }

  return (
    <div style={STYLES.page}>
      <aside style={{ ...STYLES.panel, ...STYLES.navPanel }}>
        <div style={STYLES.panelHeader}>
          <h1 style={STYLES.title}>画布</h1>
          <div style={STYLES.subtitle}>持续协作空间，默认复用相关活跃画布。</div>
          <button type="button" style={STYLES.createButton} onClick={handleCreateWorkspace}>
            新建画布
          </button>
        </div>
        <div style={STYLES.list}>
          {workspaces.length === 0 ? (
            <div style={STYLES.empty}>还没有画布。</div>
          ) : workspaces.map((item) => (
            <button
              type="button"
              key={item.id}
              style={STYLES.listItem(item.id === selectedId)}
              onClick={() => setSelectedId(item.id)}
            >
              <div style={STYLES.itemTitle}>{item.title}</div>
              <div style={STYLES.itemMeta}>
                {item.id === activeWorkspaceId && <span>当前</span>}
                <span>{formatDate(item.last_used_at || item.updated_at)}</span>
              </div>
            </button>
          ))}
        </div>
      </aside>

      <main style={{ ...STYLES.panel, ...STYLES.canvasPanel, ...(isFullscreen ? STYLES.canvasPanelFullscreen : {}) }}>
        {!workspace && (
          <div style={STYLES.empty}>选择一个画布，或新建画布开始协作。</div>
        )}
        {workspace && (
          <>
            <header style={STYLES.canvasHeader}>
              <div>
                <h2 style={STYLES.canvasTitle}>{workspace.title}</h2>
                <div style={STYLES.canvasMeta}>
                  <span style={STYLES.tag}>{workspace.type}</span>
                  <span style={STYLES.tag}>{savingState}</span>
                  <span style={STYLES.tag}>更新 {formatDate(workspace.updated_at)}</span>
                  {(workspace.tags || []).map((tag) => <span key={tag} style={STYLES.tag}>{tag}</span>)}
                  {toolMessage && <span style={STYLES.tag}>{toolMessage}</span>}
                </div>
              </div>
              <div style={STYLES.headerActions}>
                <button type="button" style={STYLES.ghostButton} onClick={() => setIsFullscreen((value) => !value)}>
                  {isFullscreen ? '退出全屏' : '全屏查看'}
                </button>
                <button type="button" style={STYLES.ghostButton} onClick={handleActivate}>
                  设为当前
                </button>
              </div>
            </header>
            {detailLoading ? (
              <div style={STYLES.empty}>正在加载画布...</div>
            ) : (
              <div style={{ ...STYLES.canvasArea, ...(isFullscreen ? STYLES.canvasAreaFullscreen : {}) }}>
                <Tldraw
                  key={workspace.id}
                  persistenceKey={`vd-canvas-workspace-${workspace.id}`}
                  shapeUtils={CANVAS_SHAPE_UTILS}
                  components={tldrawComponents}
                  onMount={handleMount}
                />
                {scaffoldPickerOpen && (
                  <div
                    style={STYLES.canvasToolPopover}
                    onPointerDown={(event) => event.stopPropagation()}
                    onWheel={(event) => event.stopPropagation()}
                  >
                    <div style={STYLES.canvasToolPopoverHeader}>
                      <div style={STYLES.canvasToolPopoverTitle}>脚手架库</div>
                      <div style={STYLES.canvasToolPopoverMeta}>Templates / Widgets / Project variants</div>
                    </div>
                    <div style={STYLES.canvasToolPopoverList}>
                      {scaffolds.length === 0 ? (
                        <div style={STYLES.empty}>还没有脚手架。</div>
                      ) : scaffolds.map((scaffold) => (
                        <button
                          type="button"
                          key={scaffold.id}
                          style={STYLES.canvasScaffoldItem}
                          onClick={() => handleInsertScaffold(scaffold)}
                        >
                          <div style={STYLES.itemMeta}>
                            <span>{scaffold.type}</span>
                            <span>{scaffold.stage}</span>
                          </div>
                          <div style={STYLES.canvasScaffoldTitle}>{scaffold.title}</div>
                          <div style={STYLES.canvasScaffoldDescription}>{scaffold.description}</div>
                          <span style={STYLES.canvasScaffoldAction}>添加到画布</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div style={STYLES.htmlOverlayLayer}>
                  {authoredOverlays.filter((item) => item.kind === 'completion_request').map((item) => (
                    <div key={`completion-${item.shapeId}`} style={STYLES.completionRequestOverlay(item)} />
                  ))}
                  {previewMode === 'highlight' && authoredOverlays.filter((item) => item.kind !== 'completion_request').map((item) => (
                    <div key={item.shapeId} style={STYLES.highlightOverlay(item)} />
                  ))}
                  {htmlComponents.map((component) => (
                    <CanvasHtmlComponentOverlay
                      key={component.shapeId}
                      component={component}
                      tokens={tokens}
                      onSelect={handleSelectHtmlComponent}
                      onFeedback={handleHtmlComponentFeedback}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
