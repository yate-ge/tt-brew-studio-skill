import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Tldraw, createShapeId, getSnapshot, loadSnapshot, toRichText } from 'tldraw';
import 'tldraw/tldraw.css';
import {
  activateCanvasWorkspace,
  addCanvasWorkspaceFeedback,
  createCanvasWorkspace,
  fetchCanvasWorkspace,
  fetchCanvasWorkspaces,
  updateCanvasWorkspaceSnapshot,
} from '../lib/api';

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
    collectPlainText(props.richText),
  ].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

function describeShape(shape) {
  const text = shapeText(shape);
  return {
    shape_id: String(shape.id),
    type: shape.type || 'shape',
    title: text.split(/\s+/).slice(0, 8).join(' ') || shape.type || 'shape',
    text,
    x: shape.x,
    y: shape.y,
    w: shape.props?.w,
    h: shape.props?.h,
    asset_id: shape.props?.assetId || null,
  };
}

function describeSelectedShapes(editor, shapeIds) {
  return shapeIds.map((shapeId) => {
    const shape = editor?.getShape?.(shapeId);
    return describeShape(shape || { id: shapeId, type: 'shape', props: {} });
  });
}

function semanticIndexFromEditor(editor, workspace) {
  const shapes = editor?.getCurrentPageShapes?.() || [];
  return {
    version: 1,
    workspace_id: workspace?.id,
    zones: workspace?.semantic_index?.zones || [
      { id: 'agent-zone', role: 'agent', title: 'Agent 工作区' },
      { id: 'user-zone', role: 'user', title: '用户反馈区' },
      { id: 'shared-zone', role: 'shared', title: '共享决策区' },
    ],
    nodes: shapes.map(describeShape),
    annotations: [],
    relationships: [],
    updated_at: new Date().toISOString(),
  };
}

function seedWorkspace(editor) {
  const existingShapes = editor.getCurrentPageShapes?.() || [];
  if (existingShapes.length > 0) return;
  editor.createShapes([
    {
      id: createShapeId('vd-agent-zone'),
      type: 'geo',
      x: 0,
      y: 0,
      props: {
        geo: 'rectangle',
        w: 320,
        h: 190,
        fill: 'solid',
        color: 'blue',
        richText: toRichText('Agent 工作区\n\n方案、素材、推理过程和设计说明。'),
      },
    },
    {
      id: createShapeId('vd-user-zone'),
      type: 'geo',
      x: 380,
      y: 0,
      props: {
        geo: 'rectangle',
        w: 320,
        h: 190,
        fill: 'solid',
        color: 'green',
        richText: toRichText('用户反馈区\n\n圈选、批注、补充素材和修改意见。'),
      },
    },
    {
      id: createShapeId('vd-shared-zone'),
      type: 'geo',
      x: 190,
      y: 260,
      props: {
        geo: 'rectangle',
        w: 320,
        h: 190,
        fill: 'solid',
        color: 'violet',
        richText: toRichText('共享决策区\n\n结论、取舍、下一步动作。'),
      },
    },
  ]);
  editor.zoomToFit?.();
}

const STYLES = {
  page: {
    display: 'grid',
    gridTemplateColumns: '280px minmax(0, 1fr) 300px',
    gap: 'var(--vd-space-4)',
    minHeight: 'calc(100dvh - 32px)',
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
  canvasHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 'var(--vd-space-4)',
    padding: 'var(--vd-space-4)',
    borderBottom: '1px solid var(--vd-border-subtle)',
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
    background: '#f8fafc',
  },
  sidePanel: {
    display: 'flex',
    flexDirection: 'column',
  },
  sideBody: {
    flex: 1,
    overflowY: 'auto',
    padding: 'var(--vd-space-4)',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--vd-space-4)',
  },
  sectionTitle: {
    margin: 0,
    fontSize: 'var(--vd-font-size-sm)',
    fontWeight: 'var(--vd-font-weight-semibold)',
    color: 'var(--vd-text-primary)',
  },
  muted: {
    color: 'var(--vd-text-tertiary)',
    fontSize: 'var(--vd-font-size-xs)',
    lineHeight: 1.5,
  },
  textarea: {
    width: '100%',
    minHeight: 96,
    resize: 'vertical',
    border: '1px solid var(--vd-border-default)',
    borderRadius: 'var(--vd-radius-md)',
    background: 'var(--vd-page-bg)',
    color: 'var(--vd-text-primary)',
    font: 'inherit',
    fontSize: 'var(--vd-font-size-sm)',
    padding: 'var(--vd-space-3)',
    outline: 'none',
  },
  feedbackButton: {
    border: 'none',
    borderRadius: 'var(--vd-radius-md)',
    background: 'var(--vd-primary)',
    color: 'var(--vd-text-inverse)',
    padding: '8px 12px',
    fontSize: 'var(--vd-font-size-sm)',
    fontWeight: 'var(--vd-font-weight-medium)',
    cursor: 'pointer',
  },
  feedbackItem: {
    border: '1px solid var(--vd-border-subtle)',
    borderRadius: 'var(--vd-radius-md)',
    padding: 'var(--vd-space-3)',
    background: 'var(--vd-page-bg)',
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
  const [selectedShapeIds, setSelectedShapeIds] = useState([]);
  const [feedbackText, setFeedbackText] = useState('');
  const [savingState, setSavingState] = useState('已保存');
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

  const selectedShapes = useMemo(() => (
    editorRef.current ? describeSelectedShapes(editorRef.current, selectedShapeIds) : []
  ), [selectedShapeIds]);

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
    setSelectedShapeIds(readSelectedShapeIds(editor));
    const unsubscribe = editor.store.listen(() => {
      if (!mounted.current) return;
      setSelectedShapeIds(readSelectedShapeIds(editor));
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

  async function handleFeedbackSubmit() {
    if (!workspace || !feedbackText.trim()) return;
    const editor = editorRef.current;
    const shapeIds = readSelectedShapeIds(editor);
    const target = shapeIds.length > 0
      ? {
        type: 'canvas_selection',
        shape_ids: shapeIds.map(String),
        shapes: describeSelectedShapes(editor, shapeIds),
        bounds: compactBounds(editor?.getSelectionPageBounds?.()),
      }
      : { type: 'canvas_workspace' };
    const feedback = await addCanvasWorkspaceFeedback(workspace.id, {
      content: feedbackText.trim(),
      target,
      kind: target.type,
      author: 'user',
    });
    setWorkspace((current) => ({
      ...current,
      feedback: [...(current?.feedback || []), feedback],
    }));
    setFeedbackText('');
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

      <main style={{ ...STYLES.panel, ...STYLES.canvasPanel }}>
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
                </div>
              </div>
              <button type="button" style={STYLES.ghostButton} onClick={handleActivate}>
                设为当前
              </button>
            </header>
            {detailLoading ? (
              <div style={STYLES.empty}>正在加载画布...</div>
            ) : (
              <div style={STYLES.canvasArea}>
                <Tldraw key={workspace.id} persistenceKey={`vd-canvas-workspace-${workspace.id}`} onMount={handleMount} />
              </div>
            )}
          </>
        )}
      </main>

      <aside style={{ ...STYLES.panel, ...STYLES.sidePanel }}>
        <div style={STYLES.panelHeader}>
          <h2 style={STYLES.title}>协作记录</h2>
          <div style={STYLES.subtitle}>选中对象后提交反馈，会带上选区信息。</div>
        </div>
        <div style={STYLES.sideBody}>
          <section>
            <h3 style={STYLES.sectionTitle}>当前选区</h3>
            {selectedShapeIds.length === 0 ? (
              <p style={STYLES.muted}>未选择对象。</p>
            ) : (
              <p style={STYLES.muted}>{selectedShapeIds.length} 个对象：{selectedShapes.map((shape) => shape.title).join('、')}</p>
            )}
          </section>
          <section>
            <h3 style={STYLES.sectionTitle}>提交反馈</h3>
            <textarea
              style={STYLES.textarea}
              value={feedbackText}
              onChange={(event) => setFeedbackText(event.target.value)}
              placeholder="写下对当前画布或选区的修改意见"
            />
            <button
              type="button"
              style={{ ...STYLES.feedbackButton, marginTop: 'var(--vd-space-2)' }}
              onClick={handleFeedbackSubmit}
              disabled={!workspace || !feedbackText.trim()}
            >
              提交反馈
            </button>
          </section>
          <section>
            <h3 style={STYLES.sectionTitle}>最近反馈</h3>
            {(workspace?.feedback || []).length === 0 ? (
              <p style={STYLES.muted}>暂无反馈。</p>
            ) : (
              (workspace.feedback || []).slice().reverse().slice(0, 6).map((item) => (
                <div key={item.id} style={STYLES.feedbackItem}>
                  <div style={{ color: 'var(--vd-text-primary)', fontSize: 'var(--vd-font-size-sm)' }}>{item.content}</div>
                  <div style={STYLES.muted}>{formatDate(item.created_at)} · {item.target?.type || 'canvas_workspace'}</div>
                </div>
              ))
            )}
          </section>
        </div>
      </aside>
    </div>
  );
}
