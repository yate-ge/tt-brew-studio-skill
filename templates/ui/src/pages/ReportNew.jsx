import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createCanvasWorkspace, createReport } from '../lib/api';

const STRUCTURE_OPTIONS = [
  { key: 'standard', label: '标准汇报', desc: '单 section，短周期汇报，快速呈现结论与证据' },
  { key: 'complex-review', label: '复杂任务评审', desc: '多 section，适合长期任务，支持文档内反馈追踪' },
];

const SURFACE_OPTIONS = [
  { key: 'document_report', label: 'Document Report', desc: '交互式交付文档，内容由任务目标决定，可内嵌表格、代码和决策项' },
  { key: 'canvas_workspace', label: 'Canvas Workspace', desc: '持续协作画布，适合 moodboard、图片标注、思维导图和设计对齐' },
];

const STYLES = {
  page: {
    maxWidth: 640,
  },
  title: {
    fontSize: 'var(--vd-font-size-2xl)',
    fontWeight: 'var(--vd-font-weight-bold)',
    color: 'var(--vd-text-primary)',
    marginBottom: 'var(--vd-space-1)',
  },
  subtitle: {
    fontSize: 'var(--vd-font-size-sm)',
    color: 'var(--vd-text-secondary)',
    marginBottom: 'var(--vd-space-6)',
  },
  section: {
    marginBottom: 'var(--vd-space-6)',
  },
  sectionTitle: {
    fontSize: 'var(--vd-font-size-sm)',
    fontWeight: 'var(--vd-font-weight-semibold)',
    color: 'var(--vd-text-primary)',
    marginBottom: 'var(--vd-space-3)',
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--vd-space-2)',
  },
  stepNum: {
    width: 20,
    height: 20,
    borderRadius: 10,
    background: 'var(--vd-primary-bg)',
    color: 'var(--vd-primary)',
    fontSize: 11,
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 'var(--vd-space-3)',
  },
  optionCard: (selected) => ({
    padding: 'var(--vd-space-4)',
    borderRadius: 'var(--vd-radius-md)',
    border: `1px solid ${selected ? 'var(--vd-primary)' : 'var(--vd-border-default)'}`,
    background: selected ? 'var(--vd-primary-bg)' : 'var(--vd-surface-bg)',
    cursor: 'pointer',
    transition: 'all var(--vd-transition-fast)',
  }),
  optionLabel: {
    fontSize: 'var(--vd-font-size-sm)',
    fontWeight: 'var(--vd-font-weight-semibold)',
    color: 'var(--vd-text-primary)',
    marginBottom: 4,
  },
  optionDesc: {
    fontSize: 'var(--vd-font-size-xs)',
    color: 'var(--vd-text-tertiary)',
    lineHeight: 1.4,
  },
  agentRecommend: {
    padding: 'var(--vd-space-3)',
    borderRadius: 'var(--vd-radius-md)',
    background: 'var(--vd-info-bg)',
    border: '1px solid var(--vd-info-border)',
    fontSize: 'var(--vd-font-size-sm)',
    color: 'var(--vd-text-secondary)',
    marginBottom: 'var(--vd-space-4)',
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--vd-space-2)',
  },
  actions: {
    display: 'flex',
    gap: 'var(--vd-space-3)',
    justifyContent: 'flex-end',
    marginTop: 'var(--vd-space-6)',
  },
  btnCancel: {
    padding: 'var(--vd-space-2) var(--vd-space-4)',
    borderRadius: 'var(--vd-radius-md)',
    border: '1px solid var(--vd-border-default)',
    background: 'transparent',
    color: 'var(--vd-text-secondary)',
    fontSize: 'var(--vd-font-size-sm)',
    cursor: 'pointer',
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
};

export default function ReportNew() {
  const navigate = useNavigate();
  const [structure, setStructure] = useState('complex-review');
  const [surfaceType, setSurfaceType] = useState('document_report');

  const handleCreate = async () => {
    try {
      if (surfaceType === 'canvas_workspace') {
        const workspace = await createCanvasWorkspace({
          title: '协作画布',
          purpose: '持续承载本项目的视觉协作、标注、moodboard 和结构化设计沟通。',
          tags: ['collaboration', 'design'],
          make_active: true,
        });
        navigate(`/canvas?workspace=${encodeURIComponent(workspace.id)}`);
        return;
      }

      await createReport({
        title: '新建交付汇报',
        structure,
        presentation: 'document_report',
      });
      navigate('/reports');
    } catch {
      /* silently fail — stay on page */
    }
  };

  return (
    <div style={STYLES.page}>
      <h1 style={STYLES.title}>新建汇报</h1>
      <p style={STYLES.subtitle}>Agent 将根据模板选择自动组织汇报结构</p>

      {/* Agent recommendation */}
      <div style={STYLES.agentRecommend}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
        </svg>
        Agent 推荐：复杂任务评审 + Document Report
      </div>

      {/* Step 1: Structure */}
      <div style={STYLES.section}>
        <div style={STYLES.sectionTitle}>
          <span style={STYLES.stepNum}>1</span>
          选择结构层
        </div>
        <div style={STYLES.optionGrid}>
          {STRUCTURE_OPTIONS.map((opt) => (
            <div
              key={opt.key}
              style={STYLES.optionCard(structure === opt.key)}
              onClick={() => setStructure(opt.key)}
            >
              <div style={STYLES.optionLabel}>{opt.label}</div>
              <div style={STYLES.optionDesc}>{opt.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Step 2: Surface */}
      <div style={STYLES.section}>
        <div style={STYLES.sectionTitle}>
          <span style={STYLES.stepNum}>2</span>
          选择交付模式
        </div>
        <div style={STYLES.optionGrid}>
          {SURFACE_OPTIONS.map((opt) => (
            <div
              key={opt.key}
              style={STYLES.optionCard(surfaceType === opt.key)}
              onClick={() => setSurfaceType(opt.key)}
            >
              <div style={STYLES.optionLabel}>{opt.label}</div>
              <div style={STYLES.optionDesc}>{opt.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div style={STYLES.actions}>
        <button style={STYLES.btnCancel} onClick={() => navigate('/reports')}>
          取消
        </button>
        <button style={STYLES.btnSubmit} onClick={handleCreate}>
          {surfaceType === 'canvas_workspace' ? '创建画布工作区' : '创建汇报草稿'}
        </button>
      </div>
    </div>
  );
}
