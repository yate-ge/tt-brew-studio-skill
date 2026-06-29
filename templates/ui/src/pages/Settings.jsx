import { useState, useEffect } from 'react';
import { getThemePreference, setThemePreference } from '../lib/theme';
import { fetchProjectConfig, updateProjectConfig } from '../lib/api';

const STYLES = {
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--vd-space-6)',
    maxWidth: 640,
  },
  title: {
    fontSize: 'var(--vd-font-size-2xl)',
    fontWeight: 'var(--vd-font-weight-bold)',
    color: 'var(--vd-text-primary)',
  },
  loadingState: {
    textAlign: 'center',
    padding: 'var(--vd-space-16) var(--vd-space-6)',
    color: 'var(--vd-text-tertiary)',
  },
  group: {
    marginBottom: 'var(--vd-space-2)',
  },
  groupTitle: {
    fontSize: 'var(--vd-font-size-xs)',
    fontWeight: 'var(--vd-font-weight-semibold)',
    color: 'var(--vd-text-tertiary)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: 'var(--vd-space-3)',
  },
  card: {
    background: 'var(--vd-surface-bg)',
    borderRadius: 'var(--vd-radius-lg)',
    border: '1px solid var(--vd-border-default)',
    overflow: 'hidden',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 'var(--vd-space-4)',
    borderBottom: '1px solid var(--vd-border-subtle)',
    gap: 'var(--vd-space-4)',
  },
  rowLabel: {
    fontSize: 'var(--vd-font-size-sm)',
    fontWeight: 'var(--vd-font-weight-medium)',
    color: 'var(--vd-text-primary)',
    minWidth: 100,
  },
  rowValue: {
    fontSize: 'var(--vd-font-size-sm)',
    color: 'var(--vd-text-secondary)',
    flex: 1,
  },
  input: {
    padding: 'var(--vd-space-2) var(--vd-space-3)',
    borderRadius: 'var(--vd-radius-md)',
    border: '1px solid var(--vd-border-default)',
    background: 'var(--vd-surface-bg)',
    color: 'var(--vd-text-primary)',
    fontSize: 'var(--vd-font-size-sm)',
    width: '100%',
    maxWidth: 280,
  },
  select: {
    padding: 'var(--vd-space-2) var(--vd-space-3)',
    borderRadius: 'var(--vd-radius-md)',
    border: '1px solid var(--vd-border-default)',
    background: 'var(--vd-surface-bg)',
    color: 'var(--vd-text-primary)',
    fontSize: 'var(--vd-font-size-sm)',
  },
  themeOption: (active) => ({
    padding: 'var(--vd-space-2) var(--vd-space-4)',
    borderRadius: 'var(--vd-radius-md)',
    border: `1px solid ${active ? 'var(--vd-primary)' : 'var(--vd-border-default)'}`,
    background: active ? 'var(--vd-primary-bg)' : 'transparent',
    color: active ? 'var(--vd-primary)' : 'var(--vd-text-secondary)',
    fontSize: 'var(--vd-font-size-sm)',
    cursor: 'pointer',
  }),
  colorDot: (color) => ({
    width: 20,
    height: 20,
    borderRadius: 10,
    background: color,
    border: '2px solid var(--vd-border-default)',
    cursor: 'pointer',
    flexShrink: 0,
  }),
  colorDotActive: (color) => ({
    width: 20,
    height: 20,
    borderRadius: 10,
    background: color,
    border: '2px solid var(--vd-primary)',
    boxShadow: `0 0 0 2px var(--vd-primary-bg)`,
    cursor: 'pointer',
    flexShrink: 0,
  }),
  previewBox: {
    marginTop: 'var(--vd-space-4)',
    padding: 'var(--vd-space-4)',
    borderRadius: 'var(--vd-radius-lg)',
    background: 'var(--vd-surface-bg)',
    border: '1px solid var(--vd-border-default)',
  },
  previewLabel: {
    fontSize: 'var(--vd-font-size-xs)',
    fontWeight: 'var(--vd-font-weight-medium)',
    color: 'var(--vd-text-tertiary)',
    marginBottom: 'var(--vd-space-3)',
  },
  previewCard: (primaryColor) => ({
    padding: 'var(--vd-space-4)',
    borderRadius: 'var(--vd-radius-md)',
    border: '1px solid var(--vd-border-default)',
    background: 'var(--vd-page-bg)',
  }),
  previewBtn: (primaryColor) => ({
    display: 'inline-flex',
    padding: 'var(--vd-space-2) var(--vd-space-4)',
    borderRadius: 'var(--vd-radius-md)',
    background: primaryColor,
    color: '#fff',
    fontSize: 'var(--vd-font-size-sm)',
    fontWeight: 500,
    marginTop: 'var(--vd-space-3)',
  }),
  saveBtn: {
    padding: 'var(--vd-space-2) var(--vd-space-6)',
    borderRadius: 'var(--vd-radius-md)',
    border: 'none',
    background: 'var(--vd-primary)',
    color: 'var(--vd-text-inverse)',
    fontSize: 'var(--vd-font-size-sm)',
    fontWeight: 'var(--vd-font-weight-medium)',
    cursor: 'pointer',
    alignSelf: 'flex-end',
  },
};

const ACCENT_COLORS = [
  { key: 'blue', value: '#2563EB' },
  { key: 'cyan', value: '#0891B2' },
  { key: 'purple', value: '#7C3AED' },
  { key: 'green', value: '#16A34A' },
  { key: 'orange', value: '#EA580C' },
];

export default function Settings() {
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState(() => getThemePreference());
  const [accent, setAccent] = useState('blue');
  const [layoutDensity, setLayoutDensity] = useState('comfortable');
  const [projectName, setProjectName] = useState('');
  const [projectDesc, setProjectDesc] = useState('');
  const [projectStage, setProjectStage] = useState('dev');
  const [hostMode, setHostMode] = useState('local');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetchProjectConfig()
      .then((config) => {
        setProjectName(config.name || '');
        setProjectDesc(config.description || '');
        setProjectStage(config.stage || 'dev');
        setTheme(config.theme === 'system' ? getThemePreference() : config.theme || getThemePreference());
        setAccent(config.accent || 'blue');
        setLayoutDensity(config.density || 'comfortable');
        setHostMode(config.host_mode || 'local');
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleThemeChange = (t) => {
    setTheme(t);
    setThemePreference(t);
  };

  const handleSave = async () => {
    try {
      await updateProjectConfig({
        name: projectName,
        description: projectDesc,
        stage: projectStage,
        theme,
        accent,
        density: layoutDensity,
        host_mode: hostMode,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      /* silently fail */
    }
  };

  const primaryColor = ACCENT_COLORS.find((c) => c.key === accent)?.value || '#2563EB';

  if (loading) {
    return (
      <div style={STYLES.loadingState}>
        <div style={{ fontSize: 'var(--vd-font-size-lg)', marginBottom: 'var(--vd-space-2)' }}>加载中...</div>
      </div>
    );
  }

  return (
    <div style={STYLES.page}>
      <h1 style={STYLES.title}>设置</h1>

      {/* Project Info */}
      <div style={STYLES.group}>
        <div style={STYLES.groupTitle}>项目信息</div>
        <div style={STYLES.card}>
          <div style={STYLES.row}>
            <span style={STYLES.rowLabel}>项目名称</span>
            <input
              style={STYLES.input}
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
            />
          </div>
          <div style={STYLES.row}>
            <span style={STYLES.rowLabel}>项目描述</span>
            <input
              style={STYLES.input}
              value={projectDesc}
              onChange={(e) => setProjectDesc(e.target.value)}
            />
          </div>
          <div style={STYLES.row}>
            <span style={STYLES.rowLabel}>项目阶段</span>
            <select
              style={STYLES.select}
              value={projectStage}
              onChange={(e) => setProjectStage(e.target.value)}
            >
              <option value="requirements">需求对齐</option>
              <option value="dev">开发中</option>
              <option value="review">评审中</option>
              <option value="done">已收尾</option>
            </select>
          </div>
        </div>
      </div>

      {/* Personalization */}
      <div style={STYLES.group}>
        <div style={STYLES.groupTitle}>个性化</div>
        <div style={STYLES.card}>
          <div style={STYLES.row}>
            <span style={STYLES.rowLabel}>主题</span>
            <div style={{ display: 'flex', gap: 'var(--vd-space-2)' }}>
              {['light', 'dark'].map((t) => (
                <button
                  key={t}
                  style={STYLES.themeOption(theme === t)}
                  onClick={() => handleThemeChange(t)}
                >
                  {t === 'light' ? '浅色' : '深色'}
                </button>
              ))}
            </div>
          </div>
          <div style={STYLES.row}>
            <span style={STYLES.rowLabel}>主色调</span>
            <div style={{ display: 'flex', gap: 'var(--vd-space-3)' }}>
              {ACCENT_COLORS.map((c) => (
                <div
                  key={c.key}
                  style={accent === c.key ? STYLES.colorDotActive(c.value) : STYLES.colorDot(c.value)}
                  onClick={() => setAccent(c.key)}
                  title={c.key}
                />
              ))}
            </div>
          </div>
          <div style={STYLES.row}>
            <span style={STYLES.rowLabel}>布局密度</span>
            <div style={{ display: 'flex', gap: 'var(--vd-space-2)' }}>
              <button
                style={STYLES.themeOption(layoutDensity === 'comfortable')}
                onClick={() => setLayoutDensity('comfortable')}
              >
                舒适
              </button>
              <button
                style={STYLES.themeOption(layoutDensity === 'compact')}
                onClick={() => setLayoutDensity('compact')}
              >
                紧凑
              </button>
            </div>
          </div>

          {/* Preview */}
          <div style={{ padding: '0 var(--vd-space-4) var(--vd-space-4)' }}>
            <div style={STYLES.previewBox}>
              <div style={STYLES.previewLabel}>实时预览</div>
              <div style={STYLES.previewCard(primaryColor)}>
                <div style={{ fontSize: 'var(--vd-font-size-sm)', fontWeight: 600, color: 'var(--vd-text-primary)' }}>
                  样例标题
                </div>
                <div style={{ fontSize: 'var(--vd-font-size-sm)', color: 'var(--vd-text-secondary)', marginTop: 4 }}>
                  这是受当前主题和主色调影响的样例文本
                </div>
                <div style={STYLES.previewBtn(primaryColor)}>主要按钮</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Host & Access */}
      <div style={STYLES.group}>
        <div style={STYLES.groupTitle}>访问设置</div>
        <div style={STYLES.card}>
          <div style={STYLES.row}>
            <span style={STYLES.rowLabel}>运行模式</span>
            <div style={{ display: 'flex', gap: 'var(--vd-space-2)' }}>
              {[
                { key: 'local', label: '本地' },
                { key: 'lan', label: '局域网' },
              ].map((m) => (
                <button
                  key={m.key}
                  style={STYLES.themeOption(hostMode === m.key)}
                  onClick={() => setHostMode(m.key)}
                >
                  {m.label}
                </button>
              ))}
              <button
                style={{ ...STYLES.themeOption(false), opacity: 0.5, cursor: 'not-allowed' }}
                disabled
                title="即将推出"
              >
                在线平台
              </button>
            </div>
          </div>
          <div style={STYLES.row}>
            <span style={STYLES.rowLabel}>访问密钥</span>
            <input
              style={STYLES.input}
              type="password"
              value="auto-generated-key"
              readOnly
            />
          </div>
        </div>
      </div>

      <button style={STYLES.saveBtn} onClick={handleSave}>
        {saved ? '已保存 ✓' : '保存设置'}
      </button>
    </div>
  );
}
