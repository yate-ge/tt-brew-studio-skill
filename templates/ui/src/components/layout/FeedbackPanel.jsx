import { useState, useCallback } from 'react';

const STATUS_LABELS = {
  tracked: '待处理',
  addressed: '已处理',
  confirmed: '已确认',
};

const STATUS_COLORS = {
  tracked: { bg: 'var(--vd-warning-bg)', color: 'var(--vd-warning)', border: 'var(--vd-warning-border)' },
  addressed: { bg: 'var(--vd-info-bg)', color: 'var(--vd-info)', border: 'var(--vd-info-border)' },
  confirmed: { bg: 'var(--vd-success-bg)', color: 'var(--vd-success)', border: 'var(--vd-success-border)' },
};

const STYLES = {
  panel: {
    width: 'var(--vd-feedback-width)',
    height: '100%',
    background: 'var(--vd-surface-bg)',
    borderLeft: '1px solid var(--vd-border-default)',
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0,
    overflow: 'hidden',
  },
  header: {
    height: 'var(--vd-topbar-height)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 var(--vd-space-4)',
    borderBottom: '1px solid var(--vd-border-subtle)',
    flexShrink: 0,
  },
  headerTitle: {
    fontSize: 'var(--vd-font-size-sm)',
    fontWeight: 'var(--vd-font-weight-semibold)',
    color: 'var(--vd-text-primary)',
  },
  headerCount: {
    fontSize: 'var(--vd-font-size-xs)',
    color: 'var(--vd-text-tertiary)',
  },
  tabs: {
    display: 'flex',
    borderBottom: '1px solid var(--vd-border-subtle)',
    flexShrink: 0,
  },
  tab: {
    flex: 1,
    padding: 'var(--vd-space-2) var(--vd-space-3)',
    fontSize: 'var(--vd-font-size-xs)',
    fontWeight: 'var(--vd-font-weight-medium)',
    color: 'var(--vd-text-tertiary)',
    border: 'none',
    borderBottom: '2px solid transparent',
    background: 'transparent',
    cursor: 'pointer',
    transition: 'all var(--vd-transition-fast)',
  },
  tabActive: {
    color: 'var(--vd-primary)',
    borderBottomColor: 'var(--vd-primary)',
  },
  list: {
    flex: 1,
    overflowY: 'auto',
    padding: 'var(--vd-space-2)',
  },
  emptyState: {
    padding: 'var(--vd-space-8) var(--vd-space-4)',
    textAlign: 'center',
    color: 'var(--vd-text-tertiary)',
    fontSize: 'var(--vd-font-size-sm)',
  },
  item: {
    padding: 'var(--vd-space-3)',
    borderRadius: 'var(--vd-radius-md)',
    border: '1px solid var(--vd-border-subtle)',
    marginBottom: 'var(--vd-space-2)',
    cursor: 'pointer',
    transition: 'all var(--vd-transition-fast)',
    background: 'var(--vd-surface-bg)',
  },
  itemMeta: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 'var(--vd-space-1)',
  },
  itemContent: {
    fontSize: 'var(--vd-font-size-sm)',
    color: 'var(--vd-text-primary)',
    lineHeight: 'var(--vd-line-height-normal)',
    marginBottom: 'var(--vd-space-2)',
  },
  itemSource: {
    fontSize: 'var(--vd-font-size-xs)',
    color: 'var(--vd-text-tertiary)',
  },
  badge: {
    padding: '1px 6px',
    borderRadius: 'var(--vd-radius-sm)',
    fontSize: 10,
    fontWeight: 'var(--vd-font-weight-medium)',
  },
  changeRecord: {
    marginTop: 'var(--vd-space-2)',
    padding: 'var(--vd-space-2)',
    borderRadius: 'var(--vd-radius-sm)',
    background: 'var(--vd-page-bg)',
    fontSize: 'var(--vd-font-size-xs)',
    color: 'var(--vd-text-secondary)',
    lineHeight: 'var(--vd-line-height-normal)',
  },
  changeRecordLabel: {
    fontSize: 10,
    fontWeight: 'var(--vd-font-weight-semibold)',
    color: 'var(--vd-text-tertiary)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: 'var(--vd-space-1)',
  },
};

export default function FeedbackPanel({ feedbacks = [], onConfirmFeedback }) {
  const [activeTab, setActiveTab] = useState('tracked');

  const filtered = feedbacks.filter((f) => {
    if (activeTab === 'all') return true;
    return f.status === activeTab;
  });

  const tabs = [
    { key: 'tracked', label: '待处理', count: feedbacks.filter((f) => f.status === 'tracked').length },
    { key: 'addressed', label: '已处理', count: feedbacks.filter((f) => f.status === 'addressed').length },
    { key: 'confirmed', label: '已确认', count: feedbacks.filter((f) => f.status === 'confirmed').length },
  ];

  return (
    <aside style={STYLES.panel}>
      <div style={STYLES.header}>
        <span style={STYLES.headerTitle}>项目反馈池</span>
        <span style={STYLES.headerCount}>{feedbacks.length} 条</span>
      </div>

      <div style={STYLES.tabs}>
        {tabs.map((tab) => (
          <button
            key={tab.key}
            style={{
              ...STYLES.tab,
              ...(activeTab === tab.key ? STYLES.tabActive : {}),
            }}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
            {tab.count > 0 && ` (${tab.count})`}
          </button>
        ))}
      </div>

      <div style={STYLES.list}>
        {filtered.length === 0 ? (
          <div style={STYLES.emptyState}>
            暂无{activeTab === 'tracked' ? '待处理' : activeTab === 'addressed' ? '已处理' : '已确认'}的反馈
          </div>
        ) : (
          filtered.map((fb) => {
            const statusStyle = STATUS_COLORS[fb.status] || STATUS_COLORS.tracked;
            return (
              <div key={fb.id} style={STYLES.item}>
                <div style={STYLES.itemMeta}>
                  <span
                    style={{
                      ...STYLES.badge,
                      background: statusStyle.bg,
                      color: statusStyle.color,
                      border: `1px solid ${statusStyle.border}`,
                    }}
                  >
                    {STATUS_LABELS[fb.status]}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--vd-text-tertiary)' }}>
                    {formatTime(fb.createdAt)}
                  </span>
                </div>
                <div style={STYLES.itemContent}>{fb.content}</div>
                <div style={STYLES.itemSource}>
                  来源：{fb.source?.type === 'report' ? `汇报 · ${fb.source.reportTitle || fb.source.reportId}` : '全局'}
                </div>

                {/* Change record */}
                {fb.changeRecord && (
                  <div style={STYLES.changeRecord}>
                    <div style={STYLES.changeRecordLabel}>变更记录</div>
                    {fb.changeRecord.summary}
                  </div>
                )}

                {/* Confirm button for addressed feedback */}
                {fb.status === 'addressed' && onConfirmFeedback && (
                  <button
                    onClick={() => onConfirmFeedback(fb.id)}
                    style={{
                      marginTop: 'var(--vd-space-2)',
                      padding: 'var(--vd-space-1) var(--vd-space-3)',
                      borderRadius: 'var(--vd-radius-sm)',
                      border: `1px solid var(--vd-success-border)`,
                      background: 'var(--vd-success-bg)',
                      color: 'var(--vd-success)',
                      fontSize: 'var(--vd-font-size-xs)',
                      fontWeight: 'var(--vd-font-weight-medium)',
                      cursor: 'pointer',
                      width: '100%',
                    }}
                  >
                    确认已解决
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}

function formatTime(iso) {
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
