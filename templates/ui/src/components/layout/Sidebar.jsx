import { NavLink, useLocation } from 'react-router-dom';

const NAV_ITEMS = [
  { to: '/', icon: 'home', label: '主页' },
  { to: '/logs', icon: 'logs', label: '日志' },
  { to: '/reports', icon: 'reports', label: '汇报' },
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
    borderRight: '1px solid var(--vd-border-default)',
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0,
    overflow: 'hidden',
  },
  brand: {
    height: 'var(--vd-topbar-height)',
    display: 'flex',
    alignItems: 'center',
    padding: '0 var(--vd-space-4)',
    gap: 'var(--vd-space-3)',
    borderBottom: '1px solid var(--vd-border-subtle)',
    flexShrink: 0,
  },
  brandIcon: {
    width: 32,
    height: 32,
    borderRadius: 'var(--vd-radius-md)',
    background: 'var(--vd-primary)',
    color: 'var(--vd-text-inverse)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 'var(--vd-font-size-sm)',
    fontWeight: 'var(--vd-font-weight-semibold)',
    flexShrink: 0,
  },
  brandName: {
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
    fontSize: 'var(--vd-font-size-xs)',
    color: 'var(--vd-text-tertiary)',
    flexShrink: 0,
  },
};

export default function Sidebar({ projectName, projectInitial }) {
  const location = useLocation();

  return (
    <aside style={STYLES.sidebar}>
      <div style={STYLES.brand}>
        <div style={STYLES.brandIcon}>{projectInitial || 'P'}</div>
        <span style={STYLES.brandName}>{projectName || '未命名项目'}</span>
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
        Visual Delivery v3.0
      </div>
    </aside>
  );
}
