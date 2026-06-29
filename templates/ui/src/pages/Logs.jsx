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

const LOG_DOCUMENT_KINDS = new Set(['work_log', 'project_memory']);

const VIEW_COPY = {
  logs: {
    label: '日志',
    title: '过程记录',
    empty: '当前没有独立日志，也没有发现项目记忆或工作日志文件。',
  },
  documents: {
    label: '文档',
    title: '工作文档',
    empty: '当前筛选条件下没有文档。',
  },
};

const STYLES = {
  page: {
    display: 'grid',
    gridTemplateColumns: '320px minmax(0, 1fr)',
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
  search: {
    width: '100%',
    padding: 'var(--vd-space-2) var(--vd-space-3)',
    borderRadius: 'var(--vd-radius-md)',
    border: '1px solid var(--vd-border-default)',
    background: 'var(--vd-surface-bg)',
    color: 'var(--vd-text-primary)',
    fontSize: 'var(--vd-font-size-sm)',
  },
  rescanButton: {
    width: '100%',
    padding: 'var(--vd-space-2) var(--vd-space-3)',
    borderRadius: 'var(--vd-radius-md)',
    border: '1px solid var(--vd-border-default)',
    background: 'var(--vd-surface-bg)',
    color: 'var(--vd-text-secondary)',
    fontSize: 'var(--vd-font-size-sm)',
    fontWeight: 'var(--vd-font-weight-medium)',
    fontFamily: 'inherit',
    cursor: 'pointer',
  },
  resultHeader: {
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
  item: (active) => ({
    width: '100%',
    display: 'block',
    padding: 'var(--vd-space-3)',
    borderRadius: 'var(--vd-radius-md)',
    border: `1px solid ${active ? 'var(--vd-primary-border)' : 'var(--vd-border-subtle)'}`,
    background: active ? 'var(--vd-primary-bg)' : 'var(--vd-surface-bg)',
    color: 'var(--vd-text-primary)',
    textAlign: 'left',
    textDecoration: 'none',
    fontFamily: 'inherit',
    cursor: 'pointer',
    transition: 'background var(--vd-transition-fast), border-color var(--vd-transition-fast)',
  }),
  itemTitle: {
    fontSize: 'var(--vd-font-size-sm)',
    fontWeight: 'var(--vd-font-weight-semibold)',
    color: 'var(--vd-text-primary)',
    marginBottom: 3,
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
    background: tone === 'auto' ? 'var(--vd-info-bg)' : 'var(--vd-surface-hover)',
    color: tone === 'auto' ? 'var(--vd-info)' : 'var(--vd-text-secondary)',
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
  logTitle: {
    fontSize: 'var(--vd-font-size-xl)',
    fontWeight: 'var(--vd-font-weight-bold)',
    color: 'var(--vd-text-primary)',
    marginBottom: 'var(--vd-space-2)',
  },
  logMeta: {
    display: 'flex',
    gap: 'var(--vd-space-2)',
    flexWrap: 'wrap',
    color: 'var(--vd-text-tertiary)',
    fontSize: 'var(--vd-font-size-xs)',
    marginBottom: 'var(--vd-space-4)',
  },
  logBody: {
    color: 'var(--vd-text-secondary)',
    lineHeight: 'var(--vd-line-height-relaxed)',
  },
};

function formatDate(iso) {
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
  if (sourcePath === '.') return '根目录';
  if (sourcePath === 'agents') return 'Agent Harness';
  if (sourcePath === 'docs') return '项目文档';
  if (sourcePath === 'references') return '参考资料';
  return sourcePath;
}

function itemKey(item) {
  return `${item.type}:${item.id}`;
}

function matchesSearch(value, query) {
  if (!query) return true;
  return value.toLowerCase().includes(query);
}

function sortDocuments(items) {
  return [...items].sort((a, b) => {
    const sourceDiff = sourceForPath(a.path).localeCompare(sourceForPath(b.path));
    if (sourceDiff !== 0) return sourceDiff;
    return a.path.localeCompare(b.path);
  });
}

export default function Logs() {
  const [logs, setLogs] = useState([]);
  const [harness, setHarness] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [scannedAt, setScannedAt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [rescaning, setRescaning] = useState(false);
  const [activeView, setActiveView] = useState('documents');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [kindFilter, setKindFilter] = useState('all');
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

  const baseDocuments = activeView === 'logs' ? logDocuments : workDocuments;

  const sourceOptions = useMemo(() => {
    const knownSources = new Map();
    (harness?.sources || []).forEach((source) => {
      knownSources.set(source.path, { ...source, count: 0 });
    });
    baseDocuments.forEach((doc) => {
      const source = sourceForPath(doc.path);
      const current = knownSources.get(source) || {
        id: source,
        path: source,
        kind: 'project_document',
        count: 0,
      };
      knownSources.set(source, { ...current, count: (current.count || 0) + 1 });
    });
    return Array.from(knownSources.values()).sort((a, b) => a.path.localeCompare(b.path));
  }, [baseDocuments, harness]);

  const kindOptions = useMemo(() => {
    const counts = new Map();
    baseDocuments.forEach((doc) => {
      counts.set(doc.kind, (counts.get(doc.kind) || 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([kind, count]) => ({ kind, count }))
      .sort((a, b) => kindLabel(a.kind).localeCompare(kindLabel(b.kind)));
  }, [baseDocuments]);

  const filteredDocuments = useMemo(() => {
    const query = search.trim().toLowerCase();
    return sortDocuments(baseDocuments.filter((doc) => {
      const sourceMatches = sourceFilter === 'all' || sourceForPath(doc.path) === sourceFilter;
      const kindMatches = kindFilter === 'all' || doc.kind === kindFilter;
      const searchMatches = matchesSearch(`${doc.title} ${doc.path} ${kindLabel(doc.kind)}`, query);
      return sourceMatches && kindMatches && searchMatches;
    }));
  }, [baseDocuments, kindFilter, search, sourceFilter]);

  const filteredLogs = useMemo(() => {
    if (activeView !== 'logs' || sourceFilter !== 'all' || kindFilter !== 'all') return [];
    const query = search.trim().toLowerCase();
    return logs
      .filter((log) => matchesSearch(`${log.title} ${log.event || ''} ${(log.tags || []).join(' ')}`, query))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [activeView, kindFilter, logs, search, sourceFilter]);

  const listItems = useMemo(() => {
    const logItems = filteredLogs.map((log) => ({ type: 'log', id: log.id }));
    const docItems = filteredDocuments.map((doc) => ({ type: 'document', id: doc.id }));
    return activeView === 'logs' ? [...logItems, ...docItems] : docItems;
  }, [activeView, filteredDocuments, filteredLogs]);

  useEffect(() => {
    if (listItems.length === 0) {
      if (selected) setSelected(null);
      return;
    }

    if (!selected || !listItems.some((item) => itemKey(item) === itemKey(selected))) {
      setSelected(listItems[0]);
    }
  }, [listItems, selected]);

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

  const activeLog = selected?.type === 'log'
    ? logs.find((log) => log.id === selected.id)
    : null;

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

  const handleViewChange = (view) => {
    setActiveView(view);
    setSourceFilter('all');
    setKindFilter('all');
    setSearch('');
  };

  const currentDocumentCount = activeView === 'logs'
    ? logDocuments.length
    : workDocuments.length;

  const totalVisible = activeView === 'logs'
    ? filteredLogs.length + filteredDocuments.length
    : filteredDocuments.length;

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
            {logs.length} 条托管日志 · {workDocuments.length} 份工作文档 · {logDocuments.length} 份项目记忆/日志文件
            {scannedAt ? ` · 最近扫描 ${formatDate(scannedAt)}` : ''}
          </div>
        </div>

        <input
          type="text"
          placeholder={`搜索${VIEW_COPY[activeView].label}...`}
          style={STYLES.search}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />

        <div style={STYLES.navScroll}>
          <div style={STYLES.group}>
            <div style={STYLES.groupTitle}>视图</div>
            {Object.entries(VIEW_COPY).map(([view, copy]) => (
              <button
                key={view}
                type="button"
                style={STYLES.navButton(activeView === view)}
                onClick={() => handleViewChange(view)}
              >
                <span>{copy.label}</span>
                <span style={STYLES.count}>{view === 'logs' ? logs.length + logDocuments.length : workDocuments.length}</span>
              </button>
            ))}
          </div>

          <div style={STYLES.group}>
            <div style={STYLES.groupTitle}>来源</div>
            <button
              type="button"
              style={STYLES.navButton(sourceFilter === 'all')}
              onClick={() => setSourceFilter('all')}
            >
              <span>全部来源</span>
              <span style={STYLES.count}>{currentDocumentCount}</span>
            </button>
            {sourceOptions.map((source) => (
              <button
                type="button"
                key={source.path}
                style={STYLES.navButton(sourceFilter === source.path)}
                onClick={() => setSourceFilter(source.path)}
              >
                <span>{sourceLabel(source.path)}</span>
                <span style={STYLES.count}>{source.count || 0}</span>
              </button>
            ))}
          </div>

          <div style={STYLES.group}>
            <div style={STYLES.groupTitle}>类型</div>
            <button
              type="button"
              style={STYLES.navButton(kindFilter === 'all')}
              onClick={() => setKindFilter('all')}
            >
              <span>全部类型</span>
              <span style={STYLES.count}>{currentDocumentCount}</span>
            </button>
            {kindOptions.map((item) => (
              <button
                type="button"
                key={item.kind}
                style={STYLES.navButton(kindFilter === item.kind)}
                onClick={() => setKindFilter(item.kind)}
              >
                <span>{kindLabel(item.kind)}</span>
                <span style={STYLES.count}>{item.count}</span>
              </button>
            ))}
          </div>

          <div style={STYLES.group}>
            <div style={STYLES.resultHeader}>
              <div style={STYLES.resultTitle}>{VIEW_COPY[activeView].title}</div>
              <div style={STYLES.count}>显示 {totalVisible}</div>
            </div>

            {totalVisible === 0 ? (
              <div style={STYLES.emptyState}>{VIEW_COPY[activeView].empty}</div>
            ) : (
              <>
                {activeView === 'logs' && filteredLogs.map((log) => (
                  <button
                    type="button"
                    key={log.id}
                    style={STYLES.item(selected?.type === 'log' && selected?.id === log.id)}
                    onClick={() => setSelected({ type: 'log', id: log.id })}
                  >
                    <div style={STYLES.itemTitle}>{log.title}</div>
                    <div style={STYLES.itemMeta}>
                      <span style={STYLES.badge(log.type === 'auto' ? 'auto' : 'neutral')}>
                        {log.type === 'auto' ? '自动' : '手动'}
                      </span>
                      <span>{formatDateShort(log.createdAt)}</span>
                      {log.event && <span>{log.event}</span>}
                    </div>
                  </button>
                ))}

                {filteredDocuments.map((doc) => (
                  <button
                    type="button"
                    key={doc.id}
                    style={STYLES.item(selected?.type === 'document' && selected?.id === doc.id)}
                    onClick={() => setSelected({ type: 'document', id: doc.id })}
                  >
                    <div style={STYLES.itemTitle}>{doc.title}</div>
                    <div style={STYLES.itemPath}>{doc.path}</div>
                    <div style={STYLES.itemMeta}>
                      <span style={STYLES.badge()}>{kindLabel(doc.kind)}</span>
                      <span>{sourceLabel(sourceForPath(doc.path))}</span>
                      <span>{formatSize(doc.size)}</span>
                    </div>
                  </button>
                ))}
              </>
            )}
          </div>
        </div>

        <button
          type="button"
          style={{ ...STYLES.rescanButton, opacity: rescaning ? 0.7 : 1 }}
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
          <div>
            <div style={STYLES.logTitle}>{activeLog.title}</div>
            <div style={STYLES.logMeta}>
              <span>{formatDate(activeLog.createdAt)}</span>
              {activeLog.event && <span>· 事件：{activeLog.event}</span>}
              {activeLog.reportId && (
                <span>
                  · 关联汇报：<Link to={`/reports/${activeLog.reportId}`}>{activeLog.reportId}</Link>
                </span>
              )}
              {(activeLog.tags || []).map((tag) => (
                <span key={tag}>· {tag}</span>
              ))}
            </div>
            <div style={STYLES.logBody}>
              此条目来自 Skill 托管日志。后续日志写入会优先接入项目已有 harness；
              只有项目没有合适位置时才使用托管日志作为 fallback。
            </div>
          </div>
        )}

        {!selected && (
          <div style={STYLES.contentEmpty}>
            选择左侧导航中的条目查看详情
          </div>
        )}
      </main>
    </div>
  );
}
