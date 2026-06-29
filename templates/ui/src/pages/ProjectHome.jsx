import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { fetchProjectConfig, fetchReports } from '../lib/api';

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
  pulse: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
    </svg>
  ),
  check: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
    </svg>
  ),
  edit: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>
  ),
  report: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
  projectActions: {
    display: 'flex',
    gap: 'var(--vd-space-2)',
    flexWrap: 'wrap',
    marginTop: 'var(--vd-space-4)',
  },
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
    transition: 'all var(--vd-transition-fast)',
    textDecoration: 'none',
  },
  btnSecondary: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--vd-space-2)',
    padding: 'var(--vd-space-2) var(--vd-space-4)',
    borderRadius: 'var(--vd-radius-md)',
    background: 'transparent',
    color: 'var(--vd-text-secondary)',
    border: '1px solid var(--vd-border-default)',
    fontSize: 'var(--vd-font-size-sm)',
    fontWeight: 'var(--vd-font-weight-medium)',
    cursor: 'pointer',
    transition: 'all var(--vd-transition-fast)',
    textDecoration: 'none',
  },
  stageTag: {
    padding: 'var(--vd-space-1) var(--vd-space-3)',
    borderRadius: 'var(--vd-radius-xl)',
    fontSize: 'var(--vd-font-size-xs)',
    fontWeight: 'var(--vd-font-weight-medium)',
    background: 'var(--vd-primary-bg)',
    color: 'var(--vd-primary)',
    border: '1px solid var(--vd-primary-border)',
    whiteSpace: 'nowrap',
  },

  /* ── Metrics Row ── */
  metricsRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: 'var(--vd-space-4)',
  },
  metricCard: {
    background: 'var(--vd-surface-bg)',
    borderRadius: 'var(--vd-radius-lg)',
    border: '1px solid var(--vd-border-default)',
    padding: 'var(--vd-space-4)',
    display: 'flex',
    alignItems: 'flex-start',
    gap: 'var(--vd-space-3)',
  },
  metricIcon: (color) => ({
    width: 40,
    height: 40,
    borderRadius: 'var(--vd-radius-md)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    background: `color-mix(in srgb, ${color} 10%, transparent)`,
    color: color,
  }),
  metricValue: {
    fontSize: 'var(--vd-font-size-2xl)',
    fontWeight: 'var(--vd-font-weight-bold)',
    lineHeight: 1,
    marginBottom: 'var(--vd-space-1)',
  },
  metricLabel: {
    fontSize: 'var(--vd-font-size-xs)',
    color: 'var(--vd-text-tertiary)',
  },

  /* ── Loading & Empty State ── */
  loadingState: {
    textAlign: 'center',
    padding: 'var(--vd-space-16) var(--vd-space-6)',
    color: 'var(--vd-text-tertiary)',
  },

  /* ── Action Cards ── */
  actionSection: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
    gap: 'var(--vd-space-4)',
  },
  actionCard: (borderColor) => ({
    background: 'var(--vd-surface-bg)',
    borderRadius: 'var(--vd-radius-lg)',
    border: `1px solid ${borderColor || 'var(--vd-border-default)'}`,
    padding: 'var(--vd-space-4)',
  }),
  actionCardHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 'var(--vd-space-3)',
  },
  actionCardTitle: {
    fontSize: 'var(--vd-font-size-sm)',
    fontWeight: 'var(--vd-font-weight-semibold)',
    color: 'var(--vd-text-primary)',
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--vd-space-2)',
  },
  actionCardCount: {
    fontSize: 'var(--vd-font-size-xs)',
    fontWeight: 'var(--vd-font-weight-medium)',
    padding: '1px 8px',
    borderRadius: 'var(--vd-radius-xl)',
  },

  /* ── Quick Access Grid ── */
  quickGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    gap: 'var(--vd-space-3)',
  },
  quickCard: {
    padding: 'var(--vd-space-4)',
    borderRadius: 'var(--vd-radius-lg)',
    border: '1px solid var(--vd-border-default)',
    background: 'var(--vd-surface-bg)',
    textDecoration: 'none',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 'var(--vd-space-2)',
    transition: 'all var(--vd-transition-fast)',
    cursor: 'pointer',
  },
  quickCardIcon: {
    width: 36,
    height: 36,
    borderRadius: 'var(--vd-radius-md)',
    background: 'var(--vd-page-bg)',
    color: 'var(--vd-text-secondary)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickCardLabel: {
    fontSize: 'var(--vd-font-size-sm)',
    fontWeight: 'var(--vd-font-weight-medium)',
    color: 'var(--vd-text-secondary)',
  },
};

function MetricCard({ metric }) {
  const color = getMetricColor(metric.key, metric.value, metric.threshold);
  return (
    <div style={STYLES.metricCard}>
      <div style={STYLES.metricIcon(color)}>{ICONS[metric.icon]}</div>
      <div>
        <div style={{ ...STYLES.metricValue, color }}>{metric.value}</div>
        <div style={STYLES.metricLabel}>{metric.label}</div>
      </div>
    </div>
  );
}

function getMetricColor(key, value, threshold) {
  if (!threshold) return 'var(--vd-primary)';
  if (value >= (threshold.danger || 999)) return 'var(--vd-danger)';
  if (value >= (threshold.warn || 999)) return 'var(--vd-warning)';
  return 'var(--vd-success)';
}

const STAGE_LABELS = {
  requirements: '需求对齐',
  dev: '开发中',
  review: '评审中',
  done: '已收尾',
};

export default function ProjectHome() {
  const [project, setProject] = useState(null);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetchProjectConfig(),
      fetchReports({ limit: 5 }),
    ]).then(([proj, repData]) => {
      setProject(proj);
      setReports(repData.reports || []);
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
  const projectStage = project?.stage || 'dev';

  // Compute metrics from real data
  const inProgressReports = reports.filter((r) => r.status === 'draft' || r.status === 'progress').length;
  const totalReports = reports.length;

  const metrics = [
    { key: 'reports', label: '进行中的汇报', value: inProgressReports, threshold: { warn: 1, danger: 2 }, icon: 'file' },
    { key: 'totalReports', label: '总汇报数', value: totalReports, icon: 'report' },
  ];

  // Continue current report (pick first in-progress)
  const currentReport = reports.find((r) => r.status === 'draft' || r.status === 'progress');

  return (
    <div style={STYLES.page}>
      {/* Project Header Card */}
      <div style={STYLES.projectCard}>
        <div style={STYLES.projectIcon}>{projectInitial}</div>
        <div style={STYLES.projectInfo}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--vd-space-3)', marginBottom: 'var(--vd-space-2)' }}>
            <h1 style={STYLES.projectName}>{projectName}</h1>
            <span style={STYLES.stageTag}>{STAGE_LABELS[projectStage] || projectStage}</span>
          </div>
          <p style={STYLES.projectDesc}>{projectDesc}</p>
          <div style={STYLES.projectActions}>
            <Link to="/reports" style={STYLES.btnPrimary}>
              {ICONS.report}
              继续当前工作
            </Link>
            <Link to="/reports/new" style={STYLES.btnSecondary}>
              {ICONS.edit}
              新建汇报
            </Link>
          </div>
        </div>
      </div>

      {/* Status Metrics */}
      <div style={STYLES.metricsRow}>
        {metrics.map((m) => (
          <MetricCard key={m.key} metric={m} />
        ))}
      </div>

      {/* Action Cards */}
      <div style={STYLES.actionSection}>
        {/* Continue Report Card */}
        <div style={STYLES.actionCard()}>
          <div style={STYLES.actionCardHeader}>
            <div style={STYLES.actionCardTitle}>
              {ICONS.file}
              继续当前汇报
            </div>
            <span style={{
              ...STYLES.actionCardCount,
              background: currentReport ? 'var(--vd-primary-bg)' : 'transparent',
              color: currentReport ? 'var(--vd-primary)' : 'var(--vd-text-tertiary)',
            }}>
              {currentReport ? '进行中' : '暂无'}
            </span>
          </div>
          {currentReport ? (
            <>
              <div style={{ fontSize: 'var(--vd-font-size-sm)', color: 'var(--vd-text-primary)', fontWeight: 500 }}>
                {currentReport.title}
              </div>
              <div style={{ fontSize: 'var(--vd-font-size-xs)', color: 'var(--vd-text-tertiary)', marginTop: 4 }}>
                {currentReport.structure === 'complex-review' ? '复杂任务评审' : '标准汇报'}
                {currentReport.completedSections != null && ` · ${currentReport.completedSections}/${currentReport.sections} sections`}
              </div>
              <Link
                to={`/reports/${currentReport.id}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 'var(--vd-space-2)',
                  marginTop: 'var(--vd-space-3)',
                  fontSize: 'var(--vd-font-size-sm)',
                  color: 'var(--vd-primary)',
                  fontWeight: 500,
                  textDecoration: 'none',
                }}
              >
                继续编辑 →
              </Link>
            </>
          ) : (
            <div style={{ fontSize: 'var(--vd-font-size-sm)', color: 'var(--vd-text-tertiary)', padding: 'var(--vd-space-2) 0' }}>
              暂无进行中的汇报
            </div>
          )}
        </div>

        {/* Quick Summary */}
        <div style={STYLES.actionCard()}>
          <div style={STYLES.actionCardHeader}>
            <div style={STYLES.actionCardTitle}>
              {ICONS.pulse}
              汇报概览
            </div>
          </div>
          {reports.length === 0 ? (
            <div style={{ fontSize: 'var(--vd-font-size-sm)', color: 'var(--vd-text-tertiary)', padding: 'var(--vd-space-2) 0' }}>
              暂无汇报数据
            </div>
          ) : (
            reports.slice(0, 3).map((r) => (
              <div key={r.id} style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 'var(--vd-space-2)',
                padding: 'var(--vd-space-2) 0',
              }}>
                <div style={{
                  width: 28,
                  height: 28,
                  borderRadius: 'var(--vd-radius-md)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  background: r.status === 'submitted' ? 'var(--vd-success-bg)' : 'var(--vd-info-bg)',
                  color: r.status === 'submitted' ? 'var(--vd-success)' : 'var(--vd-info)',
                }}>
                  {ICONS.check}
                </div>
                <div>
                  <div style={{ fontSize: 'var(--vd-font-size-sm)', color: 'var(--vd-text-primary)' }}>{r.title}</div>
                  <div style={{ fontSize: 'var(--vd-font-size-xs)', color: 'var(--vd-text-tertiary)' }}>{r.createdAt}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Quick Access Grid */}
      <div>
        <h2 style={{ fontSize: 'var(--vd-font-size-sm)', fontWeight: 'var(--vd-font-weight-semibold)', color: 'var(--vd-text-primary)', marginBottom: 'var(--vd-space-4)' }}>快捷入口</h2>
        <div style={STYLES.quickGrid}>
          <Link to="/reports" style={STYLES.quickCard}>
            <div style={STYLES.quickCardIcon}>{ICONS.report}</div>
            <span style={STYLES.quickCardLabel}>所有汇报</span>
          </Link>
          <Link to="/logs" style={STYLES.quickCard}>
            <div style={STYLES.quickCardIcon}>{ICONS.doc}</div>
            <span style={STYLES.quickCardLabel}>日志与文档</span>
          </Link>
          <Link to="/settings" style={STYLES.quickCard}>
            <div style={STYLES.quickCardIcon}>{ICONS.pulse}</div>
            <span style={STYLES.quickCardLabel}>项目设置</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
