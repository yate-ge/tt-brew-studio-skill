import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Tldraw, createShapeId, getSnapshot, loadSnapshot, toRichText } from 'tldraw';
import 'tldraw/tldraw.css';
import {
  activateCanvasWorkspace,
  createCanvasWorkspace,
  fetchCanvasWorkspace,
  fetchCanvasWorkspaces,
  updateCanvasWorkspaceSnapshot,
} from '../lib/api';

const SECTION_PADDING = 64;
const DEFAULT_SECTION_SIZE = { w: 960, h: 640 };
const SECTION_DUPLICATE_OFFSET = { x: 160, y: 120 };

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

function getShapePageBounds(editor, shapeOrId) {
  try {
    return compactBounds(editor?.getShapePageBounds?.(shapeOrId));
  } catch {
    return null;
  }
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
    return Object.values(value).map(collectPlainText).filter(Boolean).join(' ');
  }
  return '';
}

function shapeText(shape) {
  const props = shape?.props || {};
  return [
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
  return {
    shape_id: String(shape.id),
    kind: isCanvasSectionShape(shape) ? 'canvas_section' : 'canvas_node',
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
    meta: shape.meta || {},
  };
}

function isImageLikeShape(shape) {
  return shape?.type === 'image' || shape?.type === 'video';
}

function semanticIndexFromEditor(editor, workspace) {
  const shapes = editor?.getCurrentPageShapesSorted?.() || editor?.getCurrentPageShapes?.() || [];
  const sections = shapes.filter(isCanvasSectionShape).map((shape) => describeShape(shape, editor));
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
  return {
    version: 2,
    workspace_id: workspace?.id,
    zones: workspace?.semantic_index?.zones || [
      { id: 'agent-zone', role: 'agent', title: 'Agent 工作区' },
      { id: 'user-zone', role: 'user', title: '用户反馈区' },
      { id: 'shared-zone', role: 'shared', title: '共享决策区' },
    ],
    sections,
    nodes: shapes.map((shape) => describeShape(shape, editor)),
    assets: shapes.filter(isImageLikeShape).map((shape) => ({
      shape_id: String(shape.id),
      asset_id: shape.props?.assetId || null,
      alt_text: shape.props?.altText || '',
      section_id: nearestCanvasSection(editor, shape)?.id || null,
      bounds: getShapePageBounds(editor, shape.id),
    })),
    annotations: [],
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

function seedWorkspace(editor) {
  const existingShapes = editor.getCurrentPageShapes?.() || [];
  if (existingShapes.length > 0) return;
  const sections = [
    {
      id: createShapeId('vd-agent-section'),
      type: 'frame',
      x: 0,
      y: 0,
      props: { name: 'Agent 工作区', w: 360, h: 220, color: 'blue' },
      meta: { vd_kind: 'section', vd_role: 'agent' },
    },
    {
      id: createShapeId('vd-user-section'),
      type: 'frame',
      x: 430,
      y: 0,
      props: { name: '用户反馈区', w: 360, h: 220, color: 'green' },
      meta: { vd_kind: 'section', vd_role: 'user' },
    },
    {
      id: createShapeId('vd-shared-section'),
      type: 'frame',
      x: 215,
      y: 300,
      props: { name: '共享决策区', w: 360, h: 220, color: 'violet' },
      meta: { vd_kind: 'section', vd_role: 'shared' },
    },
  ];
  editor.createShapes(sections);
  editor.createShapes([
    {
      id: createShapeId('vd-agent-brief'),
      type: 'geo',
      x: 32,
      y: 56,
      props: {
        geo: 'rectangle',
        w: 296,
        h: 126,
        fill: 'solid',
        color: 'blue',
        richText: toRichText('Agent 工作区\n\n方案、素材、推理过程和设计说明。'),
      },
    },
    {
      id: createShapeId('vd-user-brief'),
      type: 'geo',
      x: 462,
      y: 56,
      props: {
        geo: 'rectangle',
        w: 296,
        h: 126,
        fill: 'solid',
        color: 'green',
        richText: toRichText('用户反馈区\n\n圈选、批注、补充素材和修改意见。'),
      },
    },
    {
      id: createShapeId('vd-shared-brief'),
      type: 'geo',
      x: 247,
      y: 356,
      props: {
        geo: 'rectangle',
        w: 296,
        h: 126,
        fill: 'solid',
        color: 'violet',
        richText: toRichText('共享决策区\n\n结论、取舍、下一步动作。'),
      },
    },
  ]);
  editor.reparentShapes([createShapeId('vd-agent-brief')], createShapeId('vd-agent-section'));
  editor.reparentShapes([createShapeId('vd-user-brief')], createShapeId('vd-user-section'));
  editor.reparentShapes([createShapeId('vd-shared-brief')], createShapeId('vd-shared-section'));
  editor.sendToBack?.(sections.map((section) => section.id));
  editor.zoomToFit?.();
}

const STYLES = {
  page: {
    display: 'grid',
    gridTemplateColumns: 'clamp(240px, 20vw, 320px) minmax(0, 1fr)',
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
  toolButton: {
    border: '1px solid var(--vd-border-default)',
    borderRadius: 'var(--vd-radius-md)',
    background: 'var(--vd-page-bg)',
    color: 'var(--vd-text-secondary)',
    padding: '7px 10px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  toolButtonPrimary: {
    border: '1px solid var(--vd-primary-border)',
    borderRadius: 'var(--vd-radius-md)',
    background: 'var(--vd-primary-bg)',
    color: 'var(--vd-primary)',
    padding: '7px 10px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    fontWeight: 'var(--vd-font-weight-semibold)',
  },
  canvasArea: {
    flex: 1,
    minHeight: 560,
    background: 'var(--vd-page-bg)',
  },
  canvasAreaFullscreen: {
    minHeight: 0,
  },
  empty: {
    padding: 'var(--vd-space-6)',
    color: 'var(--vd-text-tertiary)',
    textAlign: 'center',
    fontSize: 'var(--vd-font-size-sm)',
  },
};

export default function CanvasWorkspace() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [workspaces, setWorkspaces] = useState([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState(null);
  const [selectedId, setSelectedId] = useState(searchParams.get('workspace') || null);
  const [workspace, setWorkspace] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [savingState, setSavingState] = useState('已保存');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [toolMessage, setToolMessage] = useState('');
  const editorRef = useRef(null);
  const saveTimer = useRef(null);
  const mounted = useRef(false);

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
    loadList()
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

  async function saveSnapshot(editor, nextWorkspace = workspace) {
    if (!editor || !nextWorkspace) return;
    setSavingState('保存中...');
    try {
      const saved = await updateCanvasWorkspaceSnapshot(nextWorkspace.id, {
        snapshot: getSnapshot(editor.store),
        semantic_index: semanticIndexFromEditor(editor, nextWorkspace),
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
    mounted.current = true;
    const unsubscribe = editor.store.listen(() => {
      if (!mounted.current) return;
      window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => saveSnapshot(editor), 800);
    });
    return () => {
      window.clearTimeout(saveTimer.current);
      mounted.current = false;
      editorRef.current = null;
      unsubscribe?.();
    };
  }

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
                <button type="button" style={STYLES.toolButtonPrimary} onClick={handleCreateSection}>
                  创建 Section
                </button>
                <button type="button" style={STYLES.toolButton} onClick={handleDuplicateSection}>
                  复制 Section
                </button>
                <button type="button" style={STYLES.toolButton} onClick={handleOrganizeSection}>
                  整理 Section
                </button>
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
                <Tldraw key={workspace.id} persistenceKey={`vd-canvas-workspace-${workspace.id}`} onMount={handleMount} />
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
