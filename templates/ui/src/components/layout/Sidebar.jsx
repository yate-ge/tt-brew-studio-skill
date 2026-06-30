import { NavLink, useLocation } from 'react-router-dom';

const NAV_ITEMS = [
  { to: '/', icon: 'home', label: '主页' },
  { to: '/logs', icon: 'logs', label: '日志' },
  { to: '/reports', icon: 'reports', label: '汇报' },
  { to: '/canvas', icon: 'canvas', label: '画布' },
  { to: '/settings', icon: 'settings', label: '设置' },
];

const ICONS = {
  home: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
      <polyline points="9 22 9 12 15 12 15 22"/>
    </svg>
  ),
  logs: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/>
      <polyline points="10 9 9 9 8 9"/>
    </svg>
  ),
  reports: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
      <line x1="3" y1="9" x2="21" y2="9"/>
      <line x1="9" y1="21" x2="9" y2="9"/>
    </svg>
  ),
  canvas: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2"/>
      <path d="M8 8h4v4H8z"/>
      <path d="M15 14h3v3h-3z"/>
      <path d="M12 10l3 5"/>
      <path d="M7 17l3-5"/>
    </svg>
  ),
  settings: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  ),
};

const STYLES = {
  sidebar: {
    width: 'var(--vd-sidebar-width)',
    height: '100%',
    background: 'var(--vd-surface-bg)',
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0,
    overflow: 'hidden',
    position: 'relative',
    transition: 'width var(--vd-transition-slow), opacity var(--vd-transition-normal)',
    willChange: 'width, opacity',
  },
  sidebarHidden: {
    width: 0,
    opacity: 0,
    pointerEvents: 'none',
  },
  sidebarOverlay: {
    position: 'fixed',
    left: 0,
    top: 0,
    bottom: 0,
    zIndex: 40,
    boxShadow: 'var(--vd-shadow-lg)',
  },
  sidebarEdge: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: 1,
    background: 'var(--vd-border-default)',
    opacity: 1,
    pointerEvents: 'none',
    transition: 'opacity var(--vd-transition-normal)',
  },
  sidebarEdgeHidden: {
    opacity: 0,
  },
  brand: {
    height: 'var(--vd-topbar-height)',
    display: 'flex',
    alignItems: 'center',
    padding: '0 var(--vd-space-4)',
    gap: 'var(--vd-space-3)',
    justifyContent: 'space-between',
    borderBottom: '1px solid var(--vd-border-subtle)',
    flexShrink: 0,
  },
  contentWrap: {
    width: 'var(--vd-sidebar-width)',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0,
    transition: 'transform var(--vd-transition-slow)',
  },
  contentWrapHidden: {
    transform: 'translateX(-12px)',
  },
  brandName: {
    minWidth: 0,
    fontSize: 'var(--vd-font-size-sm)',
    fontWeight: 'var(--vd-font-weight-semibold)',
    color: 'var(--vd-text-primary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  nav: {
    flex: 1,
    padding: 'var(--vd-space-2)',
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    overflowY: 'auto',
  },
  navLinkBase: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--vd-space-3)',
    padding: 'var(--vd-space-2) var(--vd-space-3)',
    borderRadius: 'var(--vd-radius-md)',
    fontSize: 'var(--vd-font-size-sm)',
    fontWeight: 'var(--vd-font-weight-medium)',
    color: 'var(--vd-text-secondary)',
    textDecoration: 'none',
    transition: 'all var(--vd-transition-fast)',
    cursor: 'pointer',
  },
  navLinkActive: {
    background: 'var(--vd-primary-bg)',
    color: 'var(--vd-primary)',
  },
  footer: {
    padding: 'var(--vd-space-3) var(--vd-space-4)',
    borderTop: '1px solid var(--vd-border-subtle)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexShrink: 0,
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

export default function Sidebar({ projectName, theme, visible, overlay = false, onToggleTheme, onToggleSidebar }) {
  const location = useLocation();
  const displayName = projectName || '未命名项目';

  return (
    <aside
      style={{
        ...STYLES.sidebar,
        ...(overlay ? STYLES.sidebarOverlay : {}),
        ...(visible ? {} : STYLES.sidebarHidden),
      }}
      aria-hidden={!visible}
    >
      <div style={{ ...STYLES.contentWrap, ...(visible ? {} : STYLES.contentWrapHidden) }}>
        <div style={STYLES.brand}>
          <span style={STYLES.brandName}>{displayName}</span>
          <button
            type="button"
            style={STYLES.iconBtn}
            onClick={onToggleSidebar}
            title="隐藏侧边栏"
            aria-label="隐藏侧边栏"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <line x1="9" y1="3" x2="9" y2="21"/>
              <path d="M16 9l-3 3 3 3"/>
            </svg>
          </button>
        </div>
        <nav style={STYLES.nav}>
          {NAV_ITEMS.map((item) => {
            const isActive = item.to === '/'
              ? location.pathname === '/'
              : location.pathname.startsWith(item.to);

            return (
              <NavLink
                key={item.to}
                to={item.to}
                tabIndex={visible ? 0 : -1}
                style={{
                  ...STYLES.navLinkBase,
                  ...(isActive ? STYLES.navLinkActive : {}),
                }}
              >
                {ICONS[item.icon]}
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
        <div style={STYLES.footer}>
          <button
            type="button"
            style={STYLES.iconBtn}
            onClick={onToggleTheme}
            tabIndex={visible ? 0 : -1}
            title={theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
            aria-label={theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
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
          <span style={{ fontSize: 'var(--vd-font-size-xs)', color: 'var(--vd-text-tertiary)' }}>
            VD
          </span>
        </div>
      </div>
      <div style={{ ...STYLES.sidebarEdge, ...(visible ? {} : STYLES.sidebarEdgeHidden) }} />
    </aside>
  );
}
