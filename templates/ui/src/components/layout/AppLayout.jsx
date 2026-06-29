import { useState, useCallback, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import { getThemePreference, toggleTheme } from '../../lib/theme';

const STYLES = {
  shell: {
    display: 'flex',
    flexDirection: 'column',
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
};

export default function AppLayout() {
  const [theme, setTheme] = useState(() => getThemePreference());

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', getThemePreference());
  }, []);

  const handleToggleTheme = useCallback(() => {
    const next = toggleTheme();
    setTheme(next);
  }, []);

  return (
    <div style={STYLES.shell}>
      <TopBar theme={theme} onToggleTheme={handleToggleTheme} />
      <div style={STYLES.body}>
        <Sidebar />
        <div style={STYLES.mainArea}>
          <div style={STYLES.content}>
            <div style={STYLES.contentInner}>
              <Outlet />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
