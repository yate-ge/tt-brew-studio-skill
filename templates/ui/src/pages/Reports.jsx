import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { fetchReports } from '../lib/api';

const STATUS_BADGES = {
  draft: { label: '草稿', bg: 'var(--vd-warning-bg)', color: 'var(--vd-warning)', border: 'var(--vd-warning-border)' },
  progress: { label: '进行中', bg: 'var(--vd-info-bg)', color: 'var(--vd-info)', border: 'var(--vd-info-border)' },
  submitted: { label: '已提交', bg: 'var(--vd-success-bg)', color: 'var(--vd-success)', border: 'var(--vd-success-border)' },
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
  loadingState: {
    textAlign: 'center',
    padding: 'var(--vd-space-16) var(--vd-space-6)',
    color: 'var(--vd-text-tertiary)',
  },
  list: {
    background: 'var(--vd-surface-bg)',
    borderRadius: 'var(--vd-radius-lg)',
    border: '1px solid var(--vd-border-default)',
    overflow: 'hidden',
  },
  listItem: {
    display: 'flex',
    alignItems: 'center',
    padding: 'var(--vd-space-4)',
    borderBottom: '1px solid var(--vd-border-subtle)',
    textDecoration: 'none',
    transition: 'background var(--vd-transition-fast)',
    cursor: 'pointer',
    gap: 'var(--vd-space-4)',
  },
  reportIcon: (type) => ({
    width: 36,
    height: 36,
    borderRadius: 'var(--vd-radius-md)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    background: type === 'complex-review' ? 'var(--vd-primary-bg)' : 'var(--vd-success-bg)',
    color: type === 'complex-review' ? 'var(--vd-primary)' : 'var(--vd-success)',
  }),
  reportInfo: { flex: 1, minWidth: 0 },
  reportTitle: {
    fontSize: 'var(--vd-font-size-base)',
    fontWeight: 'var(--vd-font-weight-medium)',
    color: 'var(--vd-text-primary)',
    marginBottom: 2,
  },
  reportMeta: {
    fontSize: 'var(--vd-font-size-xs)',
    color: 'var(--vd-text-tertiary)',
    display: 'flex',
    gap: 'var(--vd-space-3)',
    flexWrap: 'wrap',
  },
  badge: (s) => ({
    padding: '1px 8px',
    borderRadius: 'var(--vd-radius-xl)',
    fontSize: 11,
    fontWeight: 'var(--vd-font-weight-medium)',
    background: STATUS_BADGES[s]?.bg || 'var(--vd-warning-bg)',
    color: STATUS_BADGES[s]?.color || 'var(--vd-warning)',
    border: `1px solid ${STATUS_BADGES[s]?.border || 'transparent'}`,
    whiteSpace: 'nowrap',
  }),
  btnPrimary: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--vd-space-2)',
    padding: 'var(--vd-space-2) var(--vd-space-4)',
    borderRadius: 'var(--vd-radius-md)',
    background: 'var(--vd-primary)',
    color: 'var(--vd-text-inverse)',
    border: 'none',
    fontSize: 'var(--vd-font-size-sm)',
    fontWeight: 'var(--vd-font-weight-medium)',
    cursor: 'pointer',
    textDecoration: 'none',
  },
  emptyState: {
    textAlign: 'center',
    padding: 'var(--vd-space-16) var(--vd-space-6)',
    color: 'var(--vd-text-tertiary)',
  },
  progressBar: {
    height: 4,
    borderRadius: 2,
    background: 'var(--vd-border-default)',
    marginTop: 'var(--vd-space-2)',
    overflow: 'hidden',
  },
  progressFill: (pct) => ({
    height: '100%',
    borderRadius: 2,
    background: 'var(--vd-primary)',
    transition: 'width var(--vd-transition-slow)',
    width: `${pct}%`,
  }),
};

export default function Reports() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchReports()
      .then((data) => { setReports(data.reports || []); setLoading(false); })
      .catch(() => { setReports([]); setLoading(false); });
  }, []);

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
        <h1 style={STYLES.title}>汇报</h1>
        <Link to="/reports/new" style={STYLES.btnPrimary}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          新建汇报
        </Link>
      </div>

      {reports.length === 0 ? (
        <div style={STYLES.emptyState}>
          <div style={{ fontSize: 'var(--vd-font-size-lg)', marginBottom: 'var(--vd-space-2)' }}>暂无汇报</div>
          <div>创建第一份汇报来开始项目协作</div>
        </div>
      ) : (
        <div style={STYLES.list}>
          {reports.map((r) => (
            <Link key={r.id} to={`/reports/${r.id}`} style={STYLES.listItem}>
              <div style={STYLES.reportIcon(r.structure)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                  <line x1="3" y1="9" x2="21" y2="9"/>
                </svg>
              </div>
              <div style={STYLES.reportInfo}>
                <div style={STYLES.reportTitle}>{r.title}</div>
                <div style={STYLES.reportMeta}>
                  <span>{r.structure === 'complex-review' ? '复杂任务评审' : '标准汇报'}</span>
                  <span>·</span>
                  <span>{r.presentation}</span>
                  <span>·</span>
                  <span>{r.createdAt}</span>
                  {r.structure === 'complex-review' && r.completedSections != null && (
                    <>
                      <span>·</span>
                      <span>{r.completedSections}/{r.sections} sections</span>
                    </>
                  )}
                </div>
                {r.structure === 'complex-review' && r.completedSections != null && (
                  <div style={STYLES.progressBar}>
                    <div style={STYLES.progressFill((r.completedSections / r.sections) * 100)} />
                  </div>
                )}
              </div>
              <div style={STYLES.badge(r.status)}>
                {STATUS_BADGES[r.status]?.label || r.status}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
