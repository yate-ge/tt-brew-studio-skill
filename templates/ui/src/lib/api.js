const BASE = '';

async function ensureOk(res, message) {
  if (res.ok) return res;
  let detail = '';
  try {
    const body = await res.json();
    detail = body?.error?.message || '';
  } catch { /* ignore */ }
  throw new Error(detail ? `${message}: ${detail}` : message);
}

export async function fetchDesignTokens() {
  const res = await fetch(`${BASE}/api/design-tokens`);
  await ensureOk(res, 'Failed to fetch design tokens');
  return res.json();
}

export async function fetchProjectCanvasWorkspace() {
  const res = await fetch(`${BASE}/api/canvas-workspaces/project-document`);
  await ensureOk(res, 'Failed to fetch project canvas workspace');
  return res.json();
}

export async function createCanvasWorkspace(workspaceData) {
  const res = await fetch(`${BASE}/api/canvas-workspaces`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(workspaceData),
  });
  await ensureOk(res, 'Failed to create canvas workspace');
  return res.json();
}

export async function updateCanvasWorkspaceSnapshot(
  workspaceId,
  { snapshot, semantic_index: semanticIndex, event, base_rev: baseRev },
) {
  const res = await fetch(`${BASE}/api/canvas-workspaces/${workspaceId}/snapshot`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      snapshot,
      semantic_index: semanticIndex,
      event,
      base_rev: baseRev,
    }),
  });
  await ensureOk(res, 'Failed to update canvas workspace snapshot');
  return res.json();
}

export async function addCanvasWorkspaceFeedback(workspaceId, feedback) {
  const res = await fetch(`${BASE}/api/canvas-workspaces/${workspaceId}/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(feedback),
  });
  await ensureOk(res, 'Failed to add canvas workspace feedback');
  return res.json();
}

export async function replyCanvasWorkspaceFeedback(workspaceId, feedbackId, payload) {
  const res = await fetch(`${BASE}/api/canvas-workspaces/${workspaceId}/feedback/${feedbackId}/reply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  await ensureOk(res, 'Failed to reply canvas workspace feedback');
  return res.json();
}

export async function fetchScaffolds(params = {}) {
  const query = new URLSearchParams(params).toString();
  const url = query ? `${BASE}/api/scaffolds?${query}` : `${BASE}/api/scaffolds`;
  const res = await fetch(url);
  await ensureOk(res, 'Failed to fetch scaffolds');
  return res.json();
}

export async function fetchCanvasWidgetTemplates() {
  const res = await fetch(`${BASE}/api/canvas-widget-templates`);
  await ensureOk(res, 'Failed to fetch canvas widget templates');
  return res.json();
}
