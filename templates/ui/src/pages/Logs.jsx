import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { fetchLogs } from '../lib/api';

const EVENT_ICONS = {
  report_submitted: { color: 'var(--vd-success)', bg: 'var(--vd-success-bg)' },
  report_created: { color: 'var(--vd-info)', bg: 'var(--vd-info-bg)' },
  feedback_addressed: { color: 'var(--vd-warning)', bg: 'var(--vd-warning-bg)' },
};

const STYLES = {
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--vd-space-6)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 'var(--vd-space-3)',
  },
  title: {
    fontSize: 'var(--vd-font-size-2xl)',
    fontWeight: 'var(--vd-font-weight-bold)',
    color: 'var(--vd-text-primary)',
  },
  searchBar: {
    padding: 'var(--vd-space-2) var(--vd-space-3)',
    borderRadius: 'var(--vd-radius-md)',
    border: '1px solid var(--vd-border-default)',
    background: 'var(--vd-surface-bg)',
    fontSize: 'var(--vd-font-size-sm)',
    color: 'var(--vd-text-primary)',
    width: 240,
  },
  loadingState: {
    textAlign: 'center',
    padding: 'var(--vd-space-16) var(--vd-space-6)',
    color: 'var(--vd-text-tertiary)',
  },
  body: {
    display: 'flex',
    gap: 'var(--vd-space-6)',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    flex: 1,
    maxWidth: 400,
    flexShrink: 0,
  },
  logItem: (selected) => ({
    padding: 'var(--vd-space-3) var(--vd-space-4)',
    borderRadius: 'var(--vd-radius-md)',
    cursor: 'pointer',
    background: selected ? 'var(--vd-primary-bg)' : 'var(--vd-surface-bg)',
    border: `1px solid ${selected ? 'var(--vd-primary-border)' : 'transparent'}`,
    transition: 'all var(--vd-transition-fast)',
    textDecoration: 'none',
    display: 'block',
  }),
  logTitle: {
    fontSize: 'var(--vd-font-size-sm)',
    fontWeight: 'var(--vd-font-weight-medium)',
    color: 'var(--vd-text-primary)',
    marginBottom: 4,
  },
  logMeta: {
    display: 'flex',
    gap: 'var(--vd-space-2)',
    alignItems: 'center',
    fontSize: 'var(--vd-font-size-xs)',
    color: 'var(--vd-text-tertiary)',
  },
  typeBadge: (type) => ({
    padding: '1px 6px',
    borderRadius: 'var(--vd-radius-sm)',
    fontSize: 10,
    fontWeight: 500,
    background: type === 'auto' ? 'var(--vd-info-bg)' : 'var(--vd-surface-hover)',
    color: type === 'auto' ? 'var(--vd-info)' : 'var(--vd-text-secondary)',
  }),
  content: {
    flex: 1,
    background: 'var(--vd-surface-bg)',
    borderRadius: 'var(--vd-radius-lg)',
    border: '1px solid var(--vd-border-default)',
    padding: 'var(--vd-space-6)',
    minHeight: 300,
  },
  contentEmpty: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    color: 'var(--vd-text-tertiary)',
    fontSize: 'var(--vd-font-size-sm)',
    minHeight: 300,
  },
  contentTitle: {
    fontSize: 'var(--vd-font-size-lg)',
    fontWeight: 'var(--vd-font-weight-semibold)',
    color: 'var(--vd-text-primary)',
    marginBottom: 'var(--vd-space-4)',
  },
  contentBody: {
    fontSize: 'var(--vd-font-size-base)',
    lineHeight: 'var(--vd-line-height-relaxed)',
    color: 'var(--vd-text-secondary)',
  },
  btnNew: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--vd-space-2)',
    padding: 'var(--vd-space-2) var(--vd-space-4)',
    borderRadius: 'var(--vd-radius-md)',
    border: '1px solid var(--vd-border-default)',
    background: 'var(--vd-surface-bg)',
    color: 'var(--vd-text-secondary)',
    fontSize: 'var(--vd-font-size-sm)',
    fontWeight: 'var(--vd-font-weight-medium)',
    cursor: 'pointer',
    textDecoration: 'none',
  },
};

function formatDate(iso) {
  try { return new Date(iso).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch { return ''; }
}

function formatDateShort(iso) {
  try { return new Date(iso).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' }); }
  catch { return ''; }
}

export default function Logs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchLogs()
      .then((data) => { setLogs(data.logs || []); setLoading(false); })
      .catch(() => { setLogs([]); setLoading(false); });
  }, []);

  const filtered = logs.filter((l) =>
    !search || l.title.toLowerCase().includes(search.toLowerCase())
  );

  const active = filtered.find((l) => l.id === selectedLog);

  if (loading) {
    return (
      <div style={STYLES.loadingState}>
        <div style={{ fontSize: 'var(--vd-font-size-lg)', marginBottom: 'var(--vd-space-2)' }}>加载中...</div>
      </div>
    );
  }

  return (
    <div style={STYLES.page}>
      <div style={STYLES.header}>
        <h1 style={STYLES.title}>日志与文档</h1>
        <div style={{ display: 'flex', gap: 'var(--vd-space-3)' }}>
          <input
            type="text"
            placeholder="搜索..."
            style={STYLES.searchBar}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button style={STYLES.btnNew}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            新建文档
          </button>
        </div>
      </div>

      {logs.length === 0 ? (
        <div style={STYLES.contentEmpty}>
          暂无日志数据
        </div>
      ) : (
        <div style={STYLES.body}>
          {/* Log list */}
          <div style={STYLES.list}>
            {filtered.map((log) => (
              <div
                key={log.id}
                style={STYLES.logItem(selectedLog === log.id)}
                onClick={() => setSelectedLog(log.id)}
              >
                <div style={STYLES.logTitle}>{log.title}</div>
                <div style={STYLES.logMeta}>
                  <span style={STYLES.typeBadge(log.type)}>
                    {log.type === 'auto' ? '自动' : '文档'}
                  </span>
                  <span>{formatDateShort(log.createdAt)}</span>
                </div>
              </div>
            ))}
            {filtered.length === 0 && (
              <div style={{ textAlign: 'center', padding: 'var(--vd-space-8)', color: 'var(--vd-text-tertiary)', fontSize: 'var(--vd-font-size-sm)' }}>
                无匹配结果
              </div>
            )}
          </div>

          {/* Log content */}
          <div style={STYLES.content}>
            {active ? (
              <>
                <div style={STYLES.contentTitle}>{active.title}</div>
                <div style={{ fontSize: 'var(--vd-font-size-xs)', color: 'var(--vd-text-tertiary)', marginBottom: 'var(--vd-space-4)' }}>
                  {formatDate(active.createdAt)}
                  {active.event && (
                    <span style={{ marginLeft: 'var(--vd-space-2)' }}>
                      · 事件：{active.event}
                    </span>
                  )}
                  {active.reportId && (
                    <span style={{ marginLeft: 'var(--vd-space-2)' }}>
                      · 关联汇报：<Link to={`/reports/${active.reportId}`}>{active.reportId}</Link>
                    </span>
                  )}
                  {active.tags && active.tags.map((t) => (
                    <span key={t} style={{
                      marginLeft: 'var(--vd-space-1)',
                      padding: '1px 6px',
                      borderRadius: 'var(--vd-radius-sm)',
                      background: 'var(--vd-surface-hover)',
                      fontSize: 10,
                    }}>
                      {t}
                    </span>
                  ))}
                </div>
                <div style={STYLES.contentBody}>
                  此条目由系统自动生成，记录了项目中的重要事件和变更。
                  {active.type === 'manual' && ' 这是一份手动创建的文档。'}
                </div>
              </>
            ) : (
              <div style={STYLES.contentEmpty}>
                选择左侧日志条目查看详情
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
