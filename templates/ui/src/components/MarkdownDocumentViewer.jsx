import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';

function childrenToText(children) {
  return React.Children.toArray(children).map((child) => {
    if (typeof child === 'string' || typeof child === 'number') return String(child);
    if (child?.props?.children) return childrenToText(child.props.children);
    return '';
  }).join('');
}

function cleanHeadingText(value) {
  return value
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

function uniqueSlug(base, counts) {
  const count = counts.get(base) || 0;
  counts.set(base, count + 1);
  return count === 0 ? base : `${base}-${count + 1}`;
}

function extractHeadings(markdown) {
  const headings = [];
  const counts = new Map();
  const pattern = /^(#{1,4})\s+(.+?)\s*#*\s*$/gm;
  let match = pattern.exec(markdown || '');

  while (match) {
    const level = match[1].length;
    const text = cleanHeadingText(match[2]);
    if (text) {
      headings.push({
        id: uniqueSlug(slugify(text), counts),
        level,
        text,
      });
    }
    match = pattern.exec(markdown || '');
  }

  return headings;
}

function headingIdFromChildren(children) {
  return slugify(childrenToText(children));
}

function headingComponent(level) {
  const Tag = `h${level}`;
  return function Heading({ children }) {
    const id = headingIdFromChildren(children);
    return (
      <Tag id={id} data-heading-id={id} style={styles[`h${level}`]}>
        {children}
      </Tag>
    );
  };
}

function formatSize(bytes) {
  if (!Number.isFinite(bytes)) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

function isMarkdownPath(path = '') {
  return /\.mdx?$/i.test(path);
}

export default function MarkdownDocumentViewer({ document, content, kindLabel }) {
  const bodyRef = useRef(null);
  const [activeHeading, setActiveHeading] = useState('');
  const markdown = typeof content === 'string' ? content : '';
  const headings = useMemo(() => extractHeadings(markdown), [markdown]);
  const isMarkdown = isMarkdownPath(document?.path || '');

  useEffect(() => {
    if (headings.length > 0) setActiveHeading(headings[0].id);
  }, [headings]);

  const handleScroll = () => {
    const container = bodyRef.current;
    if (!container || headings.length === 0) return;

    let current = headings[0].id;
    for (const heading of headings) {
      const node = container.querySelector(`[data-heading-id="${heading.id}"]`);
      if (node && node.offsetTop - container.scrollTop <= 72) {
        current = heading.id;
      }
    }
    setActiveHeading(current);
  };

  const scrollToHeading = (headingId) => {
    const container = bodyRef.current;
    const node = container?.querySelector(`[data-heading-id="${headingId}"]`);
    if (!container || !node) return;
    container.scrollTo({
      top: Math.max(node.offsetTop - 16, 0),
      behavior: 'smooth',
    });
    setActiveHeading(headingId);
  };

  return (
    <div style={styles.shell}>
      <header style={styles.header}>
        <div style={styles.titleBlock}>
          <h2 style={styles.title}>{document?.title || '未命名文档'}</h2>
          <div style={styles.path}>{document?.path}</div>
        </div>
        <div style={styles.meta}>
          <span>{kindLabel?.(document?.kind) || document?.kind || '文档'}</span>
          <span>{formatSize(document?.size)}</span>
          <span>{document?.writable ? '可写' : '只读'}</span>
          {document?.updated_at && <span>更新 {formatDate(document.updated_at)}</span>}
        </div>
      </header>

      <div style={styles.readerGrid}>
        <article ref={bodyRef} style={styles.body} onScroll={handleScroll}>
          {isMarkdown ? (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeHighlight]}
              components={{
                h1: headingComponent(1),
                h2: headingComponent(2),
                h3: headingComponent(3),
                h4: headingComponent(4),
                p: ({ children }) => <p style={styles.p}>{children}</p>,
                ul: ({ children }) => <ul style={styles.ul}>{children}</ul>,
                ol: ({ children }) => <ol style={styles.ol}>{children}</ol>,
                li: ({ children }) => <li style={styles.li}>{children}</li>,
                pre: ({ children }) => <pre style={styles.pre}>{children}</pre>,
                code: ({ inline, className, children, ...props }) => {
                  if (inline) {
                    return <code style={styles.inlineCode} {...props}>{children}</code>;
                  }
                  return <code className={className} {...props}>{children}</code>;
                },
                table: ({ children }) => (
                  <div style={styles.tableWrap}>
                    <table style={styles.table}>{children}</table>
                  </div>
                ),
                th: ({ children }) => <th style={styles.th}>{children}</th>,
                td: ({ children }) => <td style={styles.td}>{children}</td>,
                blockquote: ({ children }) => <blockquote style={styles.blockquote}>{children}</blockquote>,
                a: ({ href, children }) => {
                  const external = href && !href.startsWith('#');
                  return (
                    <a
                      href={href}
                      target={external ? '_blank' : undefined}
                      rel={external ? 'noopener noreferrer' : undefined}
                      style={styles.link}
                    >
                      {children}
                    </a>
                  );
                },
              }}
            >
              {markdown}
            </ReactMarkdown>
          ) : (
            <pre style={styles.plainText}>{markdown}</pre>
          )}
        </article>

        {isMarkdown && headings.length > 0 && (
          <aside style={styles.toc}>
            <div style={styles.tocTitle}>目录</div>
            <div style={styles.tocList}>
              {headings.map((heading) => (
                <button
                  type="button"
                  key={heading.id}
                  style={styles.tocItem(heading.level, activeHeading === heading.id)}
                  onClick={() => scrollToHeading(heading.id)}
                >
                  {heading.text}
                </button>
              ))}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

const styles = {
  shell: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
  },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 'var(--vd-space-4)',
    paddingBottom: 'var(--vd-space-4)',
    borderBottom: '1px solid var(--vd-border-subtle)',
    flexWrap: 'wrap',
  },
  titleBlock: {
    minWidth: 0,
  },
  title: {
    fontSize: 'var(--vd-font-size-xl)',
    lineHeight: 'var(--vd-line-height-tight)',
    color: 'var(--vd-text-primary)',
    fontWeight: 'var(--vd-font-weight-bold)',
  },
  path: {
    marginTop: 'var(--vd-space-1)',
    color: 'var(--vd-text-tertiary)',
    fontSize: 'var(--vd-font-size-xs)',
    wordBreak: 'break-all',
  },
  meta: {
    display: 'flex',
    gap: 'var(--vd-space-2)',
    flexWrap: 'wrap',
    color: 'var(--vd-text-secondary)',
    fontSize: 'var(--vd-font-size-xs)',
  },
  readerGrid: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) minmax(160px, 220px)',
    gap: 'var(--vd-space-6)',
    minHeight: 0,
    flex: 1,
  },
  body: {
    minHeight: 0,
    overflow: 'auto',
    padding: 'var(--vd-space-6) var(--vd-space-2) var(--vd-space-8) 0',
  },
  toc: {
    borderLeft: '1px solid var(--vd-border-subtle)',
    padding: 'var(--vd-space-6) 0 var(--vd-space-4) var(--vd-space-4)',
    minHeight: 0,
    overflow: 'auto',
  },
  tocTitle: {
    color: 'var(--vd-text-tertiary)',
    fontSize: 'var(--vd-font-size-xs)',
    fontWeight: 'var(--vd-font-weight-semibold)',
    textTransform: 'uppercase',
    marginBottom: 'var(--vd-space-3)',
  },
  tocList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  tocItem: (level, active) => ({
    width: '100%',
    border: 'none',
    borderLeft: `2px solid ${active ? 'var(--vd-primary)' : 'transparent'}`,
    background: active ? 'var(--vd-primary-bg)' : 'transparent',
    color: active ? 'var(--vd-primary)' : 'var(--vd-text-secondary)',
    cursor: 'pointer',
    textAlign: 'left',
    fontFamily: 'inherit',
    fontSize: 'var(--vd-font-size-xs)',
    lineHeight: 1.4,
    padding: '6px 8px',
    paddingLeft: `${8 + Math.max(level - 1, 0) * 10}px`,
    borderRadius: '0 var(--vd-radius-sm) var(--vd-radius-sm) 0',
  }),
  h1: {
    fontSize: 'var(--vd-font-size-2xl)',
    lineHeight: 'var(--vd-line-height-tight)',
    margin: '0 0 var(--vd-space-4)',
    color: 'var(--vd-text-primary)',
  },
  h2: {
    fontSize: 'var(--vd-font-size-xl)',
    lineHeight: 'var(--vd-line-height-tight)',
    margin: 'var(--vd-space-8) 0 var(--vd-space-3)',
    color: 'var(--vd-text-primary)',
  },
  h3: {
    fontSize: 'var(--vd-font-size-lg)',
    lineHeight: 'var(--vd-line-height-tight)',
    margin: 'var(--vd-space-6) 0 var(--vd-space-2)',
    color: 'var(--vd-text-primary)',
  },
  h4: {
    fontSize: 'var(--vd-font-size-base)',
    lineHeight: 'var(--vd-line-height-tight)',
    margin: 'var(--vd-space-4) 0 var(--vd-space-2)',
    color: 'var(--vd-text-primary)',
  },
  p: {
    margin: '0 0 var(--vd-space-4)',
    color: 'var(--vd-text-secondary)',
    lineHeight: 'var(--vd-line-height-relaxed)',
  },
  ul: {
    margin: '0 0 var(--vd-space-4)',
    paddingLeft: 'var(--vd-space-6)',
    color: 'var(--vd-text-secondary)',
  },
  ol: {
    margin: '0 0 var(--vd-space-4)',
    paddingLeft: 'var(--vd-space-6)',
    color: 'var(--vd-text-secondary)',
  },
  li: {
    marginBottom: 'var(--vd-space-1)',
  },
  pre: {
    background: 'var(--vd-page-bg)',
    border: '1px solid var(--vd-border-subtle)',
    borderRadius: 'var(--vd-radius-md)',
    padding: 'var(--vd-space-4)',
    overflow: 'auto',
    fontSize: 'var(--vd-font-size-sm)',
    margin: '0 0 var(--vd-space-4)',
  },
  inlineCode: {
    background: 'var(--vd-surface-hover)',
    borderRadius: 'var(--vd-radius-sm)',
    padding: '2px 5px',
    fontFamily: 'var(--vd-font-mono)',
    fontSize: '0.9em',
  },
  plainText: {
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    fontFamily: 'var(--vd-font-mono)',
    color: 'var(--vd-text-primary)',
    lineHeight: 1.65,
  },
  tableWrap: {
    overflow: 'auto',
    margin: '0 0 var(--vd-space-4)',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 'var(--vd-font-size-sm)',
  },
  th: {
    textAlign: 'left',
    padding: 'var(--vd-space-2) var(--vd-space-3)',
    borderBottom: '1px solid var(--vd-border-default)',
    color: 'var(--vd-text-primary)',
    background: 'var(--vd-page-bg)',
  },
  td: {
    padding: 'var(--vd-space-2) var(--vd-space-3)',
    borderBottom: '1px solid var(--vd-border-subtle)',
    color: 'var(--vd-text-secondary)',
  },
  blockquote: {
    margin: '0 0 var(--vd-space-4)',
    padding: 'var(--vd-space-3) var(--vd-space-4)',
    borderLeft: '3px solid var(--vd-primary)',
    background: 'var(--vd-primary-bg)',
    color: 'var(--vd-text-secondary)',
    borderRadius: '0 var(--vd-radius-md) var(--vd-radius-md) 0',
  },
  link: {
    color: 'var(--vd-primary)',
  },
};
