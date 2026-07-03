/* eslint-disable no-console */
// Visual-scaffold aesthetic demo: 3 exemplar framework scaffolds using the NEW
// norm — one-line caption (name + what-you-do), titled zones each with a single
// guiding prompt + fill space, NO signature text and NO AI-meta on canvas
// (attribution stays in vd_method_source meta → left expert dock). Aims at the
// reference look: proper design canvas / heart-center canvas / radial framework.

const BASE = 'http://localhost:3847';
async function api(method, url, body) {
  const res = await fetch(`${BASE}${url}`, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const t = await res.text(); let j; try { j = JSON.parse(t); } catch { j = { raw: t.slice(0, 300) }; }
  if (!res.ok) throw new Error(`${method} ${url} -> ${res.status}: ${JSON.stringify(j).slice(0, 400)}`);
  return j;
}
async function post(wsId, commands) {
  const out = await api('POST', `/api/canvas-workspaces/${wsId}/commands`, { commands });
  const bad = (out.results || []).filter((r) => !['applied', 'ok', 'no_change'].includes(r.status));
  console.log(`  commands ${(out.results || []).length}, not-applied ${bad.length}`);
  bad.slice(0, 6).forEach((r) => console.log('   !!', JSON.stringify(r).slice(0, 180)));
}

const ms = (id, names) => ({ method_id: id, class: 'C', experts: names.map((n) => ({ name: n })) });
const root = (id, stage, title, experts, note) => ({ op: 'add_node', id, kind: 'section', stage, title, role: 'scaffold.root', meta: { vd_scaffold_root: true, vd_method_source: ms(id, experts), vd_usage_note: note } });
// caption = one line: name (bold) + what-you-do (grey). No signature, no AI-meta.
const caption = (p, name, todo, w = 1100) => ([
  { op: 'add_node', id: `${p}.cap`, kind: 'text', parent: p, bounds: { x: 40, y: 18, w, h: 92 }, content: name, text_size: 'xl', font: 'sans' },
  { op: 'add_node', id: `${p}.todo`, kind: 'text', parent: p, bounds: { x: 40, y: 118, w, h: 46 }, content: todo, text_size: 's', color: 'grey' },
]);
// zone = a titled sub-frame (title shows as frame label) + one grey prompt inside + fill space.
const zone = (p, id, title, prompt, b) => ([
  { op: 'add_node', id: `${p}.${id}`, kind: 'slot', parent: p, title, bounds: b },
  { op: 'add_node', id: `${p}.${id}.q`, kind: 'text', parent: `${p}.${id}`, bounds: { x: 18, y: 46, w: b.w - 36, h: 60 }, content: prompt, text_size: 's', color: 'grey' },
]);

async function run() {
  // fresh demo workspace
  const list = await api('GET', '/api/canvas-workspaces');
  for (const s of list.workspaces || []) {
    const full = (await api('GET', `/api/canvas-workspaces/${s.id}`)).workspace || {};
    if ((/脚手架样板|老年人可玩城市/.test(full.title || '') || full.context?.vd_project_document) && full.status === 'active') {
      await api('PUT', `/api/canvas-workspaces/${s.id}`, { status: 'archived', context: { ...(full.context || {}), vd_project_document: false } });
    }
  }
  const ws = await api('POST', '/api/canvas-workspaces', { title: '视觉脚手架样板', purpose: '演示 3 种框架级视觉脚手架的目标观感。', context: { vd_initialize_stage_canvas: true, vd_project_document: true, current_stage: 'discover', expert_team: [{ name: '刘洋' }, { name: '吴端' }, { name: '辛向阳' }, { name: '马谨' }] } });
  const wsId = ws.id || ws.workspace?.id;
  await api('POST', `/api/canvas-workspaces/${wsId}/activate`, {});
  console.log('workspace:', wsId);

  /* ===== 1. 设计画布（不规则分区网格，Family A：可填写画布）===== */
  const C1 = [root('canvas', 'discover', '可玩城市设计画布', ['刘洋', '马谨'], '把研究拆进分区，每格先想一句再填证据')];
  C1.push(...caption('canvas', '可玩城市设计画布', '这是一张设计画布 — 每个分区先回答那一句提示，再往下填你的观察与证据。', 1560));
  C1.push(...zone('canvas', 'pos', '研究定位', '你到底在研究老人的什么？一句话说清楚。', { x: 40, y: 200, w: 380, h: 470 }));
  C1.push(...zone('canvas', 'user', '老年用户', '他们是谁？在什么场景里出现？', { x: 440, y: 200, w: 380, h: 470 }));
  C1.push(...zone('canvas', 'play', '可玩行为', '哪些自发行为带有探索/游戏/社交？', { x: 840, y: 200, w: 380, h: 225 }));
  C1.push(...zone('canvas', 'space', '空间条件', '哪些空间要素触发了这些行为？', { x: 840, y: 445, w: 380, h: 225 }));
  C1.push(...zone('canvas', 'social', '社交关系', '老人在这里和谁、怎样发生联系？', { x: 1240, y: 200, w: 380, h: 470 }));
  C1.push(...zone('canvas', 'value', '价值主张', '这个设计让城市对老人多了什么？', { x: 40, y: 690, w: 780, h: 320 }));
  C1.push(...zone('canvas', 'metric', '评价标准', '怎样才算"更可玩"？可核验的信号是什么？', { x: 840, y: 690, w: 780, h: 320 }));
  await post(wsId, C1);
  console.log('1 设计画布 done');

  /* ===== 2. 可玩性评价框架（心形中心 + 环绕维度，Family A/B）===== */
  const C2 = [root('heart', 'discover', '可玩性评价框架', ['辛向阳', '马谨'], '中心是可玩性内核，六个维度各问一句')];
  C2.push(...caption('heart', '可玩性评价框架', '选一个具体街角 — 绕着中心，逐个维度问自己那一句，找现场证据打分。', 1300));
  // center heart
  C2.push({ op: 'add_node', id: 'heart.core', kind: 'shape', shape_type: 'heart', parent: 'heart', bounds: { x: 560, y: 300, w: 380, h: 340 }, content: '可玩性', color: 'light-violet', fill: 'semi', text_size: 'xl' });
  // 3 left, 3 right
  C2.push(...zone('heart', 'body', '身体可玩', '是否支持慢走、停留、轻运动？', { x: 40, y: 210, w: 400, h: 180 }));
  C2.push(...zone('heart', 'social', '社交可玩', '是否支持围观、搭话、熟人相遇？', { x: 40, y: 410, w: 400, h: 180 }));
  C2.push(...zone('heart', 'cog', '认知可玩', '是否支持寻找、识别、路线选择？', { x: 40, y: 610, w: 400, h: 180 }));
  C2.push(...zone('heart', 'emo', '情感可玩', '是否让老人被需要、被看见、有掌控感？', { x: 1060, y: 210, w: 400, h: 180 }));
  C2.push(...zone('heart', 'time', '时间可玩', '早/午/晚是否形成不同活动节奏？', { x: 1060, y: 410, w: 400, h: 180 }));
  C2.push(...zone('heart', 'edge', '边界可玩', '入口、转角、树荫、栏杆是否被激活？', { x: 1060, y: 610, w: 400, h: 180 }));
  await post(wsId, C2);
  console.log('2 心形评价框架 done');

  /* ===== 3. 关系放射框架（中心 + 放射环 + 外圈提示，Family B）===== */
  const C3 = [root('radial', 'discover', '老人与城市的关系', ['吴端', '辛向阳'], '中心是关系本身，六种关系放射展开')];
  C3.push(...caption('radial', '老人与城市的关系', '可玩性是一种关系 — 绕着中心，想清楚每一种关系此刻是强还是弱。', 1200));
  const cx = 760; const cy = 620; const r = 340;
  C3.push({ op: 'add_node', id: 'radial.core', kind: 'shape', shape_type: 'ellipse', parent: 'radial', bounds: { x: cx - 150, y: cy - 110, w: 300, h: 220 }, content: '可玩性\n= 关系', color: 'violet', fill: 'semi', text_size: 'l' });
  const rel = [
    { id: 'phys', t: '身体关系', q: '身体如何与空间互动？' },
    { id: 'soc', t: '社交关系', q: '和谁产生联系？' },
    { id: 'cog', t: '认知关系', q: '如何认识、记住这里？' },
    { id: 'emo', t: '情感关系', q: '产生了什么情感？' },
    { id: 'join', t: '轻参与', q: '如何低压力地加入？' },
    { id: 'exit', t: '可退出', q: '能否随时体面退出？' },
  ];
  rel.forEach((x, i) => {
    const ang = (-90 + i * 60) * Math.PI / 180;
    const nx = Math.round(cx + r * Math.cos(ang) - 130);
    const ny = Math.round(cy + r * Math.sin(ang) - 90);
    C3.push({ op: 'add_node', id: `radial.${x.id}`, kind: 'shape', shape_type: 'ellipse', parent: 'radial', bounds: { x: nx, y: ny, w: 260, h: 180 }, content: `${x.t}\n\n${x.q}`, color: 'light-blue', fill: 'none', text_size: 'm' });
    C3.push({ op: 'add_connector', from: `radial.${x.id}`, to: 'radial.core' });
  });
  await post(wsId, C3);
  console.log('3 放射框架 done');
  console.log('ALL DONE:', wsId);
}
run().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
