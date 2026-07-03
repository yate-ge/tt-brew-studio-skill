/* eslint-disable no-console */
// 小雷 case walkthrough (v2 — agent-designed interior coordinates).
// Each expert scaffold paints a DISTINCT interior shape (grid / row / radial /
// timeline / layered) with explicit relative bounds, so the outer single-row
// horizontal stage layout shows genuinely different frameworks, not strips.
// Usage: node case-walk.mjs <setup|scene1|scene2|scene3|scene4|context>

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = 'http://localhost:3847';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const STATE_FILE = path.join(HERE, 'case-walk-state.json');

const loadState = () => { try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return {}; } };
const saveState = (patch) => { const n = { ...loadState(), ...patch }; fs.writeFileSync(STATE_FILE, JSON.stringify(n, null, 2)); return n; };

async function api(method, url, body) {
  const res = await fetch(`${BASE}${url}`, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 400) }; }
  if (!res.ok) throw new Error(`${method} ${url} -> ${res.status}: ${JSON.stringify(json).slice(0, 500)}`);
  return json;
}
async function postCommands(wsId, commands) {
  const out = await api('POST', `/api/canvas-workspaces/${wsId}/commands`, { commands });
  const bad = (out.results || []).filter((r) => !['applied', 'ok', 'no_change'].includes(r.status));
  console.log(`commands: ${(out.results || []).length} total, ${bad.length} not-applied`);
  bad.slice(0, 8).forEach((r) => console.log('  !!', JSON.stringify(r).slice(0, 200)));
  return out;
}
async function shapeIdFor(wsId, irId) {
  const ws = await api('GET', `/api/canvas-workspaces/${wsId}`);
  const si = ws?.workspace?.semantic_index || ws?.semantic_index || {};
  const hit = [...(si.sections || []), ...(si.nodes || [])].find((n) => n.ir_id === irId || n.id === irId);
  return hit?.shape_id || null;
}

/* ---------------- interior layout recipes (return relative-bounds nodes) ------ */
const PAD = 44;
const scaffold = (id, stage, title, meta) => ({ op: 'add_node', id, kind: 'section', stage, title, role: 'scaffold.root', meta });
const at = (id, parent, kind, bounds, extra = {}) => ({ op: 'add_node', id, kind, parent, bounds, ...extra });
const header = (parent, text, w = 1180) => at(`${parent}.h`, parent, 'text', { x: PAD, y: 20, w, h: 96 }, { content: text });
const sign = (parent, text, y, w = 900) => at(`${parent}.sign`, parent, 'text', { x: PAD, y, w, h: 60 }, { content: text });

// horizontal row of cards
function rowCards(parent, kind, items, { y, cardW, cardH, gap = 40, x0 = PAD }) {
  return items.map((it, i) => at(`${parent}.c${i + 1}`, parent, kind, { x: x0 + i * (cardW + gap), y, w: cardW, h: cardH }, { content: it.text, color: it.color, shape_type: it.shape }));
}
// grid of cards
function gridCards(parent, kind, items, { cols, cardW, cardH, gapX = 36, gapY = 36, x0 = PAD, y0 }) {
  return items.map((it, i) => { const r = Math.floor(i / cols); const c = i % cols; return at(`${parent}.g${i + 1}`, parent, kind, { x: x0 + c * (cardW + gapX), y: y0 + r * (cardH + gapY), w: cardW, h: cardH }, { content: it.text, title: it.title, color: it.color }); });
}
// vertical stack of slots
function stackSlots(parent, items, { slotW, slotH, gap = 28, x0 = PAD, y0 }) {
  return items.map((it, i) => at(`${parent}.s${i + 1}`, parent, 'slot', { x: x0, y: y0 + i * (slotH + gap), w: slotW, h: slotH }, { title: it.title, content: it.content }));
}
// radial: center node + ring of element nodes + connectors element->center
function radial(parent, centerId, centerText, items, { cx, cy, r, nodeW, nodeH, centerW = 260, centerH = 120 }) {
  const cmds = [at(`${parent}.${centerId}`, parent, 'shape', { x: cx - centerW / 2, y: cy - centerH / 2, w: centerW, h: centerH }, { content: centerText, shape_type: 'ellipse', color: 'violet' })];
  const n = items.length;
  items.forEach((it, i) => {
    const ang = (-90 + i * (360 / n)) * Math.PI / 180;
    const x = Math.round(cx + r * Math.cos(ang) - nodeW / 2);
    const y = Math.round(cy + r * Math.sin(ang) - nodeH / 2);
    cmds.push(at(`${parent}.e${i + 1}`, parent, 'shape', { x, y, w: nodeW, h: nodeH }, { content: it.text, shape_type: 'rectangle', color: 'light-blue' }));
    cmds.push({ op: 'add_connector', from: `${parent}.e${i + 1}`, to: `${parent}.${centerId}`, label: it.label });
  });
  return cmds;
}
// horizontal timeline: steps in a row + chain connectors (+ optional loop-back)
function timeline(parent, steps, { y, stepW = 190, stepH = 150, gap = 44, x0 = PAD, loop = false }) {
  const cmds = steps.map((s, i) => at(`${parent}.t${i + 1}`, parent, 'shape', { x: x0 + i * (stepW + gap), y, w: stepW, h: stepH }, { content: s.text, shape_type: s.shape || 'rectangle', color: s.color || 'blue' }));
  for (let i = 1; i < steps.length; i += 1) cmds.push({ op: 'add_connector', from: `${parent}.t${i}`, to: `${parent}.t${i + 1}` });
  if (loop) cmds.push({ op: 'add_connector', from: `${parent}.t${steps.length}`, to: `${parent}.t1`, label: '循环', type: 'loops_back' });
  return cmds;
}

/* ---------------- expert team ------------------------------------------------ */
const TEAM = [
  { name: '马谨', domain: '服务/系统设计', role: '方法论锚点', focus: '把"可玩"拆成可观察现象' },
  { name: '刘洋', domain: '城市数据驱动设计', role: '主导专家', focus: '行为与空间数据互相校正' },
  { name: '魏佛兰', domain: '生态参与式设计', role: '支持专家', focus: '进入真实生活现场' },
  { name: '吴端', domain: '空间与标识设计', role: '支持专家', focus: '看见边界/转角/入口' },
  { name: '辛向阳', domain: '交互设计理论', role: '支持专家', focus: '设计对象是参与关系' },
];
const ms = (methodId, cls, names) => ({ method_id: methodId, class: cls, experts: names.map((n) => { const e = TEAM.find((t) => t.name === n); return { name: n, domain: e?.domain || null }; }) });

/* ---------------- setup ------------------------------------------------------ */
async function setup() {
  const list = await api('GET', '/api/canvas-workspaces');
  for (const s of list.workspaces || []) {
    const resp = await api('GET', `/api/canvas-workspaces/${s.id}`);
    const full = resp.workspace || resp;
    if ((/老年人可玩城市/.test(full.title || '') || full.context?.vd_project_document === true) && full.status === 'active') {
      await api('PUT', `/api/canvas-workspaces/${full.id}`, { status: 'archived', context: { ...(full.context || {}), vd_project_document: false } });
      console.log('archived previous:', full.id);
    }
  }
  const ws = await api('POST', '/api/canvas-workspaces', {
    title: '老年人可玩城市 · 开题探索',
    purpose: '小雷的设计研究课题：前期探索（Discover）。',
    context: {
      vd_initialize_stage_canvas: true, vd_project_document: true, current_stage: 'discover',
      expert_team: TEAM.map((t) => ({ ...t, virtual: false })),
      judgment_contract: { ownership: '专家只搭框架、评审、警示；最终选择属于小雷。', format: '观察->依据->遮蔽->下一步（写入 meta）' },
    },
  });
  const wsId = ws.id || ws.workspace?.id;
  await api('POST', `/api/canvas-workspaces/${wsId}/activate`, {});
  saveState({ wsId });
  console.log('workspace:', wsId);
}

/* ---------------- scene1: 开题全景 — 课题卡 + 5 个各异框架 ------------------- */
async function scene1() {
  const { wsId } = loadState();
  const C = [];

  // 课题卡 — 居中卡片字段
  C.push(scaffold('topic', 'discover', '课题卡 · 老年人可玩城市', { vd_topic_card: true }));
  C.push(header('topic', '初始命题：老年人可玩城市', 700));
  C.push(at('topic.stage', 'topic', 'text', { x: PAD, y: 140, w: 700, h: 60 }, { content: '当前阶段：Discover / 前期探索' }));
  C.push(at('topic.goal', 'topic', 'text', { x: PAD, y: 220, w: 700, h: 60 }, { content: '目标：收集材料 · 识别现象 · 发现研究机会点' }));
  C.push(at('topic.doubt', 'topic', 'sticky', { x: PAD, y: 320, w: 300, h: 300 }, { content: '困惑：什么是"可玩"？老人的玩=娱乐活动吗？从设施/空间/社交/体验出发？', color: 'yellow', meta: { vd_created_by: 'user' } }));

  // 马谨 · 研究问题拆解 — 2×2 问题网格 + 强调条 + 学生改写区
  C.push(scaffold('majin', 'discover', '马谨 · 研究问题拆解', { vd_scaffold_root: true, vd_method_source: ms('question-decomposition', 'C', ['马谨']), vd_usage_note: '把"可玩城市"拆成可观察的问题。' }));
  C.push(header('majin', '方法：研究问题拆解｜训练：把模糊概念拆成可观察现象｜学生动作：挑一个先去现场观察'));
  C.push(...gridCards('majin', 'sticky', [
    { text: '老年人在城市中有哪些自发活动？', color: 'light-blue' },
    { text: '哪些活动带有探索、游戏、社交或愉悦属性？', color: 'light-blue' },
    { text: '哪些空间支持了这些行为？', color: 'light-blue' },
    { text: '哪些空间压抑了这些行为？', color: 'light-blue' },
  ], { cols: 2, cardW: 320, cardH: 220, y0: 140 }));
  C.push(at('majin.meta', 'majin', 'sticky', { x: PAD, y: 640, w: 712, h: 130 }, { content: '"可玩"是老年人自己的说法，还是设计者的想象？', color: 'orange' }));
  C.push(at('majin.slot', 'majin', 'slot', { x: PAD, y: 800, w: 712, h: 200 }, { title: '小雷的改写区', content: '把上面的问题改写成你自己的话' }));
  C.push(sign('majin', '方法来源：马谨（服务/系统设计）（即席合成）· 即席方法，用后需评估', 1030));

  // 刘洋 · 行为轨迹 × 空间节点 — 3×2 字段网格
  C.push(scaffold('liuyang', 'discover', '刘洋 · 行为轨迹 × 空间节点', { vd_scaffold_root: true, vd_method_source: ms('behavior-space', 'A', ['刘洋']), vd_usage_note: '与阴影、座椅、菜市场、公交站、公园入口密切相关。每格填现场记录。' }));
  C.push(header('liuyang', '方法：行为轨迹与空间节点观察｜训练：让判断背后有数据链｜学生动作：按字段做现场记录', 1000));
  C.push(...gridCards('liuyang', 'slot', [
    { title: '出现时间', text: '几点出现？工作日/周末差异？' }, { title: '活动地点', text: '具体到哪个入口、哪片树荫' }, { title: '停留时长', text: '路过、驻足还是长坐？' },
    { title: '移动路径', text: '从哪来、到哪去、绕行还是直达' }, { title: '高频节点', text: '哪些点被反复使用' }, { title: '触发行为的空间条件', text: '阴影/座椅/台阶/摊位' },
  ], { cols: 3, cardW: 320, cardH: 240, y0: 150 }));
  C.push(sign('liuyang', '方法来源：刘洋（城市数据驱动设计）· 领域特色方法，跨领域适用性未经验证', 730));

  // 魏佛兰 · 参与式观察 — 横向观察卡片行 + 提示
  C.push(scaffold('weifolan', 'discover', '魏佛兰 · 参与式观察', { vd_scaffold_root: true, vd_method_source: ms('participatory-obs', 'A', ['魏佛兰']), vd_usage_note: '进入老人真实生活现场，不能只从设计师视角判断什么好玩。' }));
  C.push(header('weifolan', '方法：参与式观察｜训练：从她的视角看现场｜学生动作：带着 5 个问题去现场待一个下午', 1180));
  C.push(...rowCards('weifolan', 'sticky', [
    { text: '她正在做什么？', color: 'green' }, { text: '她为什么停留？', color: 'green' }, { text: '她和谁互动？', color: 'green' }, { text: '她主动参与还是旁观？', color: 'green' }, { text: '她如何描述这里？（记原话）', color: 'green' },
  ], { y: 150, cardW: 230, cardH: 260 }));
  C.push(at('weifolan.note', 'weifolan', 'text', { x: PAD, y: 450, w: 1000, h: 60 }, { content: '审美取向：旁观也是参与；"没做什么"也是一种在场。' }));
  C.push(sign('weifolan', '方法来源：魏佛兰（生态参与式设计）· 领域特色方法', 540));

  // 吴端 · 空间线索观察 — 放射关系网
  C.push(scaffold('wuduan', 'discover', '吴端 · 空间线索观察', { vd_scaffold_root: true, vd_method_source: ms('spatial-cue', 'A', ['吴端']), vd_usage_note: '很多老年活动发生在边界、转角、入口、树荫、栏杆旁。' }));
  C.push(header('wuduan', '方法：空间线索观察｜训练：从空间要素读出行为信号｜学生动作：每个要素找真实地点拍照', 1000));
  C.push(...radial('wuduan', 'center', '老人的空间感受', [
    { text: '边界：哪些让人愿意停留？', label: '停留' }, { text: '路径：哪些让人愿意探索？', label: '探索' }, { text: '入口：老人如何识别空间？', label: '识别' }, { text: '标识：哪些带来安全感？', label: '安全感' }, { text: '节点：哪些形成社交聚集？', label: '聚集' },
  ], { cx: 520, cy: 470, r: 300, nodeW: 240, nodeH: 130 }));
  C.push(sign('wuduan', '方法来源：吴端（空间与标识设计）· 领域特色方法', 820));

  // 辛向阳 · 可玩体验触点链 — 横向时间轴
  C.push(scaffold('xxy', 'discover', '辛向阳 · 可玩体验触点链', { vd_scaffold_root: true, vd_method_source: ms('touchpoint-chain', 'C', ['辛向阳']), vd_usage_note: '设计对象是行为，不是流程。观察每个环节发生/中断在哪。' }));
  C.push(header('xxy', '方法：可玩体验触点链｜训练：把"玩"拆成参与关系的推进与退出｜学生动作：现场记录每环节案例', 1180));
  C.push(...timeline('xxy', [
    { text: '看见' }, { text: '靠近' }, { text: '停留' }, { text: '试探' }, { text: '加入' }, { text: '退出' }, { text: '再次回来', shape: 'ellipse', color: 'green' },
  ], { y: 150, stepW: 195, stepH: 150, loop: true }));
  C.push(at('xxy.note', 'xxy', 'sticky', { x: PAD, y: 360, w: 560, h: 130 }, { content: '轻触发、弱任务、可中断，比复杂互动更有尊严。', color: 'orange' }));
  C.push(sign('xxy', '方法来源：辛向阳（交互设计理论）（即席合成）· 即席方法，用后需评估', 1000));

  await postCommands(wsId, C);
  console.log('scene1 done');
}

/* ---------------- scene2: 洞察聚类 + 批注 + 共创角色 Widget ------------------ */
const ROLE_WIDGET_HTML = fs.existsSync(path.join(HERE, 'role-widget.html')) ? fs.readFileSync(path.join(HERE, 'role-widget.html'), 'utf8') : null;

async function scene2() {
  const { wsId } = loadState();
  const C = [];
  // 聚类脚手架 — 横向"松散分类"便签行（用户内容）
  C.push(scaffold('cluster', 'discover', '洞察聚类 · 观察材料分类', { vd_scaffold_root: true, vd_method_source: ms('insight-cluster', 'B', ['马谨', '魏佛兰']), vd_usage_note: '把观察材料整理成类。分类会变粗糙——这正是专家介入的地方。' }));
  C.push(header('cluster', '方法：洞察聚类｜训练：从材料长出分类｜学生动作：把便签拖成组，给每组暂定名', 1180));
  const rough = ['老人喜欢热闹', '老人需要休息', '老人喜欢和熟人聊天', '老人喜欢安全的空间', '老人需要娱乐活动'];
  rough.forEach((t, i) => C.push(at(`lei-${i + 1}`, 'cluster', 'sticky', { x: PAD + i * 250, y: 150, w: 220, h: 220 }, { content: t, color: 'yellow', meta: { vd_created_by: 'user', vd_author: 'user' } })));

  // 共创角色 Widget（魏佛兰）
  if (ROLE_WIDGET_HTML) {
    C.push({
      op: 'add_widget', id: 'cocreate-roles', stage: 'discover', title: '共创角色 Widget · 老人参与角色', html: ROLE_WIDGET_HTML,
      state: { status: 'user_reviewing', last_actor: 'expert', merges: 0, groups: [
        { id: 'g1', name: '观察型', roles: [{ id: 'r1', label: '观察型老人', desc: '喜欢看，不一定加入' }] },
        { id: 'g2', name: '节奏型', roles: [{ id: 'r2', label: '节奏型老人', desc: '每天固定路线和时间出现' }] },
        { id: 'g3', name: '社交型', roles: [{ id: 'r3', label: '社交型老人', desc: '通过聊天、交换信息获得乐趣' }] },
        { id: 'g4', name: '展示型', roles: [{ id: 'r4', label: '展示型老人', desc: '唱歌、跳舞、下棋表达自己' }] },
        { id: 'g5', name: '照护型', roles: [{ id: 'r5', label: '照护型老人', desc: '带孙辈、陪伴家人，也在使用城市' }] },
      ] },
      output_schema: { type: 'object', properties: { groups: { type: 'array' } } },
      meta: { vd_method_source: ms('cocreate-role', 'C', ['魏佛兰']) },
    });
  }
  await postCommands(wsId, C);

  const t1 = await shapeIdFor(wsId, 'lei-1');
  const t5 = await shapeIdFor(wsId, 'lei-5');
  const fb1 = await api('POST', `/api/canvas-workspaces/${wsId}/feedback`, { author: { kind: 'expert', name: '辛向阳' }, direction: 'expert_to_content', targets: t1 ? [{ shape_id: t1 }] : [], content: '"老人喜欢热闹"太粗了。交互设计关心参与关系：她是观看者、加入者、组织者，还是被动接受者？先把这句话拆开。', meta: { next_action: '把"热闹"改写成 2-3 种具体参与关系。' } });
  saveState({ fbXxyId: fb1.id });
  await api('POST', `/api/canvas-workspaces/${wsId}/feedback`, { author: { kind: 'expert', name: '魏佛兰' }, direction: 'expert_to_content', targets: t5 ? [{ shape_id: t5 }] : [], content: '"需要娱乐活动"是设计师语言。先看老人以什么角色在场，再谈他们"玩"什么。共创角色 Widget 里拖动合并——这不是最终分类。', meta: { next_action: '按现场观察拖动角色卡，合并或改名。' } });
  console.log('scene2 done');
}

/* ---------------- scene3: 补全 → 三层框架 + 六维评价 + 方向卡 ---------------- */
async function scene3() {
  const { wsId } = loadState();
  const C = [];
  // 研究问题收束（Define）— 卡片
  C.push(scaffold('rq', 'define', '研究问题 · 收束', { vd_scaffold_root: true, vd_method_source: ms('research-question', 'B', ['马谨', '辛向阳', '刘洋']), vd_usage_note: '不儿童化老人，不娱乐化城市，不把适老化简化为设施补丁。' }));
  C.push(header('rq', '研究问题（收束）', 900));
  C.push(at('rq.q', 'rq', 'text', { x: PAD, y: 130, w: 1000, h: 220 }, { content: '在城市公共空间中，如何识别并支持老年人的日常可玩行为，使城市从"适老的安全空间"进一步转化为"老年人愿意参与、探索、表达和再发现的生活场域"？' }));
  C.push(at('rq.taste', 'rq', 'sticky', { x: PAD, y: 380, w: 560, h: 150 }, { content: '研究品味三不：不儿童化老人 / 不娱乐化城市 / 不把适老化做成设施补丁', color: 'violet' }));

  // 三层可玩性框架（Define）— 分层带：每层一行
  C.push(scaffold('three', 'define', '三层可玩性框架（多专家共创）', { vd_scaffold_root: true, vd_method_source: ms('playability-3layer', 'C', ['辛向阳', '马谨', '刘洋', '吴端', '魏佛兰']), vd_usage_note: '由补全请求触发的多专家共创。', vd_completion_source: 'region_annotation' }));
  C.push(header('three', '三层可玩性框架', 1000));
  C.push(at('three.l1', 'three', 'text', { x: PAD, y: 130, w: 1100, h: 50 }, { content: '第一层 · 可玩性是一种关系' }));
  C.push(...rowCards('three', 'shape', [{ text: '身体关系', shape: 'ellipse', color: 'light-violet' }, { text: '社交关系', shape: 'ellipse', color: 'light-violet' }, { text: '认知关系', shape: 'ellipse', color: 'light-violet' }, { text: '情感关系', shape: 'ellipse', color: 'light-violet' }], { y: 190, cardW: 250, cardH: 120 }));
  C.push(at('three.l2', 'three', 'text', { x: PAD, y: 340, w: 1100, h: 90 }, { content: '第二层 · 玩是低压力的参与：慢慢进入、随时退出、旁观也成立、轻微参与也有意义' }));
  C.push(at('three.l3', 'three', 'text', { x: PAD, y: 450, w: 1100, h: 110 }, { content: '第三层 · 设计是调整城市节奏：座椅形成观看关系；路径制造轻微探索；标识引导发现附近事件；街角允许偶遇和停留' }));
  C.push({ op: 'add_connector', from: 'xxy', to: 'three', label: '触点链证据', type: 'evidence' });

  // 可玩城市评价 Template（Develop）— 3×2 网格 rubric
  C.push(scaffold('rubric', 'develop', '可玩城市评价 Template', { vd_scaffold_root: true, vd_method_source: ms('playable-rubric', 'C', ['马谨', '刘洋', '吴端', '辛向阳', '魏佛兰']), vd_usage_note: '评估一个具体场地的六维可玩性，每维给现场证据。' }));
  C.push(header('rubric', '方法：可玩城市评价｜训练：把"好玩"变成可核验的维度｜学生动作：选一个街角逐维找证据', 1000));
  C.push(...gridCards('rubric', 'slot', [
    { title: '身体可玩', text: '慢走、停留、轻运动、身体练习？' }, { title: '社交可玩', text: '围观、搭话、组队、熟人相遇？' }, { title: '认知可玩', text: '寻找、记忆、识别、路线选择？' },
    { title: '情感可玩', text: '被需要、被看见、有掌控感？' }, { title: '时间可玩', text: '早/午/晚形成不同节奏？' }, { title: '边界可玩', text: '入口/转角/树荫/栏杆是否激活？' },
  ], { cols: 3, cardW: 320, cardH: 230, y0: 150 }));
  C.push(sign('rubric', '方法来源：马谨、刘洋、吴端、辛向阳、魏佛兰（即席合成）· 即席方法', 800));

  // 可玩街角系统 方向卡（Develop）— AI 草稿，横向组件行
  C.push(scaffold('corner', 'develop', '设计方向 · 可玩街角系统（AI 草稿，待确认）', { vd_scaffold_root: true, vd_ai_draft: true, vd_method_source: ms('corner-direction', 'C', ['刘洋', '吴端', '辛向阳']), vd_usage_note: '不做大型老年乐园——那会把老人从真实城市隔离。选普通社区街角做轻量介入。' }));
  C.push(header('corner', '价值主张：把老人重新放回城市公共生活，而不是另建孤岛。', 1180));
  C.push(...rowCards('corner', 'sticky', [
    { text: '可停留的微型观察席', color: 'light-blue' }, { text: '可交换信息的社区事件牌', color: 'light-blue' }, { text: '可被老人自己更新的路线标记', color: 'light-blue' }, { text: '可围观、可加入的小型活动界面', color: 'light-blue' }, { text: '连接菜市场-公园-公交站的慢行探索路径', color: 'light-blue' }, { text: '留下记忆、故事、推荐路线的共创墙', color: 'light-blue' },
  ], { y: 150, cardW: 240, cardH: 240, gap: 30 }));
  C.push({ op: 'add_connector', from: 'rubric', to: 'corner', label: '评价维度 → 设计组件' });

  await postCommands(wsId, C);
  const rq = await shapeIdFor(wsId, 'rq');
  await api('POST', `/api/canvas-workspaces/${wsId}/feedback`, { author: { kind: 'expert', name: '刘洋' }, direction: 'expert_to_content', targets: rq ? [{ shape_id: rq }] : [], content: '这个问题现在可以做证据设计了。下一步别急着画方案：选一个街角，用行为轨迹框架做 3 次不同时段记录，让评价 Template 每个维度都有第一批数据。', meta: { next_action: '选定街角 + 3 次分时段观察。' } });
  console.log('scene3 done');
}

/* ---------------- scene4: 批注闭环 + 开题证据链 ------------------------------ */
async function scene4() {
  const { wsId, fbXxyId } = loadState();
  if (fbXxyId) {
    await api('POST', `/api/canvas-workspaces/${wsId}/feedback/${fbXxyId}/reply`, { role: 'user', author: { kind: 'user', name: '小雷' }, text: '已把"热闹"拆成三种参与关系：围观、轻加入、组织。' });
    await api('POST', `/api/canvas-workspaces/${wsId}/feedback/${fbXxyId}/reply`, { role: 'expert', author: { kind: 'expert', name: '辛向阳' }, text: '这一版把参与关系拆出来了，可以继续。把"围观"当第一级参与写进触点链。', resolve: true });
  }
  const C = [];
  // 开题证据链（Deliver）— 横向序列链
  C.push(scaffold('chain', 'deliver', '开题交付 · 判断证据链', { vd_scaffold_root: true, vd_method_source: ms('evidence-chain', 'B', ['马谨']), vd_usage_note: '每个判断如何形成：哪个框架由谁提出、改了什么、批注是否回应、采纳或拒绝。' }));
  C.push(header('chain', '方法：判断证据链｜训练：让开题每个判断可追溯｜学生动作：核对每一环，缺证据的标"待补"', 1180));
  const links = [
    { t: '5 专家开题框架 → 小雷先进入"参与式观察"' }, { t: '粗分类 → 辛向阳批注"参与关系不清" → 拆成围观/轻加入/组织 → 已回应 ✅' }, { t: '共创角色 Widget：5 组角色卡，拖动合并' }, { t: '补全 → 三层框架 + 六维评价（多专家署名）' }, { t: '拒绝"老年乐园"，采纳"可玩街角系统"（AI 草稿）', color: 'green' },
  ];
  C.push(...timeline('chain', links.map((l) => ({ text: l.t, shape: 'rectangle', color: l.color || 'grey' })), { y: 150, stepW: 300, stepH: 240, gap: 50 }));
  C.push(at('chain.shelf', 'chain', 'sticky', { x: PAD, y: 430, w: 560, h: 130 }, { content: '有意搁置：老年人数字素养差异（开题后再评估）', color: 'orange' }));
  await postCommands(wsId, C);
  const ch = await shapeIdFor(wsId, 'chain');
  await api('POST', `/api/canvas-workspaces/${wsId}/feedback`, { author: { kind: 'expert', name: '马谨' }, direction: 'expert_to_content', targets: ch ? [{ shape_id: ch }] : [], content: '这一版已经从现象描述进入研究变量定义，可以支撑开题。证据链里角色分组还缺现场验证——开题陈述时标成"待验证假设"，这是诚实，也是专业。', meta: { next_action: '开题 PPT 把角色分组标为待验证假设。' } });
  console.log('scene4 done');
}

async function contextCheck() {
  const { wsId } = loadState();
  const ctx = await api('GET', `/api/canvas-workspaces/${wsId}/agent-context`);
  console.log(JSON.stringify({ node_count: ctx.current_ir_summary?.node_count, open_feedback: (ctx.open_feedback || []).length, widgets: (ctx.widget_instances || []).length, stages: (ctx.stage_routing?.stages || []).map((s) => s.key + ':' + s.exists) }, null, 1));
}

const cmd = process.argv[2] || 'setup';
const fns = { setup, scene1, scene2, scene3, scene4, context: contextCheck };
if (!fns[cmd]) { console.error('unknown cmd', cmd); process.exit(1); }
fns[cmd]().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
