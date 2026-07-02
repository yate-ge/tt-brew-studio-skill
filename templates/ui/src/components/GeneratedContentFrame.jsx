import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getBridgeScript } from '../lib/bridge';
import { getLang } from '../lib/i18n';
import { tokensToCSS } from '../lib/theme';

function injectIntoHTML(html, tokens, lang) {
  const bridgeScript = getBridgeScript(lang);
  const tokenStyle = tokens
    ? `<style id="vd-design-tokens">${tokensToCSS(tokens)}</style>`
    : '';

  // Inject into <head> if present, otherwise prepend to html
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(
      /(<head[^>]*>)/i,
      `$1\n${tokenStyle}\n`
    ) + `\n${bridgeScript}`;
  }

  if (/<html[^>]*>/i.test(html)) {
    return html.replace(
      /(<html[^>]*>)/i,
      `$1<head>${tokenStyle}</head>`
    ) + `\n${bridgeScript}`;
  }

  // Bare HTML fragment — wrap it
  return `<!DOCTYPE html><html><head>${tokenStyle}</head><body>${html}${bridgeScript}</body></html>`;
}

// Guard against </script> breakout when embedding JSON into the boot script.
function jsValue(value) {
  return JSON.stringify(value ?? null).replace(/<\//g, '<\\/');
}

/**
 * Widget assembly (references/canvas-widgets.md): the agent supplies only a
 * fragment; the runtime owns transparency, the widget root, the vd bootstrap,
 * and the bridge. Boot script and bridge come BEFORE the fragment so widget
 * scripts can use `window.vd` synchronously.
 */
function injectWidgetHTML(html, tokens, lang, boot) {
  const bridgeScript = getBridgeScript(lang);
  const tokenStyle = tokens
    ? `<style id="vd-design-tokens">${tokensToCSS(tokens)}</style>`
    : '';
  const resetStyle = '<style id="vd-widget-reset">'
    + 'html,body{background:transparent!important;margin:0;padding:0}'
    + '#vd-widget-root{display:inline-block;width:fit-content}'
    + '</style>';
  const bootScript = `<script>window.__VD_WIDGET__ = ${jsValue(boot)};</script>`;
  return `<!DOCTYPE html><html><head>${tokenStyle}${resetStyle}</head><body>${bootScript}${bridgeScript}<div id="vd-widget-root">${html}</div></body></html>`;
}

export default function GeneratedContentFrame({
  html,
  tokens,
  onAnnotation,
  onInteractive,
  onReplaceDraft,
  drafts,
  title = 'Delivery content',
  defaultHeight = 420,
  minHeight,
  fitContainer = false,
  transparent = false,
  // Widget mode (canvas widgets): instance metadata + sizing/scaling inputs.
  widget = null,
  intrinsicSize = null,
  scale = 1,
  onWidgetStatePatch,
  onWidgetEvent,
  onWidgetSize,
  onWidgetReady,
  onWidgetError,
  onWidgetDrag,
}) {
  const iframeRef = useRef(null);
  const [height, setHeight] = useState(0);
  const prevDraftsRef = useRef([]);
  // Last state JSON the iframe itself reported — used to suppress echo pushes.
  const lastIframeStateRef = useRef(null);

  // Handle postMessage from iframe
  const handleMessage = useCallback((e) => {
    if (!e.data || typeof e.data.type !== 'string') return;

    // Verify message is from our iframe
    const iframe = iframeRef.current;
    if (!iframe || e.source !== iframe.contentWindow) return;

    switch (e.data.type) {
      case 'vd:annotation':
        if (onAnnotation && e.data.payload) {
          onAnnotation(e.data.payload);
        }
        break;

      case 'vd:interactive':
        if (onInteractive && e.data.payload) {
          onInteractive(e.data.payload);
        }
        break;

      case 'vd:interactive-replace':
        // Mutual exclusion: remove old draft for same item-id, different action
        if (onReplaceDraft && e.data.oldAction && e.data.itemId) {
          onReplaceDraft(e.data.oldAction, e.data.itemId);
        }
        break;

      case 'vd:resize':
        if (!widget && typeof e.data.height === 'number' && e.data.height > 0) {
          setHeight(e.data.height);
        }
        break;

      case 'vd:widget:state-patch':
        if (widget) {
          lastIframeStateRef.current = JSON.stringify(e.data.state || {});
          onWidgetStatePatch?.(e.data);
        }
        break;

      case 'vd:widget:size':
        if (widget && Number.isFinite(e.data.w) && Number.isFinite(e.data.h)) {
          onWidgetSize?.({ w: e.data.w, h: e.data.h });
        }
        break;

      case 'vd:widget:event':
        if (widget) onWidgetEvent?.(e.data);
        break;

      case 'vd:widget:ready':
        if (widget) onWidgetReady?.();
        break;

      case 'vd:widget:error':
        if (widget) onWidgetError?.(e.data);
        break;

      case 'vd:widget:drag':
        if (widget) onWidgetDrag?.(e.data);
        break;
    }
  }, [onAnnotation, onInteractive, onReplaceDraft, widget, onWidgetStatePatch, onWidgetEvent, onWidgetSize, onWidgetReady, onWidgetError, onWidgetDrag]);

  useEffect(() => {
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [handleMessage]);

  // Push token updates into iframe when tokens change
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !iframe.contentWindow || !tokens) return;
    iframe.contentWindow.postMessage({
      type: 'vd:tokens-update',
      css: tokensToCSS(tokens),
    }, '*');
  }, [tokens]);

  // Detect draft removals and send reset messages to iframe
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !iframe.contentWindow) return;

    const prevDrafts = prevDraftsRef.current;
    const currentIds = new Set((drafts || []).map((d) => d.id));

    // Find drafts that were in prev but not in current (removed)
    for (const prev of prevDrafts) {
      if (!currentIds.has(prev.id) && prev.kind === 'interactive' && prev.payload?.action) {
        iframe.contentWindow.postMessage({
          type: 'vd:feedback-reset',
          action: prev.payload.action,
          itemId: prev.payload['item-id'] || '',
        }, '*');
      }
    }

    prevDraftsRef.current = drafts || [];
  }, [drafts]);

  // Widget srcdoc is memoized on html only: state changes flow through
  // postMessage, so live state never reloads the iframe. The boot snapshot
  // captures whatever state the widget has when its html (re)mounts.
  const isWidget = Boolean(widget);
  const widgetSrcdoc = useMemo(() => {
    if (!isWidget) return null;
    return injectWidgetHTML(html, tokens, getLang(), {
      instance: {
        component_id: widget.componentId || null,
        shape_id: widget.shapeId || null,
        workspace_id: widget.workspaceId || null,
        title: widget.title || '',
      },
      state: widget.state || {},
      output_schema: widget.outputSchema || {},
      sizing: widget.sizing || {},
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isWidget, html]);

  // Push external (agent) state updates into the live iframe. Skips echoes of
  // the widget's own patches and anything the iframe already reported.
  const widgetStateJson = isWidget ? JSON.stringify(widget.state || {}) : null;
  useEffect(() => {
    if (!isWidget) return;
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;
    if (widgetStateJson === lastIframeStateRef.current) return;
    if (widget.stateActor && widget.stateActor !== 'agent') return;
    iframe.contentWindow.postMessage({
      type: 'vd:widget:state',
      state: widget.state || {},
      actor: widget.stateActor || 'agent',
    }, '*');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isWidget, widgetStateJson]);

  if (!html) {
    return <div style={styles.empty}>No generated content.</div>;
  }

  if (isWidget) {
    const w = Math.max(40, Math.round(intrinsicSize?.w || 320));
    const h = Math.max(24, Math.round(intrinsicSize?.h || 200));
    return (
      <iframe
        ref={iframeRef}
        srcDoc={widgetSrcdoc}
        // No allow-same-origin: widgets run on an opaque origin; the
        // postMessage bridge is the only channel to the host.
        sandbox="allow-scripts allow-popups"
        style={{
          width: w,
          height: h,
          transform: `scale(${Number.isFinite(scale) && scale > 0 ? scale : 1})`,
          transformOrigin: 'top left',
          border: 'none',
          background: 'transparent',
          display: 'block',
          overflow: 'hidden',
        }}
        title={title}
      />
    );
  }

  const srcdoc = injectIntoHTML(html, tokens, getLang());

  return (
    <iframe
      ref={iframeRef}
      srcDoc={srcdoc}
      sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      style={{
        ...styles.iframe,
        background: transparent ? 'transparent' : styles.iframe.background,
        height: fitContainer ? '100%' : (height > 0 ? `${height}px` : `${defaultHeight}px`),
        minHeight: fitContainer ? undefined : (minHeight || undefined),
      }}
      title={title}
    />
  );
}

const styles = {
  iframe: {
    width: '100%',
    border: 'none',
    background: '#fff',
    display: 'block',
    overflow: 'hidden',
  },
  empty: {
    border: '1px dashed var(--vds-colors-border)',
    borderRadius: '12px',
    padding: '24px',
    textAlign: 'center',
    color: 'var(--vds-colors-text-secondary)',
    fontSize: '15px',
  },
};
