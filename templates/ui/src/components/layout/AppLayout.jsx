import { useState, useCallback, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import { fetchProjectConfig } from '../../lib/api';
import { getThemePreference, toggleTheme } from '../../lib/theme';

const SIDEBAR_VISIBLE_KEY = 'vd-sidebar-visible';

const STYLES = {
  shell: {
    display: 'flex',
    height: '100dvh',
    overflow: 'hidden',
  },
  body: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  },
  mainArea: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  },
  content: {
    flex: 1,
    overflowY: 'auto',
    overflowX: 'hidden',
    background: 'var(--vd-page-bg)',
  },
  contentInner: {
    maxWidth: 'var(--vd-content-max)',
    margin: '0 auto',
    padding: 'var(--vd-space-6)',
    minHeight: '100%',
  },
  revealButton: {
    position: 'fixed',
    left: 'var(--vd-space-4)',
    top: 'var(--vd-space-4)',
    zIndex: 30,
    width: 36,
    height: 36,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 'var(--vd-radius-md)',
    border: '1px solid var(--vd-border-default)',
    background: 'var(--vd-surface-bg)',
    color: 'var(--vd-text-secondary)',
    boxShadow: 'var(--vd-shadow-md)',
    cursor: 'pointer',
    opacity: 1,
    transition: 'opacity var(--vd-transition-normal), transform var(--vd-transition-normal), background var(--vd-transition-fast)',
  },
};

export default function AppLayout() {
  const location = useLocation();
  const [theme, setTheme] = useState(() => getThemePreference());
  const [projectName, setProjectName] = useState('');
  const isSplitWorkspace = location.pathname.startsWith('/logs') || location.pathname.startsWith('/reports');
  const [sidebarVisible, setSidebarVisible] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_VISIBLE_KEY) !== 'false';
    } catch {
      return true;
    }
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', getThemePreference());
  }, []);

  useEffect(() => {
    let canceled = false;
    fetchProjectConfig()
      .then((project) => {
        if (!canceled) setProjectName(project?.name || '');
      })
      .catch(() => {
        if (!canceled) setProjectName('');
      });
    return () => { canceled = true; };
  }, [location.pathname]);

  const handleToggleTheme = useCallback(() => {
    const next = toggleTheme();
    setTheme(next);
  }, []);

  const handleToggleSidebar = useCallback(() => {
    setSidebarVisible((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_VISIBLE_KEY, String(next));
      } catch {
        /* ignore storage failures */
      }
      return next;
    });
  }, []);

  return (
    <div style={STYLES.shell}>
      <Sidebar
        projectName={projectName}
        theme={theme}
        visible={sidebarVisible}
        onToggleTheme={handleToggleTheme}
        onToggleSidebar={handleToggleSidebar}
      />
      {!sidebarVisible && (
        <button
          type="button"
          style={STYLES.revealButton}
          onClick={handleToggleSidebar}
          title="显示侧边栏"
          aria-label="显示侧边栏"
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <line x1="9" y1="3" x2="9" y2="21"/>
            <path d="M13 9l3 3-3 3"/>
          </svg>
        </button>
      )}
      <div style={STYLES.body}>
        <div style={STYLES.mainArea}>
          <div style={STYLES.content}>
            <div
              style={{
                ...STYLES.contentInner,
                ...(isSplitWorkspace ? {
                  maxWidth: 'none',
                  margin: 0,
                  padding: 'var(--vd-space-4)',
                } : {}),
              }}
            >
              <Outlet />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
