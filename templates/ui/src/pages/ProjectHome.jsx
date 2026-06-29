import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { fetchLogs, fetchProjectConfig, fetchReports } from '../lib/api';

const ICONS = {
  file: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
    </svg>
  ),
  doc: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>
  ),
  report: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/>
    </svg>
  ),
};

const STYLES = {
  page: { display: 'flex', flexDirection: 'column', gap: 'var(--vd-space-6)' },

  /* ── Project Header Card ── */
  projectCard: {
    background: 'var(--vd-surface-bg)',
    borderRadius: 'var(--vd-radius-lg)',
    border: '1px solid var(--vd-border-default)',
    padding: 'var(--vd-space-6)',
    display: 'flex',
    alignItems: 'flex-start',
    gap: 'var(--vd-space-6)',
    flexWrap: 'wrap',
  },
  projectIcon: {
    width: 48,
    height: 48,
    borderRadius: 'var(--vd-radius-lg)',
    background: 'var(--vd-primary)',
    color: 'var(--vd-text-inverse)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 'var(--vd-font-size-xl)',
    fontWeight: 'var(--vd-font-weight-bold)',
    flexShrink: 0,
  },
  projectInfo: { flex: 1, minWidth: 200 },
  projectName: {
    fontSize: 'var(--vd-font-size-2xl)',
    fontWeight: 'var(--vd-font-weight-bold)',
    color: 'var(--vd-text-primary)',
    marginBottom: 'var(--vd-space-1)',
  },
  projectDesc: {
    fontSize: 'var(--vd-font-size-sm)',
    color: 'var(--vd-text-secondary)',
    lineHeight: 'var(--vd-line-height-normal)',
    maxWidth: 500,
  },
  /* ── Loading & Empty State ── */
  loadingState: {
    textAlign: 'center',
    padding: 'var(--vd-space-16) var(--vd-space-6)',
    color: 'var(--vd-text-tertiary)',
  },

  /* ── Recent Review Cards ── */
  sectionGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: 'var(--vd-space-4)',
  },
  sectionCard: {
    background: 'var(--vd-surface-bg)',
    borderRadius: 'var(--vd-radius-lg)',
    border: '1px solid var(--vd-border-default)',
    padding: 'var(--vd-space-6)',
    minHeight: 160,
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--vd-space-4)',
  },
  sectionCardHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionIcon: {
    width: 40,
    height: 40,
    borderRadius: 'var(--vd-radius-md)',
    background: 'var(--vd-primary-bg)',
    color: 'var(--vd-primary)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionArrow: {
    fontSize: 'var(--vd-font-size-sm)',
    color: 'var(--vd-text-tertiary)',
    textDecoration: 'none',
  },
  sectionTitle: {
    fontSize: 'var(--vd-font-size-lg)',
    fontWeight: 'var(--vd-font-weight-semibold)',
    color: 'var(--vd-text-primary)',
  },
  sectionDescription: {
    fontSize: 'var(--vd-font-size-sm)',
    color: 'var(--vd-text-secondary)',
    lineHeight: 'var(--vd-line-height-normal)',
  },
  itemList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--vd-space-2)',
  },
  itemLink: {
    display: 'block',
    padding: 'var(--vd-space-3)',
    borderRadius: 'var(--vd-radius-md)',
    background: 'var(--vd-page-bg)',
    border: '1px solid var(--vd-border-subtle)',
    textDecoration: 'none',
    transition: 'border-color var(--vd-transition-fast), background var(--vd-transition-fast)',
  },
  itemTitle: {
    fontSize: 'var(--vd-font-size-sm)',
    fontWeight: 'var(--vd-font-weight-medium)',
    color: 'var(--vd-text-primary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    marginBottom: 2,
  },
  itemMeta: {
    fontSize: 'var(--vd-font-size-xs)',
    color: 'var(--vd-text-tertiary)',
  },
  emptyText: {
    padding: 'var(--vd-space-4)',
    borderRadius: 'var(--vd-radius-md)',
    background: 'var(--vd-page-bg)',
    color: 'var(--vd-text-tertiary)',
    fontSize: 'var(--vd-font-size-sm)',
  },
};

function formatTime(value) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleDateString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export default function ProjectHome() {
  const [project, setProject] = useState(null);
  const [reports, setReports] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetchProjectConfig(),
      fetchReports({ limit: 3 }),
      fetchLogs({ limit: 3 }),
    ]).then(([proj, reportData, logData]) => {
      setProject(proj);
      setReports((reportData.reports || []).slice(0, 3));
      setLogs((logData.logs || []).slice(0, 3));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={STYLES.loadingState}>
        <div style={{ fontSize: 'var(--vd-font-size-lg)', marginBottom: 'var(--vd-space-2)' }}>加载中...</div>
      </div>
    );
  }

  const projectName = project?.name || '未命名项目';
  const projectDesc = project?.description || '';
  const projectInitial = projectName.charAt(0);

  return (
    <div style={STYLES.page}>
      {/* Project Header Card */}
      <div style={STYLES.projectCard}>
        <div style={STYLES.projectIcon}>{projectInitial}</div>
        <div style={STYLES.projectInfo}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--vd-space-3)', marginBottom: 'var(--vd-space-2)' }}>
            <h1 style={STYLES.projectName}>{projectName}</h1>
          </div>
          <p style={STYLES.projectDesc}>{projectDesc}</p>
        </div>
      </div>

      <div style={STYLES.sectionGrid}>
        <section style={STYLES.sectionCard}>
          <div style={STYLES.sectionCardHeader}>
            <div style={STYLES.sectionIcon}>{ICONS.report}</div>
            <Link to="/reports" style={STYLES.sectionArrow}>查看全部</Link>
          </div>
          <div>
            <h2 style={STYLES.sectionTitle}>汇报</h2>
            <p style={STYLES.sectionDescription}>最近更新的项目汇报。</p>
          </div>
          <div style={STYLES.itemList}>
            {reports.length === 0 ? (
              <div style={STYLES.emptyText}>暂无汇报</div>
            ) : reports.map((report) => (
              <Link key={report.id} to={`/reports/${report.id}`} style={STYLES.itemLink}>
                <div style={STYLES.itemTitle}>{report.title}</div>
                <div style={STYLES.itemMeta}>
                  {formatTime(report.updated_at || report.updatedAt || report.created_at || report.createdAt)}
                </div>
              </Link>
            ))}
          </div>
        </section>
        <section style={STYLES.sectionCard}>
          <div style={STYLES.sectionCardHeader}>
            <div style={STYLES.sectionIcon}>{ICONS.doc}</div>
            <Link to="/logs" style={STYLES.sectionArrow}>查看全部</Link>
          </div>
          <div>
            <h2 style={STYLES.sectionTitle}>日志</h2>
            <p style={STYLES.sectionDescription}>最近更新的项目日志。</p>
          </div>
          <div style={STYLES.itemList}>
            {logs.length === 0 ? (
              <div style={STYLES.emptyText}>暂无日志</div>
            ) : logs.map((log) => (
              <Link
                key={log.id}
                to={log.reportId ? `/reports/${log.reportId}` : '/logs'}
                style={STYLES.itemLink}
              >
                <div style={STYLES.itemTitle}>{log.title}</div>
                <div style={STYLES.itemMeta}>{formatTime(log.updatedAt || log.createdAt)}</div>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
