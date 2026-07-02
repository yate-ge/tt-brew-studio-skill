/**
 * Canvas widget runtime support (server side).
 *
 * Implements the contract in references/canvas-widgets.md:
 *   - Tier 1/2: parameterized widget templates (vote, alignment_scale, rubric,
 *     bar_chart, word_cloud, timer)
 *   - Tier 3: freeform HTML fragments
 *   - normalizeWidgetSpec / validation / repair ladder (static half)
 *
 * The agent writes a widget spec; this module turns it into canonical node
 * metadata (`vd_*` fields) plus a static `widget_review`. The browser runtime
 * (bridge + GeneratedContentFrame) owns assembly, sizing, scaling, and state
 * sync at render time.
 */

const GLOBAL_SIZING_BOUNDS = {
  min_width: 160,
  max_width: 1200,
  min_height: 80,
  max_height: 900,
};

const DEFAULT_SIZING = {
  mode: 'content_intrinsic',
  min_width: 220,
  max_width: 760,
  min_height: 96,
  max_height: 680,
};

const MAX_WIDGET_HTML_LENGTH = 200_000;

/* ------------------------------------------------------------------ */
/*  Lightweight params validation (JSON-schema subset)                  */
/* ------------------------------------------------------------------ */

function typeOf(value) {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  return typeof value;
}

function checkAgainstSchema(value, schema, path, errors) {
  if (!schema || typeof schema !== 'object') return;
  if (schema.type) {
    const actual = typeOf(value);
    const matches = schema.type === 'integer'
      ? actual === 'number' && Number.isInteger(value)
      : actual === schema.type;
    if (!matches) {
      errors.push(`${path}: expected ${schema.type}, got ${actual}`);
      return;
    }
  }
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    errors.push(`${path}: value not in enum [${schema.enum.join(', ')}]`);
  }
  if (schema.type === 'object') {
    const required = Array.isArray(schema.required) ? schema.required : [];
    for (const key of required) {
      if (value == null || value[key] === undefined) errors.push(`${path}.${key}: required`);
    }
    const props = schema.properties || {};
    for (const [key, propSchema] of Object.entries(props)) {
      if (value && value[key] !== undefined) checkAgainstSchema(value[key], propSchema, `${path}.${key}`, errors);
    }
  }
  if (schema.type === 'array' && Array.isArray(value)) {
    if (Number.isFinite(schema.minItems) && value.length < schema.minItems) {
      errors.push(`${path}: needs at least ${schema.minItems} items`);
    }
    if (Number.isFinite(schema.maxItems) && value.length > schema.maxItems) {
      errors.push(`${path}: allows at most ${schema.maxItems} items`);
    }
    if (schema.items) value.forEach((item, i) => checkAgainstSchema(item, schema.items, `${path}[${i}]`, errors));
  }
  if (schema.type === 'string') {
    if (Number.isFinite(schema.maxLength) && String(value).length > schema.maxLength) {
      errors.push(`${path}: longer than ${schema.maxLength}`);
    }
  }
  if (schema.type === 'number' || schema.type === 'integer') {
    if (Number.isFinite(schema.minimum) && value < schema.minimum) errors.push(`${path}: below minimum ${schema.minimum}`);
    if (Number.isFinite(schema.maximum) && value > schema.maximum) errors.push(`${path}: above maximum ${schema.maximum}`);
  }
}

function checkParams(params, schema) {
  const errors = [];
  checkAgainstSchema(params || {}, schema || { type: 'object' }, 'params', errors);
  return { ok: errors.length === 0, errors };
}

/* ------------------------------------------------------------------ */
/*  Shared widget CSS + HTML helpers                                    */
/* ------------------------------------------------------------------ */

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Embed a JS value inside an inline <script>. Values are used via
// textContent, so no HTML escaping — only guard against </script> breakout.
function jsValue(value) {
  return JSON.stringify(value).replace(/<\//g, '<\\/');
}

const WIDGET_BASE_STYLE = `
  .vdw{display:inline-flex;flex-direction:column;gap:10px;box-sizing:border-box;min-width:220px;max-width:720px;
    padding:14px 16px;border:1px solid var(--vds-colors-border,#d8e0ea);border-radius:10px;
    background:rgba(255,255,255,.9);box-shadow:0 8px 24px rgba(15,23,42,.10);
    font-family:var(--vds-typography-font-family,system-ui,sans-serif);color:var(--vds-colors-text,#172033)}
  .vdw h3{margin:0;font-size:15px;line-height:1.3}
  .vdw .vdw-sub{margin:0;font-size:12px;color:var(--vds-colors-text-secondary,#667085);line-height:1.5}
  .vdw button{font:inherit;font-size:13px;border:1px solid var(--vds-colors-border,#d0d5dd);border-radius:8px;
    background:var(--vds-colors-surface,#f8fafc);color:inherit;padding:6px 12px;cursor:pointer}
  .vdw button:hover{border-color:var(--vds-colors-primary,#3b82f6);color:var(--vds-colors-primary,#3b82f6)}
  .vdw .vdw-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
`;

function widgetShell(className, title, subtitle, body) {
  const sub = subtitle ? `<p class="vdw-sub">${escapeHtml(subtitle)}</p>` : '';
  return `<section class="vdw ${className}">
<style>${WIDGET_BASE_STYLE}</style>
<h3>${escapeHtml(title)}</h3>
${sub}
${body}
</section>`;
}

/* ------------------------------------------------------------------ */
/*  Built-in Tier 1 templates                                           */
/* ------------------------------------------------------------------ */

const WIDGET_TEMPLATES = [
  {
    id: 'vote',
    title: '投票器',
    description: 'Dot-vote a list of options with a live tally. Use to converge on a decision.',
    params_schema: {
      type: 'object',
      required: ['options'],
      properties: {
        question: { type: 'string', maxLength: 200 },
        options: { type: 'array', minItems: 2, maxItems: 12, items: { type: 'string', maxLength: 120 } },
        max_votes_per_user: { type: 'integer', minimum: 1, maximum: 10 },
      },
    },
    defaults: { question: '你支持哪个选项？', max_votes_per_user: 3 },
    sizing: { min_width: 260, max_width: 560, initial_width: 340, initial_height: 240 },
    render(params) {
      const body = `
<div id="vote-list" style="display:flex;flex-direction:column;gap:6px"></div>
<p class="vdw-sub" id="vote-hint"></p>
<script>
(function(){
  var OPTIONS = ${jsValue(params.options)};
  var MAX = ${jsValue(params.max_votes_per_user)};
  var mine = 0;
  function state(){ return vd.state.get(); }
  function render(){
    var s = state();
    var counts = s.counts || [];
    var total = counts.reduce(function(a,b){return a+(b||0);},0) || 1;
    var list = document.getElementById('vote-list');
    list.innerHTML = '';
    OPTIONS.forEach(function(label, i){
      var count = counts[i] || 0;
      var row = document.createElement('button');
      row.type = 'button';
      row.style.cssText = 'position:relative;overflow:hidden;text-align:left;display:flex;justify-content:space-between;gap:10px';
      if (s.closed) row.disabled = true;
      var bar = document.createElement('span');
      bar.style.cssText = 'position:absolute;inset:0;background:var(--vds-colors-primary,#3b82f6);opacity:.12;transform-origin:left;transform:scaleX(' + (count/total) + ');transition:transform .2s';
      var text = document.createElement('span');
      text.textContent = label;
      text.style.position = 'relative';
      var num = document.createElement('strong');
      num.textContent = count;
      num.style.position = 'relative';
      row.appendChild(bar); row.appendChild(text); row.appendChild(num);
      row.addEventListener('click', function(){
        var cur = state();
        if (cur.closed || mine >= MAX) return;
        var next = (cur.counts || OPTIONS.map(function(){return 0;})).slice();
        next[i] = (next[i] || 0) + 1;
        mine += 1;
        vd.state.set({ counts: next, total: next.reduce(function(a,b){return a+b;},0) });
        vd.emit('vote_cast', { option: label, index: i, counts: next });
        render();
      });
      list.appendChild(row);
    });
    document.getElementById('vote-hint').textContent = s.closed
      ? '投票已关闭'
      : ('本轮每人最多 ' + MAX + ' 票，你已投 ' + mine + ' 票');
  }
  vd.state.subscribe(render);
  render();
})();
</script>`;
      return {
        html: widgetShell('vdw-vote', params.question, null, body),
        state: { counts: params.options.map(() => 0), total: 0, closed: false },
        output_schema: {
          type: 'object',
          required: ['event_type'],
          properties: {
            event_type: { enum: ['vote_cast'] },
            option: { type: 'string' },
            index: { type: 'integer' },
            counts: { type: 'array' },
          },
        },
      };
    },
  },
  {
    id: 'alignment_scale',
    title: '对齐量表',
    description: 'A 1-5 agreement/confidence scale with distribution and average. Use to check team alignment on a statement.',
    params_schema: {
      type: 'object',
      required: ['statement'],
      properties: {
        statement: { type: 'string', maxLength: 240 },
        min_label: { type: 'string', maxLength: 40 },
        max_label: { type: 'string', maxLength: 40 },
      },
    },
    defaults: { min_label: '强烈反对', max_label: '强烈同意' },
    sizing: { min_width: 280, max_width: 520, initial_width: 340, initial_height: 190 },
    render(params) {
      const body = `
<div class="vdw-row" id="scale-buttons" style="justify-content:space-between"></div>
<div class="vdw-row" style="justify-content:space-between">
  <span class="vdw-sub">${escapeHtml(params.min_label)}</span>
  <span class="vdw-sub">${escapeHtml(params.max_label)}</span>
</div>
<p class="vdw-sub" id="scale-summary"></p>
<script>
(function(){
  function render(){
    var s = vd.state.get();
    var responses = s.responses || [];
    var wrap = document.getElementById('scale-buttons');
    wrap.innerHTML = '';
    for (var v = 1; v <= 5; v++) (function(value){
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = value;
      var hits = responses.filter(function(r){ return r === value; }).length;
      btn.style.cssText = 'width:44px;height:44px;border-radius:50%;font-weight:600';
      if (hits > 0) btn.style.background = 'rgba(59,130,246,' + Math.min(.14 + hits * .14, .6) + ')';
      btn.addEventListener('click', function(){
        var cur = vd.state.get();
        var next = (cur.responses || []).concat([value]);
        var avg = next.reduce(function(a,b){return a+b;},0) / next.length;
        vd.state.set({ responses: next, average: Math.round(avg * 100) / 100 });
        vd.emit('scale_response', { value: value, average: Math.round(avg * 100) / 100, count: next.length });
        render();
      });
      wrap.appendChild(btn);
    })(v);
    document.getElementById('scale-summary').textContent = responses.length
      ? ('共 ' + responses.length + ' 次反馈，平均 ' + (s.average || 0))
      : '点击 1-5 表达你的立场';
  }
  vd.state.subscribe(render);
  render();
})();
</script>`;
      return {
        html: widgetShell('vdw-scale', params.statement, null, body),
        state: { responses: [], average: null },
        output_schema: {
          type: 'object',
          required: ['event_type'],
          properties: {
            event_type: { enum: ['scale_response'] },
            value: { type: 'integer', minimum: 1, maximum: 5 },
            average: { type: 'number' },
            count: { type: 'integer' },
          },
        },
      };
    },
  },
  {
    id: 'rubric',
    title: '评分 Rubric',
    description: 'Score multiple criteria 1-5 and submit as one structured result. Use when the agent needs schema-shaped review input.',
    params_schema: {
      type: 'object',
      required: ['criteria'],
      properties: {
        title: { type: 'string', maxLength: 120 },
        criteria: { type: 'array', minItems: 1, maxItems: 10, items: { type: 'string', maxLength: 80 } },
      },
    },
    defaults: { title: '请按维度打分' },
    sizing: { min_width: 300, max_width: 560, initial_width: 380, initial_height: 260 },
    render(params) {
      const body = `
<div id="rubric-rows" style="display:flex;flex-direction:column;gap:8px"></div>
<div class="vdw-row" style="justify-content:flex-end">
  <button type="button" id="rubric-submit">提交评分</button>
</div>
<script>
(function(){
  var CRITERIA = ${jsValue(params.criteria)};
  function render(){
    var s = vd.state.get();
    var scores = s.scores || {};
    var rows = document.getElementById('rubric-rows');
    rows.innerHTML = '';
    CRITERIA.forEach(function(name){
      var row = document.createElement('div');
      row.className = 'vdw-row';
      row.style.justifyContent = 'space-between';
      var label = document.createElement('span');
      label.textContent = name;
      label.style.fontSize = '13px';
      var group = document.createElement('span');
      group.style.cssText = 'display:inline-flex;gap:4px';
      for (var v = 1; v <= 5; v++) (function(value){
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = value;
        btn.style.cssText = 'width:30px;height:30px;padding:0;border-radius:6px';
        if (scores[name] === value) {
          btn.style.background = 'var(--vds-colors-primary,#3b82f6)';
          btn.style.color = '#fff';
        }
        btn.disabled = !!s.submitted;
        btn.addEventListener('click', function(){
          var cur = vd.state.get();
          var next = Object.assign({}, cur.scores || {});
          next[name] = value;
          vd.state.set({ scores: next });
          render();
        });
        group.appendChild(btn);
      })(v);
      row.appendChild(label);
      row.appendChild(group);
      rows.appendChild(row);
    });
    var submit = document.getElementById('rubric-submit');
    submit.disabled = !!s.submitted;
    submit.textContent = s.submitted ? '已提交' : '提交评分';
  }
  document.getElementById('rubric-submit').addEventListener('click', function(){
    var s = vd.state.get();
    var scores = s.scores || {};
    if (Object.keys(scores).length < CRITERIA.length) return;
    vd.state.set({ submitted: true });
    vd.emit('rubric_submitted', { scores: scores });
    render();
  });
  vd.state.subscribe(render);
  render();
})();
</script>`;
      return {
        html: widgetShell('vdw-rubric', params.title, '每行选择 1-5 分，全部完成后提交。', body),
        state: { scores: {}, submitted: false },
        output_schema: {
          type: 'object',
          required: ['event_type', 'scores'],
          properties: {
            event_type: { enum: ['rubric_submitted'] },
            scores: { type: 'object' },
          },
        },
      };
    },
  },
  {
    id: 'bar_chart',
    title: '条形图',
    description: 'Horizontal bar chart for counts or scores, hover to highlight, click a bar to reference it. Use to present theme analysis or comparisons.',
    params_schema: {
      type: 'object',
      required: ['data'],
      properties: {
        title: { type: 'string', maxLength: 120 },
        unit: { type: 'string', maxLength: 20 },
        data: {
          type: 'array',
          minItems: 1,
          maxItems: 20,
          items: {
            type: 'object',
            required: ['label', 'value'],
            properties: { label: { type: 'string', maxLength: 60 }, value: { type: 'number' } },
          },
        },
      },
    },
    defaults: { title: '统计结果', unit: '' },
    sizing: { min_width: 300, max_width: 640, initial_width: 400, initial_height: 240 },
    render(params) {
      const body = `
<div id="chart" style="display:flex;flex-direction:column;gap:6px"></div>
<script>
(function(){
  var UNIT = ${jsValue(String(params.unit || ''))};
  function render(){
    var s = vd.state.get();
    var data = s.data || [];
    var max = data.reduce(function(a,d){ return Math.max(a, d.value); }, 0) || 1;
    var chart = document.getElementById('chart');
    chart.innerHTML = '';
    data.forEach(function(d){
      var row = document.createElement('div');
      row.style.cssText = 'display:grid;grid-template-columns:minmax(64px,30%) 1fr auto;align-items:center;gap:8px;cursor:pointer';
      var label = document.createElement('span');
      label.textContent = d.label;
      label.style.cssText = 'font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
      var track = document.createElement('span');
      track.style.cssText = 'height:16px;border-radius:4px;background:rgba(148,163,184,.18);overflow:hidden;display:block';
      var bar = document.createElement('span');
      bar.style.cssText = 'display:block;height:100%;border-radius:4px;background:var(--vds-colors-primary,#3b82f6);opacity:.85;width:' + (d.value / max * 100) + '%;transition:opacity .15s';
      track.appendChild(bar);
      var num = document.createElement('span');
      num.textContent = d.value + (UNIT ? ' ' + UNIT : '');
      num.style.cssText = 'font-size:12px;font-variant-numeric:tabular-nums';
      row.addEventListener('mouseenter', function(){ bar.style.opacity = '1'; });
      row.addEventListener('mouseleave', function(){ bar.style.opacity = '.85'; });
      row.addEventListener('click', function(){ vd.emit('bar_selected', { label: d.label, value: d.value }); });
      row.appendChild(label); row.appendChild(track); row.appendChild(num);
      chart.appendChild(row);
    });
  }
  vd.state.subscribe(render);
  render();
})();
</script>`;
      return {
        html: widgetShell('vdw-chart', params.title, null, body),
        state: { data: params.data },
        output_schema: {
          type: 'object',
          required: ['event_type'],
          properties: {
            event_type: { enum: ['bar_selected'] },
            label: { type: 'string' },
            value: { type: 'number' },
          },
        },
      };
    },
  },
  {
    id: 'word_cloud',
    title: '词云',
    description: 'Weighted term cloud; click a term to flag it for discussion. Use to present clustered themes from brainstorm content.',
    params_schema: {
      type: 'object',
      required: ['words'],
      properties: {
        title: { type: 'string', maxLength: 120 },
        words: {
          type: 'array',
          minItems: 3,
          maxItems: 60,
          items: {
            type: 'object',
            required: ['text', 'weight'],
            properties: { text: { type: 'string', maxLength: 40 }, weight: { type: 'number', minimum: 0 } },
          },
        },
      },
    },
    defaults: { title: '主题词云' },
    sizing: { min_width: 300, max_width: 640, initial_width: 420, initial_height: 240 },
    render(params) {
      const body = `
<div id="cloud" style="display:flex;flex-wrap:wrap;gap:6px 12px;align-items:baseline;max-width:560px"></div>
<script>
(function(){
  var PALETTE = ['var(--vds-colors-primary,#3b82f6)', '#0f766e', '#b45309', '#6d28d9', '#334155'];
  function render(){
    var s = vd.state.get();
    var words = s.words || [];
    var min = Infinity, max = -Infinity;
    words.forEach(function(w){ min = Math.min(min, w.weight); max = Math.max(max, w.weight); });
    var span = (max - min) || 1;
    var cloud = document.getElementById('cloud');
    cloud.innerHTML = '';
    words.forEach(function(w, i){
      var el = document.createElement('button');
      el.type = 'button';
      el.textContent = w.text;
      var size = 13 + Math.round((w.weight - min) / span * 19);
      el.style.cssText = 'border:none;background:transparent;padding:0;cursor:pointer;font-weight:600;line-height:1.2;'
        + 'font-size:' + size + 'px;color:' + PALETTE[i % PALETTE.length] + ';opacity:' + (s.selected === w.text ? 1 : .82);
      if (s.selected === w.text) el.style.textDecoration = 'underline';
      el.addEventListener('click', function(){
        vd.state.set({ selected: w.text });
        vd.emit('word_selected', { text: w.text, weight: w.weight });
        render();
      });
      cloud.appendChild(el);
    });
  }
  vd.state.subscribe(render);
  render();
})();
</script>`;
      return {
        html: widgetShell('vdw-cloud', params.title, '点击词语可将其标记为讨论重点。', body),
        state: { words: params.words, selected: null },
        output_schema: {
          type: 'object',
          required: ['event_type', 'text'],
          properties: {
            event_type: { enum: ['word_selected'] },
            text: { type: 'string' },
            weight: { type: 'number' },
          },
        },
      };
    },
  },
  {
    id: 'timer',
    title: '计时器',
    description: 'Workshop countdown with start/pause/reset. Use to timebox a collaboration step.',
    params_schema: {
      type: 'object',
      properties: {
        label: { type: 'string', maxLength: 80 },
        duration_sec: { type: 'integer', minimum: 10, maximum: 7200 },
      },
    },
    defaults: { label: '本环节倒计时', duration_sec: 300 },
    sizing: { min_width: 220, max_width: 380, initial_width: 260, initial_height: 170 },
    render(params) {
      const body = `
<div id="timer-display" style="font-size:34px;font-weight:700;font-variant-numeric:tabular-nums;text-align:center">--:--</div>
<div class="vdw-row" style="justify-content:center">
  <button type="button" id="timer-toggle">开始</button>
  <button type="button" id="timer-reset">重置</button>
</div>
<script>
(function(){
  var DURATION = ${jsValue(params.duration_sec)};
  var ticker = null;
  function remaining(){
    var s = vd.state.get();
    if (s.running && s.ends_at) return Math.max(0, Math.round((s.ends_at - Date.now()) / 1000));
    return typeof s.remaining_sec === 'number' ? s.remaining_sec : DURATION;
  }
  function fmt(sec){
    var m = Math.floor(sec / 60), s = sec % 60;
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }
  function paint(){
    var left = remaining();
    document.getElementById('timer-display').textContent = fmt(left);
    document.getElementById('timer-toggle').textContent = vd.state.get().running ? '暂停' : '开始';
    if (left === 0 && vd.state.get().running) {
      vd.state.set({ running: false, remaining_sec: 0, ends_at: null });
      vd.emit('timer_finished', { duration_sec: DURATION });
      stopTicker();
    }
  }
  function startTicker(){ if (!ticker) ticker = setInterval(paint, 500); }
  function stopTicker(){ if (ticker) { clearInterval(ticker); ticker = null; } }
  document.getElementById('timer-toggle').addEventListener('click', function(){
    var s = vd.state.get();
    if (s.running) {
      vd.state.set({ running: false, remaining_sec: remaining(), ends_at: null });
      stopTicker();
    } else {
      vd.state.set({ running: true, ends_at: Date.now() + remaining() * 1000 });
      startTicker();
    }
    paint();
  });
  document.getElementById('timer-reset').addEventListener('click', function(){
    vd.state.set({ running: false, remaining_sec: DURATION, ends_at: null });
    stopTicker();
    paint();
  });
  vd.state.subscribe(function(){ paint(); if (vd.state.get().running) startTicker(); });
  if (vd.state.get().running) startTicker();
  paint();
})();
</script>`;
      return {
        html: widgetShell('vdw-timer', params.label, null, body),
        state: { running: false, remaining_sec: params.duration_sec, ends_at: null },
        output_schema: {
          type: 'object',
          required: ['event_type'],
          properties: {
            event_type: { enum: ['timer_finished'] },
            duration_sec: { type: 'integer' },
          },
        },
      };
    },
  },
];

function listWidgetTemplates() {
  return WIDGET_TEMPLATES.map(({ id, title, description, params_schema, defaults, sizing }) => ({
    id,
    title,
    description,
    params_schema,
    defaults,
    sizing: { ...DEFAULT_SIZING, ...(sizing || {}) },
  }));
}

function getWidgetTemplate(id) {
  return WIDGET_TEMPLATES.find((tpl) => tpl.id === id) || null;
}

/* ------------------------------------------------------------------ */
/*  Fragment validation + repairs (static half of the review ladder)    */
/* ------------------------------------------------------------------ */

function clampNumber(value, min, max, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

function normalizeWidgetSizing(input = {}) {
  const sizing = { ...DEFAULT_SIZING, ...(input && typeof input === 'object' ? input : {}) };
  const g = GLOBAL_SIZING_BOUNDS;
  sizing.mode = sizing.mode === 'fixed' ? 'fixed' : 'content_intrinsic';
  sizing.min_width = clampNumber(sizing.min_width, g.min_width, g.max_width, DEFAULT_SIZING.min_width);
  sizing.max_width = clampNumber(sizing.max_width, sizing.min_width, g.max_width, DEFAULT_SIZING.max_width);
  sizing.min_height = clampNumber(sizing.min_height, g.min_height, g.max_height, DEFAULT_SIZING.min_height);
  sizing.max_height = clampNumber(sizing.max_height, sizing.min_height, g.max_height, DEFAULT_SIZING.max_height);
  sizing.initial_width = clampNumber(sizing.initial_width, sizing.min_width, sizing.max_width, Math.min(360, sizing.max_width));
  sizing.initial_height = clampNumber(sizing.initial_height, sizing.min_height, sizing.max_height, Math.min(240, sizing.max_height));
  return sizing;
}

function validateWidgetFragment(rawHtml) {
  const errors = [];
  const warnings = [];
  const repairs = [];
  let html = typeof rawHtml === 'string' ? rawHtml.trim() : '';

  if (!html) {
    return { html, errors: ['html fragment is empty'], warnings, repairs };
  }
  if (html.length > MAX_WIDGET_HTML_LENGTH) {
    errors.push(`html exceeds ${MAX_WIDGET_HTML_LENGTH} characters`);
  }

  // Full-document wrappers: repair by unwrapping <body> content when possible.
  if (/<\s*(html|head|body)\b/i.test(html)) {
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    if (bodyMatch) {
      html = bodyMatch[1].trim();
      repairs.push('unwrapped_body');
    }
    if (/<\s*(html|head|body)\b/i.test(html)) {
      errors.push('fragment must not contain <html>/<head>/<body> tags');
    }
  }

  if (/<script[^>]*\ssrc\s*=/i.test(html)) errors.push('external <script src> is not allowed');
  if (/<iframe/i.test(html)) errors.push('nested <iframe> is not allowed inside a widget');
  if (/(^|[{}\s,])(html|body)\s*[,{][^}]*background/i.test(html)) {
    warnings.push('styles paint the document background; runtime reset keeps it transparent');
  }

  // Syntax-check inline scripts so broken JS is rejected before mount.
  const scriptRe = /<script[^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = scriptRe.exec(html)) !== null) {
    const code = match[1];
    if (!code.trim()) continue;
    try {
      // eslint-disable-next-line no-new-func
      new Function(code);
    } catch (err) {
      errors.push(`inline script syntax error: ${err.message}`);
    }
  }

  return { html, errors, warnings, repairs };
}

/* ------------------------------------------------------------------ */
/*  Widget spec normalization (the one entry point for commands/API)    */
/* ------------------------------------------------------------------ */

function widgetReviewId() {
  return `widget_review_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Turn an agent-facing widget spec (Tier 1/2 template call or Tier 3 fragment)
 * into { spec, review }. `review.status === 'failed'` means the widget must
 * not be mounted; the caller decides whether to reject or degrade.
 */
function prepareWidget(input = {}) {
  const errors = [];
  const warnings = [];
  const repairs = [];
  let spec = null;

  const templateId = input.template_id || input.template || null;
  if (templateId) {
    const template = getWidgetTemplate(templateId);
    if (!template) {
      errors.push(`unknown widget template: ${templateId}`);
    } else {
      const params = { ...(template.defaults || {}), ...(input.params || {}) };
      const paramsCheck = checkParams(params, template.params_schema);
      if (!paramsCheck.ok) {
        errors.push(...paramsCheck.errors);
      } else {
        const rendered = template.render(params);
        spec = {
          template_id: template.id,
          params,
          title: input.title || params.question || params.statement || params.title || template.title,
          description: input.description || template.description,
          html: rendered.html,
          state: input.state && typeof input.state === 'object' ? { ...rendered.state, ...input.state } : rendered.state,
          input_schema: input.input_schema || rendered.input_schema || {},
          output_schema: input.output_schema || rendered.output_schema || {},
          sizing: normalizeWidgetSizing({ ...(template.sizing || {}), ...(input.sizing || {}) }),
        };
      }
    }
  } else if (typeof input.html === 'string' && input.html.trim()) {
    spec = {
      template_id: null,
      params: null,
      title: input.title || 'Widget',
      description: input.description || '画布内嵌 widget',
      html: input.html,
      state: input.state && typeof input.state === 'object' ? input.state : {},
      input_schema: input.input_schema && typeof input.input_schema === 'object' ? input.input_schema : {},
      output_schema: input.output_schema && typeof input.output_schema === 'object' ? input.output_schema : {},
      sizing: normalizeWidgetSizing(input.sizing),
    };
  } else {
    errors.push('widget spec needs template_id or html');
  }

  if (spec) {
    const fragmentCheck = validateWidgetFragment(spec.html);
    spec.html = fragmentCheck.html;
    errors.push(...fragmentCheck.errors);
    warnings.push(...fragmentCheck.warnings);
    repairs.push(...fragmentCheck.repairs);
  }

  const review = {
    id: widgetReviewId(),
    type: 'widget_static_review',
    status: errors.length > 0 ? 'failed' : (warnings.length > 0 ? 'needs_adjustment' : 'passed'),
    checks: {
      static_ok: errors.length === 0,
      template_id: templateId || null,
    },
    errors,
    warnings,
    repairs,
    reviewed_at: new Date().toISOString(),
  };

  return { spec, review };
}

/**
 * Meta fields stored on the widget's anchor shape / IR node.
 */
function widgetNodeMeta(spec, { actor = 'agent', review = null, version = 1 } = {}) {
  return {
    vd_title: spec.title,
    vd_description: spec.description,
    vd_html: spec.html,
    vd_interactive: true,
    vd_widget_template: spec.template_id,
    vd_widget_params: spec.params,
    vd_widget_state: spec.state || {},
    vd_input_schema: spec.input_schema || {},
    vd_output_schema: spec.output_schema || {},
    vd_sizing: spec.sizing,
    vd_widget_version: version,
    vd_state_version: 0,
    vd_state_actor: actor,
    vd_intrinsic_size: { w: spec.sizing.initial_width, h: spec.sizing.initial_height },
    ...(review ? { vd_widget_review: review } : {}),
  };
}

module.exports = {
  GLOBAL_SIZING_BOUNDS,
  DEFAULT_SIZING,
  listWidgetTemplates,
  getWidgetTemplate,
  normalizeWidgetSizing,
  validateWidgetFragment,
  prepareWidget,
  widgetNodeMeta,
  checkParams,
};
