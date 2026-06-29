import { useLocation } from 'react-router-dom';

const PAGE_TITLES = {
  '/': '项目主页',
  '/logs': '日志与文档',
  '/reports': '汇报',
  '/reports/new': '新建汇报',
  '/settings': '设置',
};

function getPageTitle(pathname) {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
  if (pathname.startsWith('/logs/')) return '日志详情';
  if (pathname.startsWith('/reports/') && pathname !== '/reports/new') return '汇报详情';
  return '';
}

const STYLES = {
  topbar: {
    height: 'var(--vd-topbar-height)',
    background: 'var(--vd-surface-bg)',
    borderBottom: '1px solid var(--vd-border-default)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 var(--vd-space-6)',
    flexShrink: 0,
    position: 'relative',
    zIndex: 10,
  },
  left: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--vd-space-3)',
  },
  pageTitle: {
    fontSize: 'var(--vd-font-size-sm)',
    fontWeight: 'var(--vd-font-weight-semibold)',
    color: 'var(--vd-text-primary)',
  },
  right: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--vd-space-2)',
  },
  iconBtn: {
    width: 32,
    height: 32,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 'var(--vd-radius-md)',
    border: 'none',
    background: 'transparent',
    color: 'var(--vd-text-secondary)',
    cursor: 'pointer',
    transition: 'all var(--vd-transition-fast)',
  },
};

export default function TopBar({ theme, onToggleTheme }) {
  const location = useLocation();
  const pageTitle = getPageTitle(location.pathname);

  return (
    <header style={STYLES.topbar}>
      <div style={STYLES.left}>
        <span style={STYLES.pageTitle}>{pageTitle}</span>
      </div>
      <div style={STYLES.right}>
        {/* Theme toggle */}
        <button
          style={STYLES.iconBtn}
          onClick={onToggleTheme}
          title={theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
        >
          {theme === 'dark' ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="5"/>
              <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
              <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
            </svg>
          )}
        </button>
      </div>
    </header>
  );
}
