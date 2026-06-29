/**
 * V3 Theme Manager
 * Handles light/dark theme switching, design token application, and persistence.
 */

const THEME_KEY = 'vd-theme-preference';

export function getThemePreference() {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    // localStorage unavailable
  }
  // Follow system preference
  if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}

export function setThemePreference(theme) {
  if (theme !== 'light' && theme !== 'dark') return;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // ignore
  }
  document.documentElement.setAttribute('data-theme', theme);
}

export function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || getThemePreference();
  const next = current === 'dark' ? 'light' : 'dark';
  setThemePreference(next);
  return next;
}

export function applyDesignTokens(tokens) {
  if (!tokens) return;
  const root = document.documentElement;

  if (tokens.colors) {
    Object.entries(tokens.colors).forEach(([key, value]) => {
      root.style.setProperty(`--vd-${key}`, value);
    });
  }
  if (tokens.typography) {
    Object.entries(tokens.typography).forEach(([key, value]) => {
      root.style.setProperty(`--vd-font-${key}`, value);
    });
  }
}

export function applyTokens(tokens) {
  applyDesignTokens(tokens);
}

/**
 * Initialize theme on app boot.
 */
export function initTheme() {
  const theme = getThemePreference();
  document.documentElement.setAttribute('data-theme', theme);
}

export function tokensToCSS(tokens) {
  if (!tokens) return '';
  const flat = flattenTokens(tokens);
  const lines = Object.entries(flat)
    .map(([key, value]) => `  --vds-${key}: ${value};`);
  return `:root {\n${lines.join('\n')}\n}`;
}
