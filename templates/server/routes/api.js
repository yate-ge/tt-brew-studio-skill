const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { generateId } = require('../lib/ids');
const { writeJSON, readJSONArray, readJSONObject, updateJSON } = require('../lib/store');
const { broadcast } = require('../lib/ws');

const DELIVERY_MODES = ['task_delivery', 'alignment'];
const DELIVERY_STATUSES = ['normal', 'pending_feedback'];
const ALIGNMENT_STATES = ['active', 'resolved', 'canceled'];

const DEFAULT_SETTINGS = {
  language: 'en',
  language_explicit: false,
  trigger_mode: 'smart',
  port: 3847,
  remote: false,
  access_key_enabled: false,
  access_key: '',
  platform: {
    name: 'Visual Delivery',
    logo_url: '',
    slogan: 'Turn work into clear decisions.',
    visual_style: 'executive-brief',
  },
};

function generateAccessKey() {
  return `vdk_${crypto.randomBytes(18).toString('base64url')}`;
}

function normalizeSettings(stored = {}) {
  const port = Number.parseInt(stored.port, 10);
  const normalizedPort = port >= 1024 && port <= 65535 ? port : DEFAULT_SETTINGS.port;
  const triggerMode = ['auto', 'smart', 'manual'].includes(stored.trigger_mode)
    ? stored.trigger_mode
    : DEFAULT_SETTINGS.trigger_mode;

  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    trigger_mode: triggerMode,
    port: normalizedPort,
    remote: stored.remote === true,
    access_key_enabled: stored.access_key_enabled === true,
    access_key: typeof stored.access_key === 'string' && stored.access_key.trim()
      ? stored.access_key.trim()
      : generateAccessKey(),
    platform: {
      ...DEFAULT_SETTINGS.platform,
      ...(stored.platform || {}),
    },
  };
}

function ensureDeliveryContent(content) {
  if (!content || typeof content !== 'object') return false;

  if (content.type === 'ui_spec') {
    return !!content.ui_spec && typeof content.ui_spec === 'object';
  }
  if (content.type === 'generated_html') {
    return typeof content.html === 'string' && content.html.trim().length > 0;
  }
  if (content.type === 'html' || content.type === 'markdown') {
    return typeof content.body === 'string';
  }
  return false;
}

function normalizeMetadata(metadata = {}) {
  return {
    project_name: metadata.project_name || 'Untitled Project',
    task_name: metadata.task_name || 'Untitled Task',
    generated_at: metadata.generated_at || new Date().toISOString(),
    audience: metadata.audience || 'stakeholder',
  };
}

function mapIndexEntry(delivery) {
  return {
    id: delivery.id,
    mode: delivery.mode,
    status: delivery.status,
    title: delivery.title,
    created_at: delivery.created_at,
    updated_at: delivery.updated_at,
    metadata: delivery.metadata,
    agent_session_id: delivery.agent_session_id,
    alignment_state: delivery.alignment_state,
  };
}

function setupRoutes(app, dataDir, options = {}) {
  const dataRoot = path.join(dataDir, 'data');
  const projectRoot = path.resolve(options.projectDir || path.dirname(dataDir));
  const deliveriesDir = path.join(dataRoot, 'deliveries');
  const sessionsDir = path.join(dataRoot, 'sessions');
  const indexPath = path.join(dataRoot, 'index.json');
  const settingsPath = path.join(dataRoot, 'settings.json');

  fs.mkdirSync(deliveriesDir, { recursive: true });
  fs.mkdirSync(sessionsDir, { recursive: true });

  function deliveryDir(deliveryId) {
    return path.join(deliveriesDir, deliveryId);
  }

  function deliveryFile(deliveryId, fileName) {
    return path.join(deliveryDir(deliveryId), fileName);
  }

  function sessionAlignmentDir(agentSessionId) {
    return path.join(sessionsDir, agentSessionId, 'alignment');
  }

  function activeAlignmentPath(agentSessionId) {
    return path.join(sessionAlignmentDir(agentSessionId), 'active.json');
  }

  function alignmentHistoryDir(agentSessionId) {
    return path.join(sessionAlignmentDir(agentSessionId), 'history');
  }

  async function appendIndex(delivery) {
    const entry = mapIndexEntry(delivery);
    await updateJSON(indexPath, (entries) => {
      entries.push(entry);
      return entries;
    });
    return entry;
  }

  async function updateIndex(delivery) {
    const entry = mapIndexEntry(delivery);
    await updateJSON(indexPath, (entries) => {
      const idx = entries.findIndex((item) => item.id === delivery.id);
      if (idx >= 0) {
        entries[idx] = entry;
      }
      return entries;
    });
    return entry;
  }

  function readDelivery(deliveryId) {
    return readJSONObject(deliveryFile(deliveryId, 'delivery.json'));
  }

  function readDeliveryFeedback(deliveryId) {
    return readJSONArray(deliveryFile(deliveryId, 'feedback.json'));
  }

  function readDeliveryDrafts(deliveryId) {
    return readJSONArray(deliveryFile(deliveryId, 'drafts.json'));
  }

  async function writeDelivery(delivery) {
    await writeJSON(deliveryFile(delivery.id, 'delivery.json'), delivery);
  }

  async function recalcDeliveryStatus(deliveryId) {
    const delivery = readDelivery(deliveryId);
    if (!delivery) return null;

    const feedbackItems = readDeliveryFeedback(deliveryId);
    const hasUnhandled = feedbackItems.some((item) => item.handled === false);
    delivery.status = hasUnhandled ? 'pending_feedback' : 'normal';
    delivery.updated_at = new Date().toISOString();

    await writeDelivery(delivery);
    await updateIndex(delivery);
    return delivery;
  }

  function normalizeFeedbackDraftItem(item, now) {
    return {
      id: item.id || generateId('fd'),
      kind: item.kind === 'annotation' ? 'annotation' : 'interactive',
      payload: item.payload || {},
      target: item.target || null,
      created_at: item.created_at || now,
    };
  }

  function normalizeFeedbackItem(item, now) {
    return {
      id: generateId('f'),
      kind: item.kind === 'annotation' ? 'annotation' : 'interactive',
      payload: item.payload || {},
      target: item.target || null,
      handled: false,
      handled_at: null,
      handled_by: null,
      created_at: now,
    };
  }

  async function archiveActiveAlignment(agentSessionId, activeRecord, terminalState, reason, endedAt) {
    if (!activeRecord) return;
    const historyPath = path.join(
      alignmentHistoryDir(agentSessionId),
      `${Date.now()}_${activeRecord.delivery_id}.json`
    );
    fs.mkdirSync(path.dirname(historyPath), { recursive: true });

    await writeJSON(historyPath, {
      ...activeRecord,
      terminal_state: terminalState,
      reason,
      ended_at: endedAt,
    });
  }

  async function endActiveAlignment(agentSessionId, threadId, terminalState, reason) {
    const activePath = activeAlignmentPath(agentSessionId);
    const activeRecord = readJSONObject(activePath);

    if (!activeRecord) {
      return { status: 'no_active' };
    }

    if (threadId && activeRecord.thread_id !== threadId) {
      return {
        status: 'error',
        code: 'THREAD_MISMATCH',
        message: 'thread_id does not match active alignment',
      };
    }

    const now = new Date().toISOString();
    const delivery = readDelivery(activeRecord.delivery_id);
    if (delivery) {
      delivery.alignment_state = terminalState;
      delivery.updated_at = now;
      await writeDelivery(delivery);
      await updateIndex(delivery);
      broadcast('update_delivery', mapIndexEntry(delivery));
    }

    await archiveActiveAlignment(agentSessionId, activeRecord, terminalState, reason, now);
    try {
      fs.unlinkSync(activePath);
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }

    broadcast('alignment_update', {
      agent_session_id: agentSessionId,
      delivery_id: activeRecord.delivery_id,
      alignment_state: terminalState,
      reason,
    });

    return {
      status: terminalState,
      delivery_id: activeRecord.delivery_id,
    };
  }

  async function createDeliveryRecord({ mode, title, content, metadata, agentSessionId, threadId, alignmentState }) {
    const id = generateId('d');
    const now = new Date().toISOString();

    fs.mkdirSync(deliveryDir(id), { recursive: true });

    const delivery = {
      id,
      mode,
      status: 'normal',
      title,
      content,
      metadata: normalizeMetadata(metadata),
      agent_session_id: agentSessionId || null,
      thread_id: threadId || null,
      alignment_state: alignmentState || null,
      created_at: now,
      updated_at: now,
    };

    await writeDelivery(delivery);
    await writeJSON(deliveryFile(id, 'feedback.json'), []);
    await writeJSON(deliveryFile(id, 'drafts.json'), []);
    await appendIndex(delivery);

    broadcast('new_delivery', mapIndexEntry(delivery));

    return delivery;
  }

  async function upsertAlignment({ title, content, metadata, agent_session_id: agentSessionId, thread_id: threadId }) {
    if (!agentSessionId || !threadId) {
      return {
        error: {
          code: 'INVALID_REQUEST',
          message: 'agent_session_id and thread_id are required for alignment',
        },
      };
    }

    const replaced = await endActiveAlignment(agentSessionId, null, 'canceled', 'replaced_by_new_alignment');

    const delivery = await createDeliveryRecord({
      mode: 'alignment',
      title,
      content,
      metadata,
      agentSessionId,
      threadId,
      alignmentState: 'active',
    });

    const now = new Date().toISOString();
    await writeJSON(activeAlignmentPath(agentSessionId), {
      agent_session_id: agentSessionId,
      thread_id: threadId,
      delivery_id: delivery.id,
      status: 'active',
      created_at: now,
      last_heartbeat_at: now,
    });

    return {
      delivery,
      replaced_delivery_id: replaced.delivery_id || null,
    };
  }

  function hydrateDelivery(deliveryId) {
    const delivery = readDelivery(deliveryId);
    if (!delivery) return null;

    const feedback = readDeliveryFeedback(deliveryId);
    const drafts = readDeliveryDrafts(deliveryId);

    return {
      ...delivery,
      feedback,
      drafts,
      pending_feedback_count: feedback.filter((item) => item.handled === false).length,
    };
  }

  function readSettings() {
    const stored = readJSONObject(settingsPath);
    return normalizeSettings(stored || {});
  }

  // Health
  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      uptime: Math.floor(process.uptime()),
      version: '2.0.0',
    });
  });

  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      uptime: Math.floor(process.uptime()),
      version: '2.0.0',
    });
  });

  // Create delivery
  app.post('/api/deliveries', async (req, res) => {
    try {
      const {
        mode,
        title,
        content,
        metadata,
        agent_session_id: agentSessionId,
        thread_id: threadId,
      } = req.body;

      if (!mode || !title || !content) {
        return res.status(400).json({
          error: { code: 'INVALID_REQUEST', message: 'Missing required fields: mode, title, content' },
        });
      }

      if (!DELIVERY_MODES.includes(mode)) {
        return res.status(400).json({
          error: {
            code: 'INVALID_REQUEST',
            message: `mode must be one of: ${DELIVERY_MODES.join(', ')}`,
          },
        });
      }

      if (!ensureDeliveryContent(content)) {
        return res.status(400).json({
          error: {
            code: 'INVALID_REQUEST',
            message: 'content must be a supported delivery content object',
          },
        });
      }

      if (mode === 'alignment') {
        const result = await upsertAlignment({
          title,
          content,
          metadata,
          agent_session_id: agentSessionId,
          thread_id: threadId,
        });

        if (result.error) {
          return res.status(400).json({ error: result.error });
        }

        const port = app.get('port') || 3847;
        return res.status(201).json({
          id: result.delivery.id,
          url: `http://localhost:${port}/d/${result.delivery.id}`,
          replaced_delivery_id: result.replaced_delivery_id,
        });
      }

      const delivery = await createDeliveryRecord({
        mode,
        title,
        content,
        metadata,
      });

      const port = app.get('port') || 3847;
      res.status(201).json({
        id: delivery.id,
        url: `http://localhost:${port}/d/${delivery.id}`,
      });
    } catch (err) {
      console.error('Error creating delivery:', err);
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: err.message },
      });
    }
  });

  // List deliveries
  app.get('/api/deliveries', (req, res) => {
    try {
      let entries = readJSONArray(indexPath);
      const { mode, status, limit, offset, agent_session_id: agentSessionId } = req.query;

      if (mode) entries = entries.filter((item) => item.mode === mode);
      if (status) entries = entries.filter((item) => item.status === status);
      if (agentSessionId) entries = entries.filter((item) => item.agent_session_id === agentSessionId);

      const total = entries.length;
      const off = parseInt(offset, 10) || 0;
      const lim = parseInt(limit, 10) || 50;

      const deliveries = entries
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(off, off + lim);

      res.json({ deliveries, total });
    } catch (err) {
      console.error('Error listing deliveries:', err);
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: err.message },
      });
    }
  });

  // Get delivery
  app.get('/api/deliveries/:id', (req, res) => {
    try {
      const delivery = hydrateDelivery(req.params.id);
      if (!delivery) {
        return res.status(404).json({
          error: { code: 'NOT_FOUND', message: `Delivery ${req.params.id} not found` },
        });
      }

      res.json(delivery);
    } catch (err) {
      console.error('Error getting delivery:', err);
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: err.message },
      });
    }
  });

  // Save draft feedback (sidebar staging)
  app.post('/api/deliveries/:id/feedback/draft', async (req, res) => {
    try {
      const delivery = readDelivery(req.params.id);
      if (!delivery) {
        return res.status(404).json({
          error: { code: 'NOT_FOUND', message: `Delivery ${req.params.id} not found` },
        });
      }

      const { items } = req.body;
      if (!Array.isArray(items)) {
        return res.status(400).json({
          error: { code: 'INVALID_REQUEST', message: 'items must be an array' },
        });
      }

      const now = new Date().toISOString();
      const drafts = items.map((item) => normalizeFeedbackDraftItem(item, now));
      await writeJSON(deliveryFile(req.params.id, 'drafts.json'), drafts);

      res.status(200).json({
        delivery_id: req.params.id,
        count: drafts.length,
      });
    } catch (err) {
      console.error('Error saving feedback draft:', err);
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: err.message },
      });
    }
  });

  // Commit feedback from sidebar
  app.post('/api/deliveries/:id/feedback/commit', async (req, res) => {
    try {
      const deliveryId = req.params.id;
      const delivery = readDelivery(deliveryId);
      if (!delivery) {
        return res.status(404).json({
          error: { code: 'NOT_FOUND', message: `Delivery ${deliveryId} not found` },
        });
      }

      const { items } = req.body;
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({
          error: {
            code: 'INVALID_REQUEST',
            message: 'items must be a non-empty array',
          },
        });
      }

      const now = new Date().toISOString();
      const newFeedbackItems = items.map((item) => normalizeFeedbackItem(item, now));
      const feedbackPath = deliveryFile(deliveryId, 'feedback.json');

      await updateJSON(
        feedbackPath,
        (existing) => [...existing, ...newFeedbackItems],
        []
      );

      await writeJSON(deliveryFile(deliveryId, 'drafts.json'), []);

      const updatedDelivery = await recalcDeliveryStatus(deliveryId);
      const indexEntry = mapIndexEntry(updatedDelivery);

      broadcast('feedback_received', {
        delivery_id: deliveryId,
        count: newFeedbackItems.length,
      });
      broadcast('update_delivery', indexEntry);

      res.status(201).json({
        delivery_id: deliveryId,
        feedback_ids: newFeedbackItems.map((item) => item.id),
        status: updatedDelivery.status,
      });
    } catch (err) {
      console.error('Error committing feedback:', err);
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: err.message },
      });
    }
  });

  // Resolve committed feedback entries
  app.post('/api/deliveries/:id/feedback/resolve', async (req, res) => {
    try {
      const deliveryId = req.params.id;
      const delivery = readDelivery(deliveryId);
      if (!delivery) {
        return res.status(404).json({
          error: { code: 'NOT_FOUND', message: `Delivery ${deliveryId} not found` },
        });
      }

      const { feedback_ids: feedbackIds, handled_by: handledBy } = req.body;
      if (!Array.isArray(feedbackIds) || feedbackIds.length === 0) {
        return res.status(400).json({
          error: {
            code: 'INVALID_REQUEST',
            message: 'feedback_ids must be a non-empty array',
          },
        });
      }

      const now = new Date().toISOString();
      let resolvedCount = 0;

      const feedbackPath = deliveryFile(deliveryId, 'feedback.json');
      await updateJSON(
        feedbackPath,
        (items) => items.map((item) => {
          if (!feedbackIds.includes(item.id) || item.handled === true) {
            return item;
          }

          resolvedCount += 1;
          return {
            ...item,
            handled: true,
            handled_at: now,
            handled_by: handledBy || 'agent',
          };
        }),
        []
      );

      const updatedDelivery = await recalcDeliveryStatus(deliveryId);
      const indexEntry = mapIndexEntry(updatedDelivery);

      broadcast('update_delivery', indexEntry);

      res.status(200).json({
        delivery_id: deliveryId,
        resolved_count: resolvedCount,
        status: updatedDelivery.status,
      });
    } catch (err) {
      console.error('Error resolving feedback:', err);
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: err.message },
      });
    }
  });

  // Revoke unhandled committed feedback entries
  app.post('/api/deliveries/:id/feedback/revoke', async (req, res) => {
    try {
      const deliveryId = req.params.id;
      const delivery = readDelivery(deliveryId);
      if (!delivery) {
        return res.status(404).json({
          error: { code: 'NOT_FOUND', message: `Delivery ${deliveryId} not found` },
        });
      }

      const { feedback_ids: feedbackIds } = req.body;
      if (!Array.isArray(feedbackIds) || feedbackIds.length === 0) {
        return res.status(400).json({
          error: {
            code: 'INVALID_REQUEST',
            message: 'feedback_ids must be a non-empty array',
          },
        });
      }

      let revokedCount = 0;
      const feedbackPath = deliveryFile(deliveryId, 'feedback.json');
      await updateJSON(
        feedbackPath,
        (items) => items.filter((item) => {
          const shouldRevoke = feedbackIds.includes(item.id) && item.handled === false;
          if (shouldRevoke) revokedCount += 1;
          return !shouldRevoke;
        }),
        []
      );

      const updatedDelivery = await recalcDeliveryStatus(deliveryId);
      const indexEntry = mapIndexEntry(updatedDelivery);

      broadcast('feedback_revoked', {
        delivery_id: deliveryId,
        revoked_count: revokedCount,
      });
      broadcast('update_delivery', indexEntry);

      res.status(200).json({
        delivery_id: deliveryId,
        revoked_count: revokedCount,
        status: updatedDelivery.status,
      });
    } catch (err) {
      console.error('Error revoking feedback:', err);
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: err.message },
      });
    }
  });

  // Backward-agnostic annotation endpoint (stored as draft annotation item)
  app.post('/api/deliveries/:id/annotate', async (req, res) => {
    try {
      const deliveryId = req.params.id;
      const delivery = readDelivery(deliveryId);
      if (!delivery) {
        return res.status(404).json({
          error: { code: 'NOT_FOUND', message: `Delivery ${deliveryId} not found` },
        });
      }

      const { content, target } = req.body;
      if (!content) {
        return res.status(400).json({
          error: { code: 'INVALID_REQUEST', message: 'content is required' },
        });
      }

      const now = new Date().toISOString();
      const draftItem = normalizeFeedbackDraftItem(
        {
          kind: 'annotation',
          payload: { text: content },
          target: target || null,
        },
        now
      );

      await updateJSON(
        deliveryFile(deliveryId, 'drafts.json'),
        (items) => [...items, draftItem],
        []
      );

      res.status(201).json({
        id: draftItem.id,
        delivery_id: deliveryId,
      });
    } catch (err) {
      console.error('Error adding annotation draft:', err);
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: err.message },
      });
    }
  });

  // Upsert active alignment (unique per session)
  app.post('/api/alignment/upsert', async (req, res) => {
    try {
      const { title, content, metadata, agent_session_id: agentSessionId, thread_id: threadId } = req.body;

      if (!title || !content || !ensureDeliveryContent(content)) {
        return res.status(400).json({
          error: {
            code: 'INVALID_REQUEST',
            message: 'title and supported content are required',
          },
        });
      }

      const result = await upsertAlignment({
        title,
        content,
        metadata,
        agent_session_id: agentSessionId,
        thread_id: threadId,
      });

      if (result.error) {
        return res.status(400).json({ error: result.error });
      }

      const port = app.get('port') || 3847;
      res.status(201).json({
        id: result.delivery.id,
        url: `http://localhost:${port}/d/${result.delivery.id}`,
        replaced_delivery_id: result.replaced_delivery_id,
        thread_id: threadId,
      });
    } catch (err) {
      console.error('Error upserting alignment:', err);
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: err.message },
      });
    }
  });

  // Get current active alignment for a session
  app.get('/api/alignment/active', (req, res) => {
    try {
      const agentSessionId = req.query.agent_session_id;
      if (!agentSessionId) {
        return res.status(400).json({
          error: { code: 'INVALID_REQUEST', message: 'agent_session_id is required' },
        });
      }

      const activeRecord = readJSONObject(activeAlignmentPath(agentSessionId));
      if (!activeRecord) {
        return res.status(200).json({ active: null });
      }

      const delivery = hydrateDelivery(activeRecord.delivery_id);
      if (!delivery) {
        return res.status(200).json({ active: null });
      }

      const pendingFeedback = delivery.feedback.filter((item) => item.handled === false);

      res.status(200).json({
        active: {
          ...delivery,
          thread_id: activeRecord.thread_id,
          last_heartbeat_at: activeRecord.last_heartbeat_at,
        },
        pending_feedback_count: pendingFeedback.length,
        pending_feedback: pendingFeedback,
      });
    } catch (err) {
      console.error('Error getting active alignment:', err);
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: err.message },
      });
    }
  });

  // Alignment thread heartbeat
  app.post('/api/alignment/heartbeat', async (req, res) => {
    try {
      const { agent_session_id: agentSessionId, thread_id: threadId } = req.body;

      if (!agentSessionId || !threadId) {
        return res.status(400).json({
          error: {
            code: 'INVALID_REQUEST',
            message: 'agent_session_id and thread_id are required',
          },
        });
      }

      const activePath = activeAlignmentPath(agentSessionId);
      const activeRecord = readJSONObject(activePath);
      if (!activeRecord) {
        return res.status(404).json({
          error: { code: 'NOT_FOUND', message: 'No active alignment found for session' },
        });
      }

      if (activeRecord.thread_id !== threadId) {
        return res.status(409).json({
          error: { code: 'THREAD_MISMATCH', message: 'thread_id does not match active alignment' },
        });
      }

      const now = new Date().toISOString();
      activeRecord.last_heartbeat_at = now;
      await writeJSON(activePath, activeRecord);

      res.status(200).json({ status: 'ok', last_heartbeat_at: now });
    } catch (err) {
      console.error('Error in alignment heartbeat:', err);
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: err.message },
      });
    }
  });

  // Cancel active alignment (thread close / timeout / interrupt)
  app.post('/api/alignment/cancel', async (req, res) => {
    try {
      const { agent_session_id: agentSessionId, thread_id: threadId, reason } = req.body;

      if (!agentSessionId) {
        return res.status(400).json({
          error: { code: 'INVALID_REQUEST', message: 'agent_session_id is required' },
        });
      }

      const result = await endActiveAlignment(
        agentSessionId,
        threadId || null,
        'canceled',
        reason || 'thread_closed'
      );

      if (result.status === 'error') {
        return res.status(409).json({
          error: { code: result.code, message: result.message },
        });
      }

      res.status(200).json(result);
    } catch (err) {
      console.error('Error canceling alignment:', err);
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: err.message },
      });
    }
  });

  // Resolve active alignment (agent received user confirmation)
  app.post('/api/alignment/resolve', async (req, res) => {
    try {
      const {
        agent_session_id: agentSessionId,
        thread_id: threadId,
        delivery_id: deliveryId,
      } = req.body;

      if (!agentSessionId) {
        return res.status(400).json({
          error: { code: 'INVALID_REQUEST', message: 'agent_session_id is required' },
        });
      }

      const activeRecord = readJSONObject(activeAlignmentPath(agentSessionId));
      if (!activeRecord) {
        return res.status(200).json({ status: 'no_active' });
      }

      if (deliveryId && activeRecord.delivery_id !== deliveryId) {
        return res.status(409).json({
          error: {
            code: 'DELIVERY_MISMATCH',
            message: 'delivery_id does not match active alignment',
          },
        });
      }

      const result = await endActiveAlignment(
        agentSessionId,
        threadId || null,
        'resolved',
        'agent_received_feedback'
      );

      if (result.status === 'error') {
        return res.status(409).json({
          error: { code: result.code, message: result.message },
        });
      }

      res.status(200).json(result);
    } catch (err) {
      console.error('Error resolving alignment:', err);
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: err.message },
      });
    }
  });

  // Settings
  app.get('/api/settings', async (req, res) => {
    try {
      const settings = readSettings();
      await writeJSON(settingsPath, settings);
      res.status(200).json(settings);
    } catch (err) {
      console.error('Error reading settings:', err);
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: err.message },
      });
    }
  });

  app.put('/api/settings', async (req, res) => {
    try {
      const current = readSettings();
      const input = req.body || {};
      const nextPort = Number.parseInt(input.port, 10);
      const hasValidPort = nextPort >= 1024 && nextPort <= 65535;
      const nextTriggerMode = ['auto', 'smart', 'manual'].includes(input.trigger_mode)
        ? input.trigger_mode
        : current.trigger_mode;

      const next = {
        ...current,
        language: input.language || current.language,
        language_explicit: input.language_explicit === undefined ? current.language_explicit : !!input.language_explicit,
        trigger_mode: nextTriggerMode,
        port: hasValidPort ? nextPort : current.port,
        remote: input.remote === undefined ? current.remote : !!input.remote,
        access_key_enabled: input.access_key_enabled === undefined ? current.access_key_enabled : !!input.access_key_enabled,
        access_key: input.rotate_access_key
          ? generateAccessKey()
          : (typeof input.access_key === 'string' && input.access_key.trim() ? input.access_key.trim() : current.access_key),
        platform: {
          ...current.platform,
          ...(input.platform || {}),
        },
      };

      await writeJSON(settingsPath, next);
      broadcast('settings_updated', next);

      res.status(200).json(next);
    } catch (err) {
      console.error('Error updating settings:', err);
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: err.message },
      });
    }
  });

  // Design tokens
  app.get('/api/design-tokens', (req, res) => {
    const tokensPath = path.join(dataDir, 'design', 'tokens.json');
    try {
      const tokens = JSON.parse(fs.readFileSync(tokensPath, 'utf8'));
      res.status(200).json(tokens);
    } catch (err) {
      console.error('Error reading tokens.json:', err.message);
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: 'Invalid design tokens' },
      });
    }
  });

  // Locale strings injected into the UI shell.
  app.get('/api/locale', (req, res) => {
    const localePath = path.join(dataRoot, 'locale.json');
    try {
      const locale = readJSONObject(localePath) || {};
      res.status(200).json(locale);
    } catch (err) {
      console.error('Error reading locale.json:', err.message);
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: 'Invalid locale file' },
      });
    }
  });

  app.put('/api/locale', async (req, res) => {
    const localePath = path.join(dataRoot, 'locale.json');
    try {
      const locale = req.body;
      if (!locale || Array.isArray(locale) || typeof locale !== 'object') {
        return res.status(400).json({
          error: { code: 'INVALID_REQUEST', message: 'locale must be an object' },
        });
      }
      await writeJSON(localePath, locale);
      broadcast('locale_updated', locale);
      res.status(200).json(locale);
    } catch (err) {
      console.error('Error updating locale.json:', err.message);
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: err.message },
      });
    }
  });

  // ═══════════════════════════════════════════════════════
  // V3: Project-level APIs
  // ═══════════════════════════════════════════════════════

  const projectConfigPath = path.join(dataRoot, 'project.json');
  const projectHarnessPath = path.join(dataRoot, 'harness.json');
  const projectDocumentIndexPath = path.join(dataRoot, 'document-index.json');
  const projectLogsPath = path.join(dataRoot, 'logs.json');
  const projectFeedbackPath = path.join(dataRoot, 'feedback.json');
  const projectReportsPath = path.join(dataRoot, 'reports');
  const projectCanvasWorkspacesPath = path.join(dataRoot, 'canvas-workspaces');
  const projectScaffoldsPath = path.join(dataRoot, 'scaffolds');
  const skillManagedLogsPath = path.join(dataRoot, 'logs');
  const skillManagedDocumentsPath = path.join(dataRoot, 'documents');

  const DOCUMENT_EXTENSIONS = new Set([
    '.md',
    '.mdx',
    '.txt',
    '.json',
    '.jsonc',
    '.yaml',
    '.yml',
    '.toml',
  ]);
  const DOCUMENT_DIR_NAMES = new Set([
    'docs',
    'doc',
    'documentation',
    'references',
    'reference',
    'notes',
    'note',
    'memory',
    'memories',
    'logs',
    'log',
    'journal',
    'journals',
    'agents',
    '.claude',
    '.codex',
  ]);
  const SKIP_DIR_NAMES = new Set([
    '.git',
    'node_modules',
    'dist',
    'build',
    '.next',
    '.nuxt',
    '.vite',
    'coverage',
    '.cache',
    'tmp',
    'temp',
    'vendor',
  ]);
  const MAX_DISCOVERY_DEPTH = 4;
  const MAX_DOCUMENT_BYTES = 512 * 1024;

  // Ensure V3 data dirs/files exist
  fs.mkdirSync(projectReportsPath, { recursive: true });
  fs.mkdirSync(projectCanvasWorkspacesPath, { recursive: true });
  fs.mkdirSync(projectScaffoldsPath, { recursive: true });
  fs.mkdirSync(skillManagedLogsPath, { recursive: true });
  fs.mkdirSync(skillManagedDocumentsPath, { recursive: true });
  if (!fs.existsSync(projectLogsPath)) { fs.writeFileSync(projectLogsPath, '[]', 'utf8'); }
  if (!fs.existsSync(projectFeedbackPath)) { fs.writeFileSync(projectFeedbackPath, '[]', 'utf8'); }

  const DEFAULT_PROJECT = {
    name: '未命名项目',
    description: '',
    stage: 'dev',
    initial: 'P',
    theme: 'system',
    accent: 'blue',
    density: 'comfortable',
    host_mode: 'local',
  };

  function readProjectConfig() {
    const stored = readJSONObject(projectConfigPath);
    return stored ? { ...DEFAULT_PROJECT, ...stored } : { ...DEFAULT_PROJECT };
  }

  function toPosixPath(value) {
    return value.split(path.sep).join('/');
  }

  function stableId(prefix, value) {
    const hash = crypto.createHash('sha1').update(value).digest('hex').slice(0, 12);
    return `${prefix}_${hash}`;
  }

  function safeReadDir(dirPath) {
    try {
      return fs.readdirSync(dirPath, { withFileTypes: true });
    } catch {
      return [];
    }
  }

  function isIgnoredDirectory(name) {
    const lower = name.toLowerCase();
    return SKIP_DIR_NAMES.has(lower) || lower.startsWith('.visual-delivery');
  }

  function isDocumentFileName(fileName) {
    const lower = fileName.toLowerCase();
    return DOCUMENT_EXTENSIONS.has(path.extname(lower)) || lower === '.cursorrules';
  }

  function isRootDocumentCandidate(fileName) {
    const lower = fileName.toLowerCase();
    return /^readme(\..*)?\.md$/.test(lower)
      || /^(agents|claude|codex|gemini|cursor)(\..*)?\.md$/.test(lower)
      || lower === '.cursorrules'
      || /^(overview|project|spec|context|memory|journal|log|harness)(\..*)?\.(md|txt|json|yaml|yml)$/.test(lower);
  }

  function classifyDocument(relPath) {
    const normalized = toPosixPath(relPath).toLowerCase();
    const base = path.basename(normalized);

    if (/^(agents|claude|codex|gemini|cursor)(\..*)?\.md$/.test(base) || base === '.cursorrules') {
      return 'agent_instructions';
    }
    if (base.startsWith('readme') || base === 'overview.md') {
      return 'project_overview';
    }
    if (normalized.includes('memory') || normalized.includes('context')) {
      return 'project_memory';
    }
    if (normalized.includes('journal') || normalized.includes('log')) {
      return 'work_log';
    }
    if (normalized.startsWith('docs/') || normalized.startsWith('doc/') || normalized.startsWith('documentation/')) {
      return 'project_documentation';
    }
    if (normalized.startsWith('references/') || normalized.startsWith('reference/')) {
      return 'reference';
    }
    if (normalized.startsWith('notes/') || normalized.startsWith('note/')) {
      return 'note';
    }
    if (normalized.startsWith('agents/') || normalized.startsWith('.claude/') || normalized.startsWith('.codex/')) {
      return 'agent_harness';
    }
    return 'project_document';
  }

  function readFirstHeading(filePath) {
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      const heading = raw.split(/\r?\n/).find((line) => /^#\s+/.test(line));
      return heading ? heading.replace(/^#\s+/, '').trim() : '';
    } catch {
      return '';
    }
  }

  function titleFromPath(absPath, relPath) {
    const heading = path.extname(relPath).toLowerCase().startsWith('.md')
      ? readFirstHeading(absPath)
      : '';
    if (heading) return heading;
    return path.basename(relPath).replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ');
  }

  function hasWriteAccess(filePath) {
    try {
      fs.accessSync(filePath, fs.constants.W_OK);
      return true;
    } catch {
      return false;
    }
  }

  function isPathInside(parent, target) {
    const relative = path.relative(parent, target);
    return relative === '' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative));
  }

  function addDocument(documents, absPath, now) {
    const resolved = path.resolve(absPath);
    if (!isPathInside(projectRoot, resolved)) return;

    let stat = null;
    try {
      stat = fs.statSync(resolved);
    } catch {
      return;
    }
    if (!stat.isFile()) return;

    const relPath = toPosixPath(path.relative(projectRoot, resolved));
    if (!relPath || documents.has(relPath)) return;

    documents.set(relPath, {
      id: stableId('doc', relPath),
      source: 'external',
      kind: classifyDocument(relPath),
      path: relPath,
      title: titleFromPath(resolved, relPath),
      writable: hasWriteAccess(resolved),
      size: stat.size,
      updated_at: stat.mtime.toISOString(),
      last_seen_at: now,
      last_indexed_at: now,
    });
  }

  function walkDocumentDirectory(dirPath, relDir, depth, documents, now) {
    if (depth > MAX_DISCOVERY_DEPTH) return;

    for (const entry of safeReadDir(dirPath)) {
      const absPath = path.join(dirPath, entry.name);
      const relPath = path.join(relDir, entry.name);

      if (entry.isDirectory()) {
        if (!isIgnoredDirectory(entry.name)) {
          walkDocumentDirectory(absPath, relPath, depth + 1, documents, now);
        }
        continue;
      }

      if (entry.isFile() && isDocumentFileName(entry.name)) {
        addDocument(documents, absPath, now);
      }
    }
  }

  function discoverProjectDocuments(now) {
    const documents = new Map();

    for (const entry of safeReadDir(projectRoot)) {
      const absPath = path.join(projectRoot, entry.name);
      const lowerName = entry.name.toLowerCase();

      if (entry.isFile()) {
        if (isRootDocumentCandidate(entry.name)) {
          addDocument(documents, absPath, now);
        }
        continue;
      }

      if (entry.isDirectory() && DOCUMENT_DIR_NAMES.has(lowerName) && !isIgnoredDirectory(entry.name)) {
        walkDocumentDirectory(absPath, entry.name, 1, documents, now);
      }
    }

    return Array.from(documents.values()).sort((a, b) => {
      if (a.kind !== b.kind) return a.kind.localeCompare(b.kind);
      return a.path.localeCompare(b.path);
    });
  }

  function sourceKindForPath(sourcePath) {
    if (sourcePath === '.') return 'root_files';
    const lower = sourcePath.toLowerCase();
    if (lower.includes('memory') || lower.includes('context')) return 'project_memory';
    if (lower.includes('journal') || lower.includes('log')) return 'work_log';
    if (lower.includes('agent') || lower === '.claude' || lower === '.codex') return 'agent_harness';
    if (lower.includes('reference')) return 'reference';
    if (lower.includes('note')) return 'note';
    return 'project_documentation';
  }

  function buildHarness(documents, previousHarness, now) {
    const sourcesByPath = new Map();
    const previousSources = Array.isArray(previousHarness?.sources) ? previousHarness.sources : [];
    const previousByPath = new Map(previousSources.map((source) => [source.path, source]));

    for (const doc of documents) {
      const firstSegment = doc.path.includes('/') ? doc.path.split('/')[0] : '.';
      const source = sourcesByPath.get(firstSegment) || {
        id: stableId('src', firstSegment),
        path: firstSegment,
        kind: sourceKindForPath(firstSegment),
        source: 'external',
        writable: false,
        document_count: 0,
      };
      source.writable = source.writable || doc.writable;
      source.document_count += 1;
      sourcesByPath.set(firstSegment, source);
    }

    for (const [sourcePath, source] of sourcesByPath.entries()) {
      const previous = previousByPath.get(sourcePath);
      if (previous) {
        sourcesByPath.set(sourcePath, {
          ...source,
          id: previous.id || source.id,
          title: previous.title || source.title,
          enabled: previous.enabled !== false,
          manual: !!previous.manual,
          log_target: !!previous.log_target,
        });
      } else {
        sourcesByPath.set(sourcePath, {
          ...source,
          enabled: true,
          manual: false,
          log_target: false,
        });
      }
    }

    for (const previous of previousSources) {
      if (previous.manual && previous.enabled !== false && !sourcesByPath.has(previous.path)) {
        sourcesByPath.set(previous.path, {
          ...previous,
          document_count: 0,
        });
      }
    }

    const transparencyTarget = previousHarness?.transparency_target || previousSources.find((source) => source.log_target)?.path || null;

    return {
      version: 1,
      project_root: projectRoot,
      strategy: 'external-first',
      managed_fallback: {
        logs_path: toPosixPath(path.relative(projectRoot, skillManagedLogsPath)),
        documents_path: toPosixPath(path.relative(projectRoot, skillManagedDocumentsPath)),
      },
      sources: Array.from(sourcesByPath.values()).sort((a, b) => a.path.localeCompare(b.path)),
      transparency_target: transparencyTarget,
      discovered_at: previousHarness?.discovered_at || now,
      updated_at: now,
    };
  }

  function summarizeDocumentIndex(documentIndex) {
    return {
      project_root: documentIndex.project_root,
      scanned_at: documentIndex.scanned_at,
      total: documentIndex.documents.length,
    };
  }

  function readHarnessState() {
    return {
      harness: readJSONObject(projectHarnessPath) || null,
      documentIndex: readDocumentIndex(),
    };
  }

  async function writeHarness(harness) {
    const next = {
      ...harness,
      updated_at: new Date().toISOString(),
    };
    await writeJSON(projectHarnessPath, next);
    return next;
  }

  function validateRelativeProjectPath(inputPath) {
    const relPath = toPosixPath(String(inputPath || '').trim()).replace(/^\/+/, '');
    if (!relPath) {
      throw new Error('path is required');
    }
    const absPath = path.resolve(projectRoot, relPath);
    if (!isPathInside(projectRoot, absPath)) {
      throw new Error('path must be inside the project root');
    }
    return { relPath, absPath };
  }

  async function rescanHarness() {
    const now = new Date().toISOString();
    const previousHarness = readJSONObject(projectHarnessPath) || {};
    const documents = discoverProjectDocuments(now);
    const harness = buildHarness(documents, previousHarness, now);
    const documentIndex = {
      version: 1,
      project_root: projectRoot,
      scanned_at: now,
      documents,
    };

    await writeJSON(projectHarnessPath, harness);
    await writeJSON(projectDocumentIndexPath, documentIndex);

    return { harness, documentIndex };
  }

  async function ensureHarnessState() {
    const harness = readJSONObject(projectHarnessPath);
    const documentIndex = readJSONObject(projectDocumentIndexPath);
    if (harness && documentIndex && Array.isArray(documentIndex.documents)) {
      return { harness, documentIndex };
    }
    return rescanHarness();
  }

  function readDocumentIndex() {
    const documentIndex = readJSONObject(projectDocumentIndexPath);
    if (!documentIndex || !Array.isArray(documentIndex.documents)) {
      return {
        version: 1,
        project_root: projectRoot,
        scanned_at: null,
        documents: [],
      };
    }
    return documentIndex;
  }

  function sourcePathForDocument(docPath) {
    return docPath.includes('/') ? docPath.split('/')[0] : '.';
  }

  function filterDocumentsByHarness(documents, harness) {
    const sources = Array.isArray(harness?.sources) ? harness.sources : [];
    const sourceByPath = new Map(sources.map((source) => [source.path, source]));
    return documents.filter((doc) => {
      const sourcePath = sourcePathForDocument(doc.path);
      const source = sourceByPath.get(doc.path) || sourceByPath.get(sourcePath);
      return !source || source.enabled !== false;
    });
  }

  async function mergeDocumentsIntoIndex(documentsToMerge, now) {
    const current = readDocumentIndex();
    const byPath = new Map((current.documents || []).map((doc) => [doc.path, doc]));
    for (const doc of documentsToMerge) {
      byPath.set(doc.path, doc);
    }
    const nextIndex = {
      ...current,
      version: 1,
      project_root: projectRoot,
      scanned_at: now,
      documents: Array.from(byPath.values()).sort((a, b) => {
        if (a.kind !== b.kind) return a.kind.localeCompare(b.kind);
        return a.path.localeCompare(b.path);
      }),
    };
    await writeJSON(projectDocumentIndexPath, nextIndex);
    return nextIndex;
  }

  ensureHarnessState().catch((err) => {
    console.error('Error initializing project harness:', err.message);
  });

  // Project config
  app.get('/api/project', (req, res) => {
    try {
      res.json(readProjectConfig());
    } catch (err) {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message } });
    }
  });

  app.put('/api/project', async (req, res) => {
    try {
      const current = readProjectConfig();
      const next = { ...current, ...req.body };
      await writeJSON(projectConfigPath, next);
      broadcast('project_updated', next);
      res.json(next);
    } catch (err) {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message } });
    }
  });

  // V4: Project harness and external document discovery
  app.get('/api/harness', async (req, res) => {
    try {
      const { harness, documentIndex } = await ensureHarnessState();
      res.json({
        harness,
        document_index: summarizeDocumentIndex(documentIndex),
      });
    } catch (err) {
      console.error('Error reading harness:', err);
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message } });
    }
  });

  app.post('/api/harness/rescan', async (req, res) => {
    try {
      const { harness, documentIndex } = await rescanHarness();
      broadcast('harness_rescanned', {
        total: documentIndex.documents.length,
        scanned_at: documentIndex.scanned_at,
      });
      res.json({
        harness,
        document_index: summarizeDocumentIndex(documentIndex),
      });
    } catch (err) {
      console.error('Error rescanning harness:', err);
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message } });
    }
  });

  app.post('/api/harness/sources', async (req, res) => {
    try {
      const { relPath, absPath } = validateRelativeProjectPath(req.body.path);
      const now = new Date().toISOString();
      const { harness, documentIndex } = await ensureHarnessState();
      const stat = fs.existsSync(absPath) ? fs.statSync(absPath) : null;
      const manualDocs = new Map();
      if (stat?.isFile() && isDocumentFileName(path.basename(absPath))) {
        addDocument(manualDocs, absPath, now);
      } else if (stat?.isDirectory()) {
        walkDocumentDirectory(absPath, relPath, 1, manualDocs, now);
      }
      const nextDocumentIndex = manualDocs.size > 0
        ? await mergeDocumentsIntoIndex(Array.from(manualDocs.values()), now)
        : documentIndex;
      const nextSource = {
        id: stableId('src', relPath),
        path: relPath,
        title: req.body.title || relPath,
        kind: req.body.kind || sourceKindForPath(relPath),
        source: 'external',
        writable: stat ? hasWriteAccess(absPath) : false,
        document_count: nextDocumentIndex.documents.filter((doc) => doc.path === relPath || doc.path.startsWith(`${relPath}/`)).length,
        enabled: true,
        manual: true,
        log_target: !!req.body.log_target,
      };
      const sources = (harness.sources || []).filter((source) => source.path !== relPath);
      sources.push(nextSource);
      const nextHarness = await writeHarness({
        ...harness,
        sources,
        transparency_target: nextSource.log_target ? relPath : harness.transparency_target || null,
        updated_at: now,
      });
      broadcast('harness_updated', nextHarness);
      res.status(201).json({ harness: nextHarness, source: nextSource, document_index: summarizeDocumentIndex(nextDocumentIndex) });
    } catch (err) {
      res.status(400).json({ error: { code: 'INVALID_REQUEST', message: err.message } });
    }
  });

  app.put('/api/harness/sources/:id', async (req, res) => {
    try {
      const { harness } = await ensureHarnessState();
      let updatedSource = null;
      const sources = (harness.sources || []).map((source) => {
        if (source.id !== req.params.id) return source;
        updatedSource = {
          ...source,
          title: req.body.title ?? source.title,
          kind: req.body.kind ?? source.kind,
          enabled: req.body.enabled === undefined ? source.enabled !== false : !!req.body.enabled,
          log_target: req.body.log_target === undefined ? !!source.log_target : !!req.body.log_target,
        };
        return updatedSource;
      });
      if (!updatedSource) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Harness source not found' } });
      }
      const nextSources = sources.map((source) => ({
        ...source,
        log_target: updatedSource.log_target ? source.id === updatedSource.id : (source.id === updatedSource.id ? false : source.log_target),
      }));
      const nextHarness = await writeHarness({
        ...harness,
        sources: nextSources,
        transparency_target: updatedSource.log_target
          ? updatedSource.path
          : (harness.transparency_target === updatedSource.path ? null : harness.transparency_target),
      });
      broadcast('harness_updated', nextHarness);
      res.json({ harness: nextHarness, source: updatedSource });
    } catch (err) {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message } });
    }
  });

  app.delete('/api/harness/sources/:id', async (req, res) => {
    try {
      const { harness } = await ensureHarnessState();
      const existing = (harness.sources || []).find((source) => source.id === req.params.id);
      if (!existing) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Harness source not found' } });
      }
      const sources = (harness.sources || []).map((source) => (
        source.id === req.params.id
          ? { ...source, enabled: false, log_target: false }
          : source
      ));
      const nextHarness = await writeHarness({
        ...harness,
        sources,
        transparency_target: harness.transparency_target === existing.path ? null : harness.transparency_target,
      });
      broadcast('harness_updated', nextHarness);
      res.json({ harness: nextHarness, source: { ...existing, enabled: false, log_target: false } });
    } catch (err) {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message } });
    }
  });

  app.get('/api/documents', async (req, res) => {
    try {
      await ensureHarnessState();
      const { harness } = readHarnessState();
      let { documents, scanned_at: scannedAt } = readDocumentIndex();
      documents = filterDocumentsByHarness(documents, harness);
      const { kind, search, limit, offset } = req.query;

      if (kind) documents = documents.filter((doc) => doc.kind === kind);
      if (search) {
        const q = String(search).toLowerCase();
        documents = documents.filter((doc) => (
          doc.title.toLowerCase().includes(q)
          || doc.path.toLowerCase().includes(q)
          || doc.kind.toLowerCase().includes(q)
        ));
      }

      const total = documents.length;
      const off = parseInt(offset, 10) || 0;
      const lim = parseInt(limit, 10) || 100;

      res.json({
        documents: documents.slice(off, off + lim),
        total,
        scanned_at: scannedAt,
      });
    } catch (err) {
      console.error('Error listing documents:', err);
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message } });
    }
  });

  app.get('/api/documents/:id', async (req, res) => {
    try {
      await ensureHarnessState();
      const { documents } = readDocumentIndex();
      const document = documents.find((doc) => doc.id === req.params.id);

      if (!document) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Document not found' } });
      }

      const absPath = path.resolve(projectRoot, document.path);
      if (!isPathInside(projectRoot, absPath)) {
        return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Document path is outside project root' } });
      }

      const stat = fs.statSync(absPath);
      const freshDocument = {
        ...document,
        size: stat.size,
        updated_at: stat.mtime.toISOString(),
        writable: hasWriteAccess(absPath),
      };

      if (stat.size > MAX_DOCUMENT_BYTES) {
        return res.json({
          document: freshDocument,
          content: '',
          truncated: true,
          message: `Document exceeds ${MAX_DOCUMENT_BYTES} bytes and was not loaded.`,
        });
      }

      res.json({
        document: freshDocument,
        content: fs.readFileSync(absPath, 'utf8'),
        truncated: false,
      });
    } catch (err) {
      console.error('Error reading document:', err);
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message } });
    }
  });

  async function updateReportFeedbackMirror(feedback) {
    const reportId = feedback?.report_id || feedback?.source?.report_id;
    if (!reportId) return;
    const feedbackPath = path.join(projectReportsPath, reportId, 'feedback.json');
    if (!fs.existsSync(feedbackPath)) return;
    await updateJSON(feedbackPath, (items) => items.map((item) => (
      item.id === feedback.id ? { ...item, ...feedback } : item
    )), []);
  }

  function shortLogText(value, max = 60) {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    if (text.length <= max) return text;
    return `${text.slice(0, max - 1)}...`;
  }

  // V3: Project-level feedback pool
  app.get('/api/feedback', (req, res) => {
    try {
      const items = readJSONArray(projectFeedbackPath);
      const { status } = req.query;
      const filtered = status ? items.filter((f) => f.status === status) : items;
      res.json({ feedbacks: filtered, total: items.length });
    } catch (err) {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message } });
    }
  });

  app.post('/api/feedback', async (req, res) => {
    try {
      const { content, source, author } = req.body;
      if (!content) {
        return res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'content is required' } });
      }
      const now = new Date().toISOString();
      const feedback = {
        id: generateId('fb'),
        status: 'tracked',
        source: source || {},
        content,
        author: author || 'user',
        createdAt: now,
        updatedAt: now,
      };
      await updateJSON(projectFeedbackPath, (items) => [...items, feedback], []);
      await appendLogEntry({
        type: 'auto',
        event: 'feedback_created',
        title: `记录反馈：${shortLogText(feedback.content)}`,
        content: '用户提交了一条项目级反馈，状态为 tracked。',
        tags: ['feedback'],
        createdAt: now,
      });
      broadcast('feedback_updated', { action: 'created', feedback });
      res.status(201).json(feedback);
    } catch (err) {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message } });
    }
  });

  app.post('/api/feedback/:id/resolve', async (req, res) => {
    try {
      const { changeRecord } = req.body || {};
      const now = new Date().toISOString();
      let resolved = null;
      await updateJSON(projectFeedbackPath, (items) => items.map((f) => {
        if (f.id === req.params.id) {
          resolved = { ...f, status: 'addressed', changeRecord: changeRecord || f.changeRecord, updatedAt: now };
          return resolved;
        }
        return f;
      }), []);
      if (!resolved) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Feedback not found' } });
      }
      await updateReportFeedbackMirror(resolved);
      await appendLogEntry({
        type: 'auto',
        event: 'feedback_addressed',
        title: `处理反馈：${shortLogText(resolved.content)}`,
        content: changeRecord?.change_summary || changeRecord?.changeSummary || '反馈已标记为 addressed。',
        tags: ['feedback'],
        createdAt: now,
      });
      broadcast('feedback_updated', { action: 'resolved', feedback: resolved });
      res.json(resolved);
    } catch (err) {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message } });
    }
  });

  app.post('/api/feedback/:id/confirm', async (req, res) => {
    try {
      const now = new Date().toISOString();
      let confirmed = null;
      await updateJSON(projectFeedbackPath, (items) => items.map((f) => {
        if (f.id === req.params.id) {
          confirmed = {
            ...f,
            status: 'confirmed',
            changeRecord: { ...(f.changeRecord || {}), confirmedAt: now },
            updatedAt: now,
          };
          return confirmed;
        }
        return f;
      }), []);
      if (!confirmed) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Feedback not found' } });
      }
      await updateReportFeedbackMirror(confirmed);
      await appendLogEntry({
        type: 'auto',
        event: 'feedback_confirmed',
        title: `确认反馈：${shortLogText(confirmed.content)}`,
        content: '用户已确认这条反馈的处理结果。',
        tags: ['feedback'],
        createdAt: now,
      });
      broadcast('feedback_updated', { action: 'confirmed', feedback: confirmed });
      res.json(confirmed);
    } catch (err) {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message } });
    }
  });

  app.post('/api/feedback/:id/archive', async (req, res) => {
    try {
      const now = new Date().toISOString();
      let archived = null;
      await updateJSON(projectFeedbackPath, (items) => items.map((f) => {
        if (f.id === req.params.id) {
          archived = {
            ...f,
            status: 'archived',
            archived_at: now,
            updated_at: now,
            updatedAt: now,
          };
          return archived;
        }
        return f;
      }), []);
      if (!archived) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Feedback not found' } });
      }
      await updateReportFeedbackMirror(archived);
      await appendLogEntry({
        type: 'auto',
        event: 'feedback_archived',
        title: `归档反馈：${shortLogText(archived.content)}`,
        content: '反馈已归档。',
        tags: ['feedback'],
        createdAt: now,
      });
      broadcast('feedback_updated', { action: 'archived', feedback: archived });
      res.json(archived);
    } catch (err) {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message } });
    }
  });

  function renderLogMarkdown(log) {
    const lines = [
      '',
      `## ${log.title || log.event || 'Visual Delivery Log'}`,
      '',
      `- Time: ${log.createdAt}`,
      `- Type: ${log.type || 'manual'}`,
    ];
    if (log.event) lines.push(`- Event: ${log.event}`);
    if (log.reportId) lines.push(`- Report: ${log.reportId}`);
    if (Array.isArray(log.tags) && log.tags.length > 0) lines.push(`- Tags: ${log.tags.join(', ')}`);
    if (log.content) {
      lines.push('', String(log.content));
    }
    lines.push('');
    return lines.join('\n');
  }

  function findExternalLogTarget() {
    const harness = readJSONObject(projectHarnessPath);
    const documentIndex = readDocumentIndex();
    const enabledSources = Array.isArray(harness?.sources)
      ? harness.sources.filter((source) => source.enabled !== false)
      : [];
    const targetPath = harness?.transparency_target || enabledSources.find((source) => source.log_target)?.path;
    const docs = documentIndex.documents || [];

    const candidates = [];
    if (targetPath) {
      candidates.push(...docs.filter((doc) => doc.writable && (doc.path === targetPath || doc.path.startsWith(`${targetPath}/`))));
    }
    candidates.push(...docs.filter((doc) => doc.writable && (doc.kind === 'work_log' || doc.kind === 'project_memory')));
    candidates.sort((a, b) => {
      const score = (doc) => (doc.kind === 'work_log' ? 0 : 1) + (doc.path.endsWith('.md') ? 0 : 2);
      return score(a) - score(b);
    });

    return candidates[0] || null;
  }

  async function writeTransparencyLog(log) {
    const externalTarget = findExternalLogTarget();
    if (!externalTarget) {
      return { strategy: 'managed', path: 'logs.json' };
    }

    const absPath = path.resolve(projectRoot, externalTarget.path);
    if (!isPathInside(projectRoot, absPath) || !hasWriteAccess(absPath)) {
      return { strategy: 'managed', path: 'logs.json' };
    }

    fs.appendFileSync(absPath, renderLogMarkdown(log), 'utf8');
    return { strategy: 'external', path: externalTarget.path };
  }

  // V3: Project logs
  app.get('/api/logs', (req, res) => {
    try {
      let logs = readJSONArray(projectLogsPath);
      const { type, search, limit, offset } = req.query;
      if (type) logs = logs.filter((l) => l.type === type);
      if (search) {
        const q = search.toLowerCase();
        logs = logs.filter((l) => l.title.toLowerCase().includes(q));
      }
      logs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      const total = logs.length;
      const off = parseInt(offset, 10) || 0;
      const lim = parseInt(limit, 10) || 50;
      res.json({ logs: logs.slice(off, off + lim), total });
    } catch (err) {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message } });
    }
  });

  app.post('/api/logs', async (req, res) => {
    try {
      const now = new Date().toISOString();
      const log = {
        id: generateId('log'),
        type: req.body.type || 'manual',
        title: req.body.title || '',
        event: req.body.event || null,
        reportId: req.body.reportId || null,
        content: req.body.content || '',
        tags: req.body.tags || [],
        createdAt: now,
      };
      const savedLog = await appendLogEntry(log);
      res.status(201).json(savedLog);
    } catch (err) {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message } });
    }
  });

  // V4: Reports (canonical project-scoped report model)
  const REPORT_PRESENTATIONS = new Set(['document_report', 'canvas_workspace']);
  const REPORT_PRESENTATION_ALIASES = new Map([
    ['document', 'document_report'],
    ['report_template', 'document_report'],
    ['table', 'document_report'],
    ['slides', 'document_report'],
    ['canvas', 'canvas_workspace'],
  ]);
  const REPORT_STRUCTURES = new Set(['standard', 'standard-report', 'complex-review']);

  function reportDir(reportId) {
    return path.join(projectReportsPath, reportId);
  }

  function reportFilePath(reportId) {
    return path.join(reportDir(reportId), 'report.json');
  }

  function legacyReportFilePath(reportId) {
    return path.join(projectReportsPath, `${reportId}.json`);
  }

  function reportFeedbackPath(reportId) {
    return path.join(reportDir(reportId), 'feedback.json');
  }

  function reportDraftsPath(reportId) {
    return path.join(reportDir(reportId), 'drafts.json');
  }

  function normalizeReportStructure(structure) {
    if (!structure) return 'standard-report';
    if (structure === 'standard') return 'standard-report';
    return REPORT_STRUCTURES.has(structure) ? structure : 'standard-report';
  }

  function normalizeReportPresentation(presentation) {
    const key = String(presentation || '').trim();
    if (REPORT_PRESENTATIONS.has(key)) return key;
    if (REPORT_PRESENTATION_ALIASES.has(key)) return REPORT_PRESENTATION_ALIASES.get(key);
    return 'document_report';
  }

  function reportSection(id, title, presentation, artifactTitle, narrative = '') {
    const normalizedPresentation = normalizeReportPresentation(presentation);
    return {
      id,
      title,
      status: 'draft',
      narrative,
      presentation: normalizedPresentation,
      artifact: createTemplateArtifact(normalizedPresentation, artifactTitle || title),
      feedback_targets: [],
    };
  }

  function reportTimestamp(report, key) {
    return report?.[key] || report?.[key.replace('_at', 'At')] || null;
  }

  function defaultRoutingReason(structure, presentation) {
    const normalizedStructure = normalizeReportStructure(structure);
    const normalizedPresentation = normalizeReportPresentation(presentation);
    if (normalizedPresentation === 'canvas_workspace') {
      return 'Canvas workspace is a persistent project collaboration space. Reuse the active related canvas unless the user asks for a new one or the task is clearly unrelated.';
    }
    if (normalizedStructure === 'complex-review') {
      return 'Document report uses one interactive document surface. Tables, lists, and decisions live inside the document body instead of becoming separate table/slides artifacts.';
    }
    return 'Document report uses an interactive document surface for the delivery content.';
  }

  function createTemplateArtifact(presentation, title) {
    const legacyPresentation = String(presentation || '').trim();
    if (legacyPresentation === 'table') {
      return {
        type: 'table',
        columns: [
          { key: 'item', label: '项目' },
          { key: 'summary', label: '说明' },
          { key: 'status', label: '状态' },
        ],
        rows: [
          { id: 'row-1', item: title || '待补充项目', summary: '由 agent 填充数据和证据', status: 'draft' },
          { id: 'row-2', item: '待确认事项', summary: '记录需要用户选择、批准或补充的信息', status: 'pending' },
        ],
        views: [
          { id: 'draft', label: '草稿', filter: { status: 'draft' } },
          { id: 'pending', label: '待确认', filter: { status: 'pending' } },
        ],
        feedback_targets: ['row-1'],
      };
    }
    if (legacyPresentation === 'canvas') {
      return {
        type: 'canvas',
        mode: 'tldraw',
        tldraw_snapshot: null,
        assets: [],
        canvas_regions: [],
        seed_nodes: [],
        node_feedback_targets: [],
        prompt: '在无限画布中放置方案、素材、批注和待决策点。',
      };
    }
    if (legacyPresentation === 'slides') {
      return {
        type: 'slides',
        slides: [
          {
            id: 'slide-1',
            title: title || '汇报页',
            body: '由 agent 补充本页结论、证据和需要用户确认的问题。',
            decision: {
              id: 'main-decision',
              prompt: '这页内容是否符合当前对齐方向？',
              status: 'needs_decision',
            },
            feedback_targets: ['slide-1'],
          },
        ],
      };
    }
    const normalizedPresentation = normalizeReportPresentation(presentation);
    if (normalizedPresentation === 'canvas_workspace') {
      return {
        type: 'document',
        body: `# ${title || '画布协作空间'}\n\n这个任务适合进入项目级 canvas_workspace。请在画布页持续沉淀 moodboard、图片标注、结构图、思维导图和设计决策。\n`,
        feedback_targets: ['document-body'],
      };
    }
    return {
      type: 'document',
      body: `# ${title || '汇报内容'}\n\n由 agent 补充产出、解释、证据和待决策点。\n`,
      feedback_targets: ['document-body'],
    };
  }

  function createTemplateSections(structure, presentation, title) {
    const normalizedStructure = normalizeReportStructure(structure);
    const normalizedPresentation = normalizeReportPresentation(presentation);
    if (normalizedStructure !== 'complex-review') {
      return [
        reportSection(generateId('sec'), '交付汇报', normalizedPresentation, title),
      ];
    }

    const sections = [
      reportSection(generateId('sec'), '背景与目标', normalizedPresentation, '背景与目标', '说明任务背景、用户目标、约束和本次评审范围。'),
      reportSection(generateId('sec'), '核心交付内容', normalizedPresentation, title || '核心交付内容', '呈现 agent 的产出、解释、证据和关键判断。'),
      reportSection(generateId('sec'), '决策与下一步', normalizedPresentation, '决策与下一步', '沉淀待确认事项、风险、取舍和后续动作。'),
    ];
    return sections;
  }

  function createReportContent({ title, structure, presentation, content, sections }) {
    const normalizedStructure = normalizeReportStructure(structure);
    const normalizedPresentation = normalizeReportPresentation(presentation);
    if (content && typeof content === 'object') {
      const contentType = content.type === 'report_template' ? 'document_report' : (content.type || 'document_report');
      return {
        ...content,
        type: contentType,
        surface_type: content.surface_type || normalizedPresentation,
        structure: content.structure || normalizedStructure,
        presentation: content.presentation || normalizedPresentation,
        routing_reason: content.routing_reason || defaultRoutingReason(normalizedStructure, normalizedPresentation),
        sections: sections || content.sections || createTemplateSections(normalizedStructure, normalizedPresentation, title),
      };
    }
    return {
      type: 'document_report',
      surface_type: normalizedPresentation,
      version: 1,
      structure: normalizedStructure,
      presentation: normalizedPresentation,
      routing_reason: defaultRoutingReason(normalizedStructure, normalizedPresentation),
      change_records: [],
      sections: sections || createTemplateSections(normalizedStructure, normalizedPresentation, title),
    };
  }

  function collectRecentChangeRecords(limit = 6) {
    return readJSONArray(projectFeedbackPath)
      .filter((feedback) => {
        const record = feedback.changeRecord || feedback.change_record;
        return record && (feedback.status === 'addressed' || feedback.status === 'confirmed');
      })
      .sort((a, b) => new Date(b.updated_at || b.updatedAt || b.created_at || b.createdAt).getTime()
        - new Date(a.updated_at || a.updatedAt || a.created_at || a.createdAt).getTime())
      .slice(0, limit)
      .map((feedback) => ({
        feedback_id: feedback.id,
        report_id: feedback.report_id || feedback.source?.report_id || null,
        report_title: feedback.source?.report_title || '',
        content: feedback.content || '',
        status: feedback.status,
        change_record: feedback.change_record || feedback.changeRecord,
        updated_at: feedback.updated_at || feedback.updatedAt || feedback.created_at || feedback.createdAt,
      }));
  }

  function normalizeReportRecord(report) {
    if (!report || typeof report !== 'object') return null;
    const createdAt = reportTimestamp(report, 'created_at') || new Date().toISOString();
    const updatedAt = reportTimestamp(report, 'updated_at') || createdAt;
    const structure = normalizeReportStructure(report.structure || report.content?.structure);
    const presentation = normalizeReportPresentation(report.presentation || report.content?.presentation);
    const content = report.content || createReportContent({
      title: report.title,
      structure,
      presentation,
      sections: report.sections,
    });
    const sections = content.sections || report.sections || [];
    return {
      ...report,
      id: report.id,
      title: report.title || '未命名汇报',
      status: report.status || 'draft',
      structure,
      presentation,
      content,
      sections,
      created_at: createdAt,
      updated_at: updatedAt,
      createdAt,
      updatedAt,
      section_count: sections.length,
      completed_section_count: sections.filter((section) => section.status === 'completed').length,
    };
  }

  function readCanonicalReport(reportId) {
    const stored = readJSONObject(reportFilePath(reportId)) || readJSONObject(legacyReportFilePath(reportId));
    return normalizeReportRecord(stored);
  }

  function deliveryIndexToReport(entry) {
    if (!entry) return null;
    return normalizeReportRecord({
      ...entry,
      source: 'legacy_delivery',
      structure: entry.metadata?.structure || 'standard-report',
      presentation: entry.metadata?.presentation || 'document',
      content: null,
    });
  }

  function deliveryToReport(delivery) {
    if (!delivery) return null;
    return normalizeReportRecord({
      ...delivery,
      source: 'legacy_delivery',
      structure: delivery.metadata?.structure || 'standard-report',
      presentation: delivery.metadata?.presentation || 'document',
      content: delivery.content,
      feedback: delivery.feedback,
      drafts: delivery.drafts,
      pending_feedback_count: delivery.pending_feedback_count,
    });
  }

  function listCanonicalReports() {
    if (!fs.existsSync(projectReportsPath)) return [];
    const reports = [];
    for (const entry of fs.readdirSync(projectReportsPath, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        const report = readCanonicalReport(entry.name);
        if (report) reports.push(report);
      } else if (entry.isFile() && entry.name.endsWith('.json')) {
        const reportId = entry.name.replace(/\.json$/, '');
        if (!fs.existsSync(reportFilePath(reportId))) {
          const report = readCanonicalReport(reportId);
          if (report) reports.push(report);
        }
      }
    }
    return reports;
  }

  function readReportRecord(reportId) {
    const canonical = readCanonicalReport(reportId);
    if (canonical) return canonical;
    return deliveryToReport(hydrateDelivery(reportId));
  }

  function readReportFeedback(reportId) {
    const report = readCanonicalReport(reportId);
    if (report) return readJSONArray(reportFeedbackPath(reportId));
    return readDeliveryFeedback(reportId);
  }

  function readReportDrafts(reportId) {
    const report = readCanonicalReport(reportId);
    if (report) return readJSONArray(reportDraftsPath(reportId));
    return readDeliveryDrafts(reportId);
  }

  async function writeReportRecord(report) {
    const normalized = normalizeReportRecord(report);
    fs.mkdirSync(reportDir(normalized.id), { recursive: true });
    await writeJSON(reportFilePath(normalized.id), normalized);
    if (!fs.existsSync(reportFeedbackPath(normalized.id))) await writeJSON(reportFeedbackPath(normalized.id), []);
    if (!fs.existsSync(reportDraftsPath(normalized.id))) await writeJSON(reportDraftsPath(normalized.id), []);
    return normalized;
  }

  async function updateReportRecord(reportId, updater) {
    const current = readCanonicalReport(reportId);
    if (!current) return null;
    const updated = normalizeReportRecord(updater(current));
    updated.updated_at = new Date().toISOString();
    updated.updatedAt = updated.updated_at;
    await writeReportRecord(updated);
    return updated;
  }

  function publicReport(report, { includeDetail = false } = {}) {
    const normalized = normalizeReportRecord(report);
    if (!normalized) return null;
    const feedback = includeDetail ? readReportFeedback(normalized.id) : [];
    const drafts = includeDetail ? readReportDrafts(normalized.id) : [];
    return {
      ...normalized,
      feedback,
      drafts,
      pending_feedback_count: feedback.filter((item) => item.handled === false || item.status === 'tracked').length,
    };
  }

  async function appendLogEntry(entry) {
    const log = {
      ...entry,
      id: entry.id || generateId('log'),
      createdAt: entry.createdAt || new Date().toISOString(),
    };
    if (!log.transparency) {
      log.transparency = await writeTransparencyLog(log);
    }
    await updateJSON(projectLogsPath, (items) => [...items, log], []);
    broadcast('log_created', log);
    return log;
  }

  function feedbackContentFromItem(item) {
    if (item.content) return item.content;
    if (item.payload?.note) return item.payload.note;
    if (item.payload?.label) return item.payload.label;
    if (item.payload?.quote) return `选中文本：${item.payload.quote}`;
    if (item.payload?.action) return `操作反馈：${item.payload.label || item.payload.action}`;
    return '用户提交了反馈';
  }

  function createReportFeedbackItem(report, item) {
    const now = new Date().toISOString();
    return {
      id: generateId('fb'),
      report_id: report.id,
      kind: item.kind || 'direct',
      payload: item.payload || {},
      target: item.target || item.payload?.target || {},
      status: 'tracked',
      handled: false,
      content: feedbackContentFromItem(item),
      author: item.author || 'user',
      source: {
        type: 'report',
        report_id: report.id,
        report_title: report.title,
        draft_id: item.id || null,
      },
      created_at: now,
      updated_at: now,
      createdAt: now,
      updatedAt: now,
    };
  }

  async function upsertProjectFeedback(feedback) {
    await updateJSON(projectFeedbackPath, (items) => {
      const idx = items.findIndex((item) => item.id === feedback.id);
      if (idx >= 0) {
        items[idx] = { ...items[idx], ...feedback };
        return items;
      }
      return [...items, feedback];
    }, []);
  }

  async function updateProjectFeedbackItem(feedbackId, updater) {
    let updated = null;
    await updateJSON(projectFeedbackPath, (items) => items.map((item) => {
      if (item.id !== feedbackId) return item;
      updated = updater(item);
      return updated;
    }), []);
    return updated;
  }

  async function recalcReportStatus(reportId) {
    const canonical = readCanonicalReport(reportId);
    if (!canonical) {
      return recalcDeliveryStatus(reportId);
    }
    const feedbacks = readReportFeedback(reportId);
    const hasPending = feedbacks.some((item) => item.handled === false || item.status === 'tracked');
    const nextStatus = hasPending ? 'pending_feedback' : (canonical.status === 'pending_feedback' ? 'normal' : canonical.status);
    return updateReportRecord(reportId, (report) => ({ ...report, status: nextStatus }));
  }

  // V4: Canvas workspaces (persistent project collaboration spaces)
  const CANVAS_WORKSPACE_STATUSES = new Set(['active', 'archived']);

  function canvasIndexPath() {
    return path.join(projectCanvasWorkspacesPath, 'index.json');
  }

  function canvasWorkspaceDir(workspaceId) {
    return path.join(projectCanvasWorkspacesPath, workspaceId);
  }

  function canvasWorkspaceFile(workspaceId) {
    return path.join(canvasWorkspaceDir(workspaceId), 'workspace.json');
  }

  function canvasSnapshotFile(workspaceId) {
    return path.join(canvasWorkspaceDir(workspaceId), 'snapshot.json');
  }

  function canvasEventsFile(workspaceId) {
    return path.join(canvasWorkspaceDir(workspaceId), 'events.json');
  }

  function canvasFeedbackFile(workspaceId) {
    return path.join(canvasWorkspaceDir(workspaceId), 'feedback.json');
  }

  function canvasAssetsDir(workspaceId) {
    return path.join(canvasWorkspaceDir(workspaceId), 'assets');
  }

  function readCanvasIndex() {
    const stored = readJSONObject(canvasIndexPath());
    return {
      version: 1,
      active_workspace_id: stored?.active_workspace_id || null,
      workspaces: Array.isArray(stored?.workspaces) ? stored.workspaces : [],
      updated_at: stored?.updated_at || null,
    };
  }

  async function writeCanvasIndex(index) {
    const next = {
      version: 1,
      active_workspace_id: index.active_workspace_id || null,
      workspaces: Array.isArray(index.workspaces) ? index.workspaces : [],
      updated_at: new Date().toISOString(),
    };
    await writeJSON(canvasIndexPath(), next);
    return next;
  }

  function defaultCanvasSemanticIndex() {
    return {
      version: 2,
      zones: [],
      sections: [],
      nodes: [],
      assets: [],
      annotations: [],
      completion_requests: [],
      scaffold_instances: [],
      widget_instances: [],
      artifact_links: [],
      layout_reviews: [],
      relationships: [],
      edit_summary: null,
      updated_at: null,
    };
  }

  function normalizeCanvasSemanticIndex(index) {
    const base = defaultCanvasSemanticIndex();
    if (!index || typeof index !== 'object') return base;
    return {
      ...base,
      ...index,
      version: index.version || base.version,
      zones: Array.isArray(index.zones) ? index.zones : base.zones,
      sections: Array.isArray(index.sections) ? index.sections : [],
      nodes: Array.isArray(index.nodes) ? index.nodes : [],
      assets: Array.isArray(index.assets) ? index.assets : [],
      annotations: Array.isArray(index.annotations) ? index.annotations : [],
      completion_requests: Array.isArray(index.completion_requests) ? index.completion_requests : [],
      scaffold_instances: Array.isArray(index.scaffold_instances) ? index.scaffold_instances : [],
      widget_instances: Array.isArray(index.widget_instances) ? index.widget_instances : [],
      artifact_links: Array.isArray(index.artifact_links) ? index.artifact_links : [],
      layout_reviews: Array.isArray(index.layout_reviews) ? index.layout_reviews : [],
      relationships: Array.isArray(index.relationships) ? index.relationships : [],
      edit_summary: index.edit_summary && typeof index.edit_summary === 'object' ? index.edit_summary : null,
    };
  }

  function mergeCanvasLayoutReviews(...reviewLists) {
    const byId = new Map();
    for (const list of reviewLists) {
      const items = Array.isArray(list) ? list : (list ? [list] : []);
      for (const review of items) {
        if (review && typeof review === 'object' && review.id) {
          byId.set(review.id, review);
        }
      }
    }
    return Array.from(byId.values()).slice(-20);
  }

  function boundsChanged(prev = {}, next = {}) {
    return ['x', 'y', 'w', 'h'].some((key) => Math.round(Number(prev?.[key] || 0)) !== Math.round(Number(next?.[key] || 0)));
  }

  function summarizeSemanticDiff(previousIndex, nextIndex) {
    const previous = normalizeCanvasSemanticIndex(previousIndex);
    const next = normalizeCanvasSemanticIndex(nextIndex);
    const previousNodes = new Map((previous.nodes || []).map((node) => [node.shape_id, node]));
    const nextNodes = new Map((next.nodes || []).map((node) => [node.shape_id, node]));
    const added = [];
    const modified = [];
    const moved_or_resized = [];
    const deleted = [];

    for (const [shapeId, node] of nextNodes.entries()) {
      const before = previousNodes.get(shapeId);
      if (!before) {
        added.push({
          shape_id: shapeId,
          kind: node.kind,
          title: node.title,
          authored_by: node.meta?.vd_created_by || node.meta?.vd_author || 'unknown',
        });
        continue;
      }
      const textChanged = (before.text || '') !== (node.text || '')
        || (before.title || '') !== (node.title || '')
        || before.kind !== node.kind
        || before.section_id !== node.section_id;
      const stateChanged = JSON.stringify(before.meta?.vd_widget_state || null)
        !== JSON.stringify(node.meta?.vd_widget_state || null);
      if (textChanged || stateChanged) {
        modified.push({
          shape_id: shapeId,
          kind: node.kind,
          title: node.title,
          authored_by: node.meta?.vd_last_edited_by || node.meta?.vd_created_by || 'unknown',
          changed: [
            textChanged ? 'content' : null,
            stateChanged ? 'widget_state' : null,
          ].filter(Boolean),
        });
      }
      if (boundsChanged(before.bounds || before, node.bounds || node)) {
        moved_or_resized.push({
          shape_id: shapeId,
          kind: node.kind,
          title: node.title,
        });
      }
    }

    for (const [shapeId, node] of previousNodes.entries()) {
      if (!nextNodes.has(shapeId)) {
        deleted.push({
          shape_id: shapeId,
          kind: node.kind,
          title: node.title,
        });
      }
    }

    return {
      version: 1,
      generated_at: new Date().toISOString(),
      previous_updated_at: previous.updated_at || null,
      next_updated_at: next.updated_at || null,
      counts: {
        added: added.length,
        modified: modified.length,
        moved_or_resized: moved_or_resized.length,
        deleted: deleted.length,
      },
      added,
      modified,
      moved_or_resized,
      deleted,
    };
  }

  function hasSemanticDiff(diff) {
    const counts = diff?.counts || {};
    return ['added', 'modified', 'moved_or_resized', 'deleted'].some((key) => Number(counts[key] || 0) > 0);
  }

  function normalizeCanvasWorkspace(workspace) {
    if (!workspace || typeof workspace !== 'object') return null;
    const now = new Date().toISOString();
    const createdAt = workspace.created_at || workspace.createdAt || now;
    const updatedAt = workspace.updated_at || workspace.updatedAt || createdAt;
    return {
      id: workspace.id,
      type: 'canvas_workspace',
      title: workspace.title || '未命名画布',
      purpose: workspace.purpose || '',
      status: CANVAS_WORKSPACE_STATUSES.has(workspace.status) ? workspace.status : 'active',
      tags: Array.isArray(workspace.tags) ? workspace.tags : [],
      context: workspace.context || {},
      source_task_id: workspace.source_task_id || workspace.context?.task_id || null,
      semantic_index: normalizeCanvasSemanticIndex(workspace.semantic_index),
      selection_policy: workspace.selection_policy || {
        default: 'reuse_related_active_workspace',
        create_when: [
          'user_explicitly_requests_new_canvas',
          'no_active_canvas_exists',
          'task_context_is_unrelated_to_existing_canvases',
          'existing_canvas_is_archived_or_too_crowded',
        ],
      },
      created_at: createdAt,
      updated_at: updatedAt,
      createdAt,
      updatedAt,
      last_used_at: workspace.last_used_at || workspace.lastUsedAt || updatedAt,
    };
  }

  function canvasWorkspaceSummary(workspace) {
    const normalized = normalizeCanvasWorkspace(workspace);
    if (!normalized) return null;
    return {
      id: normalized.id,
      type: normalized.type,
      title: normalized.title,
      purpose: normalized.purpose,
      status: normalized.status,
      tags: normalized.tags,
      context: normalized.context,
      source_task_id: normalized.source_task_id,
      created_at: normalized.created_at,
      updated_at: normalized.updated_at,
      last_used_at: normalized.last_used_at,
    };
  }

  function listCanvasWorkspaces() {
    const index = readCanvasIndex();
    const summaries = [];
    for (const entry of safeReadDir(projectCanvasWorkspacesPath)) {
      if (!entry.isDirectory()) continue;
      const workspace = normalizeCanvasWorkspace(readJSONObject(canvasWorkspaceFile(entry.name)));
      if (workspace) summaries.push(canvasWorkspaceSummary(workspace));
    }
    const byId = new Map(summaries.map((item) => [item.id, item]));
    for (const item of index.workspaces) {
      if (item?.id && !byId.has(item.id)) byId.set(item.id, item);
    }
    return Array.from(byId.values())
      .filter(Boolean)
      .sort((a, b) => new Date(b.last_used_at || b.updated_at || b.created_at).getTime()
        - new Date(a.last_used_at || a.updated_at || a.created_at).getTime());
  }

  async function upsertCanvasIndexEntry(workspace, { makeActive = false } = {}) {
    const summary = canvasWorkspaceSummary(workspace);
    const index = readCanvasIndex();
    const entries = index.workspaces.filter((item) => item.id !== summary.id);
    entries.push(summary);
    await writeCanvasIndex({
      ...index,
      active_workspace_id: makeActive ? summary.id : (index.active_workspace_id || summary.id),
      workspaces: entries.sort((a, b) => new Date(b.last_used_at || b.updated_at).getTime()
        - new Date(a.last_used_at || a.updated_at).getTime()),
    });
  }

  async function writeCanvasWorkspace(workspace, { makeActive = false } = {}) {
    const normalized = normalizeCanvasWorkspace(workspace);
    fs.mkdirSync(canvasWorkspaceDir(normalized.id), { recursive: true });
    fs.mkdirSync(canvasAssetsDir(normalized.id), { recursive: true });
    await writeJSON(canvasWorkspaceFile(normalized.id), normalized);
    if (!fs.existsSync(canvasSnapshotFile(normalized.id))) await writeJSON(canvasSnapshotFile(normalized.id), {});
    if (!fs.existsSync(canvasEventsFile(normalized.id))) await writeJSON(canvasEventsFile(normalized.id), []);
    if (!fs.existsSync(canvasFeedbackFile(normalized.id))) await writeJSON(canvasFeedbackFile(normalized.id), []);
    await upsertCanvasIndexEntry(normalized, { makeActive });
    return normalized;
  }

  function readCanvasWorkspace(workspaceId) {
    return normalizeCanvasWorkspace(readJSONObject(canvasWorkspaceFile(workspaceId)));
  }

  function readCanvasSnapshot(workspaceId) {
    return readJSONObject(canvasSnapshotFile(workspaceId)) || {};
  }

  function readCanvasEvents(workspaceId) {
    return readJSONArray(canvasEventsFile(workspaceId));
  }

  function readCanvasFeedback(workspaceId) {
    return readJSONArray(canvasFeedbackFile(workspaceId));
  }

  function openCanvasFeedback(workspaceId) {
    return readCanvasFeedback(workspaceId).filter((item) => item.handled === false || item.status === 'tracked');
  }

  function openCompletionRequests(workspace) {
    return (normalizeCanvasSemanticIndex(workspace?.semantic_index).completion_requests || [])
      .filter((item) => !item.status || item.status === 'open' || item.status === 'in_progress');
  }

  function publicCanvasWorkspace(workspace, { includeDetail = false } = {}) {
    const normalized = normalizeCanvasWorkspace(workspace);
    if (!normalized) return null;
    const detail = includeDetail
      ? {
        snapshot: readCanvasSnapshot(normalized.id),
        events: readCanvasEvents(normalized.id),
        feedback: readCanvasFeedback(normalized.id),
      }
      : {};
    return {
      ...normalized,
      ...detail,
      pending_feedback_count: includeDetail
        ? detail.feedback.filter((item) => item.handled === false || item.status === 'tracked').length
        : undefined,
    };
  }

  async function appendCanvasEvent(workspaceId, event = {}) {
    const now = new Date().toISOString();
    const item = {
      id: event.id || generateId('cwe'),
      type: event.type || 'workspace_event',
      actor: event.actor || 'agent',
      summary: event.summary || '',
      target: event.target || null,
      commands: Array.isArray(event.commands) ? event.commands : undefined,
      created_shape_ids: Array.isArray(event.created_shape_ids) ? event.created_shape_ids : undefined,
      mutated_shape_ids: Array.isArray(event.mutated_shape_ids) ? event.mutated_shape_ids : undefined,
      semantic_diff: event.semantic_diff && typeof event.semantic_diff === 'object' ? event.semantic_diff : undefined,
      meta: event.meta && typeof event.meta === 'object' ? event.meta : undefined,
      created_at: event.created_at || now,
      createdAt: event.createdAt || event.created_at || now,
    };
    await updateJSON(canvasEventsFile(workspaceId), (items) => [...items, item], []);
    return item;
  }

  function tokenizeCanvasQuery(value) {
    return String(value || '')
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((token) => token.length >= 2);
  }

  function scoreCanvasWorkspace(workspace, context = {}) {
    const tokens = tokenizeCanvasQuery([
      context.title,
      context.purpose,
      context.task,
      context.task_name,
      context.prompt,
      ...(Array.isArray(context.tags) ? context.tags : []),
    ].filter(Boolean).join(' '));
    const haystack = [
      workspace.title,
      workspace.purpose,
      workspace.source_task_id,
      ...(workspace.tags || []),
      JSON.stringify(workspace.context || {}),
    ].join(' ').toLowerCase();
    let score = 0;
    for (const token of tokens) {
      if (haystack.includes(token)) score += 2;
    }
    const index = readCanvasIndex();
    if (index.active_workspace_id === workspace.id) score += 5;
    if (workspace.status === 'active') score += 2;
    const lastUsed = new Date(workspace.last_used_at || workspace.updated_at || workspace.created_at).getTime();
    const ageHours = Number.isFinite(lastUsed) ? (Date.now() - lastUsed) / 3600000 : 9999;
    if (ageHours < 24) score += 2;
    if (ageHours < 168) score += 1;
    return score;
  }

  async function createCanvasWorkspace({ title, purpose, tags, context, source_task_id: sourceTaskId, make_active: makeActive }) {
    const now = new Date().toISOString();
    const workspace = await writeCanvasWorkspace({
      id: generateId('cw'),
      type: 'canvas_workspace',
      title: title || '协作画布',
      purpose: purpose || '',
      status: 'active',
      tags: Array.isArray(tags) ? tags : [],
      context: context || {},
      source_task_id: sourceTaskId || context?.task_id || null,
      semantic_index: defaultCanvasSemanticIndex(),
      created_at: now,
      updated_at: now,
      last_used_at: now,
    }, { makeActive: makeActive !== false });
    await appendCanvasEvent(workspace.id, {
      type: 'workspace_created',
      actor: 'agent',
      summary: '创建 canvas_workspace。',
    });
    return workspace;
  }

  const DEFAULT_SCAFFOLDS = [
    {
      id: 'scaffold_inspiration_wall',
      type: 'template',
      scope: 'project',
      title: '灵感墙',
      stage: 'exploration',
      description: '用于头脑风暴：包含主题区、灵感 sticky notes、聚类区和用户补充区。',
      agent_note: '当前处于探索阶段，我会先放一个灵感墙和一批启发 sticky notes，方便你删改、移动和继续扩展。',
      structure: [
        { kind: 'section', client_id: 'inspiration', title: '灵感墙', bounds: { x: 0, y: 0, w: 1180, h: 820 } },
      ],
      seed_content: [
        { kind: 'sticky_note', text: '机会点\n\n把模糊想法转成可操作的画布区域。', color: 'yellow', bounds: { x: 56, y: 300, w: 200, h: 200 } },
        { kind: 'sticky_note', text: '参考方向\n\n先给半成品，让用户直接改，而不是只给空模板。', color: 'yellow', bounds: { x: 288, y: 300, w: 200, h: 200 } },
        { kind: 'sticky_note', text: '待验证\n\n哪些内容应该进入正式 artifact？', color: 'yellow', bounds: { x: 520, y: 300, w: 200, h: 200 } },
        { kind: 'shape', text: '用户补充区\n\n把你的想法、素材或反例拖到这里。', color: 'green', bounds: { x: 56, y: 560, w: 520, h: 160 } },
        { kind: 'shape', text: '聚类 / 选择区\n\n把相近便签移动到一起，圈出值得继续展开的方向。', color: 'violet', bounds: { x: 608, y: 560, w: 520, h: 160 } },
      ],
      interaction_slots: [
        { title: '添加你的想法', bounds: { x: 80, y: 600, w: 400, h: 96 } },
      ],
      next_actions: ['补充 sticky notes', '聚类相近想法', '选择 3 个方向继续展开'],
    },
    {
      id: 'scaffold_definition_board',
      type: 'template',
      scope: 'project',
      title: '需求定义板',
      stage: 'definition',
      description: '用于把开放需求收束成目标、约束、用户、成功标准和待确认问题。',
      agent_note: '当前需要定义问题边界，我会放一张需求定义板，并预留用户确认与改写的位置。',
      structure: [
        { kind: 'section', client_id: 'definition', title: '需求定义', bounds: { x: 0, y: 0, w: 1180, h: 680 } },
      ],
      seed_content: [
        { kind: 'shape', text: '目标\n\n这次协作最终要帮助用户完成什么？', color: 'blue', bounds: { x: 48, y: 96, w: 240, h: 160 } },
        { kind: 'shape', text: '用户 / 场景\n\n谁会使用？在什么情境下使用？', color: 'green', bounds: { x: 324, y: 96, w: 240, h: 160 } },
        { kind: 'shape', text: '约束\n\n技术、时间、风格、数据边界。', color: 'orange', bounds: { x: 600, y: 96, w: 240, h: 160 } },
        { kind: 'shape', text: '成功标准\n\n怎样判断这次产出是好的？', color: 'violet', bounds: { x: 876, y: 96, w: 240, h: 160 } },
        { kind: 'sticky_note', text: '待确认：优先做 MVP 还是完整系统设计？', color: 'yellow', bounds: { x: 48, y: 340, w: 240, h: 140 } },
        { kind: 'sticky_note', text: '待确认：哪些内容必须进入第一版验收？', color: 'yellow', bounds: { x: 324, y: 340, w: 240, h: 140 } },
      ],
      interaction_slots: [
        { title: '用户改写目标', bounds: { x: 48, y: 520, w: 520, h: 96 } },
      ],
      next_actions: ['确认目标', '标记必须项', '生成实施计划'],
    },
    {
      id: 'widget_priority_picker',
      type: 'widget',
      scope: 'project',
      title: '优先级选择器',
      stage: 'review',
      description: '透明背景的轻量 HTML widget，用于让用户快速选择下一步优先级。',
      agent_note: '我会放一个可交互的优先级选择器，用户选择会作为 widget 状态和反馈进入上下文。',
      sizing: {
        mode: 'content_intrinsic',
        min_width: 260,
        max_width: 520,
        min_height: 140,
        max_height: 320,
      },
      state: {},
      input_schema: {},
      output_schema: {
        priority: 'string',
        note: 'string',
      },
      html: `<section style="display:inline-block;padding:12px;font-family:var(--vds-typography-font-family,system-ui,sans-serif);color:var(--vds-colors-text,#172033);background:transparent">
  <style>
    html,body{margin:0;background:transparent}
    .picker{display:inline-flex;flex-direction:column;gap:10px;min-width:260px;max-width:520px;padding:14px;border:1px solid rgba(124,58,237,.28);border-radius:8px;background:rgba(255,255,255,.86);box-shadow:0 8px 24px rgba(15,23,42,.12)}
    .title{font-size:14px;font-weight:700;line-height:1.3}
    .actions{display:flex;gap:8px;flex-wrap:wrap}
    button{min-height:32px;border:1px solid rgba(124,58,237,.32);border-radius:7px;background:#fff;color:#6d28d9;font:inherit;font-size:13px;padding:6px 10px;cursor:pointer}
  </style>
  <div class="picker">
    <div class="title">下一步优先做什么？</div>
    <div class="actions">
      <button data-vd-feedback-action="priority_define" data-vd-feedback-label="先定义需求" data-vd-feedback-item-id="priority-picker">定义需求</button>
      <button data-vd-feedback-action="priority_create" data-vd-feedback-label="先做初稿" data-vd-feedback-item-id="priority-picker">做初稿</button>
      <button data-vd-feedback-action="priority_review" data-vd-feedback-label="先评审取舍" data-vd-feedback-item-id="priority-picker">评审取舍</button>
    </div>
  </div>
</section>`,
    },
  ];

  function scaffoldIndexPath() {
    return path.join(projectScaffoldsPath, 'index.json');
  }

  function normalizeScaffold(scaffold) {
    if (!scaffold || typeof scaffold !== 'object') return null;
    const now = new Date().toISOString();
    return {
      id: scaffold.id || generateId('scf'),
      type: scaffold.type === 'widget' ? 'widget' : 'template',
      scope: 'project',
      title: scaffold.title || '未命名脚手架',
      stage: scaffold.stage || 'exploration',
      description: scaffold.description || '',
      agent_note: scaffold.agent_note || '',
      structure: Array.isArray(scaffold.structure) ? scaffold.structure : [],
      seed_content: Array.isArray(scaffold.seed_content) ? scaffold.seed_content : [],
      interaction_slots: Array.isArray(scaffold.interaction_slots) ? scaffold.interaction_slots : [],
      next_actions: Array.isArray(scaffold.next_actions) ? scaffold.next_actions : [],
      html: typeof scaffold.html === 'string' ? scaffold.html : '',
      state: scaffold.state && typeof scaffold.state === 'object' ? scaffold.state : {},
      input_schema: scaffold.input_schema && typeof scaffold.input_schema === 'object' ? scaffold.input_schema : {},
      output_schema: scaffold.output_schema && typeof scaffold.output_schema === 'object' ? scaffold.output_schema : {},
      sizing: scaffold.sizing && typeof scaffold.sizing === 'object' ? scaffold.sizing : null,
      created_at: scaffold.created_at || now,
      updated_at: scaffold.updated_at || now,
    };
  }

  function readScaffolds() {
    const stored = readJSONObject(scaffoldIndexPath());
    const projectItems = Array.isArray(stored?.scaffolds) ? stored.scaffolds.map(normalizeScaffold).filter(Boolean) : [];
    const byId = new Map(DEFAULT_SCAFFOLDS.map((item) => [item.id, normalizeScaffold(item)]));
    for (const item of projectItems) byId.set(item.id, item);
    return Array.from(byId.values());
  }

  async function writeScaffolds(scaffolds) {
    const now = new Date().toISOString();
    const normalized = scaffolds.map(normalizeScaffold).filter(Boolean);
    await writeJSON(scaffoldIndexPath(), {
      version: 1,
      scope: 'project',
      scaffolds: normalized,
      updated_at: now,
    });
    return normalized;
  }

  app.get('/api/scaffolds', (req, res) => {
    try {
      let scaffolds = readScaffolds();
      const { type, stage } = req.query;
      if (type) scaffolds = scaffolds.filter((item) => item.type === type);
      if (stage) scaffolds = scaffolds.filter((item) => item.stage === stage);
      res.json({ type: 'project_scaffold_library', scope: 'project', scaffolds, total: scaffolds.length });
    } catch (err) {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message } });
    }
  });

  app.post('/api/scaffolds', async (req, res) => {
    try {
      const body = req.body || {};
      if (!body.title) {
        return res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'title is required' } });
      }
      const scaffolds = readScaffolds().filter((item) => item.id !== body.id);
      const scaffold = normalizeScaffold({
        ...body,
        id: body.id || generateId('scf'),
        created_at: body.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      await writeScaffolds([...scaffolds, scaffold]);
      res.status(201).json(scaffold);
    } catch (err) {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message } });
    }
  });

  app.get('/api/canvas-workspaces', (req, res) => {
    try {
      let workspaces = listCanvasWorkspaces();
      const { status, search } = req.query;
      if (status) workspaces = workspaces.filter((workspace) => workspace.status === status);
      if (search) {
        const query = String(search).toLowerCase();
        workspaces = workspaces.filter((workspace) => [
          workspace.title,
          workspace.purpose,
          workspace.source_task_id,
          ...(workspace.tags || []),
        ].join(' ').toLowerCase().includes(query));
      }
      const index = readCanvasIndex();
      res.json({
        type: 'canvas_workspace_index',
        active_workspace_id: index.active_workspace_id,
        workspaces,
        total: workspaces.length,
      });
    } catch (err) {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message } });
    }
  });

  app.post('/api/canvas-workspaces', async (req, res) => {
    try {
      const workspace = await createCanvasWorkspace(req.body || {});
      await appendLogEntry({
        type: 'auto',
        event: 'canvas_workspace_created',
        title: `创建画布工作区：${workspace.title}`,
        content: workspace.purpose || '创建新的 canvas_workspace。',
        tags: ['canvas_workspace'],
      });
      broadcast('canvas_workspace_created', canvasWorkspaceSummary(workspace));
      res.status(201).json(publicCanvasWorkspace(workspace, { includeDetail: true }));
    } catch (err) {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message } });
    }
  });

  app.post('/api/canvas-workspaces/select', async (req, res) => {
    try {
      const body = req.body || {};
      const forceNew = body.force_new === true || body.new_canvas === true;
      const selectionContext = { ...body, ...(body.context || {}) };
      const candidates = listCanvasWorkspaces()
        .filter((workspace) => workspace.status === 'active')
        .map((workspace) => ({
          workspace,
          score: scoreCanvasWorkspace(workspace, selectionContext),
        }))
        .sort((a, b) => b.score - a.score);

      let selected = null;
      let reason = 'created_new_workspace';
      if (!forceNew && candidates.length > 0 && candidates[0].score >= 5) {
        selected = readCanvasWorkspace(candidates[0].workspace.id);
        reason = 'reused_related_workspace';
      }

      if (!selected) {
        selected = await createCanvasWorkspace({
          title: body.title || body.context?.title || '协作画布',
          purpose: body.purpose || body.context?.purpose || '',
          tags: body.tags || body.context?.tags || [],
          context: body.context || {},
          source_task_id: body.source_task_id || body.context?.task_id || null,
          make_active: true,
        });
      } else {
        selected.last_used_at = new Date().toISOString();
        selected.updated_at = selected.last_used_at;
        selected.updatedAt = selected.updated_at;
        await writeCanvasWorkspace(selected, { makeActive: true });
        await appendCanvasEvent(selected.id, {
          type: 'workspace_selected',
          actor: 'agent',
          summary: '根据当前任务上下文复用已有 canvas_workspace。',
        });
      }

      res.json({
        workspace: publicCanvasWorkspace(selected, { includeDetail: true }),
        selection: {
          reason,
          score: candidates[0]?.score || 0,
          candidates: candidates.slice(0, 5).map((item) => ({
            id: item.workspace.id,
            title: item.workspace.title,
            score: item.score,
          })),
        },
      });
    } catch (err) {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message } });
    }
  });

  app.get('/api/canvas-workspaces/:id', (req, res) => {
    try {
      const workspace = readCanvasWorkspace(req.params.id);
      if (!workspace) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Canvas workspace not found' } });
      }
      res.json(publicCanvasWorkspace(workspace, { includeDetail: true }));
    } catch (err) {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message } });
    }
  });

  app.get('/api/canvas-workspaces/:id/context', (req, res) => {
    try {
      const workspace = readCanvasWorkspace(req.params.id);
      if (!workspace) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Canvas workspace not found' } });
      }
      res.json({
        type: 'canvas_workspace_agent_context',
        inspect_required_before_write: true,
        workspace: publicCanvasWorkspace(workspace),
        snapshot: readCanvasSnapshot(workspace.id),
        semantic_index: workspace.semantic_index,
        events: readCanvasEvents(workspace.id),
        open_feedback: openCanvasFeedback(workspace.id),
        open_completion_requests: openCompletionRequests(workspace),
      });
    } catch (err) {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message } });
    }
  });

  app.put('/api/canvas-workspaces/:id', async (req, res) => {
    try {
      const workspace = readCanvasWorkspace(req.params.id);
      if (!workspace) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Canvas workspace not found' } });
      }
      const next = {
        ...workspace,
        ...req.body,
        id: workspace.id,
        type: 'canvas_workspace',
        updated_at: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const saved = await writeCanvasWorkspace(next, { makeActive: req.body?.make_active === true });
      broadcast('canvas_workspace_updated', canvasWorkspaceSummary(saved));
      res.json(publicCanvasWorkspace(saved, { includeDetail: true }));
    } catch (err) {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message } });
    }
  });

  app.post('/api/canvas-workspaces/:id/activate', async (req, res) => {
    try {
      const workspace = readCanvasWorkspace(req.params.id);
      if (!workspace) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Canvas workspace not found' } });
      }
      workspace.last_used_at = new Date().toISOString();
      workspace.updated_at = workspace.last_used_at;
      workspace.updatedAt = workspace.updated_at;
      const saved = await writeCanvasWorkspace(workspace, { makeActive: true });
      await appendCanvasEvent(saved.id, {
        type: 'workspace_activated',
        actor: req.body?.actor || 'user',
        summary: '设为当前 canvas_workspace。',
      });
      broadcast('canvas_workspace_updated', canvasWorkspaceSummary(saved));
      res.json(publicCanvasWorkspace(saved, { includeDetail: true }));
    } catch (err) {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message } });
    }
  });

  app.put('/api/canvas-workspaces/:id/snapshot', async (req, res) => {
    try {
      const { snapshot, semantic_index: semanticIndex, event } = req.body || {};
      if (!snapshot || typeof snapshot !== 'object') {
        return res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'snapshot is required' } });
      }
      const workspace = readCanvasWorkspace(req.params.id);
      if (!workspace) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Canvas workspace not found' } });
      }
      const now = new Date().toISOString();
      const previousIndex = workspace.semantic_index;
      const normalizedNextIndexBase = semanticIndex && typeof semanticIndex === 'object'
        ? normalizeCanvasSemanticIndex({ ...semanticIndex, updated_at: now })
        : workspace.semantic_index;
      const eventReview = event?.meta?.scaffold_review || null;
      const normalizedNextIndex = {
        ...normalizedNextIndexBase,
        layout_reviews: mergeCanvasLayoutReviews(
          previousIndex?.layout_reviews,
          normalizedNextIndexBase?.layout_reviews,
          eventReview,
        ),
      };
      const semanticDiff = summarizeSemanticDiff(previousIndex, normalizedNextIndex);
      const nextSemanticIndex = {
        ...normalizedNextIndex,
        edit_summary: hasSemanticDiff(semanticDiff) ? semanticDiff : normalizedNextIndex.edit_summary || null,
      };
      await writeJSON(canvasSnapshotFile(workspace.id), snapshot);
      const saved = await writeCanvasWorkspace({
        ...workspace,
        semantic_index: nextSemanticIndex,
        updated_at: now,
        updatedAt: now,
        last_used_at: now,
      }, { makeActive: true });
      if (event) {
        await appendCanvasEvent(workspace.id, {
          ...event,
          semantic_diff: hasSemanticDiff(semanticDiff) ? semanticDiff : event.semantic_diff,
        });
      }
      broadcast('canvas_workspace_updated', canvasWorkspaceSummary(saved));
      res.json(publicCanvasWorkspace(saved, { includeDetail: true }));
    } catch (err) {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message } });
    }
  });

  app.post('/api/canvas-workspaces/:id/events', async (req, res) => {
    try {
      const workspace = readCanvasWorkspace(req.params.id);
      if (!workspace) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Canvas workspace not found' } });
      }
      const event = await appendCanvasEvent(workspace.id, req.body || {});
      res.status(201).json(event);
    } catch (err) {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message } });
    }
  });

  app.post('/api/canvas-workspaces/:id/feedback', async (req, res) => {
    try {
      const workspace = readCanvasWorkspace(req.params.id);
      if (!workspace) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Canvas workspace not found' } });
      }
      const content = String(req.body?.content || '').trim();
      if (!content) {
        return res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'content is required' } });
      }
      const now = new Date().toISOString();
      const feedback = {
        id: generateId('fb'),
        kind: req.body?.kind || 'canvas_feedback',
        workspace_id: workspace.id,
        target: req.body?.target || {},
        status: 'tracked',
        handled: false,
        content,
        author: req.body?.author || 'user',
        source: {
          type: 'canvas_workspace',
          workspace_id: workspace.id,
          workspace_title: workspace.title,
        },
        created_at: now,
        updated_at: now,
        createdAt: now,
        updatedAt: now,
      };
      await updateJSON(canvasFeedbackFile(workspace.id), (items) => [...items, feedback], []);
      await upsertProjectFeedback(feedback);
      await appendCanvasEvent(workspace.id, {
        type: 'feedback_received',
        actor: feedback.author,
        summary: content,
        target: feedback.target,
      });
      await appendLogEntry({
        type: 'auto',
        event: 'canvas_feedback_committed',
        title: `收到画布反馈：${workspace.title}`,
        content,
        tags: ['canvas_workspace', 'feedback'],
      });
      res.status(201).json(feedback);
    } catch (err) {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message } });
    }
  });

  app.get('/api/reports', (req, res) => {
    try {
      const canonicalReports = listCanonicalReports();
      const canonicalIds = new Set(canonicalReports.map((report) => report.id));
      const legacyReports = readJSONArray(indexPath)
        .filter((entry) => !canonicalIds.has(entry.id))
        .map(deliveryIndexToReport)
        .filter(Boolean);
      let reports = [...canonicalReports, ...legacyReports];
      const { status, search, limit, offset } = req.query;
      if (status) reports = reports.filter((report) => report.status === status);
      if (search) {
        const query = String(search).toLowerCase();
        reports = reports.filter((report) => `${report.title} ${report.metadata?.task_name || ''}`.toLowerCase().includes(query));
      }
      reports.sort((a, b) => new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime());
      const total = reports.length;
      const off = parseInt(offset, 10) || 0;
      const lim = parseInt(limit, 10) || reports.length || 50;
      res.json({ reports: reports.slice(off, off + lim).map((report) => publicReport(report)), total });
    } catch (err) {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message } });
    }
  });

  app.get('/api/reports/:id', (req, res) => {
    try {
      const report = readReportRecord(req.params.id);
      if (!report) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Report not found' } });
      }
      res.json(publicReport(report, { includeDetail: true }));
    } catch (err) {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message } });
    }
  });

  app.post('/api/reports', async (req, res) => {
    try {
      const { title, structure, presentation, feedbackIds, metadata, content, sections, routing_reason: routingReason } = req.body;
      if (!title) {
        return res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'title is required' } });
      }
      const now = new Date().toISOString();
      const normalizedStructure = normalizeReportStructure(structure);
      const normalizedPresentation = normalizeReportPresentation(presentation);
      const reportId = generateId('r');
      const reportContent = createReportContent({
        title,
        structure: normalizedStructure,
        presentation: normalizedPresentation,
        content,
        sections,
      });
      if (routingReason && (reportContent.type === 'report_template' || reportContent.type === 'document_report')) {
        reportContent.routing_reason = routingReason;
      }
      if ((reportContent.type === 'report_template' || reportContent.type === 'document_report') && !Array.isArray(reportContent.change_records)) {
        reportContent.change_records = collectRecentChangeRecords();
      }
      if ((reportContent.type === 'report_template' || reportContent.type === 'document_report') && reportContent.change_records.length === 0) {
        reportContent.change_records = collectRecentChangeRecords();
      }
      const report = await writeReportRecord({
        id: reportId,
        title,
        structure: normalizedStructure,
        presentation: normalizedPresentation,
        status: 'draft',
        feedbackIds: feedbackIds || [],
        metadata: metadata || {},
        content: reportContent,
        sections: reportContent.sections || [],
        created_at: now,
        updated_at: now,
        createdAt: now,
        updatedAt: now,
      });

      const logEntry = {
        id: generateId('log'),
        type: 'auto',
        event: 'report_created',
        title: `创建汇报草稿：${title}`,
        reportId: report.id,
        content: `创建 ${report.structure} / ${report.presentation} 汇报草稿。`,
        createdAt: now,
      };
      await appendLogEntry(logEntry);
      broadcast('report_created', report);

      res.status(201).json(publicReport(report, { includeDetail: true }));
    } catch (err) {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message } });
    }
  });

  app.put('/api/reports/:id', async (req, res) => {
    try {
      const updated = await updateReportRecord(req.params.id, (report) => ({
        ...report,
        ...req.body,
        id: report.id,
        content: req.body.content ? createReportContent({
          title: req.body.title || report.title,
          structure: req.body.structure || report.structure,
          presentation: req.body.presentation || report.presentation,
          content: req.body.content,
          sections: req.body.sections,
        }) : report.content,
      }));
      if (!updated) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Report not found' } });
      }
      broadcast('report_updated', updated);
      res.json(publicReport(updated, { includeDetail: true }));
    } catch (err) {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message } });
    }
  });

  app.put('/api/reports/:id/canvas', async (req, res) => {
    try {
      const { sectionId, snapshot } = req.body || {};
      if (!snapshot || typeof snapshot !== 'object') {
        return res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'snapshot is required' } });
      }
      const updated = await updateReportRecord(req.params.id, (report) => {
        const content = report.content || createReportContent(report);
        const sections = (content.sections || []).map((section) => {
          if ((sectionId && section.id !== sectionId) || section.presentation !== 'canvas') return section;
          return {
            ...section,
            artifact: {
              ...(section.artifact || createTemplateArtifact('canvas', section.title)),
              type: 'canvas',
              mode: 'tldraw',
              tldraw_snapshot: snapshot,
              updated_at: new Date().toISOString(),
            },
          };
        });
        return { ...report, content: { ...content, sections }, sections };
      });
      if (!updated) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Report not found' } });
      }
      broadcast('report_updated', updated);
      res.json(publicReport(updated, { includeDetail: true }));
    } catch (err) {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message } });
    }
  });

  app.get('/api/reports/:id/feedback', (req, res) => {
    try {
      const report = readReportRecord(req.params.id);
      if (!report) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Report not found' } });
      }
      const feedbacks = readReportFeedback(req.params.id);
      res.json({ feedbacks, total: feedbacks.length });
    } catch (err) {
      console.error('Error reading report feedback:', err);
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message } });
    }
  });

  app.post('/api/reports/:id/feedback/draft', async (req, res) => {
    try {
      const report = readReportRecord(req.params.id);
      if (!report) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Report not found' } });
      }
      const drafts = Array.isArray(req.body.items) ? req.body.items : [];
      if (readCanonicalReport(req.params.id)) {
        await writeJSON(reportDraftsPath(req.params.id), drafts);
      } else {
        await writeJSON(deliveryFile(req.params.id, 'drafts.json'), drafts);
      }
      broadcast('feedback_draft_updated', { report_id: req.params.id, drafts });
      res.json({ drafts });
    } catch (err) {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message } });
    }
  });

  app.post('/api/reports/:id/feedback/commit', async (req, res) => {
    try {
      const report = readReportRecord(req.params.id);
      if (!report) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Report not found' } });
      }
      const items = Array.isArray(req.body.items) ? req.body.items : [];
      if (items.length === 0) {
        return res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'items must be a non-empty array' } });
      }
      const feedbacks = items.map((item) => createReportFeedbackItem(report, item));
      if (readCanonicalReport(req.params.id)) {
        await updateJSON(reportFeedbackPath(req.params.id), (current) => [...current, ...feedbacks], []);
        await writeJSON(reportDraftsPath(req.params.id), []);
      } else {
        await updateJSON(deliveryFile(req.params.id, 'feedback.json'), (current) => [...current, ...feedbacks], []);
        await writeJSON(deliveryFile(req.params.id, 'drafts.json'), []);
      }
      for (const feedback of feedbacks) {
        await upsertProjectFeedback(feedback);
      }
      await appendLogEntry({
        type: 'auto',
        event: 'report_feedback_committed',
        title: `收到汇报反馈：${report.title}`,
        reportId: report.id,
        content: `用户在汇报中提交了 ${feedbacks.length} 条反馈，已进入项目级反馈池。`,
        tags: ['report', 'feedback'],
      });
      const updatedReport = await recalcReportStatus(req.params.id);
      broadcast('feedback_received', { report_id: req.params.id, feedback_ids: feedbacks.map((item) => item.id) });
      broadcast('report_updated', updatedReport);
      res.status(201).json({ feedback: feedbacks, drafts: [], report: publicReport(updatedReport, { includeDetail: true }) });
    } catch (err) {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message } });
    }
  });

  app.post('/api/reports/:id/feedback/revoke', async (req, res) => {
    try {
      const report = readReportRecord(req.params.id);
      if (!report) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Report not found' } });
      }
      const feedbackIds = Array.isArray(req.body.feedback_ids) ? req.body.feedback_ids : [];
      if (feedbackIds.length === 0) {
        return res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'feedback_ids must be a non-empty array' } });
      }
      const pathToFeedback = readCanonicalReport(req.params.id)
        ? reportFeedbackPath(req.params.id)
        : deliveryFile(req.params.id, 'feedback.json');
      await updateJSON(pathToFeedback, (items) => items.filter((item) => !feedbackIds.includes(item.id)), []);
      await updateJSON(projectFeedbackPath, (items) => items.filter((item) => !feedbackIds.includes(item.id)), []);
      await appendLogEntry({
        type: 'auto',
        event: 'report_feedback_revoked',
        title: `撤回汇报反馈：${report.title}`,
        reportId: report.id,
        content: `用户撤回了 ${feedbackIds.length} 条尚未处理的反馈。`,
        tags: ['report', 'feedback'],
      });
      const updatedReport = await recalcReportStatus(req.params.id);
      broadcast('feedback_revoked', { report_id: req.params.id, feedback_ids: feedbackIds });
      broadcast('report_updated', updatedReport);
      res.json({ revoked: feedbackIds, report: publicReport(updatedReport, { includeDetail: true }) });
    } catch (err) {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message } });
    }
  });

  app.post('/api/reports/:id/feedback', async (req, res) => {
    try {
      const report = readReportRecord(req.params.id);
      if (!report) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Report not found' } });
      }
      const { content, author, target } = req.body;
      if (!content) {
        return res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'content is required' } });
      }
      const feedback = createReportFeedbackItem(report, { kind: 'direct', content, author, target });
      await updateJSON(reportFeedbackPath(req.params.id), (items) => [...items, feedback], []);
      await upsertProjectFeedback(feedback);
      const updatedReport = await recalcReportStatus(req.params.id);
      broadcast('feedback_updated', { action: 'created', reportId: req.params.id, feedback });
      broadcast('report_updated', updatedReport);
      res.status(201).json(feedback);
    } catch (err) {
      console.error('Error creating report feedback:', err);
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message } });
    }
  });

  app.post('/api/reports/:id/feedback/:feedbackId/resolve', async (req, res) => {
    try {
      const { changeRecord } = req.body || {};
      const now = new Date().toISOString();
      let resolved = null;
      await updateJSON(reportFeedbackPath(req.params.id), (items) => items.map((f) => {
        if (f.id === req.params.feedbackId) {
          resolved = {
            ...f,
            status: 'addressed',
            handled: true,
            changeRecord: changeRecord || f.changeRecord,
            change_record: changeRecord || f.change_record,
            resolved_at: now,
            updated_at: now,
            updatedAt: now,
          };
          return resolved;
        }
        return f;
      }), []);
      if (!resolved) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Feedback not found' } });
      }
      await updateProjectFeedbackItem(req.params.feedbackId, () => resolved);
      await appendLogEntry({
        type: 'auto',
        event: 'report_feedback_addressed',
        title: `处理汇报反馈：${shortLogText(resolved.content)}`,
        reportId: req.params.id,
        content: changeRecord?.change_summary || changeRecord?.changeSummary || '汇报反馈已标记为 addressed。',
        tags: ['report', 'feedback'],
        createdAt: now,
      });
      const updatedReport = await recalcReportStatus(req.params.id);
      broadcast('feedback_updated', { action: 'resolved', reportId: req.params.id, feedback: resolved });
      broadcast('report_updated', updatedReport);
      res.json(resolved);
    } catch (err) {
      console.error('Error resolving report feedback:', err);
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message } });
    }
  });

  app.post('/api/reports/:id/feedback/:feedbackId/confirm', async (req, res) => {
    try {
      const now = new Date().toISOString();
      let confirmed = null;
      await updateJSON(reportFeedbackPath(req.params.id), (items) => items.map((f) => {
        if (f.id === req.params.feedbackId) {
          confirmed = {
            ...f,
            status: 'confirmed',
            handled: true,
            changeRecord: { ...(f.changeRecord || {}), confirmedAt: now },
            change_record: { ...(f.change_record || {}), confirmed_at: now },
            confirmed_at: now,
            updated_at: now,
            updatedAt: now,
          };
          return confirmed;
        }
        return f;
      }), []);
      if (!confirmed) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Feedback not found' } });
      }
      await updateProjectFeedbackItem(req.params.feedbackId, () => confirmed);
      await appendLogEntry({
        type: 'auto',
        event: 'report_feedback_confirmed',
        title: `确认汇报反馈：${shortLogText(confirmed.content)}`,
        reportId: req.params.id,
        content: '用户已确认这条汇报反馈的处理结果。',
        tags: ['report', 'feedback'],
        createdAt: now,
      });
      broadcast('feedback_updated', { action: 'confirmed', reportId: req.params.id, feedback: confirmed });
      res.json(confirmed);
    } catch (err) {
      console.error('Error confirming report feedback:', err);
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message } });
    }
  });

  // Validate constants at startup (defensive)
  if (!DELIVERY_STATUSES.includes('normal') || !ALIGNMENT_STATES.includes('active')) {
    throw new Error('Invalid status configuration');
  }
}

module.exports = { setupRoutes };
