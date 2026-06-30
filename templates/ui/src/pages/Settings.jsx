import { useState, useEffect } from 'react';
import {
  addHarnessSource,
  fetchHarness,
  fetchProjectConfig,
  fetchSettings,
  removeHarnessSource,
  rescanHarness,
  updateSettings,
  updateHarnessSource,
  updateProjectConfig,
} from '../lib/api';

const STYLES = {
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--vd-space-6)',
    maxWidth: 860,
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
    flexWrap: 'wrap',
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
    minWidth: 180,
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
  inlineActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--vd-space-2)',
    flexWrap: 'wrap',
  },
  smallBtn: {
    padding: 'var(--vd-space-2) var(--vd-space-3)',
    borderRadius: 'var(--vd-radius-md)',
    border: '1px solid var(--vd-border-default)',
    background: 'var(--vd-surface-bg)',
    color: 'var(--vd-text-secondary)',
    fontSize: 'var(--vd-font-size-xs)',
    cursor: 'pointer',
  },
  dangerBtn: {
    padding: 'var(--vd-space-2) var(--vd-space-3)',
    borderRadius: 'var(--vd-radius-md)',
    border: '1px solid var(--vd-danger-border)',
    background: 'var(--vd-danger-bg)',
    color: 'var(--vd-danger)',
    fontSize: 'var(--vd-font-size-xs)',
    cursor: 'pointer',
  },
  sourceItem: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: 'var(--vd-space-3)',
    padding: 'var(--vd-space-4)',
    borderBottom: '1px solid var(--vd-border-subtle)',
  },
  sourceTitle: {
    fontSize: 'var(--vd-font-size-sm)',
    fontWeight: 'var(--vd-font-weight-semibold)',
    color: 'var(--vd-text-primary)',
    marginBottom: 4,
  },
  sourceMeta: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 'var(--vd-space-2)',
    color: 'var(--vd-text-tertiary)',
    fontSize: 'var(--vd-font-size-xs)',
  },
  badge: (active) => ({
    display: 'inline-flex',
    alignItems: 'center',
    padding: '1px 7px',
    borderRadius: 'var(--vd-radius-xl)',
    border: `1px solid ${active ? 'var(--vd-success-border)' : 'var(--vd-border-default)'}`,
    background: active ? 'var(--vd-success-bg)' : 'var(--vd-surface-hover)',
    color: active ? 'var(--vd-success)' : 'var(--vd-text-tertiary)',
    fontSize: 10,
    fontWeight: 600,
  }),
};

const SOURCE_KIND_LABELS = {
  root_files: '根目录文件',
  project_documentation: '项目文档',
  project_memory: '项目记忆',
  work_log: '工作日志',
  agent_harness: 'Agent Harness',
  reference: '参考资料',
  note: '笔记',
  external: '外部来源',
};

export default function Settings() {
  const [loading, setLoading] = useState(true);
  const [projectName, setProjectName] = useState('');
  const [projectDesc, setProjectDesc] = useState('');
  const [hostMode, setHostMode] = useState('local');
  const [accessKeyEnabled, setAccessKeyEnabled] = useState(false);
  const [accessKey, setAccessKey] = useState('');
  const [saved, setSaved] = useState(false);
  const [harness, setHarness] = useState(null);
  const [documentIndex, setDocumentIndex] = useState(null);
  const [harnessBusy, setHarnessBusy] = useState(false);
  const [sourcePath, setSourcePath] = useState('');
  const [sourceTitle, setSourceTitle] = useState('');
  const [sourceKind, setSourceKind] = useState('project_documentation');

  useEffect(() => {
    Promise.all([fetchProjectConfig(), fetchHarness(), fetchSettings()])
      .then(([config, harnessData, settings]) => {
        setProjectName(config.name || '');
        setProjectDesc(config.description || '');
        setHostMode(settings.remote ? 'lan' : (config.host_mode || 'local'));
        setAccessKeyEnabled(settings.access_key_enabled === true);
        setAccessKey(settings.access_key || '');
        setHarness(harnessData.harness || null);
        setDocumentIndex(harnessData.document_index || null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const rememberAccessKey = (key) => {
    if (!key) return;
    document.cookie = `vd_access_key=${encodeURIComponent(key)}; SameSite=Lax; Path=/`;
  };

  const handleSave = async () => {
    try {
      if (accessKeyEnabled && accessKey) rememberAccessKey(accessKey);
      await updateProjectConfig({
        name: projectName,
        description: projectDesc,
        host_mode: hostMode,
      });
      const nextSettings = await updateSettings({
        remote: hostMode === 'lan',
        access_key_enabled: accessKeyEnabled,
        access_key: accessKey,
      });
      setAccessKeyEnabled(nextSettings.access_key_enabled === true);
      setAccessKey(nextSettings.access_key || accessKey);
      if (nextSettings.access_key_enabled && nextSettings.access_key) rememberAccessKey(nextSettings.access_key);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      /* silently fail */
    }
  };

  const handleRotateAccessKey = async () => {
    try {
      const nextSettings = await updateSettings({ rotate_access_key: true });
      setAccessKey(nextSettings.access_key || '');
      if (nextSettings.access_key_enabled && nextSettings.access_key) rememberAccessKey(nextSettings.access_key);
    } catch {
      /* keep current key */
    }
  };

  const refreshHarness = async () => {
    const data = await fetchHarness();
    setHarness(data.harness || null);
    setDocumentIndex(data.document_index || null);
    return data;
  };

  const handleRescanHarness = async () => {
    setHarnessBusy(true);
    try {
      const data = await rescanHarness();
      setHarness(data.harness || null);
      setDocumentIndex(data.document_index || null);
    } finally {
      setHarnessBusy(false);
    }
  };

  const handleAddSource = async () => {
    if (!sourcePath.trim()) return;
    setHarnessBusy(true);
    try {
      const data = await addHarnessSource({
        path: sourcePath.trim(),
        title: sourceTitle.trim() || sourcePath.trim(),
        kind: sourceKind,
      });
      setHarness(data.harness || null);
      setSourcePath('');
      setSourceTitle('');
      await refreshHarness();
    } finally {
      setHarnessBusy(false);
    }
  };

  const handleToggleSource = async (source) => {
    setHarnessBusy(true);
    try {
      const data = source.enabled === false
        ? await updateHarnessSource(source.id, { enabled: true })
        : await removeHarnessSource(source.id);
      setHarness(data.harness || null);
    } finally {
      setHarnessBusy(false);
    }
  };

  const handleSetLogTarget = async (source) => {
    setHarnessBusy(true);
    try {
      const data = await updateHarnessSource(source.id, { log_target: !source.log_target, enabled: true });
      setHarness(data.harness || null);
    } finally {
      setHarnessBusy(false);
    }
  };

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
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 'var(--vd-space-2)', flexWrap: 'wrap' }}>
              <button
                type="button"
                style={STYLES.themeOption(accessKeyEnabled)}
                onClick={() => setAccessKeyEnabled(!accessKeyEnabled)}
              >
                {accessKeyEnabled ? '已启用' : '未启用'}
              </button>
              <input
                style={{ ...STYLES.input, maxWidth: 360 }}
                type="text"
                value={accessKey}
                readOnly
              />
              <button type="button" style={STYLES.smallBtn} onClick={handleRotateAccessKey}>
                重新生成
              </button>
              <span style={{ color: 'var(--vd-text-tertiary)', fontSize: 'var(--vd-font-size-xs)' }}>
                启用后可通过 URL 参数 <code>vd_key</code> 或请求头 <code>x-vd-access-key</code> 访问。
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Harness Sources */}
      <div style={STYLES.group}>
        <div style={STYLES.groupTitle}>项目文档与日志来源</div>
        <div style={STYLES.card}>
          <div style={STYLES.row}>
            <span style={STYLES.rowLabel}>扫描状态</span>
            <div style={STYLES.rowValue}>
              {documentIndex?.total ?? 0} 个文档 · {documentIndex?.scanned_at ? `上次扫描 ${new Date(documentIndex.scanned_at).toLocaleString('zh-CN')}` : '尚未扫描'}
            </div>
            <button type="button" style={STYLES.smallBtn} onClick={handleRescanHarness} disabled={harnessBusy}>
              {harnessBusy ? '处理中...' : '重新扫描'}
            </button>
          </div>

          {(harness?.sources || []).map((source) => (
            <div key={source.id} style={STYLES.sourceItem}>
              <div>
                <div style={STYLES.sourceTitle}>{source.title || source.path}</div>
                <div style={STYLES.sourceMeta}>
                  <span>{source.path}</span>
                  <span>{SOURCE_KIND_LABELS[source.kind] || source.kind}</span>
                  <span>{source.document_count || 0} 个文档</span>
                  <span>{source.writable ? '可写' : '只读'}</span>
                  <span style={STYLES.badge(source.enabled !== false)}>{source.enabled === false ? '已停用' : '已接入'}</span>
                  {source.log_target && <span style={STYLES.badge(true)}>日志目标</span>}
                </div>
              </div>
              <div style={STYLES.inlineActions}>
                <button type="button" style={STYLES.smallBtn} onClick={() => handleSetLogTarget(source)} disabled={harnessBusy || source.enabled === false}>
                  {source.log_target ? '取消日志目标' : '设为日志目标'}
                </button>
                <button
                  type="button"
                  style={source.enabled === false ? STYLES.smallBtn : STYLES.dangerBtn}
                  onClick={() => handleToggleSource(source)}
                  disabled={harnessBusy}
                >
                  {source.enabled === false ? '重新接入' : '停用'}
                </button>
              </div>
            </div>
          ))}

          <div style={STYLES.row}>
            <span style={STYLES.rowLabel}>手动添加</span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 'var(--vd-space-2)', flex: 1, minWidth: 220 }}>
              <input
                style={{ ...STYLES.input, maxWidth: 'none' }}
                value={sourcePath}
                placeholder="例如 docs 或 notes/project-log.md"
                onChange={(e) => setSourcePath(e.target.value)}
              />
              <input
                style={{ ...STYLES.input, maxWidth: 'none' }}
                value={sourceTitle}
                placeholder="显示名称"
                onChange={(e) => setSourceTitle(e.target.value)}
              />
              <select style={STYLES.select} value={sourceKind} onChange={(e) => setSourceKind(e.target.value)}>
                {Object.entries(SOURCE_KIND_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
            <button type="button" style={STYLES.smallBtn} onClick={handleAddSource} disabled={harnessBusy || !sourcePath.trim()}>
              添加
            </button>
          </div>
        </div>
      </div>

      <button style={STYLES.saveBtn} onClick={handleSave}>
        {saved ? '已保存 ✓' : '保存设置'}
      </button>
    </div>
  );
}
