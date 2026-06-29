import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { fetchReport, fetchReportFeedback, addReportFeedback, confirmReportFeedback } from '../lib/api';

const STATUS_BADGES = {
  completed: { label: '已完成', bg: 'var(--vd-success-bg)', color: 'var(--vd-success)' },
  progress: { label: '进行中', bg: 'var(--vd-info-bg)', color: 'var(--vd-info)' },
  pending: { label: '待处理', bg: 'var(--vd-border-default)', color: 'var(--vd-text-tertiary)' },
};

const FB_STATUS_LABELS = {
  tracked: '待处理',
  addressed: '已处理',
  confirmed: '已确认',
};

const FB_STATUS_COLORS = {
  tracked: { bg: 'var(--vd-warning-bg)', color: 'var(--vd-warning)', border: 'var(--vd-warning-border)' },
  addressed: { bg: 'var(--vd-info-bg)', color: 'var(--vd-info)', border: 'var(--vd-info-border)' },
  confirmed: { bg: 'var(--vd-success-bg)', color: 'var(--vd-success)', border: 'var(--vd-success-border)' },
};

const STYLES = {
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--vd-space-4)',
  },
  loadingState: {
    textAlign: 'center',
    padding: 'var(--vd-space-16)',
    color: 'var(--vd-text-tertiary)',
  },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 'var(--vd-space-3)',
    marginBottom: 'var(--vd-space-2)',
  },
  backLink: {
    fontSize: 'var(--vd-font-size-sm)',
    color: 'var(--vd-text-secondary)',
    textDecoration: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--vd-space-1)',
    marginBottom: 'var(--vd-space-3)',
  },
  title: {
    fontSize: 'var(--vd-font-size-2xl)',
    fontWeight: 'var(--vd-font-weight-bold)',
    color: 'var(--vd-text-primary)',
  },
  meta: {
    display: 'flex',
    gap: 'var(--vd-space-3)',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: 'var(--vd-space-2)',
  },
  badge: (color) => ({
    padding: '2px 8px',
    borderRadius: 'var(--vd-radius-xl)',
    fontSize: 11,
    fontWeight: 'var(--vd-font-weight-medium)',
    background: STATUS_BADGES[color]?.bg,
    color: STATUS_BADGES[color]?.color,
  }),
  body: {
    display: 'flex',
    gap: 'var(--vd-space-6)',
    flex: 1,
    minHeight: 0,
  },
  sectionNav: {
    width: 180,
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  sectionNavItem: (active) => ({
    padding: 'var(--vd-space-2) var(--vd-space-3)',
    borderRadius: 'var(--vd-radius-md)',
    fontSize: 'var(--vd-font-size-sm)',
    fontWeight: active ? 'var(--vd-font-weight-medium)' : 'var(--vd-font-weight-normal)',
    color: active ? 'var(--vd-primary)' : 'var(--vd-text-secondary)',
    background: active ? 'var(--vd-primary-bg)' : 'transparent',
    cursor: 'pointer',
    border: 'none',
    textAlign: 'left',
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--vd-space-2)',
    transition: 'all var(--vd-transition-fast)',
  }),
  statusDot: (status) => ({
    width: 6,
    height: 6,
    borderRadius: 3,
    flexShrink: 0,
    background: status === 'completed' ? 'var(--vd-success)'
      : status === 'progress' ? 'var(--vd-info)'
      : 'var(--vd-border-strong)',
  }),
  sectionContent: {
    flex: 1,
    minWidth: 0,
    background: 'var(--vd-surface-bg)',
    borderRadius: 'var(--vd-radius-lg)',
    border: '1px solid var(--vd-border-default)',
    padding: 'var(--vd-space-6)',
  },
  sectionTitle: {
    fontSize: 'var(--vd-font-size-lg)',
    fontWeight: 'var(--vd-font-weight-semibold)',
    color: 'var(--vd-text-primary)',
    marginBottom: 'var(--vd-space-4)',
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--vd-space-2)',
  },
  narrative: {
    fontSize: 'var(--vd-font-size-base)',
    lineHeight: 'var(--vd-line-height-relaxed)',
    color: 'var(--vd-text-primary)',
    marginBottom: 'var(--vd-space-6)',
    padding: 'var(--vd-space-4)',
    borderRadius: 'var(--vd-radius-md)',
    background: 'var(--vd-page-bg)',
  },
  artifactPlaceholder: {
    padding: 'var(--vd-space-8) var(--vd-space-6)',
    borderRadius: 'var(--vd-radius-md)',
    border: '2px dashed var(--vd-border-default)',
    textAlign: 'center',
    color: 'var(--vd-text-tertiary)',
    fontSize: 'var(--vd-font-size-sm)',
  },
  footer: {
    display: 'flex',
    justifyContent: 'space-between',
    marginTop: 'var(--vd-space-6)',
    paddingTop: 'var(--vd-space-4)',
    borderTop: '1px solid var(--vd-border-subtle)',
  },
  btnNav: {
    padding: 'var(--vd-space-2) var(--vd-space-4)',
    borderRadius: 'var(--vd-radius-md)',
    border: '1px solid var(--vd-border-default)',
    background: 'var(--vd-surface-bg)',
    color: 'var(--vd-text-secondary)',
    fontSize: 'var(--vd-font-size-sm)',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--vd-space-1)',
  },
  btnSubmit: {
    padding: 'var(--vd-space-2) var(--vd-space-6)',
    borderRadius: 'var(--vd-radius-md)',
    border: 'none',
    background: 'var(--vd-primary)',
    color: 'var(--vd-text-inverse)',
    fontSize: 'var(--vd-font-size-sm)',
    fontWeight: 'var(--vd-font-weight-medium)',
    cursor: 'pointer',
  },
  presentationTag: {
    fontSize: 10,
    fontWeight: 500,
    color: 'var(--vd-text-tertiary)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginLeft: 'var(--vd-space-2)',
  },

  /* ── Feedback Sidebar ── */
  feedbackSidebar: {
    width: 280,
    flexShrink: 0,
    background: 'var(--vd-surface-bg)',
    borderLeft: '1px solid var(--vd-border-default)',
    borderRadius: 'var(--vd-radius-lg)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  feedbackHeader: {
    padding: 'var(--vd-space-3) var(--vd-space-4)',
    borderBottom: '1px solid var(--vd-border-subtle)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexShrink: 0,
  },
  feedbackHeaderTitle: {
    fontSize: 'var(--vd-font-size-sm)',
    fontWeight: 'var(--vd-font-weight-semibold)',
    color: 'var(--vd-text-primary)',
  },
  feedbackHeaderCount: {
    fontSize: 'var(--vd-font-size-xs)',
    color: 'var(--vd-text-tertiary)',
  },
  feedbackInputArea: {
    padding: 'var(--vd-space-3)',
    borderBottom: '1px solid var(--vd-border-subtle)',
    flexShrink: 0,
  },
  feedbackInput: {
    width: '100%',
    padding: 'var(--vd-space-2) var(--vd-space-3)',
    borderRadius: 'var(--vd-radius-md)',
    border: '1px solid var(--vd-border-default)',
    background: 'var(--vd-page-bg)',
    color: 'var(--vd-text-primary)',
    fontSize: 'var(--vd-font-size-sm)',
    resize: 'none',
    minHeight: 60,
    fontFamily: 'inherit',
  },
  feedbackSubmitBtn: {
    marginTop: 'var(--vd-space-2)',
    padding: 'var(--vd-space-1) var(--vd-space-3)',
    borderRadius: 'var(--vd-radius-md)',
    border: 'none',
    background: 'var(--vd-primary)',
    color: 'var(--vd-text-inverse)',
    fontSize: 'var(--vd-font-size-xs)',
    fontWeight: 'var(--vd-font-weight-medium)',
    cursor: 'pointer',
    width: '100%',
  },
  feedbackList: {
    flex: 1,
    overflowY: 'auto',
    padding: 'var(--vd-space-2)',
  },
  feedbackEmptyState: {
    padding: 'var(--vd-space-8) var(--vd-space-4)',
    textAlign: 'center',
    color: 'var(--vd-text-tertiary)',
    fontSize: 'var(--vd-font-size-sm)',
  },
  feedbackGroupTitle: {
    fontSize: 'var(--vd-font-size-xs)',
    fontWeight: 'var(--vd-font-weight-semibold)',
    color: 'var(--vd-text-tertiary)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    padding: 'var(--vd-space-2) var(--vd-space-3)',
    marginBottom: 'var(--vd-space-1)',
  },
  feedbackItem: {
    padding: 'var(--vd-space-3)',
    borderRadius: 'var(--vd-radius-md)',
    border: '1px solid var(--vd-border-subtle)',
    marginBottom: 'var(--vd-space-2)',
    background: 'var(--vd-surface-bg)',
  },
  feedbackItemMeta: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 'var(--vd-space-1)',
  },
  feedbackBadge: {
    padding: '1px 6px',
    borderRadius: 'var(--vd-radius-sm)',
    fontSize: 10,
    fontWeight: 'var(--vd-font-weight-medium)',
  },
  feedbackItemTime: {
    fontSize: 10,
    color: 'var(--vd-text-tertiary)',
  },
  feedbackItemContent: {
    fontSize: 'var(--vd-font-size-sm)',
    color: 'var(--vd-text-primary)',
    lineHeight: 'var(--vd-line-height-normal)',
    marginBottom: 'var(--vd-space-2)',
  },
  feedbackChangeRecord: {
    marginTop: 'var(--vd-space-2)',
    padding: 'var(--vd-space-2)',
    borderRadius: 'var(--vd-radius-sm)',
    background: 'var(--vd-page-bg)',
    fontSize: 'var(--vd-font-size-xs)',
    color: 'var(--vd-text-secondary)',
    lineHeight: 'var(--vd-line-height-normal)',
  },
  feedbackChangeRecordLabel: {
    fontSize: 10,
    fontWeight: 'var(--vd-font-weight-semibold)',
    color: 'var(--vd-text-tertiary)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: 'var(--vd-space-1)',
  },
  feedbackConfirmBtn: {
    marginTop: 'var(--vd-space-2)',
    padding: 'var(--vd-space-1) var(--vd-space-3)',
    borderRadius: 'var(--vd-radius-sm)',
    border: '1px solid var(--vd-success-border)',
    background: 'var(--vd-success-bg)',
    color: 'var(--vd-success)',
    fontSize: 'var(--vd-font-size-xs)',
    fontWeight: 'var(--vd-font-weight-medium)',
    cursor: 'pointer',
    width: '100%',
  },
};

function formatFeedbackTime(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const now = new Date();
    const diff = now - d;
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
    return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

export default function ReportDetail() {
  const { reportId } = useParams();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState(0);
  const [feedbacks, setFeedbacks] = useState([]);
  const [feedbackOpen, setFeedbackOpen] = useState(true);
  const [newFeedback, setNewFeedback] = useState('');

  useEffect(() => {
    setLoading(true);
    fetchReport(reportId)
      .then((r) => { setReport(r); setLoading(false); })
      .catch(() => { setReport(null); setLoading(false); });
    fetchReportFeedback(reportId)
      .then((data) => setFeedbacks(data.feedbacks || []))
      .catch(() => setFeedbacks([]));
  }, [reportId]);

  const handleAddFeedback = async () => {
    if (!newFeedback.trim()) return;
    try {
      const fb = await addReportFeedback(reportId, { content: newFeedback.trim(), author: 'user' });
      setFeedbacks((prev) => [...prev, fb]);
      setNewFeedback('');
    } catch {
      /* silently fail — user can retry */
    }
  };

  const handleConfirmFeedback = async (feedbackId) => {
    try {
      const fb = await confirmReportFeedback(reportId, feedbackId);
      setFeedbacks((prev) => prev.map((f) => f.id === feedbackId ? fb : f));
    } catch {
      /* silently fail — user can retry */
    }
  };

  // Loading state
  if (loading) {
    return (
      <div style={STYLES.loadingState}>
        <div style={{ fontSize: 'var(--vd-font-size-lg)', marginBottom: 'var(--vd-space-2)' }}>加载中...</div>
      </div>
    );
  }

  // Not found state
  if (!report) {
    return (
      <div style={STYLES.loadingState}>
        <div style={{ fontSize: 'var(--vd-font-size-lg)', marginBottom: 'var(--vd-space-2)' }}>汇报未找到</div>
      </div>
    );
  }

  const section = report.sections?.[activeSection];

  // Group feedbacks by status
  const trackedFbs = feedbacks.filter((f) => f.status === 'tracked');
  const addressedFbs = feedbacks.filter((f) => f.status === 'addressed');
  const confirmedFbs = feedbacks.filter((f) => f.status === 'confirmed');

  return (
    <div style={STYLES.page}>
      <Link to="/reports" style={STYLES.backLink}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
        返回汇报列表
      </Link>

      <div style={STYLES.header}>
        <div>
          <h1 style={STYLES.title}>{report.title}</h1>
          <div style={STYLES.meta}>
            <span style={STYLES.badge(report.structure === 'complex-review' ? 'complex-review' : 'standard')}>
              {report.structure === 'complex-review' ? '复杂任务评审' : '标准汇报'}
            </span>
            {report.sections && (
              <span style={{ fontSize: 'var(--vd-font-size-xs)', color: 'var(--vd-text-tertiary)' }}>
                {report.sections.filter((s) => s.status === 'completed').length}/{report.sections.length} sections
              </span>
            )}
            <span style={{ fontSize: 'var(--vd-font-size-xs)', color: 'var(--vd-text-tertiary)' }}>
              创建于 {report.createdAt}
            </span>
          </div>
        </div>
      </div>

      {/* Section Navigation + Content + Feedback Sidebar */}
      <div style={STYLES.body}>
        {/* Left: Section Nav */}
        {report.sections && report.sections.length > 0 && (
          <nav style={STYLES.sectionNav}>
            {report.sections.map((s, i) => (
              <button
                key={s.id}
                style={STYLES.sectionNavItem(i === activeSection)}
                onClick={() => setActiveSection(i)}
              >
                <span style={STYLES.statusDot(s.status)} />
                <span>{i + 1}. {s.title}</span>
              </button>
            ))}
          </nav>
        )}

        {/* Center: Section Content */}
        {section ? (
          <div style={STYLES.sectionContent}>
            <div style={STYLES.sectionTitle}>
              {activeSection + 1}. {section.title}
              <span style={STYLES.badge(section.status)}>{STATUS_BADGES[section.status]?.label || section.status}</span>
              <span style={STYLES.presentationTag}>{section.presentation}</span>
            </div>

            {/* Narrative */}
            {section.narrative ? (
              <div style={STYLES.narrative}>
                <div style={{ fontSize: 'var(--vd-font-size-xs)', fontWeight: 600, color: 'var(--vd-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 'var(--vd-space-2)' }}>
                  叙事摘要
                </div>
                {section.narrative}
              </div>
            ) : (
              <div style={STYLES.artifactPlaceholder}>
                此 section 尚未填充内容
              </div>
            )}

            {/* Artifact placeholder */}
            {section.narrative && (
              <div>
                <div style={{
                  fontSize: 'var(--vd-font-size-xs)',
                  fontWeight: 600,
                  color: 'var(--vd-text-tertiary)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  marginBottom: 'var(--vd-space-3)',
                }}>
                  Artifact · {section.presentation}
                </div>
                <div style={STYLES.artifactPlaceholder}>
                  {section.presentation === 'document' && '📄 文档内容将在此渲染'}
                  {section.presentation === 'table' && '📊 表格内容将在此渲染'}
                  {section.presentation === 'canvas' && '🎨 画布内容将在此渲染'}
                  {section.presentation === 'slides' && '🖥 Slides 将在此渲染'}
                </div>
              </div>
            )}

            {/* Footer Navigation */}
            {report.sections && (
              <div style={STYLES.footer}>
                <button
                  style={{ ...STYLES.btnNav, visibility: activeSection > 0 ? 'visible' : 'hidden' }}
                  onClick={() => setActiveSection((p) => Math.max(0, p - 1))}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6"/>
                  </svg>
                  上一 section
                </button>

                {activeSection < report.sections.length - 1 ? (
                  <button
                    style={STYLES.btnNav}
                    onClick={() => setActiveSection((p) => Math.min(report.sections.length - 1, p + 1))}
                  >
                    下一 section
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="9 18 15 12 9 6"/>
                    </svg>
                  </button>
                ) : (
                  <button style={STYLES.btnSubmit}>
                    提交汇报
                  </button>
                )}
              </div>
            )}
          </div>
        ) : (
          <div style={STYLES.sectionContent}>
            <div style={STYLES.artifactPlaceholder}>
              暂无内容
            </div>
          </div>
        )}

        {/* Right: Feedback Sidebar */}
        {feedbackOpen && (
          <aside style={STYLES.feedbackSidebar}>
            <div style={STYLES.feedbackHeader}>
              <span style={STYLES.feedbackHeaderTitle}>汇报反馈</span>
              <span style={STYLES.feedbackHeaderCount}>{feedbacks.length} 条</span>
            </div>

            {/* New feedback input */}
            <div style={STYLES.feedbackInputArea}>
              <textarea
                style={STYLES.feedbackInput}
                placeholder="输入反馈内容..."
                value={newFeedback}
                onChange={(e) => setNewFeedback(e.target.value)}
                rows={3}
              />
              <button
                style={{ ...STYLES.feedbackSubmitBtn, opacity: newFeedback.trim() ? 1 : 0.5 }}
                onClick={handleAddFeedback}
                disabled={!newFeedback.trim()}
              >
                提交反馈
              </button>
            </div>

            {/* Feedback list grouped by status */}
            <div style={STYLES.feedbackList}>
              {feedbacks.length === 0 ? (
                <div style={STYLES.feedbackEmptyState}>
                  暂无反馈，点击上方提交第一条反馈
                </div>
              ) : (
                <>
                  {/* Tracked feedbacks */}
                  {trackedFbs.length > 0 && (
                    <>
                      <div style={STYLES.feedbackGroupTitle}>待处理 ({trackedFbs.length})</div>
                      {trackedFbs.map((fb) => (
                        <div key={fb.id} style={STYLES.feedbackItem}>
                          <div style={STYLES.feedbackItemMeta}>
                            <span style={{
                              ...STYLES.feedbackBadge,
                              background: FB_STATUS_COLORS.tracked.bg,
                              color: FB_STATUS_COLORS.tracked.color,
                              border: `1px solid ${FB_STATUS_COLORS.tracked.border}`,
                            }}>
                              {FB_STATUS_LABELS.tracked}
                            </span>
                            <span style={STYLES.feedbackItemTime}>{formatFeedbackTime(fb.createdAt)}</span>
                          </div>
                          <div style={STYLES.feedbackItemContent}>{fb.content}</div>
                        </div>
                      ))}
                    </>
                  )}

                  {/* Addressed feedbacks */}
                  {addressedFbs.length > 0 && (
                    <>
                      <div style={STYLES.feedbackGroupTitle}>已处理 ({addressedFbs.length})</div>
                      {addressedFbs.map((fb) => (
                        <div key={fb.id} style={STYLES.feedbackItem}>
                          <div style={STYLES.feedbackItemMeta}>
                            <span style={{
                              ...STYLES.feedbackBadge,
                              background: FB_STATUS_COLORS.addressed.bg,
                              color: FB_STATUS_COLORS.addressed.color,
                              border: `1px solid ${FB_STATUS_COLORS.addressed.border}`,
                            }}>
                              {FB_STATUS_LABELS.addressed}
                            </span>
                            <span style={STYLES.feedbackItemTime}>{formatFeedbackTime(fb.createdAt)}</span>
                          </div>
                          <div style={STYLES.feedbackItemContent}>{fb.content}</div>

                          {/* Change record */}
                          {fb.changeRecord && (
                            <div style={STYLES.feedbackChangeRecord}>
                              <div style={STYLES.feedbackChangeRecordLabel}>变更记录</div>
                              {fb.changeRecord.summary}
                            </div>
                          )}

                          {/* Confirm button */}
                          <button
                            style={STYLES.feedbackConfirmBtn}
                            onClick={() => handleConfirmFeedback(fb.id)}
                          >
                            确认已解决
                          </button>
                        </div>
                      ))}
                    </>
                  )}

                  {/* Confirmed feedbacks */}
                  {confirmedFbs.length > 0 && (
                    <>
                      <div style={STYLES.feedbackGroupTitle}>已确认 ({confirmedFbs.length})</div>
                      {confirmedFbs.map((fb) => (
                        <div key={fb.id} style={STYLES.feedbackItem}>
                          <div style={STYLES.feedbackItemMeta}>
                            <span style={{
                              ...STYLES.feedbackBadge,
                              background: FB_STATUS_COLORS.confirmed.bg,
                              color: FB_STATUS_COLORS.confirmed.color,
                              border: `1px solid ${FB_STATUS_COLORS.confirmed.border}`,
                            }}>
                              {FB_STATUS_LABELS.confirmed}
                            </span>
                            <span style={STYLES.feedbackItemTime}>{formatFeedbackTime(fb.createdAt)}</span>
                          </div>
                          <div style={STYLES.feedbackItemContent}>{fb.content}</div>

                          {/* Change record */}
                          {fb.changeRecord && (
                            <div style={STYLES.feedbackChangeRecord}>
                              <div style={STYLES.feedbackChangeRecordLabel}>变更记录</div>
                              {fb.changeRecord.summary}
                            </div>
                          )}
                        </div>
                      ))}
                    </>
                  )}
                </>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
