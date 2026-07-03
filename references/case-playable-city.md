# 走通案例：老年人可玩城市（小雷 · 开题探索）

本文是一次**已在真实运行时走通并截图验收**的完整案例记录：一位设计研究学生（小雷）带着
初始题目「老年人可玩城市」进入 skill，从开题全景到开题交付画布的四幕全流程。所有命令都在
本地服务上实际执行过（布局零重叠、反馈线程闭环、Widget 状态持久化均已验证）。用它作为
生成参考可以显著提升稳定性；**但它是参照，不是预制件**——换项目时必须按"脚手架 = 专家
思考框架"管线重新想本质、重新构建框架，不要照抄分区。

## 0. 场景与专家团队

- 用户输入：`我想研究老年人可玩城市，但现在还在前期探索阶段。我希望先整理已有资料、
  观察和访谈，再看看这个方向有没有更清晰的研究切口。`
- 场景路由：项目从零开始（只有题目/想法）→ **项目导入 + 开题全景**（Discover）。
- 专家团队（5 位，上限内）：

| 专家 | 角色 | 入场理由 |
| --- | --- | --- |
| 刘洋（城市数据驱动设计） | 主导专家 | 课题本质是城市空间中的真实行为，判断要靠现场证据链 |
| 马谨（服务/系统设计） | 方法论锚点 | 先把"可玩"拆成可观察现象，问题语言决定方案空间 |
| 魏佛兰（生态参与式设计） | 支持专家 | 必须进入老人真实生活现场，尊重微小经验 |
| 吴端（空间与标识设计） | 支持专家 | 老年活动多发生在边界/转角/入口等不起眼空间 |
| 辛向阳（交互设计理论） | 支持专家 | "玩"的本质是参与关系的推进与退出，不是娱乐设施 |

- 判断契约与专家团队写入 workspace `context`（`expert_team` / `judgment_contract` /
  `current_stage: "discover"`），创建时传 `vd_initialize_stage_canvas: true` 自动生成
  四阶段骨架。

## 1. 幕一 · 开题全景（Discover）

课题卡 + 每位专家一个署名思考框架。每个框架都走了管线：想本质 → 定框架（甲/乙）→
选母型与工具 → 转成命令。**注意工具多样性**：便签放想法/观察项，text 放头卡与署名，
slot 放学生填写字段，geo + connector 画图示，一种 kind 不铺满一个框架。

**内部布局用显式坐标**（`bounds` 相对根 frame 左上角），每个框架画出**各异的母型形状**，
不是雷同竖条；外层由后端横向铺开、占满阶段高度（见 canvas-templates.md §4.5）：

| 脚手架 | 来源类 | 母型（内部形状） | 坐标要点 |
| --- | --- | --- | --- |
| 课题卡（role `topic.card`） | — | 卡片字段 | 命题/阶段/目标 text 纵向 + 困惑便签 |
| 马谨 · 研究问题拆解 | 乙 / C | **2×2 问题网格** | 4 问题便签 grid + 强调条 + 学生改写 slot |
| 刘洋 · 行为轨迹 × 空间节点 | 甲 / A | **3×2 字段网格** | 6 个观察字段 slot 排成 3 列 2 行 |
| 魏佛兰 · 参与式观察 | 甲 / A | **横向卡片行** | 5 张观察问题便签同一 y 横排 |
| 吴端 · 空间线索观察 | 甲 / A | **放射关系网** | 中心椭圆 + 5 要素按角度环绕 + 指向中心 connector |
| 辛向阳 · 可玩体验触点链 | 乙 / C | **横向时间轴** | 7 步同一 y 横排 + 串联 connector + 尾部循环 |

关键命令样例（专家框架根 + 结构化署名 meta——`experts` 数组是前端头像归因的数据源，
**必须是对象数组，不要写成一句字符串**）：

```json
{ "op": "add_node", "id": "majin-split", "kind": "section", "stage": "discover",
  "title": "马谨 · 研究问题拆解", "role": "scaffold.root",
  "meta": {
    "vd_scaffold_root": true,
    "vd_method_source": { "method_id": "question-decomposition", "class": "C",
      "experts": [{ "name": "马谨", "domain": "服务/系统设计" }] },
    "vd_usage_note": "一开始就把\"可玩城市\"拆成可观察的问题。把模糊概念拆成可研究的现象。"
  } }
```

图示关系用 `add_connector`（两个已有节点之间的箭头）：

```json
{ "op": "add_connector", "from": "wuduan-cues.e1", "to": "wuduan-cues.center", "label": "停留" }
```

## 2. 幕二 · 洞察聚类 + 专家批注 + 共创角色 Widget

1. `insight-cluster` 聚类脚手架（B 类，马谨×魏佛兰联署）+ 小雷的 5 张粗分类黄便签
   （模拟用户内容时 meta 加 `vd_created_by: "user"`）。
2. 专家批注走 **feedback API**，绑定到具体便签 shape（不是泛泛总评）：

```json
POST /api/canvas-workspaces/{id}/feedback
{ "author": { "kind": "expert", "name": "辛向阳" },
  "direction": "expert_to_content",
  "targets": [{ "shape_id": "shape:vd-ir-lei-1" }],
  "content": "\"老人喜欢热闹\"太粗了。交互设计关心的是参与关系：她是观看者、加入者、组织者，还是被动接受者？先把这句话拆开。",
  "meta": { "rationale": "设计对象是行为与参与关系", "next_action": "把\"热闹\"改写成 2-3 种具体参与关系" } }
```

   > shape_id 规律：`shape:vd-ir-{node_id，点号变连字符}`；从
   > `semantic_index.sections[].shape_id` / `nodes[].shape_id` 查询（section 在 sections
   > 数组里，不在 nodes 里）。

3. **共创角色 Widget**（魏佛兰署名，Tier 3 自由 HTML）：5 组角色卡（观察型/节奏型/社交型/
   展示型/照护型），支持拖动换组=合并、双击组名改写（contenteditable）、
   「物化到画布」按钮 `vd.emit('roles_materialize_requested', {groups})`。
   状态结构：

```json
{ "status": "user_reviewing", "merges": 0,
  "groups": [ { "id": "g1", "name": "观察型",
    "roles": [{ "id": "r1", "label": "观察型老人", "desc": "喜欢看，不一定加入" }] } ] }
```

   实现要点（完整模式见 widget-examples.md「局部操作型」）：
   - 卡片拖拽用 pointer events + `elementFromPoint` 找落点组；卡片是嵌套 div（非根直系
     子节点），不会触发宿主的 widget 整体拖拽契约。
   - 组名 `contenteditable` + blur 时 `vd.state.set`——**用户编辑经此路径实测已持久化到
     `semantic_index.widget_instances[].state`（actor=user）**。
   - agent 侧用 `update_widget` + `state_patch` 修改分组，实测能推回 iframe 并重渲染。

## 3. 幕三 · 补全请求 → 多专家共创（Define / Develop）

用户在画布上画紫色区域批注请求补全（用户专属工具；agent 读取
`open_region_annotations` / `open_completion_requests` 响应）。本轮生成，全部带
多专家 `vd_method_source`：

- Define：`rq-card` 研究问题收束卡（含"研究品味三不"紫便签）；`three-layer` 三层可玩性
  框架（层=slot，第一层内 4 个关系椭圆；层间 connector：`关系需要低压力入口` /
  `轻参与靠节奏支撑`；跨阶段证据线 `xxy-chain → three-layer`）。
- Develop：`playability-rubric` 可玩城市评价 Template（6 维 slot：身体/社交/认知/情感/
  时间/边界可玩，每维一句评价问题）；`corner-system` 可玩街角系统方向卡
  （**AI 草稿，待确认**，`vd_ai_draft: true`，6 个组件便签；connector
  `评价维度 → 设计组件`）。
- 生成后主导专家（刘洋）对 `rq-card` 发署名意见，给下一步动作（选定街角做 3 次分时段
  观察）。

## 4. 幕四 · 批注闭环 + 开题证据链（Deliver）

1. **批注闭环**（意见 → 学生回应 → 专家复评并 resolve）：

```json
POST /feedback/{fid}/reply  { "role": "user", "author": { "kind": "user", "name": "小雷" },
  "text": "已把\"热闹\"拆成三种参与关系：围观、轻加入、组织。" }
POST /feedback/{fid}/reply  { "role": "expert", "author": { "kind": "expert", "name": "辛向阳" },
  "text": "这一版把参与关系拆出来了，可以继续。", "resolve": true }
```

   实测：线程 3 条、状态 `resolved`；UI 中点击专家头像可见完整对话，hover 时画布上用
   虚线连到目标便签并高亮。

2. `evidence-chain` 开题证据链（Deliver，序列链）：5 个环节 geo 依次相连——专家框架 →
   批注闭环 → Widget 分组记录 → 补全共创 → 方向决策（拒绝老年乐园/采纳街角系统），外加
   「有意搁置」便签（王受之搁置原则）。末尾马谨作为方法论锚点复评：
   「这一版已经从现象描述进入研究变量定义，可以支撑开题。」

## 5. 验收结论（2026-07-03 实测）

- 命令 115 条全部 applied；布局审查零重叠、零溢出（含嵌套容器与阶段带重排）。
- 左侧专家栏正确显示 5 位专家 + 各自意见角标；小雷作为用户参与者出现。
- 专家意见面板 → 画布目标虚线联动、线程展开、resolved 状态均正常。
- Widget iframe 渲染、用户编辑写回、`update_widget` 下发三条链路实测通过。
- 待真机复核项：卡片拖拽合并、物化按钮 emit（与已验证链路同管道；自动化指针合成
  受限，需人工点一次确认）。
- 已知视觉小瑕疵：竖排图示的 connector label 会压在中间节点上（吴端框架）；frame 左上角
  专家头像 chip 与 hover 说明尚未在前端渲染（`vd_method_source` / `vd_usage_note`
  数据已就位）。

## 6. 复用指引

换一个"从零开题"的项目时，保持不变的是：**流程骨架**（课题卡 → 每专家一个署名框架 →
聚类+批注 → 补全共创 → 证据链交付）、**署名与 meta 约定**、**工具多样性纪律**。必须
重新生成的是：专家路由（按新领域）、每个框架的本质判断与内容、Widget 的角色/维度。
