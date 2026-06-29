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
  platform: {
    name: 'Visual Delivery',
    logo_url: '',
    slogan: 'Turn work into clear decisions.',
    visual_style: 'executive-brief',
  },
};

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
    if (!stored) return DEFAULT_SETTINGS;

    return {
      platform: {
        ...DEFAULT_SETTINGS.platform,
        ...(stored.platform || {}),
      },
    };
  }

  // Health
  app.get('/health', (req, res) => {
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

      const next = {
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

  // ═══════════════════════════════════════════════════════
  // V3: Project-level APIs
  // ═══════════════════════════════════════════════════════

  const projectConfigPath = path.join(dataRoot, 'project.json');
  const projectHarnessPath = path.join(dataRoot, 'harness.json');
  const projectDocumentIndexPath = path.join(dataRoot, 'document-index.json');
  const projectLogsPath = path.join(dataRoot, 'logs.json');
  const projectFeedbackPath = path.join(dataRoot, 'feedback.json');
  const projectReportsPath = path.join(dataRoot, 'reports');
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

    return {
      version: 1,
      project_root: projectRoot,
      strategy: 'external-first',
      managed_fallback: {
        logs_path: toPosixPath(path.relative(projectRoot, skillManagedLogsPath)),
        documents_path: toPosixPath(path.relative(projectRoot, skillManagedDocumentsPath)),
      },
      sources: Array.from(sourcesByPath.values()).sort((a, b) => a.path.localeCompare(b.path)),
      discovered_at: previousHarness?.discovered_at || now,
      updated_at: now,
    };
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
        document_index: {
          project_root: documentIndex.project_root,
          scanned_at: documentIndex.scanned_at,
          total: documentIndex.documents.length,
        },
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
        document_index: {
          project_root: documentIndex.project_root,
          scanned_at: documentIndex.scanned_at,
          total: documentIndex.documents.length,
        },
      });
    } catch (err) {
      console.error('Error rescanning harness:', err);
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message } });
    }
  });

  app.get('/api/documents', async (req, res) => {
    try {
      await ensureHarnessState();
      let { documents, scanned_at: scannedAt } = readDocumentIndex();
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
      broadcast('feedback_updated', { action: 'confirmed', feedback: confirmed });
      res.json(confirmed);
    } catch (err) {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message } });
    }
  });

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
        tags: req.body.tags || [],
        createdAt: now,
      };
      await updateJSON(projectLogsPath, (items) => [...items, log], []);
      broadcast('log_created', log);
      res.status(201).json(log);
    } catch (err) {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message } });
    }
  });

  // V3: Reports (structured reports with sections)
  app.get('/api/reports', (req, res) => {
    try {
      // For now, map deliveries as reports
      let entries = readJSONArray(indexPath);
      // Enrich with V3 report fields (mock for existing entries)
      const reports = entries
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .map((e) => ({
          ...e,
          structure: e.mode === 'task_delivery' ? 'standard' : 'complex-review',
          presentation: 'document',
          sections: e.metadata?.sections || 1,
          completedSections: e.status === 'submitted' ? (e.metadata?.sections || 1) : 0,
        }));
      res.json({ reports, total: reports.length });
    } catch (err) {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message } });
    }
  });

  app.get('/api/reports/:id', (req, res) => {
    try {
      const delivery = hydrateDelivery(req.params.id);
      if (!delivery) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Report not found' } });
      }
      // Enrich with V3 report structure
      res.json({
        ...delivery,
        structure: 'complex-review',
        sections: [
          { id: 'sec-1', title: '背景与目标', status: 'completed', narrative: delivery.content?.ui_spec?.description || '', presentation: 'document' },
          { id: 'sec-2', title: '关键发现', status: 'progress', narrative: '', presentation: 'document' },
        ],
      });
    } catch (err) {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message } });
    }
  });

  app.post('/api/reports', async (req, res) => {
    try {
      const { title, structure, presentation, feedbackIds } = req.body;
      if (!title) {
        return res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'title is required' } });
      }
      const now = new Date().toISOString();
      const report = {
        id: generateId('r'),
        title,
        structure: structure || 'standard',
        presentation: presentation || 'document',
        status: 'draft',
        feedbackIds: feedbackIds || [],
        sections: structure === 'complex-review' ? [
          { id: `${generateId('sec')}`, title: '背景', status: 'pending', narrative: '', presentation: presentation || 'document' },
          { id: `${generateId('sec')}`, title: '分析', status: 'pending', narrative: '', presentation: presentation || 'document' },
          { id: `${generateId('sec')}`, title: '结论', status: 'pending', narrative: '', presentation: presentation || 'document' },
        ] : [
          { id: `${generateId('sec')}`, title: '汇报内容', status: 'pending', narrative: '', presentation: presentation || 'document' },
        ],
        createdAt: now,
        updatedAt: now,
      };

      // Create report directory and feedback file
      const reportDirPath = path.join(projectReportsPath, report.id);
      fs.mkdirSync(reportDirPath, { recursive: true });
      await writeJSON(path.join(reportDirPath, 'feedback.json'), []);

      const reportFilePath = path.join(projectReportsPath, `${report.id}.json`);
      await writeJSON(reportFilePath, report);

      // Auto-create log entry
      const logEntry = {
        id: generateId('log'),
        type: 'auto',
        event: 'report_created',
        title: `创建汇报草稿：${title}`,
        reportId: report.id,
        createdAt: now,
      };
      await updateJSON(projectLogsPath, (items) => [...items, logEntry], []);
      broadcast('log_created', logEntry);
      broadcast('report_created', report);

      res.status(201).json(report);
    } catch (err) {
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message } });
    }
  });

  // ═══════════════════════════════════════════════════════
  // V3: Report-level feedback
  // ═══════════════════════════════════════════════════════

  // Helper: read report-level feedback file
  function reportFeedbackPath(reportId) {
    return path.join(projectReportsPath, reportId, 'feedback.json');
  }

  function readReportFeedback(reportId) {
    return readJSONArray(reportFeedbackPath(reportId));
  }

  // GET /api/reports/:id/feedback — Get all feedback for a report
  app.get('/api/reports/:id/feedback', (req, res) => {
    try {
      const feedbacks = readReportFeedback(req.params.id);
      res.json({ feedbacks, total: feedbacks.length });
    } catch (err) {
      console.error('Error reading report feedback:', err);
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message } });
    }
  });

  // POST /api/reports/:id/feedback — Submit new feedback for a report
  app.post('/api/reports/:id/feedback', async (req, res) => {
    try {
      const { content, author } = req.body;
      if (!content) {
        return res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'content is required' } });
      }
      const now = new Date().toISOString();
      const feedback = {
        id: generateId('fb'),
        status: 'tracked',
        content,
        author: author || 'user',
        createdAt: now,
        updatedAt: now,
      };
      await updateJSON(reportFeedbackPath(req.params.id), (items) => [...items, feedback], []);
      broadcast('feedback_updated', { action: 'created', reportId: req.params.id, feedback });
      res.status(201).json(feedback);
    } catch (err) {
      console.error('Error creating report feedback:', err);
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message } });
    }
  });

  // POST /api/reports/:id/feedback/:feedbackId/resolve — Agent addresses feedback
  app.post('/api/reports/:id/feedback/:feedbackId/resolve', async (req, res) => {
    try {
      const { changeRecord } = req.body || {};
      const now = new Date().toISOString();
      let resolved = null;
      await updateJSON(reportFeedbackPath(req.params.id), (items) => items.map((f) => {
        if (f.id === req.params.feedbackId) {
          resolved = { ...f, status: 'addressed', changeRecord: changeRecord || f.changeRecord, updatedAt: now };
          return resolved;
        }
        return f;
      }), []);
      if (!resolved) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Feedback not found' } });
      }
      broadcast('feedback_updated', { action: 'resolved', reportId: req.params.id, feedback: resolved });
      res.json(resolved);
    } catch (err) {
      console.error('Error resolving report feedback:', err);
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message } });
    }
  });

  // POST /api/reports/:id/feedback/:feedbackId/confirm — User confirms resolved feedback
  app.post('/api/reports/:id/feedback/:feedbackId/confirm', async (req, res) => {
    try {
      const now = new Date().toISOString();
      let confirmed = null;
      await updateJSON(reportFeedbackPath(req.params.id), (items) => items.map((f) => {
        if (f.id === req.params.feedbackId) {
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
