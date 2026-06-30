import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { Tldraw, createShapeId, getSnapshot, loadSnapshot, toRichText } from 'tldraw';
import 'tldraw/tldraw.css';

function asSections(report) {
  const contentSections = report?.content?.sections;
  if (Array.isArray(contentSections) && contentSections.length > 0) return contentSections;
  if (Array.isArray(report?.sections) && report.sections.length > 0) return report.sections;
  return [];
}

function childrenToText(children) {
  return React.Children.toArray(children).map((child) => {
    if (typeof child === 'string' || typeof child === 'number') return String(child);
    if (child?.props?.children) return childrenToText(child.props.children);
    return '';
  }).join('');
}

function cleanHeadingText(value) {
  return String(value || '')
    .replace(/[`*_~[\]()#>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function slugify(value) {
  const normalized = cleanHeadingText(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'section';
}

function safeShapeKey(value) {
  const normalized = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'node';
}

function markdownSummary(value, max = 260) {
  const text = String(value || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/\[[^\]]+]\([^)]*\)/g, (match) => match.replace(/^\[|\]\([^)]*\)$/g, ''))
    .replace(/[#>*_~[\]()|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max - 1)}...` : text;
}

function uniqueSlug(base, counts) {
  const count = counts.get(base) || 0;
  counts.set(base, count + 1);
  return count === 0 ? base : `${base}-${count + 1}`;
}

function extractHeadings(markdown) {
  const headings = [];
  const counts = new Map();
  String(markdown || '').split(/\r?\n/).forEach((line, index) => {
    const match = /^(#{1,4})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!match) return;
    const text = cleanHeadingText(match[2]);
    if (!text) return;
    headings.push({
      id: uniqueSlug(slugify(text), counts),
      level: match[1].length,
      line: index + 1,
      text,
    });
  });
  return headings;
}

function headingIdFromNode(children, node, headingByLine) {
  const line = node?.position?.start?.line;
  if (line && headingByLine.has(line)) return headingByLine.get(line).id;
  return slugify(childrenToText(children));
}

function shortText(value, max = 80) {
  const text = cleanHeadingText(value);
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}...`;
}

function compactBounds(bounds) {
  if (!bounds) return null;
  const result = {
    x: bounds.x ?? bounds.minX,
    y: bounds.y ?? bounds.minY,
    w: bounds.w ?? bounds.width ?? (Number.isFinite(bounds.maxX) && Number.isFinite(bounds.minX) ? bounds.maxX - bounds.minX : undefined),
    h: bounds.h ?? bounds.height ?? (Number.isFinite(bounds.maxY) && Number.isFinite(bounds.minY) ? bounds.maxY - bounds.minY : undefined),
    minX: bounds.minX,
    minY: bounds.minY,
    maxX: bounds.maxX,
    maxY: bounds.maxY,
  };
  return Object.fromEntries(Object.entries(result).filter(([, value]) => Number.isFinite(value)));
}

function columnKey(column, fallback) {
  return String(column?.key || column?.id || fallback);
}

function displayValue(value) {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.map(displayValue).filter(Boolean).join(', ');
  if (typeof value === 'object') return value.label || value.title || value.name || JSON.stringify(value);
  return String(value);
}

function rowValue(row, column, fallback) {
  const key = columnKey(column, fallback);
  return row?.[key] ?? row?.[column?.label] ?? '';
}

function rowIdentity(row, index) {
  return String(row?.id || row?._id || row?.key || index + 1);
}

function rowTitle(row, columns, index) {
  const firstColumn = columns[0];
  const firstValue = firstColumn ? displayValue(rowValue(row, firstColumn, 0)) : '';
  return firstValue || row?.title || row?.name || `第 ${index + 1} 行`;
}

function rowMatchesView(row, view) {
  if (!view || view.id === 'all') return true;
  const id = String(row?.id || row?._id || row?.key || '');
  if (Array.isArray(view.row_ids) && view.row_ids.length > 0) {
    return view.row_ids.map(String).includes(id);
  }
  const filter = view.filter || view.filters || view.where;
  if (!filter || typeof filter !== 'object') return true;
  return Object.entries(filter).every(([key, expected]) => {
    const actual = displayValue(row?.[key]).toLowerCase();
    if (Array.isArray(expected)) {
      return expected.map((item) => displayValue(item).toLowerCase()).includes(actual);
    }
    const expectedText = displayValue(expected).toLowerCase();
    return actual === expectedText || actual.includes(expectedText);
  });
}

function rowMatchesQuery(row, columns, query) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return columns.some((column, index) => displayValue(rowValue(row, column, index)).toLowerCase().includes(needle));
}

function compareValues(a, b) {
  const aNumber = Number(a);
  const bNumber = Number(b);
  if (Number.isFinite(aNumber) && Number.isFinite(bNumber)) return aNumber - bNumber;
  return displayValue(a).localeCompare(displayValue(b), undefined, { numeric: true, sensitivity: 'base' });
}

function slideDecision(slide) {
  const decision = slide?.decision || slide?.decision_prompt || slide?.decision_question || slide?.decision_point;
  if (!decision && !slide?.needs_decision) return null;
  if (typeof decision === 'object') {
    return {
      id: decision.id || slide.id,
      text: decision.prompt || decision.question || decision.title || decision.body || '需要确认的决策',
      status: decision.status || slide.decision_status || (slide.needs_decision ? 'needs_decision' : 'open'),
    };
  }
  return {
    id: slide?.decision_id || slide?.id,
    text: decision || '需要确认的决策',
    status: slide?.decision_status || (slide?.needs_decision ? 'needs_decision' : 'open'),
  };
}

function isCanvasPresentationReport(report) {
  return (report?.presentation || report?.content?.presentation) === 'canvas';
}

function summarizeTableArtifact(artifact) {
  const columns = Array.isArray(artifact?.columns) ? artifact.columns : [];
  const rows = Array.isArray(artifact?.rows) ? artifact.rows : [];
  const rowLines = rows.slice(0, 4).map((row, index) => {
    const title = rowTitle(row, columns, index);
    const status = row?.status ? ` (${row.status})` : '';
    return `- ${title}${status}`;
  });
  return [`${rows.length} 行，${columns.length} 个字段。`, ...rowLines].filter(Boolean).join('\n');
}

function summarizeSlidesArtifact(artifact) {
  const slides = Array.isArray(artifact?.slides) ? artifact.slides : [];
  return slides.slice(0, 6).map((slide, index) => {
    const decision = slideDecision(slide);
    return `${index + 1}. ${slide?.title || `Slide ${index + 1}`}${decision ? `\n   决策：${decision.text}` : ''}`;
  }).join('\n') || '暂无 slides 内容。';
}

function sectionToCanvasNode(section, index) {
  const presentation = section.presentation || section.artifact?.type || 'document';
  const artifact = section.artifact || {};
  if (presentation === 'canvas' || artifact.type === 'canvas') return null;

  let body = section.narrative || '';
  if (presentation === 'table' || artifact.type === 'table') {
    body = [body, summarizeTableArtifact(artifact)].filter(Boolean).join('\n\n');
  } else if (presentation === 'slides' || artifact.type === 'slides') {
    body = [body, summarizeSlidesArtifact(artifact)].filter(Boolean).join('\n\n');
  } else {
    body = [body, markdownSummary(artifact.body || artifact.markdown || artifact.content || '')].filter(Boolean).join('\n\n');
  }

  return {
    id: `section-${index}-${section.id || presentation}`,
    role: 'agent',
    title: section.title || `Section ${index + 1}`,
    body: body || '由 agent 在画布中补充该区块内容。',
    x: (index % 2) * 360,
    y: 520 + Math.floor(index / 2) * 240,
    w: 320,
    h: 190,
    color: presentation === 'table' ? 'orange' : (presentation === 'slides' ? 'violet' : 'blue'),
    source_section_id: section.id,
    source_presentation: presentation,
  };
}

function changeRecordToCanvasNode(item, index) {
  const record = item.change_record || item.changeRecord || {};
  const summary = record.change_summary || record.summary || record.description || '';
  if (!summary) return null;
  return {
    id: `change-record-${item.feedback_id || item.id || index}`,
    role: 'shared',
    title: `反馈闭环 ${index + 1}`,
    body: [
      summary,
      item.content ? `来源反馈：${item.content}` : '',
      item.status ? `状态：${item.status === 'confirmed' ? '已确认' : '已处理'}` : '',
    ].filter(Boolean).join('\n'),
    x: 760,
    y: 40 + index * 220,
    w: 320,
    h: 170,
    color: 'green',
  };
}

function uniqueCanvasNodes(nodes) {
  const used = new Map();
  return nodes.filter(Boolean).map((node, index) => {
    const base = safeShapeKey(node.id || node.title || index);
    const count = used.get(base) || 0;
    used.set(base, count + 1);
    const key = count === 0 ? base : `${base}-${count + 1}`;
    return { ...node, _shapeKey: key };
  });
}

function createCanvasReportSection(report, sections) {
  const canvasSection = sections.find((section) => (
    (section.presentation || section.artifact?.type) === 'canvas'
  ));
  const baseSection = canvasSection || {
    id: 'canvas-report',
    title: report?.title || '画布汇报',
    presentation: 'canvas',
    artifact: { type: 'canvas', mode: 'tldraw', seed_nodes: [] },
  };
  const baseArtifact = baseSection.artifact || {};
  const existingSeedNodes = getCanvasSeedNodes(baseArtifact);
  const routingNode = report?.content?.routing_reason ? {
    id: 'routing-reason',
    role: 'agent',
    title: '汇报路由',
    body: report.content.routing_reason,
    x: -360,
    y: 0,
    w: 300,
    h: 150,
    color: 'blue',
  } : null;
  const sectionNodes = sections.map(sectionToCanvasNode).filter(Boolean);
  const changeNodes = (Array.isArray(report?.content?.change_records) ? report.content.change_records : [])
    .map(changeRecordToCanvasNode)
    .filter(Boolean);

  return {
    ...baseSection,
    title: baseSection.title || report?.title || '画布汇报',
    presentation: 'canvas',
    narrative: baseSection.narrative || '画布模式会把汇报内容、推理、决策和反馈目标放在同一个无限画布中。',
    artifact: {
      ...baseArtifact,
      type: 'canvas',
      mode: 'tldraw',
      seed_nodes: uniqueCanvasNodes([
        routingNode,
        ...existingSeedNodes,
        ...sectionNodes,
        ...changeNodes,
      ]),
    },
  };
}

function addFeedback(onAddFeedback, section, target = {}) {
  const targetInfo = {
    section_id: section.id,
    section_title: section.title,
    ...target,
  };
  const label = target.label || `反馈：${section.title}`;
  onAddFeedback?.({
    kind: 'interactive',
    target: {
      anchor: label,
      ...targetInfo,
    },
    payload: {
      action: target.action || 'report_section_feedback',
      label,
      'item-id': target.id || section.id,
      fields: target.fields,
      target: targetInfo,
    },
  });
}

function presentationLabel(value) {
  if (value === 'document_report' || value === 'document') return 'Document Report';
  if (value === 'canvas_workspace') return 'Canvas Workspace';
  if (value === 'canvas') return 'Canvas';
  if (value === 'table') return 'Table';
  if (value === 'slides') return 'Slides';
  return value || 'Document Report';
}

function SectionShell({ section, children, onAddFeedback }) {
  return (
    <section style={styles.section}>
      <header style={styles.sectionHeader}>
        <div>
          <div style={styles.sectionEyebrow}>{presentationLabel(section.presentation || section.artifact?.type)}</div>
          <h2 style={styles.sectionTitle}>{section.title}</h2>
          {section.narrative && <p style={styles.narrative}>{section.narrative}</p>}
        </div>
        <button type="button" style={styles.feedbackButton} onClick={() => addFeedback(onAddFeedback, section)}>
          反馈
        </button>
      </header>
      {children}
    </section>
  );
}

function DocumentArtifact({ section, artifact, onAddFeedback }) {
  const body = artifact?.body || '由 agent 补充文档内容。';
  const headings = useMemo(() => extractHeadings(body), [body]);
  const headingByLine = useMemo(() => new Map(headings.map((heading) => [heading.line, heading])), [headings]);

  useEffect(() => {
    if (headings.length === 0) return;
    const firstHeading = document.getElementById(`${section.id}-${headings[0].id}`);
    firstHeading?.setAttribute('data-active-heading', 'true');
  }, [headings, section.id]);

  const scrollToHeading = (headingId) => {
    const node = document.getElementById(`${section.id}-${headingId}`);
    node?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  function addParagraphFeedback(node, children) {
    const line = node?.position?.start?.line;
    const text = shortText(childrenToText(children));
    addFeedback(onAddFeedback, section, {
      id: `${section.id}:paragraph:${line || slugify(text)}`,
      kind: 'document_paragraph',
      action: 'document_paragraph_feedback',
      label: text ? `段落反馈：${text}` : `段落反馈：${section.title}`,
      paragraph_line: line || null,
      quote: text,
      fields: {
        type: 'document_paragraph',
        line: line || 'unknown',
      },
    });
  }

  function headingComponent(level) {
    const Tag = `h${level}`;
    return function Heading({ children, node }) {
      const id = headingIdFromNode(children, node, headingByLine);
      return (
        <Tag id={`${section.id}-${id}`} data-heading-id={id} style={styles[`docH${level}`]}>
          {children}
        </Tag>
      );
    };
  }

  return (
    <div style={styles.documentGrid(headings.length > 0)}>
      <article style={styles.document}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeHighlight]}
          components={{
            h1: headingComponent(1),
            h2: headingComponent(2),
            h3: headingComponent(3),
            h4: headingComponent(4),
            p: ({ children, node }) => (
              <div style={styles.paragraphBlock}>
                <p style={styles.paragraphText}>{children}</p>
                <button
                  type="button"
                  style={styles.paragraphFeedbackButton}
                  onClick={() => addParagraphFeedback(node, children)}
                >
                  反馈
                </button>
              </div>
            ),
            pre: ({ children }) => <pre style={styles.pre}>{children}</pre>,
            code: ({ inline, className, children, ...props }) => (
              inline
                ? <code style={styles.inlineCode} {...props}>{children}</code>
                : <code className={className} {...props}>{children}</code>
            ),
            table: ({ children }) => (
              <div style={styles.tableWrap}>
                <table style={styles.table}>{children}</table>
              </div>
            ),
            th: ({ children }) => <th style={styles.th}>{children}</th>,
            td: ({ children }) => <td style={styles.td}>{children}</td>,
          }}
        >
          {body}
        </ReactMarkdown>
      </article>
      {headings.length > 0 && (
        <aside style={styles.documentToc}>
          <div style={styles.tocTitle}>目录</div>
          <div style={styles.tocList}>
            {headings.map((heading) => (
              <button
                type="button"
                key={heading.id}
                style={styles.tocItem(heading.level)}
                onClick={() => scrollToHeading(heading.id)}
              >
                {heading.text}
              </button>
            ))}
          </div>
        </aside>
      )}
    </div>
  );
}

function TableArtifact({ section, artifact, onAddFeedback }) {
  const columns = Array.isArray(artifact?.columns) ? artifact.columns : [];
  const rows = Array.isArray(artifact?.rows) ? artifact.rows : [];
  const views = Array.isArray(artifact?.views) ? artifact.views : [];
  const [query, setQuery] = useState('');
  const [activeViewId, setActiveViewId] = useState('all');
  const [sortState, setSortState] = useState({ key: null, direction: 'asc' });
  const allViews = useMemo(() => [{ id: 'all', label: '全部' }, ...views], [views]);
  const activeView = allViews.find((view) => view.id === activeViewId) || allViews[0];
  const visibleRows = useMemo(() => {
    const filtered = rows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => rowMatchesView(row, activeView))
      .filter(({ row }) => rowMatchesQuery(row, columns, query));

    if (!sortState.key) return filtered;
    const column = columns.find((item, index) => columnKey(item, index) === sortState.key);
    return [...filtered].sort((a, b) => {
      const direction = sortState.direction === 'desc' ? -1 : 1;
      return compareValues(
        rowValue(a.row, column, sortState.key),
        rowValue(b.row, column, sortState.key),
      ) * direction;
    });
  }, [activeView, columns, query, rows, sortState.direction, sortState.key]);

  function toggleSort(key) {
    setSortState((current) => {
      if (current.key !== key) return { key, direction: 'asc' };
      if (current.direction === 'asc') return { key, direction: 'desc' };
      return { key: null, direction: 'asc' };
    });
  }

  function handleFieldFeedback(column, index) {
    const key = columnKey(column, index);
    const label = column.label || key;
    addFeedback(onAddFeedback, section, {
      id: `${section.id}:field:${key}`,
      kind: 'table_field',
      action: 'table_field_feedback',
      label: `字段反馈：${label}`,
      column_key: key,
      column_label: label,
      fields: {
        type: 'table_field',
        column: label,
      },
    });
  }

  function handleRowFeedback(row, index) {
    const id = rowIdentity(row, index);
    const title = rowTitle(row, columns, index);
    addFeedback(onAddFeedback, section, {
      id: `${section.id}:row:${id}`,
      kind: 'table_row',
      action: 'table_row_feedback',
      label: `行反馈：${title}`,
      row_id: id,
      row_index: index + 1,
      row_label: title,
      fields: {
        type: 'table_row',
        row: title,
      },
    });
  }

  return (
    <div>
      <div style={styles.tableToolbar}>
        <label style={styles.tableSearchLabel}>
          <span style={styles.tableSearchTitle}>查询</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索当前表格"
            style={styles.tableSearch}
          />
        </label>
        <div style={styles.tableViews} aria-label="表格视图">
          {allViews.map((view) => (
            <button
              type="button"
              key={view.id}
              style={styles.tableViewButton(view.id === activeViewId)}
              onClick={() => setActiveViewId(view.id)}
            >
              {view.label || view.name || view.id}
            </button>
          ))}
        </div>
        <div style={styles.tableMeta}>{visibleRows.length} / {rows.length} 行</div>
      </div>
      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              {columns.map((column, index) => {
                const key = columnKey(column, index);
                const label = column.label || key;
                const sorted = sortState.key === key;
                return (
                  <th key={key} style={styles.th}>
                    <div style={styles.thContent}>
                      <button
                        type="button"
                        style={styles.tableHeaderButton}
                        onClick={() => toggleSort(key)}
                      >
                        <span>{label}</span>
                        <span style={styles.sortIndicator}>{sorted ? (sortState.direction === 'desc' ? '↓' : '↑') : '↕'}</span>
                      </button>
                      <button
                        type="button"
                        style={styles.tableHeaderFeedback}
                        onClick={() => handleFieldFeedback(column, index)}
                      >
                        字段反馈
                      </button>
                    </div>
                  </th>
                );
              })}
              <th style={styles.th}>行反馈</th>
            </tr>
          </thead>
          <tbody>
            {columns.length === 0 || rows.length === 0 ? (
              <tr>
                <td style={styles.td} colSpan={columns.length + 1}>暂无表格数据</td>
              </tr>
            ) : visibleRows.length === 0 ? (
              <tr>
                <td style={styles.td} colSpan={columns.length + 1}>没有匹配当前筛选条件的行</td>
              </tr>
            ) : visibleRows.map(({ row, index }) => (
              <tr key={rowIdentity(row, index)}>
                {columns.map((column, columnIndex) => (
                  <td key={columnKey(column, columnIndex)} style={styles.td}>{displayValue(rowValue(row, column, columnIndex))}</td>
                ))}
                <td style={styles.td}>
                  <button
                    type="button"
                    style={styles.inlineFeedbackButton}
                    onClick={() => handleRowFeedback(row, index)}
                  >
                    反馈
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SlidesArtifact({ section, artifact, onAddFeedback }) {
  const slides = Array.isArray(artifact?.slides) ? artifact.slides : [];
  const [activeIndex, setActiveIndex] = useState(0);
  const activeSlide = slides[Math.min(activeIndex, Math.max(slides.length - 1, 0))];
  const decision = slideDecision(activeSlide);
  const slidePoints = Array.isArray(activeSlide?.points)
    ? activeSlide.points
    : (Array.isArray(activeSlide?.items) ? activeSlide.items : []);

  useEffect(() => {
    if (activeIndex >= slides.length && slides.length > 0) setActiveIndex(slides.length - 1);
  }, [activeIndex, slides.length]);

  function handleSlideFeedback(slide, index) {
    addFeedback(onAddFeedback, section, {
      id: `${section.id}:slide:${slide?.id || index + 1}`,
      kind: 'slide_page',
      action: 'slide_page_feedback',
      label: `页面反馈：${slide?.title || `Slide ${index + 1}`}`,
      slide_id: slide?.id || null,
      slide_index: index + 1,
      fields: {
        type: 'slide_page',
        slide: slide?.title || `Slide ${index + 1}`,
      },
    });
  }

  function handleDecisionFeedback(slide, index, decisionTarget) {
    addFeedback(onAddFeedback, section, {
      id: `${section.id}:slide:${slide?.id || index + 1}:decision:${decisionTarget.id || 'main'}`,
      kind: 'slide_decision',
      action: 'slide_decision_feedback',
      label: `决策反馈：${shortText(decisionTarget.text, 40)}`,
      slide_id: slide?.id || null,
      slide_index: index + 1,
      decision_id: decisionTarget.id || null,
      decision_status: decisionTarget.status,
      prompt: decisionTarget.text,
      fields: {
        type: 'slide_decision',
        decision: decisionTarget.text,
        status: decisionTarget.status,
      },
    });
  }

  return (
    <div style={styles.slidesShell}>
      {slides.length === 0 ? (
        <div style={styles.emptyArtifact}>暂无 slides 内容</div>
      ) : (
        <>
          <nav style={styles.slideNav} aria-label="Slides">
            {slides.map((slide, index) => (
              <button
                type="button"
                key={slide.id || index}
                style={styles.slideNavButton(index === activeIndex)}
                onClick={() => setActiveIndex(index)}
              >
                <span style={styles.slideNavIndex}>{String(index + 1).padStart(2, '0')}</span>
                <span style={styles.slideNavTitle}>{slide.title || `Slide ${index + 1}`}</span>
              </button>
            ))}
          </nav>
          <article style={styles.slideMain}>
            <div style={styles.slideTopline}>
              <span style={styles.slideIndex}>{String(activeIndex + 1).padStart(2, '0')} / {slides.length}</span>
              {decision && <span style={styles.decisionBadge}>{decision.status}</span>}
            </div>
            <h3 style={styles.slideTitle}>{activeSlide.title || `Slide ${activeIndex + 1}`}</h3>
            {(activeSlide.body || activeSlide.summary) && (
              <div style={styles.slideMarkdown}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{activeSlide.body || activeSlide.summary}</ReactMarkdown>
              </div>
            )}
            {slidePoints.length > 0 && (
              <ul style={styles.slidePoints}>
                {slidePoints.map((item, index) => (
                  <li key={`${displayValue(item)}-${index}`}>{displayValue(item)}</li>
                ))}
              </ul>
            )}
            {decision && (
              <div style={styles.slideDecision}>
                <div style={styles.slideDecisionTitle}>待确认决策</div>
                <div style={styles.slideDecisionText}>{decision.text}</div>
                <button
                  type="button"
                  style={styles.inlineFeedbackButton}
                  onClick={() => handleDecisionFeedback(activeSlide, activeIndex, decision)}
                >
                  反馈决策
                </button>
              </div>
            )}
            {activeSlide.speaker_notes && <div style={styles.slideNotes}>{activeSlide.speaker_notes}</div>}
            <footer style={styles.slideActions}>
              <div style={styles.slideStepButtons}>
                <button
                  type="button"
                  style={styles.inlineFeedbackButton}
                  disabled={activeIndex === 0}
                  onClick={() => setActiveIndex((value) => Math.max(value - 1, 0))}
                >
                  上一页
                </button>
                <button
                  type="button"
                  style={styles.inlineFeedbackButton}
                  disabled={activeIndex >= slides.length - 1}
                  onClick={() => setActiveIndex((value) => Math.min(value + 1, slides.length - 1))}
                >
                  下一页
                </button>
              </div>
              <button
                type="button"
                style={styles.feedbackButton}
                onClick={() => handleSlideFeedback(activeSlide, activeIndex)}
              >
                对本页反馈
              </button>
            </footer>
          </article>
        </>
      )}
    </div>
  );
}

function getCanvasSeedNodes(artifact) {
  return Array.isArray(artifact?.seed_nodes) && artifact.seed_nodes.length > 0
    ? artifact.seed_nodes
    : [
      {
        id: 'agent-brief',
        role: 'agent',
        title: 'Agent 工作区',
        body: '放置方案、素材、推理过程和设计说明。',
        x: 0,
        y: 0,
        w: 280,
        h: 170,
        color: 'blue',
      },
      {
        id: 'inspiration',
        role: 'agent',
        title: '灵感与素材',
        body: '收集参考、截图、链接和用户补充信息。',
        x: 340,
        y: 0,
        w: 280,
        h: 170,
        color: 'yellow',
      },
      {
        id: 'feedback',
        role: 'user',
        title: '用户反馈区',
        body: '圈选区域、批注或补充新的想法。',
        x: 0,
        y: 240,
        w: 280,
        h: 170,
        color: 'green',
      },
      {
        id: 'decision',
        role: 'shared',
        title: '共享决策区',
        body: '沉淀需要确认的结论、取舍和下一步动作。',
        x: 340,
        y: 240,
        w: 280,
        h: 170,
        color: 'violet',
      },
    ];
}

function readSelectedShapeIds(editor) {
  try {
    return editor?.getSelectedShapeIds?.() || [];
  } catch {
    return [];
  }
}

function sameShapeIds(a, b) {
  if (a.length !== b.length) return false;
  return a.every((item, index) => String(item) === String(b[index]));
}

function describeSelectedShapes(editor, shapeIds) {
  return shapeIds.map((shapeId) => {
    const shape = editor?.getShape?.(shapeId);
    return {
      id: String(shapeId),
      type: shape?.type || 'shape',
      x: shape?.x,
      y: shape?.y,
    };
  });
}

function canvasNodeShapeId(sectionId, node, index = 0) {
  return createShapeId(`vd-${safeShapeKey(sectionId)}-${node._shapeKey || safeShapeKey(node.id || node.title || index)}`);
}

function CanvasArtifact({ reportId, section, artifact, onCanvasSnapshot, onAddFeedback, variant = 'section' }) {
  const saveTimer = useRef(null);
  const selectionPoller = useRef(null);
  const loaded = useRef(false);
  const editorRef = useRef(null);
  const [selectedShapeIds, setSelectedShapeIds] = useState([]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const snapshot = artifact?.tldraw_snapshot;
  const seedNodes = getCanvasSeedNodes(artifact);
  const isReportCanvas = variant === 'report';

  useEffect(() => {
    if (!isFullscreen) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setIsFullscreen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

  useEffect(() => () => {
    window.clearTimeout(saveTimer.current);
    window.clearInterval(selectionPoller.current);
  }, []);

  function ensureSeedShapes(editor) {
    const existingShapes = editor.getCurrentPageShapes?.() || [];
    const shapes = seedNodes.map((node, index) => ({
      id: canvasNodeShapeId(section.id, node, index),
      type: 'geo',
      x: Number.isFinite(node.x) ? node.x : index * 320,
      y: Number.isFinite(node.y) ? node.y : (index % 2 === 0 ? 0 : 220),
      props: {
        geo: 'rectangle',
        w: Number.isFinite(node.w) ? node.w : 280,
        h: Number.isFinite(node.h) ? node.h : 170,
        fill: 'solid',
        color: node.color || ['blue', 'yellow', 'green', 'violet'][index % 4],
        richText: toRichText(`${node.title || 'Canvas Node'}${node.role ? ` · ${node.role}` : ''}\n\n${node.body || ''}`),
      },
    })).filter((shape) => !editor.getShape?.(shape.id));

    if (shapes.length > 0) editor.createShapes(shapes);
    if (existingShapes.length === 0 && shapes.length > 0) editor.zoomToFit?.();
  }

  function handleMount(editor) {
    editorRef.current = editor;
    if (snapshot?.store || snapshot?.document?.store) {
      try {
        loadSnapshot(editor.store, snapshot);
        editor.clearHistory?.();
      } catch (error) {
        console.error('Failed to load tldraw snapshot', error);
      }
    } else {
      ensureSeedShapes(editor);
    }
    ensureSeedShapes(editor);
    loaded.current = true;
    setSelectedShapeIds(readSelectedShapeIds(editor));
    window.clearInterval(selectionPoller.current);
    selectionPoller.current = window.setInterval(() => {
      const nextShapeIds = readSelectedShapeIds(editor);
      setSelectedShapeIds((current) => (
        sameShapeIds(current, nextShapeIds) ? current : nextShapeIds
      ));
    }, 250);
    const unsubscribe = editor.store.listen(() => {
      if (!loaded.current) return;
      setSelectedShapeIds(readSelectedShapeIds(editor));
      window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => {
        try {
          onCanvasSnapshot?.(section.id, getSnapshot(editor.store));
        } catch (error) {
          console.error('Failed to save tldraw snapshot', error);
        }
      }, 900);
    });
    return () => {
      window.clearTimeout(saveTimer.current);
      editorRef.current = null;
      unsubscribe?.();
    };
  }

  function handleCanvasNodeFeedback(node, index = 0) {
    const shapeId = String(canvasNodeShapeId(section.id, node, index));
    addFeedback(onAddFeedback, section, {
      id: `${reportId}:${section.id}:node:${node.id}`,
      kind: 'canvas_node',
      action: 'canvas_node_feedback',
      label: `画布节点反馈：${node.title || node.id}`,
      node_id: node.id,
      shape_id: shapeId,
      fields: {
        type: 'canvas_node',
        node: node.title || node.id,
        shape_id: shapeId,
      },
    });
  }

  function handleSelectionFeedback() {
    const editor = editorRef.current;
    const shapeIds = readSelectedShapeIds(editor);
    if (shapeIds.length === 0) return;
    const bounds = compactBounds(editor?.getSelectionPageBounds?.());
    addFeedback(onAddFeedback, section, {
      id: `${reportId}:${section.id}:selection:${shapeIds.map(String).join('|')}`,
      kind: 'canvas_selection',
      action: 'canvas_selection_feedback',
      label: `画布选区反馈：${shapeIds.length} 个对象`,
      shape_ids: shapeIds.map(String),
      shape_count: shapeIds.length,
      shapes: describeSelectedShapes(editor, shapeIds),
      bounds,
      fields: {
        type: 'canvas_selection',
        selected_shapes: shapeIds.length,
        shape_ids: shapeIds.map(String).join(', '),
      },
    });
  }

  return (
    <div
      style={{
        ...styles.canvasShell,
        ...(isReportCanvas ? styles.canvasReportShell : {}),
        ...(isFullscreen ? styles.canvasFullscreenShell : {}),
      }}
    >
      <div style={styles.canvasToolbar}>
        <div>
          <div style={styles.canvasTitle}>{isReportCanvas ? (section.title || '画布汇报工作区') : '无限画布'}</div>
          <div style={styles.canvasHint}>{section.narrative || '适合设计创意、头脑风暴、灵感采集和产品设计推进'}</div>
        </div>
        <div style={styles.canvasToolbarActions}>
          <button
            type="button"
            style={{
              ...styles.selectionFeedbackButton,
              ...(selectedShapeIds.length === 0 ? styles.selectionFeedbackButtonDisabled : {}),
            }}
            disabled={selectedShapeIds.length === 0}
            onClick={handleSelectionFeedback}
          >
            {selectedShapeIds.length > 0 ? `对选中元素反馈 (${selectedShapeIds.length})` : '选中元素后反馈'}
          </button>
          <button
            type="button"
            style={styles.feedbackButton}
            onClick={() => setIsFullscreen((value) => !value)}
          >
            {isFullscreen ? '退出全屏' : '全屏查看'}
          </button>
          <button
            type="button"
            style={styles.feedbackButton}
            onClick={() => addFeedback(onAddFeedback, section, { id: `${reportId}:${section.id}:canvas`, kind: 'canvas' })}
          >
            对画布反馈
          </button>
        </div>
      </div>
      <div style={styles.canvasTargetBar}>
        <div style={styles.canvasTargetGroup}>
          {seedNodes.map((node, index) => (
            <button
              type="button"
              key={node._shapeKey || node.id || index}
              style={styles.canvasTargetButton}
              onClick={() => handleCanvasNodeFeedback(node, index)}
            >
              {node.role ? `${node.title || node.id} · ${node.role}` : (node.title || node.id)}
            </button>
          ))}
        </div>
        <div style={styles.canvasSelectionHint}>
          {selectedShapeIds.length > 0 ? `当前选中 ${selectedShapeIds.length} 个元素` : '点击画布元素后，可在上方提交选中反馈'}
        </div>
      </div>
      <div style={{ ...styles.canvas, ...(isReportCanvas ? styles.canvasReportStage : {}), ...(isFullscreen ? styles.canvasFullscreenStage : {}) }}>
        <Tldraw persistenceKey={`vd-report-${reportId}-${section.id}`} onMount={handleMount} />
      </div>
    </div>
  );
}

function ArtifactRenderer({ report, section, onAddFeedback, onCanvasSnapshot }) {
  const artifact = section.artifact || {};
  const presentation = section.presentation || artifact.type || 'document';
  if (presentation === 'table') {
    return <TableArtifact section={section} artifact={artifact} onAddFeedback={onAddFeedback} />;
  }
  if (presentation === 'canvas') {
    return (
      <CanvasArtifact
        reportId={report.id}
        section={section}
        artifact={artifact}
        onCanvasSnapshot={onCanvasSnapshot}
        onAddFeedback={onAddFeedback}
      />
    );
  }
  if (presentation === 'slides') {
    return <SlidesArtifact section={section} artifact={artifact} onAddFeedback={onAddFeedback} />;
  }
  return <DocumentArtifact section={section} artifact={artifact} onAddFeedback={onAddFeedback} />;
}

export default function ReportTemplateRenderer({ report, onAddFeedback, onCanvasSnapshot }) {
  const sections = asSections(report);
  if (sections.length === 0) {
    return <div style={styles.emptyArtifact}>这份汇报没有 section 内容。</div>;
  }
  if (isCanvasPresentationReport(report)) {
    const canvasSection = createCanvasReportSection(report, sections);
    return (
      <div style={styles.canvasReportRoot}>
        <CanvasArtifact
          reportId={report.id}
          section={canvasSection}
          artifact={canvasSection.artifact}
          onCanvasSnapshot={onCanvasSnapshot}
          onAddFeedback={onAddFeedback}
          variant="report"
        />
      </div>
    );
  }
  return (
    <div style={styles.root}>
      {report.content?.routing_reason && (
        <div style={styles.routingReason}>
          <strong>模板路由：</strong>{report.content.routing_reason}
        </div>
      )}
      {sections.map((section) => (
        <SectionShell key={section.id} section={section} onAddFeedback={onAddFeedback}>
          <ArtifactRenderer
            report={report}
            section={section}
            onAddFeedback={onAddFeedback}
            onCanvasSnapshot={onCanvasSnapshot}
          />
        </SectionShell>
      ))}
    </div>
  );
}

const styles = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--vd-space-5)',
  },
  canvasReportRoot: {
    minHeight: 'calc(100dvh - 180px)',
  },
  routingReason: {
    padding: 'var(--vd-space-3) var(--vd-space-4)',
    border: '1px solid var(--vd-info-border)',
    borderRadius: 'var(--vd-radius-md)',
    background: 'var(--vd-info-bg)',
    color: 'var(--vd-text-secondary)',
    fontSize: 'var(--vd-font-size-sm)',
    lineHeight: 'var(--vd-line-height-relaxed)',
  },
  section: {
    border: '1px solid var(--vd-border-subtle)',
    borderRadius: 'var(--vd-radius-md)',
    background: 'var(--vd-page-bg)',
    overflow: 'hidden',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 'var(--vd-space-4)',
    padding: 'var(--vd-space-4)',
    borderBottom: '1px solid var(--vd-border-subtle)',
    background: 'var(--vd-surface-bg)',
  },
  sectionEyebrow: {
    fontSize: 'var(--vd-font-size-xs)',
    color: 'var(--vd-text-tertiary)',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    marginBottom: 4,
  },
  sectionTitle: {
    margin: 0,
    fontSize: 'var(--vd-font-size-lg)',
    color: 'var(--vd-text-primary)',
  },
  narrative: {
    margin: 'var(--vd-space-2) 0 0',
    color: 'var(--vd-text-secondary)',
    fontSize: 'var(--vd-font-size-sm)',
    lineHeight: 'var(--vd-line-height-relaxed)',
  },
  feedbackButton: {
    border: '1px solid var(--vd-border-default)',
    borderRadius: 'var(--vd-radius-md)',
    background: 'var(--vd-surface-bg)',
    color: 'var(--vd-text-secondary)',
    fontSize: 'var(--vd-font-size-xs)',
    padding: 'var(--vd-space-2) var(--vd-space-3)',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  inlineFeedbackButton: {
    border: '1px solid var(--vd-border-default)',
    borderRadius: 'var(--vd-radius-sm)',
    background: 'var(--vd-surface-bg)',
    color: 'var(--vd-text-secondary)',
    fontSize: 'var(--vd-font-size-xs)',
    padding: '4px 8px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  document: {
    padding: 'var(--vd-space-5)',
    color: 'var(--vd-text-primary)',
    lineHeight: 'var(--vd-line-height-relaxed)',
    minWidth: 0,
  },
  documentGrid: (hasToc) => ({
    display: 'grid',
    gridTemplateColumns: hasToc ? 'minmax(0, 1fr) minmax(160px, 220px)' : 'minmax(0, 1fr)',
    gap: 'var(--vd-space-4)',
    alignItems: 'start',
  }),
  documentToc: {
    position: 'sticky',
    top: 'var(--vd-space-4)',
    maxHeight: 'min(520px, calc(100dvh - 120px))',
    overflow: 'auto',
    padding: 'var(--vd-space-4) var(--vd-space-4) var(--vd-space-4) 0',
    borderLeft: '1px solid var(--vd-border-subtle)',
  },
  tocTitle: {
    paddingLeft: 'var(--vd-space-4)',
    marginBottom: 'var(--vd-space-2)',
    color: 'var(--vd-text-tertiary)',
    fontSize: 'var(--vd-font-size-xs)',
    fontWeight: 'var(--vd-font-weight-semibold)',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  tocList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  tocItem: (level) => ({
    width: '100%',
    border: 'none',
    borderLeft: '2px solid transparent',
    background: 'transparent',
    color: 'var(--vd-text-secondary)',
    cursor: 'pointer',
    textAlign: 'left',
    fontFamily: 'inherit',
    fontSize: 'var(--vd-font-size-xs)',
    lineHeight: 1.4,
    padding: '6px 8px',
    paddingLeft: `${12 + Math.max(level - 1, 0) * 10}px`,
    borderRadius: '0 var(--vd-radius-sm) var(--vd-radius-sm) 0',
  }),
  docH1: {
    margin: '0 0 var(--vd-space-4)',
    color: 'var(--vd-text-primary)',
    fontSize: 'var(--vd-font-size-2xl)',
    lineHeight: 'var(--vd-line-height-tight)',
  },
  docH2: {
    margin: 'var(--vd-space-7) 0 var(--vd-space-3)',
    color: 'var(--vd-text-primary)',
    fontSize: 'var(--vd-font-size-xl)',
    lineHeight: 'var(--vd-line-height-tight)',
  },
  docH3: {
    margin: 'var(--vd-space-5) 0 var(--vd-space-2)',
    color: 'var(--vd-text-primary)',
    fontSize: 'var(--vd-font-size-lg)',
    lineHeight: 'var(--vd-line-height-tight)',
  },
  docH4: {
    margin: 'var(--vd-space-4) 0 var(--vd-space-2)',
    color: 'var(--vd-text-primary)',
    fontSize: 'var(--vd-font-size-base)',
    lineHeight: 'var(--vd-line-height-tight)',
  },
  paragraphBlock: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto',
    gap: 'var(--vd-space-3)',
    alignItems: 'start',
    marginBottom: 'var(--vd-space-4)',
  },
  paragraphText: {
    margin: 0,
    color: 'var(--vd-text-secondary)',
  },
  paragraphFeedbackButton: {
    border: '1px solid var(--vd-border-default)',
    borderRadius: 'var(--vd-radius-sm)',
    background: 'var(--vd-surface-bg)',
    color: 'var(--vd-text-tertiary)',
    fontSize: 'var(--vd-font-size-xs)',
    padding: '3px 7px',
    cursor: 'pointer',
  },
  pre: {
    overflow: 'auto',
    padding: 'var(--vd-space-4)',
    borderRadius: 'var(--vd-radius-md)',
    background: 'var(--vd-surface-bg)',
    border: '1px solid var(--vd-border-subtle)',
  },
  inlineCode: {
    padding: '2px 5px',
    borderRadius: 'var(--vd-radius-sm)',
    background: 'var(--vd-surface-hover)',
  },
  tableWrap: {
    overflow: 'auto',
  },
  tableToolbar: {
    display: 'grid',
    gridTemplateColumns: 'minmax(180px, 280px) minmax(0, 1fr) auto',
    gap: 'var(--vd-space-3)',
    alignItems: 'center',
    padding: 'var(--vd-space-3) var(--vd-space-4)',
    borderBottom: '1px solid var(--vd-border-subtle)',
    background: 'var(--vd-surface-bg)',
  },
  tableSearchLabel: {
    display: 'grid',
    gap: 4,
  },
  tableSearchTitle: {
    color: 'var(--vd-text-tertiary)',
    fontSize: 'var(--vd-font-size-xs)',
    fontWeight: 'var(--vd-font-weight-medium)',
  },
  tableSearch: {
    width: '100%',
    minWidth: 0,
    border: '1px solid var(--vd-border-default)',
    borderRadius: 'var(--vd-radius-sm)',
    background: 'var(--vd-page-bg)',
    color: 'var(--vd-text-primary)',
    font: 'inherit',
    fontSize: 'var(--vd-font-size-sm)',
    padding: '7px 9px',
    outline: 'none',
  },
  tableViews: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--vd-space-2)',
    flexWrap: 'wrap',
    minWidth: 0,
  },
  tableViewButton: (active) => ({
    border: `1px solid ${active ? 'var(--vd-primary-border)' : 'var(--vd-border-default)'}`,
    borderRadius: 'var(--vd-radius-xl)',
    background: active ? 'var(--vd-primary-bg)' : 'var(--vd-page-bg)',
    color: active ? 'var(--vd-primary)' : 'var(--vd-text-secondary)',
    fontSize: 'var(--vd-font-size-xs)',
    fontWeight: active ? 'var(--vd-font-weight-semibold)' : 'var(--vd-font-weight-medium)',
    padding: '5px 10px',
    cursor: 'pointer',
  }),
  tableMeta: {
    color: 'var(--vd-text-tertiary)',
    fontSize: 'var(--vd-font-size-xs)',
    whiteSpace: 'nowrap',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    background: 'var(--vd-page-bg)',
  },
  th: {
    textAlign: 'left',
    padding: 'var(--vd-space-3)',
    borderBottom: '1px solid var(--vd-border-default)',
    color: 'var(--vd-text-secondary)',
    fontSize: 'var(--vd-font-size-xs)',
    fontWeight: 'var(--vd-font-weight-semibold)',
  },
  td: {
    padding: 'var(--vd-space-3)',
    borderBottom: '1px solid var(--vd-border-subtle)',
    color: 'var(--vd-text-primary)',
    fontSize: 'var(--vd-font-size-sm)',
  },
  thContent: {
    display: 'grid',
    gap: 5,
    alignItems: 'start',
  },
  tableHeaderButton: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    width: '100%',
    border: 'none',
    background: 'transparent',
    color: 'var(--vd-text-secondary)',
    font: 'inherit',
    fontSize: 'var(--vd-font-size-xs)',
    fontWeight: 'var(--vd-font-weight-semibold)',
    padding: 0,
    cursor: 'pointer',
    textAlign: 'left',
  },
  sortIndicator: {
    color: 'var(--vd-text-tertiary)',
    fontSize: 'var(--vd-font-size-xs)',
  },
  tableHeaderFeedback: {
    justifySelf: 'start',
    border: 'none',
    background: 'transparent',
    color: 'var(--vd-primary)',
    fontSize: 'var(--vd-font-size-xs)',
    padding: 0,
    cursor: 'pointer',
  },
  slidesShell: {
    display: 'grid',
    gridTemplateColumns: 'minmax(160px, 220px) minmax(0, 1fr)',
    minHeight: 420,
    background: 'var(--vd-page-bg)',
  },
  slideNav: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    padding: 'var(--vd-space-4)',
    borderRight: '1px solid var(--vd-border-subtle)',
    background: 'var(--vd-surface-bg)',
  },
  slideNavButton: (active) => ({
    display: 'grid',
    gridTemplateColumns: '32px minmax(0, 1fr)',
    gap: 'var(--vd-space-2)',
    alignItems: 'start',
    width: '100%',
    border: 'none',
    borderLeft: `2px solid ${active ? 'var(--vd-primary)' : 'transparent'}`,
    borderRadius: '0 var(--vd-radius-sm) var(--vd-radius-sm) 0',
    background: active ? 'var(--vd-primary-bg)' : 'transparent',
    color: active ? 'var(--vd-primary)' : 'var(--vd-text-secondary)',
    cursor: 'pointer',
    textAlign: 'left',
    padding: '9px 10px',
  }),
  slideNavIndex: {
    color: 'var(--vd-text-tertiary)',
    fontSize: 'var(--vd-font-size-xs)',
    fontVariantNumeric: 'tabular-nums',
  },
  slideNavTitle: {
    minWidth: 0,
    color: 'inherit',
    fontSize: 'var(--vd-font-size-xs)',
    lineHeight: 1.35,
  },
  slideMain: {
    padding: 'var(--vd-space-4)',
    minWidth: 0,
  },
  slideTopline: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 'var(--vd-space-3)',
    marginBottom: 'var(--vd-space-3)',
  },
  slideIndex: {
    color: 'var(--vd-text-tertiary)',
    fontSize: 'var(--vd-font-size-xs)',
    fontVariantNumeric: 'tabular-nums',
  },
  decisionBadge: {
    border: '1px solid var(--vd-warning-border)',
    borderRadius: 'var(--vd-radius-xl)',
    background: 'var(--vd-warning-bg)',
    color: 'var(--vd-warning)',
    fontSize: 'var(--vd-font-size-xs)',
    padding: '3px 8px',
  },
  slideTitle: {
    margin: 0,
    color: 'var(--vd-text-primary)',
    fontSize: 'var(--vd-font-size-xl)',
    lineHeight: 'var(--vd-line-height-tight)',
  },
  slideMarkdown: {
    color: 'var(--vd-text-secondary)',
    fontSize: 'var(--vd-font-size-sm)',
    lineHeight: 'var(--vd-line-height-relaxed)',
    marginTop: 'var(--vd-space-3)',
  },
  slidePoints: {
    margin: 'var(--vd-space-4) 0',
    paddingLeft: 'var(--vd-space-5)',
    color: 'var(--vd-text-secondary)',
    fontSize: 'var(--vd-font-size-sm)',
    lineHeight: 'var(--vd-line-height-relaxed)',
  },
  slideDecision: {
    display: 'grid',
    gap: 'var(--vd-space-2)',
    margin: 'var(--vd-space-4) 0',
    padding: 'var(--vd-space-3)',
    borderRadius: 'var(--vd-radius-md)',
    border: '1px solid var(--vd-primary-border)',
    background: 'var(--vd-primary-bg)',
  },
  slideDecisionTitle: {
    color: 'var(--vd-primary)',
    fontSize: 'var(--vd-font-size-xs)',
    fontWeight: 'var(--vd-font-weight-semibold)',
  },
  slideDecisionText: {
    color: 'var(--vd-text-primary)',
    fontSize: 'var(--vd-font-size-sm)',
    lineHeight: 'var(--vd-line-height-relaxed)',
  },
  slideNotes: {
    margin: 'var(--vd-space-3) 0',
    padding: 'var(--vd-space-2) var(--vd-space-3)',
    borderRadius: 'var(--vd-radius-sm)',
    background: 'var(--vd-page-bg)',
    color: 'var(--vd-text-tertiary)',
    fontSize: 'var(--vd-font-size-xs)',
  },
  slideActions: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 'var(--vd-space-3)',
    marginTop: 'var(--vd-space-5)',
    paddingTop: 'var(--vd-space-4)',
    borderTop: '1px solid var(--vd-border-subtle)',
  },
  slideStepButtons: {
    display: 'flex',
    gap: 'var(--vd-space-2)',
  },
  canvasShell: {
    background: 'var(--vd-page-bg)',
  },
  canvasReportShell: {
    border: '1px solid var(--vd-border-default)',
    borderRadius: 'var(--vd-radius-lg)',
    background: 'var(--vd-surface-bg)',
    overflow: 'hidden',
    boxShadow: 'var(--vd-shadow-sm)',
  },
  canvasFullscreenShell: {
    position: 'fixed',
    inset: 0,
    zIndex: 40,
    borderRadius: 0,
    border: 'none',
    background: 'var(--vd-surface-bg)',
    boxShadow: 'none',
  },
  canvasToolbar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 'var(--vd-space-4)',
    padding: 'var(--vd-space-3) var(--vd-space-4)',
    borderBottom: '1px solid var(--vd-border-subtle)',
    background: 'var(--vd-surface-bg)',
  },
  canvasToolbarActions: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 'var(--vd-space-2)',
    flexWrap: 'wrap',
  },
  canvasTargetBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 'var(--vd-space-3)',
    flexWrap: 'wrap',
    padding: 'var(--vd-space-3) var(--vd-space-4)',
    borderBottom: '1px solid var(--vd-border-subtle)',
    background: 'var(--vd-surface-bg)',
  },
  canvasTargetGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--vd-space-2)',
    flexWrap: 'wrap',
    minWidth: 0,
  },
  canvasTargetButton: {
    border: '1px solid var(--vd-border-default)',
    borderRadius: 'var(--vd-radius-xl)',
    background: 'var(--vd-page-bg)',
    color: 'var(--vd-text-secondary)',
    fontSize: 'var(--vd-font-size-xs)',
    padding: '4px 9px',
    cursor: 'pointer',
  },
  selectionFeedbackButton: {
    border: '1px solid var(--vd-primary-border)',
    borderRadius: 'var(--vd-radius-md)',
    background: 'var(--vd-primary-bg)',
    color: 'var(--vd-primary)',
    fontSize: 'var(--vd-font-size-xs)',
    fontWeight: 'var(--vd-font-weight-medium)',
    padding: '6px 10px',
    cursor: 'pointer',
  },
  selectionFeedbackButtonDisabled: {
    borderColor: 'var(--vd-border-default)',
    background: 'var(--vd-surface-hover)',
    color: 'var(--vd-text-tertiary)',
    cursor: 'not-allowed',
  },
  canvasSelectionHint: {
    color: 'var(--vd-text-tertiary)',
    fontSize: 'var(--vd-font-size-xs)',
    whiteSpace: 'nowrap',
  },
  canvasTitle: {
    color: 'var(--vd-text-primary)',
    fontSize: 'var(--vd-font-size-sm)',
    fontWeight: 'var(--vd-font-weight-semibold)',
  },
  canvasHint: {
    color: 'var(--vd-text-tertiary)',
    fontSize: 'var(--vd-font-size-xs)',
    marginTop: 2,
  },
  canvas: {
    height: 560,
    minHeight: 420,
    background: 'var(--vd-page-bg)',
  },
  canvasReportStage: {
    height: 'calc(100dvh - 266px)',
    minHeight: 560,
  },
  canvasFullscreenStage: {
    height: 'calc(100dvh - 98px)',
    minHeight: 0,
  },
  emptyArtifact: {
    padding: 'var(--vd-space-6)',
    color: 'var(--vd-text-tertiary)',
    fontSize: 'var(--vd-font-size-sm)',
  },
};
