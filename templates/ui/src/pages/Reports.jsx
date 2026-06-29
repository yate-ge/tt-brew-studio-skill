import { useState, useEffect, useMemo } from 'react';
import {
  commitFeedback,
  fetchReport,
  fetchReports,
  revokeFeedback,
  saveFeedbackDraft,
} from '../lib/api';
import { useDesignTokens } from '../hooks/useDesignTokens';
import ContentRenderer from '../components/ContentRenderer';
import FeedbackSidebar from '../components/feedback/FeedbackSidebar';

const STATUS_BADGES = {
  normal: { label: '正常', bg: 'var(--vd-success-bg)', color: 'var(--vd-success)', border: 'var(--vd-success-border)' },
  pending_feedback: { label: '待反馈', bg: 'var(--vd-warning-bg)', color: 'var(--vd-warning)', border: 'var(--vd-warning-border)' },
  draft: { label: '草稿', bg: 'var(--vd-warning-bg)', color: 'var(--vd-warning)', border: 'var(--vd-warning-border)' },
  progress: { label: '进行中', bg: 'var(--vd-info-bg)', color: 'var(--vd-info)', border: 'var(--vd-info-border)' },
  submitted: { label: '已提交', bg: 'var(--vd-success-bg)', color: 'var(--vd-success)', border: 'var(--vd-success-border)' },
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
  reportItem: (active) => ({
    width: '100%',
    padding: 'var(--vd-space-3)',
    borderRadius: 'var(--vd-radius-md)',
    border: `1px solid ${active ? 'var(--vd-primary-border)' : 'var(--vd-border-subtle)'}`,
    background: active ? 'var(--vd-primary-bg)' : 'var(--vd-surface-bg)',
    color: 'var(--vd-text-primary)',
    textAlign: 'left',
    fontFamily: 'inherit',
    cursor: 'pointer',
    transition: 'background var(--vd-transition-fast), border-color var(--vd-transition-fast)',
  }),
  reportTitle: {
    fontSize: 'var(--vd-font-size-sm)',
    fontWeight: 'var(--vd-font-weight-semibold)',
    color: 'var(--vd-text-primary)',
    marginBottom: 4,
  },
  reportMeta: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 'var(--vd-space-2)',
    color: 'var(--vd-text-tertiary)',
    fontSize: 'var(--vd-font-size-xs)',
  },
  badge: (status) => ({
    padding: '1px 7px',
    borderRadius: 'var(--vd-radius-xl)',
    fontSize: 10,
    fontWeight: 'var(--vd-font-weight-medium)',
    background: STATUS_BADGES[status]?.bg || 'var(--vd-surface-hover)',
    color: STATUS_BADGES[status]?.color || 'var(--vd-text-secondary)',
    border: `1px solid ${STATUS_BADGES[status]?.border || 'var(--vd-border-subtle)'}`,
    whiteSpace: 'nowrap',
  }),
  contentPane: {
    minWidth: 0,
    minHeight: 'calc(100dvh - 32px)',
    background: 'var(--vd-surface-bg)',
    borderRadius: 'var(--vd-radius-lg)',
    border: '1px solid var(--vd-border-default)',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  contentHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 'var(--vd-space-4)',
    padding: 'var(--vd-space-5) var(--vd-space-6)',
    borderBottom: '1px solid var(--vd-border-subtle)',
  },
  contentTitle: {
    fontSize: 'var(--vd-font-size-xl)',
    fontWeight: 'var(--vd-font-weight-bold)',
    color: 'var(--vd-text-primary)',
    marginBottom: 'var(--vd-space-2)',
  },
  contentMeta: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 'var(--vd-space-2)',
    color: 'var(--vd-text-tertiary)',
    fontSize: 'var(--vd-font-size-xs)',
  },
  contentBody: {
    padding: 'var(--vd-space-6)',
    minHeight: 0,
    flex: 1,
  },
  reportWorkspace: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) 320px',
    gap: 'var(--vd-space-5)',
    alignItems: 'flex-start',
  },
  reportContent: {
    minWidth: 0,
  },
  feedbackRail: {
    minWidth: 0,
  },
  emptyState: {
    height: '100%',
    minHeight: 420,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--vd-text-tertiary)',
    fontSize: 'var(--vd-font-size-sm)',
    textAlign: 'center',
    padding: 'var(--vd-space-6)',
  },
  navEmpty: {
    padding: 'var(--vd-space-5) var(--vd-space-3)',
    border: '1px dashed var(--vd-border-default)',
    borderRadius: 'var(--vd-radius-md)',
    color: 'var(--vd-text-tertiary)',
    fontSize: 'var(--vd-font-size-sm)',
    textAlign: 'center',
  },
  specFallback: {
    padding: 'var(--vd-space-5)',
    borderRadius: 'var(--vd-radius-md)',
    border: '1px solid var(--vd-border-subtle)',
    background: 'var(--vd-page-bg)',
    color: 'var(--vd-text-secondary)',
    lineHeight: 'var(--vd-line-height-relaxed)',
  },
  loadingState: {
    textAlign: 'center',
    padding: 'var(--vd-space-16) var(--vd-space-6)',
    color: 'var(--vd-text-tertiary)',
  },
};

function statusLabel(status) {
  return STATUS_BADGES[status]?.label || status || '未知';
}

function structureLabel(report) {
  return report?.structure === 'complex-review' ? '复杂任务评审' : '标准汇报';
}

function formatDate(value) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleDateString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return value;
  }
}

function getReportDate(report) {
  return report.updated_at || report.created_at || report.updatedAt || report.createdAt;
}

function createDraftItem(item) {
  return {
    ...item,
    id: item.id || `fd_local_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    created_at: item.created_at || new Date().toISOString(),
  };
}

function renderReportContent(report, tokens, feedbackHandlers) {
  if (!report?.content) {
    return <div style={STYLES.emptyState}>这份汇报没有可渲染内容</div>;
  }

  if (report.content.type === 'ui_spec') {
    return (
      <div style={STYLES.specFallback}>
        {report.content.ui_spec?.description || '这份汇报使用 UI Spec 格式，当前页面暂不支持直接渲染。'}
      </div>
    );
  }

  return (
    <ContentRenderer
      content={report.content}
      tokens={tokens}
      onCreateAnnotation={feedbackHandlers.addDraftItem}
      onCreateInteractive={feedbackHandlers.addDraftItem}
      onReplaceDraft={feedbackHandlers.replaceDraftByAction}
      drafts={feedbackHandlers.drafts}
    />
  );
}

export default function Reports() {
  const tokens = useDesignTokens();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedReportId, setSelectedReportId] = useState(null);
  const [selectedReport, setSelectedReport] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [drafts, setDrafts] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    let canceled = false;
    fetchReports()
      .then((data) => {
        if (canceled) return;
        const nextReports = data.reports || [];
        setReports(nextReports);
        if (!selectedReportId && nextReports.length > 0) {
          setSelectedReportId(nextReports[0].id);
        }
      })
      .catch(() => {
        if (!canceled) setReports([]);
      })
      .finally(() => {
        if (!canceled) setLoading(false);
      });
    return () => { canceled = true; };
  }, []);

  useEffect(() => {
    let canceled = false;
    if (!selectedReportId) {
      setSelectedReport(null);
      return () => { canceled = true; };
    }

    setDetailLoading(true);
    fetchReport(selectedReportId)
      .then((report) => {
        if (!canceled) {
          setSelectedReport(report);
          setDrafts(report.drafts || []);
        }
      })
      .catch(() => {
        if (!canceled) {
          setSelectedReport(null);
          setDrafts([]);
        }
      })
      .finally(() => {
        if (!canceled) setDetailLoading(false);
      });

    return () => { canceled = true; };
  }, [selectedReportId]);

  async function reloadSelectedReport() {
    if (!selectedReportId) return null;
    const report = await fetchReport(selectedReportId);
    setSelectedReport(report);
    setDrafts(report.drafts || []);
    return report;
  }

  async function persistDrafts(nextDrafts) {
    setDrafts(nextDrafts);
    if (!selectedReportId) return;
    try {
      await saveFeedbackDraft(selectedReportId, nextDrafts);
    } catch {
      /* keep local draft state so the user can retry */
    }
  }

  function addDraftItem(item) {
    persistDrafts([...drafts, createDraftItem(item)]);
  }

  function removeDraftItem(draftId) {
    persistDrafts(drafts.filter((item) => item.id !== draftId));
  }

  function replaceDraftByAction(oldAction, itemId) {
    const nextDrafts = drafts.filter((item) => {
      if (item.kind !== 'interactive') return true;
      const draftAction = item.payload?.action;
      const draftItemId = item.payload?.['item-id'] || '';
      return !(draftAction === oldAction && draftItemId === itemId);
    });
    if (nextDrafts.length !== drafts.length) {
      persistDrafts(nextDrafts);
    }
  }

  async function handleCommitFeedback() {
    if (!selectedReportId || drafts.length === 0) return;
    setSubmitting(true);
    try {
      await commitFeedback(selectedReportId, drafts);
      await persistDrafts([]);
      await reloadSelectedReport();
      setReports((items) => items.map((item) => (
        item.id === selectedReportId ? { ...item, status: 'pending_feedback' } : item
      )));
    } catch {
      /* keep drafts for retry */
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRevokeFeedback(feedbackId) {
    if (!selectedReportId) return;
    try {
      await revokeFeedback(selectedReportId, [feedbackId]);
      await reloadSelectedReport();
    } catch {
      /* keep current state */
    }
  }

  const statusOptions = useMemo(() => {
    const counts = new Map();
    reports.forEach((report) => {
      counts.set(report.status, (counts.get(report.status) || 0) + 1);
    });
    return Array.from(counts.entries()).map(([status, count]) => ({ status, count }));
  }, [reports]);

  const filteredReports = useMemo(() => {
    const query = search.trim().toLowerCase();
    return reports.filter((report) => {
      const statusMatches = statusFilter === 'all' || report.status === statusFilter;
      const searchMatches = !query || `${report.title} ${report.metadata?.task_name || ''}`.toLowerCase().includes(query);
      return statusMatches && searchMatches;
    });
  }, [reports, search, statusFilter]);

  useEffect(() => {
    if (filteredReports.length === 0) {
      if (selectedReportId) setSelectedReportId(null);
      return;
    }
    if (!filteredReports.some((report) => report.id === selectedReportId)) {
      setSelectedReportId(filteredReports[0].id);
    }
  }, [filteredReports, selectedReportId]);

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
          <div style={STYLES.title}>汇报</div>
          <div style={STYLES.summary}>
            {reports.length} 份汇报 · {filteredReports.length} 份当前可见
          </div>
        </div>

        <input
          type="text"
          placeholder="搜索汇报..."
          style={STYLES.search}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />

        <div style={STYLES.navScroll}>
          <div style={STYLES.group}>
            <div style={STYLES.groupTitle}>状态</div>
            <button
              type="button"
              style={STYLES.navButton(statusFilter === 'all')}
              onClick={() => setStatusFilter('all')}
            >
              <span>全部汇报</span>
              <span style={STYLES.count}>{reports.length}</span>
            </button>
            {statusOptions.map((item) => (
              <button
                type="button"
                key={item.status}
                style={STYLES.navButton(statusFilter === item.status)}
                onClick={() => setStatusFilter(item.status)}
              >
                <span>{statusLabel(item.status)}</span>
                <span style={STYLES.count}>{item.count}</span>
              </button>
            ))}
          </div>

          <div style={STYLES.group}>
            <div style={STYLES.groupTitle}>汇报列表</div>
            {filteredReports.length === 0 ? (
              <div style={STYLES.navEmpty}>当前筛选条件下没有汇报</div>
            ) : (
              filteredReports.map((report) => (
                <button
                  type="button"
                  key={report.id}
                  style={STYLES.reportItem(selectedReportId === report.id)}
                  onClick={() => setSelectedReportId(report.id)}
                >
                  <div style={STYLES.reportTitle}>{report.title}</div>
                  <div style={STYLES.reportMeta}>
                    <span style={STYLES.badge(report.status)}>{statusLabel(report.status)}</span>
                    <span>{structureLabel(report)}</span>
                    <span>{formatDate(getReportDate(report))}</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      </aside>

      <main style={STYLES.contentPane}>
        {!selectedReportId && (
          <div style={STYLES.emptyState}>选择左侧汇报查看内容</div>
        )}

        {selectedReportId && detailLoading && (
          <div style={STYLES.emptyState}>正在读取汇报...</div>
        )}

        {selectedReportId && !detailLoading && selectedReport && (
          <>
            <div style={STYLES.contentHeader}>
              <div>
                <div style={STYLES.contentTitle}>{selectedReport.title}</div>
                <div style={STYLES.contentMeta}>
                  <span style={STYLES.badge(selectedReport.status)}>{statusLabel(selectedReport.status)}</span>
                  <span>{structureLabel(selectedReport)}</span>
                  <span>{formatDate(getReportDate(selectedReport))}</span>
                </div>
              </div>
            </div>
            <div style={STYLES.contentBody}>
              <div style={STYLES.reportWorkspace}>
                <div style={STYLES.reportContent}>
                  {renderReportContent(selectedReport, tokens, {
                    addDraftItem,
                    replaceDraftByAction,
                    drafts,
                  })}
                </div>
                <div style={STYLES.feedbackRail}>
                  <FeedbackSidebar
                    drafts={drafts}
                    feedback={selectedReport.feedback || []}
                    onRemoveDraft={removeDraftItem}
                    onAddInteractive={addDraftItem}
                    onCommit={handleCommitFeedback}
                    onRevoke={handleRevokeFeedback}
                    submitting={submitting}
                  />
                </div>
              </div>
            </div>
          </>
        )}

        {selectedReportId && !detailLoading && !selectedReport && (
          <div style={STYLES.emptyState}>无法读取这份汇报</div>
        )}
      </main>
    </div>
  );
}
