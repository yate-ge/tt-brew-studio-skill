import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  fetchLogs,
  fetchHarness,
  fetchDocuments,
  fetchDocument,
  rescanHarness,
} from '../lib/api';
import MarkdownDocumentViewer from '../components/MarkdownDocumentViewer';

const KIND_LABELS = {
  managed_log: '托管日志',
  agent_harness: 'Harness',
  agent_instructions: 'Agent 指令',
  note: '笔记',
  project_document: '项目文档',
  project_documentation: '文档',
  project_memory: '项目记忆',
  project_overview: '项目说明',
  reference: '参考资料',
  root_files: '根目录',
  work_log: '工作日志',
};

const CONTENT_SCOPES = [
  { key: 'all', label: '全部' },
  { key: 'logs', label: '日志' },
  { key: 'documents', label: '文档' },
];

const GROUP_MODES = [
  { key: 'type', label: '按照类型' },
  { key: 'source', label: '按照来源' },
];

const LOG_DOCUMENT_KINDS = new Set(['work_log', 'project_memory']);

const STYLES = {
  page: {
    display: 'grid',
    gridTemplateColumns: '360px minmax(0, 1fr)',
    gap: 'var(--vd-space-5)',
    minHeight: 'calc(100dvh - 32px)',
    width: '100%',
  },
  nav: {
    minWidth: 0,
    height: 'calc(100dvh - 32px)',
    position: 'sticky',
    top: 'var(--vd-space-4)',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--vd-space-4)',
    paddingRight: 'var(--vd-space-4)',
    borderRight: '1px solid var(--vd-border-default)',
  },
  navHeader: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--vd-space-1)',
  },
  title: {
    fontSize: 'var(--vd-font-size-xl)',
    fontWeight: 'var(--vd-font-weight-bold)',
    color: 'var(--vd-text-primary)',
  },
  summary: {
    fontSize: 'var(--vd-font-size-xs)',
    color: 'var(--vd-text-tertiary)',
    lineHeight: 'var(--vd-line-height-normal)',
  },
  search: {
    width: '100%',
    padding: 'var(--vd-space-2) var(--vd-space-3)',
    borderRadius: 'var(--vd-radius-md)',
    border: '1px solid var(--vd-border-default)',
    background: 'var(--vd-surface-bg)',
    color: 'var(--vd-text-primary)',
    fontSize: 'var(--vd-font-size-sm)',
  },
  navScroll: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--vd-space-4)',
    paddingRight: 2,
  },
  group: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--vd-space-2)',
  },
  groupTitle: {
    fontSize: 'var(--vd-font-size-xs)',
    fontWeight: 'var(--vd-font-weight-semibold)',
    color: 'var(--vd-text-tertiary)',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  segmented: {
    display: 'grid',
    gridAutoFlow: 'column',
    gridAutoColumns: '1fr',
    gap: 4,
    padding: 4,
    borderRadius: 'var(--vd-radius-md)',
    border: '1px solid var(--vd-border-default)',
    background: 'var(--vd-page-bg)',
  },
  segmentButton: (active) => ({
    minHeight: 32,
    border: 'none',
    borderRadius: 'var(--vd-radius-sm)',
    background: active ? 'var(--vd-surface-bg)' : 'transparent',
    color: active ? 'var(--vd-primary)' : 'var(--vd-text-secondary)',
    boxShadow: active ? 'var(--vd-shadow-sm)' : 'none',
    fontSize: 'var(--vd-font-size-xs)',
    fontWeight: active ? 'var(--vd-font-weight-semibold)' : 'var(--vd-font-weight-medium)',
    fontFamily: 'inherit',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  }),
  navButton: (active) => ({
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 'var(--vd-space-2)',
    padding: 'var(--vd-space-2) var(--vd-space-3)',
    borderRadius: 'var(--vd-radius-md)',
    border: `1px solid ${active ? 'var(--vd-primary-border)' : 'transparent'}`,
    background: active ? 'var(--vd-primary-bg)' : 'transparent',
    color: active ? 'var(--vd-primary)' : 'var(--vd-text-secondary)',
    fontSize: 'var(--vd-font-size-sm)',
    fontWeight: active ? 'var(--vd-font-weight-semibold)' : 'var(--vd-font-weight-medium)',
    fontFamily: 'inherit',
    cursor: 'pointer',
    textAlign: 'left',
  }),
  count: {
    color: 'var(--vd-text-tertiary)',
    fontSize: 'var(--vd-font-size-xs)',
    fontWeight: 'var(--vd-font-weight-normal)',
  },
  listHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 'var(--vd-space-2)',
  },
  resultTitle: {
    fontSize: 'var(--vd-font-size-sm)',
    fontWeight: 'var(--vd-font-weight-semibold)',
    color: 'var(--vd-text-primary)',
  },
  sortButton: {
    padding: '6px 9px',
    borderRadius: 'var(--vd-radius-sm)',
    border: '1px solid var(--vd-border-default)',
    background: 'var(--vd-surface-bg)',
    color: 'var(--vd-text-secondary)',
    fontSize: 'var(--vd-font-size-xs)',
    fontWeight: 'var(--vd-font-weight-medium)',
    fontFamily: 'inherit',
    cursor: 'pointer',
  },
  item: (active) => ({
    width: '100%',
    display: 'block',
    padding: 'var(--vd-space-3)',
    borderRadius: 'var(--vd-radius-md)',
    border: `1px solid ${active ? 'var(--vd-primary-border)' : 'var(--vd-border-subtle)'}`,
    borderLeft: `3px solid ${active ? 'var(--vd-primary)' : 'var(--vd-border-subtle)'}`,
    background: active ? 'var(--vd-primary-bg)' : 'var(--vd-surface-bg)',
    color: 'var(--vd-text-primary)',
    textAlign: 'left',
    textDecoration: 'none',
    fontFamily: 'inherit',
    cursor: 'pointer',
    transition: 'background var(--vd-transition-fast), border-color var(--vd-transition-fast)',
  }),
  itemTopline: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 'var(--vd-space-2)',
    marginBottom: 3,
  },
  itemTitle: {
    minWidth: 0,
    fontSize: 'var(--vd-font-size-sm)',
    fontWeight: 'var(--vd-font-weight-semibold)',
    color: 'var(--vd-text-primary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  itemPath: {
    fontSize: 'var(--vd-font-size-xs)',
    color: 'var(--vd-text-tertiary)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  itemMeta: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 'var(--vd-space-2)',
    marginTop: 'var(--vd-space-1)',
    color: 'var(--vd-text-tertiary)',
    fontSize: 'var(--vd-font-size-xs)',
  },
  badge: (tone = 'neutral') => ({
    padding: '1px 6px',
    borderRadius: 'var(--vd-radius-sm)',
    fontSize: 10,
    fontWeight: 500,
    whiteSpace: 'nowrap',
    background: tone === 'log' ? 'var(--vd-info-bg)' : 'var(--vd-surface-hover)',
    color: tone === 'log' ? 'var(--vd-info)' : 'var(--vd-text-secondary)',
  }),
  contentPane: {
    minWidth: 0,
    minHeight: 'calc(100dvh - 32px)',
    background: 'var(--vd-surface-bg)',
    borderRadius: 'var(--vd-radius-lg)',
    border: '1px solid var(--vd-border-default)',
    padding: 'var(--vd-space-6)',
    overflow: 'hidden',
  },
  emptyState: {
    minHeight: 220,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 'var(--vd-space-6)',
    border: '1px dashed var(--vd-border-default)',
    borderRadius: 'var(--vd-radius-lg)',
    color: 'var(--vd-text-tertiary)',
    fontSize: 'var(--vd-font-size-sm)',
    textAlign: 'center',
  },
  contentEmpty: {
    minHeight: 420,
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--vd-text-tertiary)',
    fontSize: 'var(--vd-font-size-sm)',
    textAlign: 'center',
  },
  loadingState: {
    textAlign: 'center',
    padding: 'var(--vd-space-16) var(--vd-space-6)',
    color: 'var(--vd-text-tertiary)',
  },
  logShell: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
  },
  logHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 'var(--vd-space-4)',
    paddingBottom: 'var(--vd-space-4)',
    borderBottom: '1px solid var(--vd-border-subtle)',
    flexWrap: 'wrap',
  },
  logTitleBlock: {
    minWidth: 0,
  },
  logTitle: {
    fontSize: 'var(--vd-font-size-xl)',
    fontWeight: 'var(--vd-font-weight-bold)',
    color: 'var(--vd-text-primary)',
    marginBottom: 'var(--vd-space-1)',
  },
  logMeta: {
    display: 'flex',
    gap: 'var(--vd-space-2)',
    flexWrap: 'wrap',
    color: 'var(--vd-text-tertiary)',
    fontSize: 'var(--vd-font-size-xs)',
  },
  logBody: {
    marginTop: 'var(--vd-space-6)',
    color: 'var(--vd-text-secondary)',
    lineHeight: 'var(--vd-line-height-relaxed)',
    whiteSpace: 'pre-wrap',
  },
  logContentBox: {
    marginTop: 'var(--vd-space-4)',
    padding: 'var(--vd-space-4)',
    borderRadius: 'var(--vd-radius-md)',
    background: 'var(--vd-page-bg)',
    border: '1px solid var(--vd-border-subtle)',
  },
};

function formatDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

function formatDateShort(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

function formatSize(bytes) {
  if (!Number.isFinite(bytes)) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function kindLabel(kind) {
  return KIND_LABELS[kind] || kind || '文档';
}

function sourceForPath(filePath = '') {
  if (!filePath.includes('/')) return '.';
  return filePath.split('/')[0] || '.';
}

function sourceLabel(sourcePath) {
  if (sourcePath === 'managed_logs') return '托管日志';
  if (sourcePath === '.') return '根目录';
  if (sourcePath === '.codex') return '项目级 Codex Skill';
  if (sourcePath === 'agents') return 'Agent Harness';
  if (sourcePath === 'docs') return '项目文档';
  if (sourcePath === 'references') return '参考资料';
  return sourcePath;
}

function itemKey(item) {
  return item ? `${item.type}:${item.id}` : '';
}

function matchesSearch(value, query) {
  if (!query) return true;
  return value.toLowerCase().includes(query);
}

function timestamp(value) {
  const time = new Date(value || 0).getTime();
  return Number.isFinite(time) ? time : 0;
}

function documentScope(doc) {
  return LOG_DOCUMENT_KINDS.has(doc.kind) ? 'logs' : 'documents';
}

function makeLogItem(log) {
  return {
    type: 'log',
    id: log.id,
    title: log.title || log.event || '未命名日志',
    path: log.transparency?.path || 'logs.json',
    scope: 'logs',
    kindKey: 'managed_log',
    kindLabel: '托管日志',
    sourceKey: 'managed_logs',
    sourceLabel: '托管日志',
    time: log.updatedAt || log.createdAt,
    searchText: [
      log.title,
      log.event,
      log.content,
      (log.tags || []).join(' '),
      log.reportId,
    ].filter(Boolean).join(' '),
    record: log,
  };
}

function makeDocumentItem(doc) {
  const sourceKey = sourceForPath(doc.path);
  return {
    type: 'document',
    id: doc.id,
    title: doc.title || doc.path || '未命名文档',
    path: doc.path,
    scope: documentScope(doc),
    kindKey: doc.kind || 'project_document',
    kindLabel: kindLabel(doc.kind),
    sourceKey,
    sourceLabel: sourceLabel(sourceKey),
    time: doc.updated_at || doc.last_seen_at || doc.last_indexed_at,
    searchText: [
      doc.title,
      doc.path,
      doc.kind,
      kindLabel(doc.kind),
      sourceLabel(sourceKey),
    ].filter(Boolean).join(' '),
    record: doc,
  };
}

function scopeLabel(scope) {
  return CONTENT_SCOPES.find((item) => item.key === scope)?.label || '全部';
}

function listTitle(scope) {
  if (scope === 'logs') return '日志列表';
  if (scope === 'documents') return '文档列表';
  return '全部记录';
}

function emptyMessage(scope) {
  if (scope === 'logs') return '当前筛选条件下没有日志。';
  if (scope === 'documents') return '当前筛选条件下没有文档。';
  return '当前筛选条件下没有日志或文档。';
}

export default function Logs() {
  const [logs, setLogs] = useState([]);
  const [harness, setHarness] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [scannedAt, setScannedAt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [rescaning, setRescaning] = useState(false);
  const [contentScope, setContentScope] = useState('all');
  const [groupMode, setGroupMode] = useState('type');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [sortDirection, setSortDirection] = useState('desc');
  const [selected, setSelected] = useState(null);
  const [activeDocument, setActiveDocument] = useState(null);
  const [documentLoading, setDocumentLoading] = useState(false);
  const [search, setSearch] = useState('');

  const loadData = async () => {
    const [logData, harnessData, documentData] = await Promise.all([
      fetchLogs(),
      fetchHarness(),
      fetchDocuments(),
    ]);
    setLogs(logData.logs || []);
    setHarness(harnessData.harness || null);
    setDocuments(documentData.documents || []);
    setScannedAt(documentData.scanned_at || harnessData.document_index?.scanned_at || null);
  };

  useEffect(() => {
    let canceled = false;
    setLoading(true);
    loadData()
      .catch(() => {
        if (!canceled) {
          setLogs([]);
          setHarness(null);
          setDocuments([]);
        }
      })
      .finally(() => {
        if (!canceled) setLoading(false);
      });
    return () => { canceled = true; };
  }, []);

  const logDocuments = useMemo(
    () => documents.filter((doc) => LOG_DOCUMENT_KINDS.has(doc.kind)),
    [documents]
  );

  const workDocuments = useMemo(
    () => documents.filter((doc) => !LOG_DOCUMENT_KINDS.has(doc.kind)),
    [documents]
  );

  const allItems = useMemo(
    () => [
      ...logs.map(makeLogItem),
      ...documents.map(makeDocumentItem),
    ],
    [documents, logs]
  );

  const scopedItems = useMemo(() => (
    contentScope === 'all'
      ? allItems
      : allItems.filter((item) => item.scope === contentScope)
  ), [allItems, contentScope]);

  const categoryOptions = useMemo(() => {
    const counts = new Map();
    scopedItems.forEach((item) => {
      const key = groupMode === 'type' ? item.kindKey : item.sourceKey;
      const label = groupMode === 'type' ? item.kindLabel : item.sourceLabel;
      const current = counts.get(key) || { key, label, count: 0 };
      counts.set(key, { ...current, count: current.count + 1 });
    });
    return Array.from(counts.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [groupMode, scopedItems]);

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    return scopedItems
      .filter((item) => {
        const categoryKey = groupMode === 'type' ? item.kindKey : item.sourceKey;
        const categoryMatches = categoryFilter === 'all' || categoryKey === categoryFilter;
        const searchMatches = matchesSearch(item.searchText, query);
        return categoryMatches && searchMatches;
      })
      .sort((a, b) => {
        const timeDiff = sortDirection === 'asc'
          ? timestamp(a.time) - timestamp(b.time)
          : timestamp(b.time) - timestamp(a.time);
        if (timeDiff !== 0) return timeDiff;
        return a.title.localeCompare(b.title);
      });
  }, [categoryFilter, groupMode, scopedItems, search, sortDirection]);

  useEffect(() => {
    if (categoryFilter === 'all') return;
    if (!categoryOptions.some((item) => item.key === categoryFilter)) {
      setCategoryFilter('all');
    }
  }, [categoryFilter, categoryOptions]);

  useEffect(() => {
    if (filteredItems.length === 0) {
      if (selected) setSelected(null);
      return;
    }

    if (!selected || !filteredItems.some((item) => itemKey(item) === itemKey(selected))) {
      setSelected({ type: filteredItems[0].type, id: filteredItems[0].id });
    }
  }, [filteredItems, selected]);

  useEffect(() => {
    let canceled = false;
    if (!selected || selected.type !== 'document') {
      setActiveDocument(null);
      return () => { canceled = true; };
    }

    setDocumentLoading(true);
    fetchDocument(selected.id)
      .then((data) => {
        if (!canceled) setActiveDocument(data);
      })
      .catch(() => {
        if (!canceled) setActiveDocument(null);
      })
      .finally(() => {
        if (!canceled) setDocumentLoading(false);
      });

    return () => { canceled = true; };
  }, [selected?.type, selected?.id]);

  const selectedItem = selected
    ? allItems.find((item) => item.type === selected.type && item.id === selected.id)
    : null;

  const activeLog = selectedItem?.type === 'log' ? selectedItem.record : null;

  const handleRescan = async () => {
    setRescaning(true);
    try {
      const harnessData = await rescanHarness();
      const documentData = await fetchDocuments();
      setHarness(harnessData.harness || null);
      setDocuments(documentData.documents || []);
      setScannedAt(documentData.scanned_at || harnessData.document_index?.scanned_at || null);
    } catch {
      /* keep current state */
    } finally {
      setRescaning(false);
    }
  };

  const handleScopeChange = (scope) => {
    setContentScope(scope);
    setCategoryFilter('all');
  };

  const handleGroupModeChange = (mode) => {
    setGroupMode(mode);
    setCategoryFilter('all');
  };

  const totalLogCount = logs.length + logDocuments.length;
  const totalDocumentCount = workDocuments.length;
  const totalVisible = filteredItems.length;
  const classificationLabel = groupMode === 'type' ? '类型' : '来源';
  const sortLabel = sortDirection === 'desc' ? '时间倒序' : '时间正序';

  if (loading) {
    return (
      <div style={STYLES.loadingState}>
        <div style={{ fontSize: 'var(--vd-font-size-lg)', marginBottom: 'var(--vd-space-2)' }}>加载中...</div>
      </div>
    );
  }

  return (
    <div style={STYLES.page}>
      <aside style={STYLES.nav}>
        <div style={STYLES.navHeader}>
          <div style={STYLES.title}>日志与文档</div>
          <div style={STYLES.summary}>
            {totalLogCount} 条日志 · {totalDocumentCount} 份文档 · 当前显示 {totalVisible}
            {scannedAt ? ` · 最近扫描 ${formatDate(scannedAt)}` : ''}
          </div>
        </div>

        <input
          type="text"
          placeholder={`搜索${scopeLabel(contentScope)}...`}
          style={STYLES.search}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />

        <div style={STYLES.navScroll}>
          <div style={STYLES.group}>
            <div style={STYLES.groupTitle}>内容</div>
            <div style={STYLES.segmented}>
              {CONTENT_SCOPES.map((scope) => (
                <button
                  key={scope.key}
                  type="button"
                  style={STYLES.segmentButton(contentScope === scope.key)}
                  onClick={() => handleScopeChange(scope.key)}
                >
                  {scope.label}
                </button>
              ))}
            </div>
          </div>

          <div style={STYLES.group}>
            <div style={STYLES.groupTitle}>分类方式</div>
            <div style={STYLES.segmented}>
              {GROUP_MODES.map((mode) => (
                <button
                  key={mode.key}
                  type="button"
                  style={STYLES.segmentButton(groupMode === mode.key)}
                  onClick={() => handleGroupModeChange(mode.key)}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          </div>

          <div style={STYLES.group}>
            <div style={STYLES.groupTitle}>{classificationLabel}</div>
            <button
              type="button"
              style={STYLES.navButton(categoryFilter === 'all')}
              onClick={() => setCategoryFilter('all')}
            >
              <span>全部{classificationLabel}</span>
              <span style={STYLES.count}>{scopedItems.length}</span>
            </button>
            {categoryOptions.map((item) => (
              <button
                type="button"
                key={item.key}
                style={STYLES.navButton(categoryFilter === item.key)}
                onClick={() => setCategoryFilter(item.key)}
              >
                <span>{item.label}</span>
                <span style={STYLES.count}>{item.count}</span>
              </button>
            ))}
          </div>

          <div style={STYLES.group}>
            <div style={STYLES.listHeader}>
              <div>
                <div style={STYLES.resultTitle}>{listTitle(contentScope)}</div>
                <div style={STYLES.count}>显示 {totalVisible}</div>
              </div>
              <button
                type="button"
                style={STYLES.sortButton}
                onClick={() => setSortDirection(sortDirection === 'desc' ? 'asc' : 'desc')}
              >
                {sortLabel}
              </button>
            </div>

            {totalVisible === 0 ? (
              <div style={STYLES.emptyState}>{emptyMessage(contentScope)}</div>
            ) : (
              filteredItems.map((item) => (
                <button
                  type="button"
                  key={itemKey(item)}
                  style={STYLES.item(itemKey(selected) === itemKey(item))}
                  onClick={() => setSelected({ type: item.type, id: item.id })}
                >
                  <div style={STYLES.itemTopline}>
                    <div style={STYLES.itemTitle}>{item.title}</div>
                    <span style={STYLES.badge(item.type === 'log' ? 'log' : 'neutral')}>
                      {item.type === 'log' ? '日志' : '文档'}
                    </span>
                  </div>
                  <div style={STYLES.itemPath}>{item.path}</div>
                  <div style={STYLES.itemMeta}>
                    <span>{item.kindLabel}</span>
                    {item.sourceLabel !== item.kindLabel && <span>{item.sourceLabel}</span>}
                    <span>{formatDateShort(item.time)}</span>
                    {item.type === 'document' && <span>{formatSize(item.record.size)}</span>}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        <button
          type="button"
          style={{ ...STYLES.sortButton, width: '100%', opacity: rescaning ? 0.7 : 1 }}
          onClick={handleRescan}
          disabled={rescaning}
        >
          {rescaning ? '扫描中...' : '重新扫描文档来源'}
        </button>
      </aside>

      <main style={STYLES.contentPane}>
        {selected?.type === 'document' && (
          <>
            {documentLoading && (
              <div style={STYLES.contentEmpty}>正在读取文档...</div>
            )}
            {!documentLoading && activeDocument && (
              <MarkdownDocumentViewer
                document={activeDocument.document}
                content={activeDocument.truncated ? '' : activeDocument.content}
                kindLabel={kindLabel}
              />
            )}
            {!documentLoading && !activeDocument && (
              <div style={STYLES.contentEmpty}>无法读取该文档</div>
            )}
          </>
        )}

        {activeLog && (
          <div style={STYLES.logShell}>
            <header style={STYLES.logHeader}>
              <div style={STYLES.logTitleBlock}>
                <div style={STYLES.logTitle}>{activeLog.title}</div>
                <div style={STYLES.logMeta}>
                  <span>{formatDate(activeLog.createdAt)}</span>
                  <span>{activeLog.type === 'auto' ? '自动记录' : '手动记录'}</span>
                  {activeLog.event && <span>事件：{activeLog.event}</span>}
                  {(activeLog.tags || []).map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </div>
              </div>
              {activeLog.reportId && (
                <Link to={`/reports?report=${encodeURIComponent(activeLog.reportId)}`} style={STYLES.sortButton}>
                  查看关联汇报
                </Link>
              )}
            </header>
            <div style={STYLES.logBody}>
              <div style={STYLES.logContentBox}>
                {activeLog.content || '这条日志没有补充内容。'}
              </div>
              <div style={{ marginTop: 'var(--vd-space-4)', color: 'var(--vd-text-tertiary)', fontSize: 'var(--vd-font-size-xs)' }}>
                来源：{activeLog.transparency?.path || 'logs.json'}
              </div>
            </div>
          </div>
        )}

        {!selected && (
          <div style={STYLES.contentEmpty}>
            选择左侧列表中的条目查看详情
          </div>
        )}
      </main>
    </div>
  );
}
