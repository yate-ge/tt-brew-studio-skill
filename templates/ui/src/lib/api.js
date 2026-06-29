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

// ── V2 Delivery APIs (backward compat) ──

export async function fetchDeliveries(params = {}) {
  const query = new URLSearchParams(params).toString();
  const url = query ? `${BASE}/api/deliveries?${query}` : `${BASE}/api/deliveries`;
  const res = await fetch(url);
  await ensureOk(res, 'Failed to fetch deliveries');
  return res.json();
}

export async function fetchDelivery(id) {
  const res = await fetch(`${BASE}/api/deliveries/${id}`);
  await ensureOk(res, `Failed to fetch delivery ${id}`);
  return res.json();
}

export async function saveFeedbackDraft(deliveryId, items) {
  const res = await fetch(`${BASE}/api/deliveries/${deliveryId}/feedback/draft`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  });
  await ensureOk(res, 'Failed to save feedback draft');
  return res.json();
}

export async function commitFeedback(deliveryId, items) {
  const res = await fetch(`${BASE}/api/deliveries/${deliveryId}/feedback/commit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  });
  await ensureOk(res, 'Failed to commit feedback');
  return res.json();
}

export async function resolveFeedback(deliveryId, feedbackIds, handledBy = 'agent') {
  const res = await fetch(`${BASE}/api/deliveries/${deliveryId}/feedback/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ feedback_ids: feedbackIds, handled_by: handledBy }),
  });
  await ensureOk(res, 'Failed to resolve feedback');
  return res.json();
}

export async function addAnnotation(deliveryId, annotation) {
  const res = await fetch(`${BASE}/api/deliveries/${deliveryId}/annotate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(annotation),
  });
  await ensureOk(res, 'Failed to add annotation');
  return res.json();
}

export async function fetchActiveAlignment(agentSessionId) {
  const res = await fetch(`${BASE}/api/alignment/active?agent_session_id=${encodeURIComponent(agentSessionId)}`);
  await ensureOk(res, 'Failed to fetch active alignment');
  return res.json();
}

export async function fetchSettings() {
  const res = await fetch(`${BASE}/api/settings`);
  await ensureOk(res, 'Failed to fetch settings');
  return res.json();
}

export async function updateSettings(settings) {
  const res = await fetch(`${BASE}/api/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
  await ensureOk(res, 'Failed to update settings');
  return res.json();
}

export async function fetchDesignTokens() {
  const res = await fetch(`${BASE}/api/design-tokens`);
  await ensureOk(res, 'Failed to fetch design tokens');
  return res.json();
}

// ── V3 Project APIs ──

export async function fetchProjectConfig() {
  const res = await fetch(`${BASE}/api/project`);
  await ensureOk(res, 'Failed to fetch project config');
  return res.json();
}

export async function updateProjectConfig(config) {
  const res = await fetch(`${BASE}/api/project`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  await ensureOk(res, 'Failed to update project config');
  return res.json();
}

// ── V3 Feedback Pool APIs ──

export async function fetchFeedbackPool(params = {}) {
  const query = new URLSearchParams(params).toString();
  const url = query ? `${BASE}/api/feedback?${query}` : `${BASE}/api/feedback`;
  const res = await fetch(url);
  await ensureOk(res, 'Failed to fetch feedback pool');
  return res.json();
}

export async function addFeedback({ content, source, author }) {
  const res = await fetch(`${BASE}/api/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, source, author }),
  });
  await ensureOk(res, 'Failed to add feedback');
  return res.json();
}

export async function resolveProjectFeedback(feedbackId, changeRecord) {
  const res = await fetch(`${BASE}/api/feedback/${feedbackId}/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ changeRecord }),
  });
  await ensureOk(res, 'Failed to resolve feedback');
  return res.json();
}

export async function confirmFeedback(feedbackId) {
  const res = await fetch(`${BASE}/api/feedback/${feedbackId}/confirm`, {
    method: 'POST',
  });
  await ensureOk(res, 'Failed to confirm feedback');
  return res.json();
}

// ── V3 Logs APIs ──

export async function fetchLogs(params = {}) {
  const query = new URLSearchParams(params).toString();
  const url = query ? `${BASE}/api/logs?${query}` : `${BASE}/api/logs`;
  const res = await fetch(url);
  await ensureOk(res, 'Failed to fetch logs');
  return res.json();
}

export async function createLog(logData) {
  const res = await fetch(`${BASE}/api/logs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(logData),
  });
  await ensureOk(res, 'Failed to create log');
  return res.json();
}

// ── V3 Reports APIs ──

export async function fetchReports(params = {}) {
  const query = new URLSearchParams(params).toString();
  const url = query ? `${BASE}/api/reports?${query}` : `${BASE}/api/reports`;
  const res = await fetch(url);
  await ensureOk(res, 'Failed to fetch reports');
  return res.json();
}

export async function fetchReport(id) {
  const res = await fetch(`${BASE}/api/reports/${id}`);
  await ensureOk(res, `Failed to fetch report ${id}`);
  return res.json();
}

export async function createReport(reportData) {
  const res = await fetch(`${BASE}/api/reports`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(reportData),
  });
  await ensureOk(res, 'Failed to create report');
  return res.json();
}

// ── V3 Report Feedback APIs ──

export async function fetchReportFeedback(reportId) {
  const res = await fetch(`${BASE}/api/reports/${reportId}/feedback`);
  await ensureOk(res, `Failed to fetch feedback for report ${reportId}`);
  return res.json();
}

export async function addReportFeedback(reportId, { content, author }) {
  const res = await fetch(`${BASE}/api/reports/${reportId}/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, author }),
  });
  await ensureOk(res, 'Failed to add feedback');
  return res.json();
}

export async function resolveReportFeedback(reportId, feedbackId, changeRecord) {
  const res = await fetch(`${BASE}/api/reports/${reportId}/feedback/${feedbackId}/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ changeRecord }),
  });
  await ensureOk(res, 'Failed to resolve feedback');
  return res.json();
}

export async function confirmReportFeedback(reportId, feedbackId) {
  const res = await fetch(`${BASE}/api/reports/${reportId}/feedback/${feedbackId}/confirm`, {
    method: 'POST',
  });
  await ensureOk(res, 'Failed to confirm feedback');
  return res.json();
}
