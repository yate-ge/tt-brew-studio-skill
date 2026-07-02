# Widget 示例模式

本文是给智能体使用的 Widget 示例参考，不是固定组件库。智能体应根据当前项目阶段、用户目标、
画板证据和专家判断，自行决定是否创建 Widget、创建哪类 Widget，以及如何生成具体 UI、state、
events 和画板物化结果。

核心原则：

```text
对话 / 文件 / 画板内容 = 主输入
智能体本体 = 重分析、生成、调研、回写和物化
Widget = 结果呈现、轻量参数、用户选择和结构化状态
专家分身 = 必要时提供判断、风险、方法约束和下一步建议
```

Widget 不承担复杂资料输入。不要让用户在 Widget 中粘贴大段材料、选择大量文件、完成完整调研
录入，或承担本该由智能体完成的整理工作。用户主要通过对话、文件上传和已有画板内容给任务；
Widget 只承接轻量确认、点选、筛选、参数调整、补充一句话和提交结构化事件。

通用异步链路：

```text
智能体根据对话 / 文件 / 画板内容创建 Widget
-> 用户在 Widget 中轻量操作或提交请求
-> Widget 保存 state，并通过 vd.emit 发出结构化事件
-> 智能体下一轮读取 widget_instances + widget_output / feedback
-> 智能体处理请求并 update_widget 回写结果
-> 必要时用 CanvasIR 把稳定结果物化成画板 artifact
-> 智能体按阶段、风险和用户意图判断是否邀请专家给出署名判断
```

通用状态建议：

```json
{
  "status": "idle | submitted | agent_processing | result_ready | user_reviewing | accepted | materialized | error",
  "request": {},
  "result": {},
  "selected_items": [],
  "user_notes": "",
  "materialized_shape_ids": []
}
```

## 1. 智能体生成型可视化

代表例子：Topic 可视化分析 Widget。适合 Discover，也可用于 Deliver 的决策链、评审摘要或
证据梳理。

触发来源：

- 用户在对话中要求智能体分析文献、访谈、调研材料、竞品材料或画板内容，并梳理 topic。
- 用户上传文件后，智能体完成主题聚类、权重计算和证据提取。
- 智能体判断某组分析结果需要可交互呈现，而不是静态文字说明。

用户轻量输入：

- 点击某个 topic / 条形 / 扇区 / 节点。
- 切换视图：词云、条形图、饼图、topic cluster、关系图。
- 标记 `重点` / `待确认` / `不重要`。
- 点击 `展开这个 topic`、`生成洞察卡`、`物化到画板`。
- 可选补充一句话说明：为什么关注这个 topic。

Widget 记录：

```json
{
  "status": "result_ready",
  "view": "word_cloud",
  "topics": [
    {
      "id": "topic_1",
      "label": "信息焦虑",
      "weight": 82,
      "evidence_count": 7,
      "representative_evidence_ids": ["quote_1", "note_3"],
      "user_mark": "重点"
    }
  ],
  "selected_topic_id": "topic_1",
  "user_notes": "这个主题可能和招生海报的信息层级有关"
}
```

Widget events：

```text
topic_selected
topic_expand_requested
topic_mark_updated
topic_materialize_requested
```

智能体本体处理：

- 读取对话、上传文件或画板内容，完成主题提取、聚类、统计和证据索引。
- 回写 Widget 的可视化数据、代表性证据、topic 解释和待确认项。
- 用户请求展开时，生成更深入的主题解释、洞察候选和相关证据。
- 用户请求物化时，把选中的 topic 生成洞察 sticky、topic cluster、证据地图或调研摘要卡。

可能的专家介入（由智能体按 Skill 自行判断）：

- 判断 topic 是否过度概括，是否把推测当作观察。
- 指出证据薄弱、遗漏的人群 / 场景 / 材料类型。
- 从各自审美取向批注某个 topic 会打开什么设计机会、又会遮蔽什么。

输出：

- Widget 内输出：可视化图表、选中 topic、代表性证据、用户标记、展开解释。
- 画板输出：洞察 sticky、topic cluster、证据地图、调研摘要 frame。
- 专家输出：证据质量批注、遮蔽风险、下一步补充调研动作。

边界：

- 如果只是展示一张不会交互、不会被智能体读取的静态图表，应优先用 CanvasIR 原生图形或图片。
- 不要让用户在 Widget 中输入大量调研材料；材料应来自对话、文件上传或已有画板内容。

## 2. 轻量请求型

代表例子：Persona 草案生成 Widget。适合 Discover 中从已有材料生成可验证草案，也可派生为
HMW 改写、访谈问题生成、文献 topic 展开、竞品分析请求等。

触发来源：

- 用户已经在对话中描述项目，或上传了访谈 / 调研材料。
- 智能体判断现在需要一个轻量请求入口，让用户确认生成范围和少量参数。
- 用户要求“根据这些材料生成几个 persona / 竞品分析 / HMW 改写”。

用户轻量输入：

- 目标人群一句话。
- 使用场景一句话。
- 生成数量或发散程度：`保守` / `平衡` / `发散`。
- 点击 `提交生成请求`。
- 结果返回后，选择 `可信` / `太刻板` / `需要修改` / `物化为 Persona 卡`。

Widget 记录：

```json
{
  "status": "submitted",
  "request": {
    "target_group_hint": "准备申请设计学院的高中生",
    "context_hint": "开放日招生海报",
    "count": 3,
    "divergence": "平衡"
  },
  "result": {
    "personas": []
  },
  "selected_items": []
}
```

Widget events：

```text
persona_generate_requested
persona_feedback_submitted
persona_selected
persona_materialize_requested
```

智能体本体处理：

- 读取 Widget request、对话上下文、上传文件和已有画板证据。
- 生成 Persona 草案，并标明哪些内容来自证据、哪些是智能体推测。
- 用 `update_widget` 回写草案、证据依据、风险提示和待验证字段。
- 用户确认后，将 Persona 物化为 Persona 方法模板或 Persona 卡片。

可能的专家介入（由智能体按 Skill 自行判断）：

- 判断 Persona 是否刻板化，是否缺少真实证据。
- 提醒哪些字段必须通过访谈、观察或数据验证。
- 当用户把推测当事实时，发布署名警示批注。

输出：

- Widget 内输出：Persona 草案列表、证据依据、推测标记、风险提示、用户选择状态。
- 画板输出：确认后的 Persona 方法模板、Persona 卡片、需要验证的问题清单。
- 专家输出：刻板化风险、证据不足批注、下一轮调研建议。

边界：

- Widget 只收集轻量请求，不要求用户填写完整 Persona 表。
- Persona 是草案，不替代真实用户研究。

## 3. 调研请求型

代表例子：竞品分析请求 Widget。它是轻量请求型的一个特化：用户提供外部对象或少量线索，
智能体负责调研或整理材料，并按结构回写结果。

触发来源：

- 用户在对话中说要分析竞品、案例、文献、学校、品牌、活动或平台。
- 用户上传材料或提供若干名称 / 链接。
- 智能体判断需要把调研结果持续留在画板上，供用户筛选和后续物化。

用户轻量输入：

- 竞品名称或 URL，数量应少。
- 关注维度选择：定位、视觉语言、信息架构、用户承诺、功能结构、风险、可借鉴点。
- 一句关注问题，例如“它们如何吸引申请者？”
- 点击 `提交调研请求`。
- 结果返回后，勾选要进入竞品墙的条目。

Widget 记录：

```json
{
  "status": "submitted",
  "request": {
    "targets": [
      { "name": "Example School", "url": "https://example.com" }
    ],
    "dimensions": ["定位", "视觉语言", "用户承诺", "风险", "可借鉴点"],
    "focus_question": "它们如何吸引申请者？"
  },
  "result": {
    "competitors": []
  },
  "selected_items": []
}
```

Widget events：

```text
competitor_research_requested
competitor_row_selected
competitor_materialize_requested
```

智能体本体处理：

- 如果允许联网，调研竞品并记录来源；如果不能联网，请用户补充材料，不要伪造。
- 根据 request dimensions 输出结构化分析：定位、视觉语言、信息架构、用户承诺、优势、
  风险、可借鉴点和来源说明。
- 回写 Widget state，并标注 `source_notes` 和 `needs_verification`。
- 用户选择后，物化为竞品墙、对比矩阵、机会点 sticky 或风险清单。

可能的专家介入（由智能体按 Skill 自行判断）：

- 判断比较维度是否过于表层，是否只看视觉风格而忽略用户承诺和场景语境。
- 提醒某个竞品策略是否不适合当前项目。
- 从各自领域指出可借鉴点和不可借鉴点。

输出：

- Widget 内输出：竞品对比表、来源说明、待核验标记、用户选中条目。
- 画板输出：竞品墙、对比矩阵、机会点 sticky、设计约束或风险清单。
- 专家输出：比较维度批注、借鉴风险、语境差异提醒。

边界：

- 竞品结果必须带来源说明或待核验标记。
- 如果用户提供的只是一个名字，Widget 不应要求用户在内部完成完整资料录入；智能体应通过
  对话继续索取必要材料或说明限制。

## 4. 控制台型

代表例子：海报构图控制台 Widget。适合 Develop 阶段，让用户通过少量参数控制智能体生成或
修改 artifact。

触发来源：

- 用户要求生成海报、视觉方向、moodboard、UI 版式、配色或字体层级。
- 智能体已经生成 artifact 草案，需要一个轻量控制台承接下一轮迭代。
- 用户希望用几个明确参数反复调配方向。

用户轻量输入：

- 少量参数：标题位置、主视觉占比、信息密度、CTA 强度、风格倾向、生成数量。
- 点击 `生成 3 个版本`、`应用到当前海报`、`锁定这个方向`。
- 选择某个生成版本或标记需要专家再看。

Widget 记录：

```json
{
  "status": "submitted",
  "target_artifact_id": "poster_v1",
  "request": {
    "layout_params": {
      "title_position": "top",
      "hero_ratio": 0.6,
      "info_density": "medium",
      "cta_strength": "high",
      "style_tone": "实验 / 学院感"
    },
    "count": 3
  },
  "result": {
    "generated_artifact_ids": []
  },
  "selected_items": []
}
```

Widget events：

```text
poster_layout_generate_requested
poster_layout_apply_requested
artifact_variant_selected
expert_review_requested
```

智能体本体处理：

- 根据参数生成新 artifact，或修改目标 artifact。
- 生成版本链，记录每次改动对应的参数和理由。
- 回写 Widget 的生成状态、版本 ids、选中版本和错误信息。
- 用户确认后，把结果留在画板 artifact 区，并更新设计决策记录。

可能的专家介入（由智能体按 Skill 自行判断）：

- 批注信息层级、视觉重心、叙事路径、风格来源和语境风险。
- 提醒某些参数选择会遮蔽什么，例如可读性、行动线索、品牌一致性。
- 不直接生成 artifact；只提供判断和下一步动作。

输出：

- Widget 内输出：参数、生成状态、版本选择、目标 artifact 链接。
- 画板输出：海报 / UI / moodboard artifact、v1/v2/v3 版本链、设计决策记录。
- 专家输出：构图批注、审美风险、下一轮迭代建议。

边界：

- Widget 是控制台，不是最终 artifact。
- 参数不要太多；复杂 brief 仍通过对话表达。

## 5. 本地操作型

代表例子：方案筛选 Widget 或简单思维导图 Widget。适合用户在 Widget 内完成轻量操作，智能体
之后读取状态。

触发来源：

- 智能体已经生成多个方案、方向、问题卡、洞察或关系节点。
- 当前任务需要用户筛选、排序、标记、评分或调整关系。
- 操作复杂度超过普通 sticky 排列，但不需要智能体立即处理。

用户轻量输入：

- 将方案拖入 `保留` / `待定` / `淘汰`。
- 给某个方案补一句理由。
- 在思维导图中新增少量节点、拖拽关系、标记重点节点。
- 点击 `确认筛选`、`请分析这张图`、`物化关键节点`。

Widget 记录：

```json
{
  "status": "user_reviewing",
  "columns": {
    "keep": ["direction_1"],
    "maybe": ["direction_2"],
    "drop": ["direction_3"]
  },
  "reasons": {
    "direction_1": "更符合开放日的行动感"
  },
  "graph": {
    "nodes": [],
    "edges": []
  }
}
```

Widget events：

```text
screening_updated
screening_confirmed
mindmap_analysis_requested
key_nodes_materialize_requested
```

智能体本体处理：

- 读取用户筛选、排序、评分或思维图状态。
- 总结用户偏好和选择理由。
- 生成设计决策记录、下一轮迭代任务或关键节点清单。
- 根据用户请求，把关键节点物化为 sticky、关系图或任务卡。

可能的专家介入（由智能体按 Skill 自行判断）：

- 判断筛选理由是否充分，是否只按“好看 / 容易做”决策。
- 提醒被淘汰方案的潜在价值，或指出思维图中缺失的关键关系。
- 对关键节点、断裂点或关系结构发布署名批注。

输出：

- Widget 内输出：筛选状态、用户理由、图结构、确认状态。
- 画板输出：设计决策记录、下一轮迭代任务、关键节点 sticky、关系 connector。
- 专家输出：方案对照批注、关系结构风险、下一步验证动作。

边界：

- 本地操作型 Widget 不应吞掉需要长期编辑的画板内容。稳定结果应物化为原生画板节点。
- 如果只是简单排列 sticky，用原生画板即可。

## 6. 阶段推进型

代表例子：Develop 阶段的方案推进控制台。适合用户说"继续推进 / 生成几个方向 / 帮我接着细化"，
并且当前阶段需要通过少量参数生成、筛选或物化下一批内容。

触发来源：

- 当前阶段已有上游证据，例如 HMW、评价标准、Persona、旅程或已选方案。
- 用户要继续推进，而不是全项目诊断。
- 生成或筛选动作需要保留状态：方向参数、候选项、用户选择、物化目标。

Widget 记录：

```json
{
  "status": "submitted",
  "source_stage": "define",
  "source_shape_ids": ["shape:vd-ir-hmw-main", "shape:vd-ir-criteria"],
  "target_stage": "develop",
  "request": {
    "action": "generate_directions",
    "count": 5,
    "constraints": ["必须回应 HMW", "保留低精度原型可能性"]
  },
  "result": {
    "directions": []
  },
  "selected_items": []
}
```

Widget events：

```text
stage_progress_requested
direction_selected
direction_materialize_requested
stage_progress_accepted
```

智能体本体处理：

- 读取来源 shape 和上游证据，再生成候选方向；每个候选标明回应了哪个 HMW / 评价标准。
- 用户选择后，把稳定方向物化为 Develop 阶段的方案卡、低精度原型计划或决策记录。
- 更新 Widget 到 `materialized` 并记录 `materialized_shape_ids`。

专家介入：

- 主导专家评审候选方向是否真的回应上游问题。
- 方法论锚点检查筛选标准是否清楚。
- 专家不替用户选择最终方向。

边界：

- 没有上游证据时，先补 Define 脚手架，不创建推进控制台。
- 如果只是写几个静态方向，优先用方案墙方法模板，不必做 Widget。

## 7. 全项目诊断型

代表例子：跨阶段针灸式诊断 Widget。适合四阶段诊断包已经建立、并且每个阶段都有证据后，用来
比较不同阶段里的潜在杠杆点。

触发来源：

- 用户请求诊断、评审或优化整个项目。
- Discover / Define / Develop / Deliver 四个阶段已经有项目化脚手架和 seed 内容。
- agent 已从这些脚手架里提取出可比较的问题点、证据来源和待验证假设。

Widget 记录：

```json
{
  "status": "user_reviewing",
  "points": [
    {
      "id": "hmw_unclear",
      "label": "评价标准不清",
      "source_stage": "define",
      "source_shape_id": "define-diagnosis.criteria",
      "severity": 7,
      "leverage": 9,
      "evidence_summary": "Define 阶段未找到明确的成功标准",
      "ai_note": "AI 初评，需学生校正"
    }
  ],
  "selected_items": [],
  "user_notes": ""
}
```

Widget events：

```text
diagnosis_point_selected
diagnosis_score_updated
diagnosis_lever_confirmed
diagnosis_materialize_requested
```

智能体本体处理：

- 只从四阶段脚手架里的 root / slot / Widget 输出提取点，不用抽象标签凑数。
- 回写每个点的来源、证据摘要、严重度和传导力初评。
- 用户确认后，把杠杆点物化为阶段内任务卡、HMW 修订卡、信息架构调整卡或风险处理卡。

可能的专家介入：

- 主导专家命名跨阶段设计张力。
- 方法论锚点检查所选杠杆点是否真的有证据和评价标准。
- 领域专家指出这个点在真实使用场景中可能带来的连锁影响。

边界：

- 如果四阶段内容还没落位，不创建这个 Widget；先补四阶段模板和内容。
- 如果点没有 `source_stage` 或 `source_shape_id/source_note`，只能标 `AI 推测，需验证`，
  不能高亮为推荐。
- Widget 不替学生选杠杆点，只让学生校正、选择和请求物化。

## 阶段映射示例

这些示例只提示生成方向，不是固定菜单。

| 阶段 | 可优先考虑的 Widget 模式 | 示例 |
| --- | --- | --- |
| Discover | 智能体生成型可视化、轻量请求型、调研请求型 | Topic 可视化分析、Persona 草案生成、竞品分析请求、证据强度标尺 |
| Define | 轻量请求型、本地操作型、判断评审型 | HMW 检查 / 改写、问题优先级矩阵、针灸位点识别、约束梳理 |
| Develop | 控制台型、本地操作型、判断评审型 | 视觉方向控制台、海报构图控制台、Moodboard remix、方案筛选 |
| Deliver | 智能体生成型可视化、本地操作型、流程辅助型 | 最终评审 Rubric、决策链追踪、交付准备 Tracker、风险 / 搁置清单 |

## 生成前自检

创建 Widget 前，智能体应先问自己：

1. 这个动作是否真的需要交互、状态、计算、筛选、参数控制或结构化输出？
2. 用户输入是否足够轻量？复杂材料是否已经通过对话、文件或画板提供？
3. Widget 的 state 是否能让下一轮智能体明确知道要处理什么？
4. 哪部分由智能体本体处理，是否需要专家分身判断，哪部分由用户确认？
5. 稳定结果应该如何物化为 CanvasIR 原生画板内容？
6. 如果不做 Widget，是否用方法模板或普通画板节点更清楚？
