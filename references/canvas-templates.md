# 方法模板（Canvas Templates）

方法模板（CanvasIR Template）是锚定在画板上的**静态设计方法脚手架**。它承载确认后的设计
知识：结构、板块、slot、提示语、证据要求和专家审美介入点，引导学生把设计思考亲手填进
限定结构里。

方法模板首先是**专家的思考框架**，其次才是画布结构。任何模板生成都从专家的顶层判断开始
（"这个项目的本质是什么、当前阶段需要什么框架性支持"），框架来源有两个：

- **甲｜既有方法框架**：设计学 / 创意领域的成熟方法（Persona、旅程、各类矩阵、商业模式
  画布等），即 design-methods.md 的 A/B 类目录。专家因为"这个项目的本质需要它"而选它，
  不是按阶段套模板。
- **乙｜项目本质框架**：专家把自己领域的概念框架 / 设计框架 / 交互框架针对本项目现场
  构建。例：为一个 agent skill 项目构建"skill 由哪些部分组成 / 需要什么流程 / 实现什么
  功能"的组成框架；孙效华为 agent 类项目带入 human-agent interaction / 智能体交互框架。
  乙类按 C 类署名（`即席合成`）。

选定框架后，智能体本体把它**设计成画布脚手架结构**（选母型、定 slot、选原生工具、排布局），
再转成 CanvasIR 命令写入画板。框架必须同时贴合项目现有材料与学生正在思考的问题；
"已有资料 / 待补资料"式与项目无关的通用分区空桶是反模式。

它和交互组件（Widget）是同一系统的两半：

```text
方法模板 = 静态知识结构（长期留存、可编辑、学生亲手填）
交互组件 = 动态动作工具（可丢弃、有状态、承载一次交互动作）
Widget 的稳定结果 → 物化进 方法模板
```

本文是方法模板的**判断契约**：什么是方法模板、何时创建、有哪些结构母型、怎么生成、
质量底线是什么、专家在生成上扮演什么角色。运行时机制细节（节点 kind、`insert_template`、
`seed`、几何编译）见 [canvas-ir.md](canvas-ir.md)；具体方法规格（板块、署名、AI 角色）见
[design-methods.md](design-methods.md)；详细示例见 [template-examples.md](template-examples.md)。

## 1. 方法模板是什么，不是什么

方法模板是由原生画板节点组成的结构脚手架：

- 一个根 frame（`section`，`role = "scaffold.root"` 或方法自有 root），承载整个方法。
- 若干板块（`section` / `slot`），每个板块带标题和一句 slot 提示语，告诉学生这里放什么。
- 顶部一组**一句话说明**（见 §6）；专家归属只写入 `vd_method_source` meta，不在画布上放署名。
- 内容默认留空；如需预填，使用浅色草稿并在 meta/语义层标记为 AI 草稿，真正的内容由学生亲手确认。
- 视觉上只给最外层 root frame 黄色边框，表示“agent 创建的视觉脚手架”；内部 slot、便签、
  文本、连接线和材料保持各自语义颜色，不整包染黄。

方法模板**不是**：

- 不是学生可见的模板选择器 / 工具栏 / 固定菜单。它由智能体按项目语境现场生成。
- 不是 artifact。artifact（海报、终稿、视觉资产）是学生用方法模板产出的作品；方法模板
  只是承载思考的结构。
- 不是 Widget。凡是需要状态、计算、拖拽、筛选、异步请求的，用 Widget，不要塞进方法模板。
- 不是运行时以外的通用模板系统。`/api/canvas-templates` 暴露的内置模板只是方法模板的一种
  实现形式（Tier 1），不是独立产品。

## 2. 什么时候创建方法模板（触发 Rubric）

判断顺序（和 Widget 合约、design-methods §2 一致）：

```text
普通展示 / 一句话说明          → 原生画板节点（sticky / text / frame）
静态方法结构、学生要亲手填     → 方法模板（本文）
需要交互 / 状态 / 计算 / 筛选   → 交互组件（canvas-widgets.md）
```

满足以下之一时创建方法模板：

1. **需要把设计思考拆成固定板块**，让学生在结构里观察、填写、比较、记录、取舍。
2. **价值在结构完整性**：维度是否覆盖、证据链是否清楚、是否有遗漏。
3. **内容需要长期留在画板上并可继续编辑**（不是一次性交互结果）。
4. **是 Widget 或 artifact 的沉淀落点**：Persona 生成器的确认结果、方案筛选的决策记录、
   决策链的证据，都应物化成方法模板。
5. **证据链类 / 记录类 / 收敛类方法**（design-methods §2 规则 1）。

**边界（和 Widget 的交叉带）**：关系类、网格矩阵类可以是方法模板（静态描摹一次），也可以
是 Widget（需要拖动、权重、排序、筛选、视图切换）。默认保守：能用方法模板 + 原生节点清楚
表达的，不做 Widget。

### 项目推进中的模板组

方法模板不只用于诊断。任何设计推进场景都应先在目标阶段放一个项目化脚手架，再填内容。
当任务覆盖多个阶段（例如全项目诊断、阶段转换、跨阶段复盘）时，模板是一组分布在四阶段 frame
内的脚手架；当任务只推进当前阶段时，模板落在目标阶段，但要通过 connector 引用上游证据：

```text
Discover 资料/灵感/证据脚手架
Define   定位/用户/问题脚手架
Develop  方案/信息架构/迭代脚手架
Deliver  交付/导则/风险脚手架
```

通用生成顺序必须是：

1. 先确认或创建四阶段 stage frame。
2. 判断场景和目标阶段范围。
3. 先在目标阶段创建 `scaffold.root`、一句话说明、slot 和待补区。
4. 再把项目证据、用户反馈、Widget 输出、AI 草稿或 `未发现 / 待补` 填入对应 slot。
5. 再用 connector 表达阶段之间的证据流向、方案来源或问题回跳。
6. 最后让专家意见绑定到具体 root / slot / connector / Widget。

当用户直接编辑模板内部普通画布对象时，只有文本内容变化才算待处理；移动、缩放、旋转、
换形状或改样式不算。文本变化后，该对象本轮临时切换可用主题色为紫色并显示紫色待处理高亮；
用户撤销或改回原文本时，运行时恢复原色并清除高亮。不要把这种用户待处理高亮误认为模板 root
的黄色脚手架边框。

每个阶段 root 都应有清楚的阶段目的和学生动作：

- Discover：把项目里已经有的资料和前期发散摊开，标明来源和证据强度。
- Define：从资料中抽出定位、用户、场景、HMW、评价标准或待定义问题。
- Develop：梳理方案结构、功能展开、信息架构、版本迭代和取舍。
- Deliver：沉淀可交付产物、架构、设计原则、导则、风险和搁置清单。

如果场景要求覆盖某阶段但没有证据，仍然保留该阶段 root，并在待补 slot 写明缺什么；不要删除
阶段，也不要把内容挪到别的阶段凑满。普通继续推进只需覆盖当前目标阶段，但必须保留与上游
证据或下游输出的关系。

## 3. 方法模板的 6 个结构母型

方法模板按**结构形态**分为 6 个母型。具体方法（Persona、旅程、HMW…）是母型的实例：选一个
母型 + 填入阶段相关内容。

| 母型 | `vd_layout_archetype` | 最小几何要求 | 承载什么 | 典型方法 |
| --- | --- | --- | --- | --- |
| **卡片字段型** | `card_fields` | 一个 root + 4-8 个字段 slot；可纵向堆叠或左右主辅栏 | 一个实体的多个属性 | Persona、竞品卡、规范卡、方案卡 |
| **分区收集型** | `collection_zones` | 一个 root + 3-5 个分区 section；每区保留 sticky 留白 | 分类收集材料 | 证据墙、田野日志、moodboard、张力板、方案墙 |
| **网格矩阵型** | `matrix_grid` | 一个 root + 明确行列或双轴；至少 2×2，不得伪装成列表 | 多维交叉比较 | 商业模式画布、优先级矩阵、决策矩阵 |
| **时序层带型** | `timeline_swimlane` | 横向阶段列 × 纵向泳道；至少 3 个时间点或阶段 | 过程随时间展开 | 用户旅程、服务蓝图 |
| **关系网络型** | `radial_network` | 中心节点 + 4 个以上环绕节点 + connector；可放射或分群 | 元素间关系 | 利益相关者地图、生态系统图 |
| **序列链型** | `evidence_chain` | 左到右有向链；至少 3 个节点 + connector，强调证据流向 | 因果与演进链条 | 版本链、决策依据链、HMW 证据链 |

三个是主力（`card_fields` / `collection_zones` / `evidence_chain`，几乎每阶段都用），三个是专用
（`matrix_grid` / `timeline_swimlane` / `radial_network`）。母型不是固定菜单，智能体可以组合、
裁剪、按项目改写；但每个 root 必须在 meta 写明 `vd_layout_archetype` 和一句
`vd_layout_signature`。

同一批次多个专家框架必须有可见形态差异：2-3 个 frame 至少 2 种母型；4-5 个 frame 至少
3 种母型；相邻专家 frame 不连续使用同一母型。若项目确实需要同一母型，也要改变布局签名
（如"左右主辅栏卡片" vs "三列字段卡片"），并在 `vd_layout_signature` 说明理由。

生成前先形成内部计划：

```json
[
  {
    "stage": "discover",
    "root_id": "liuyang-behavior-map",
    "expert": "刘洋",
    "vd_layout_archetype": "matrix_grid",
    "vd_layout_signature": "3x2 behavior-by-space matrix with evidence notes",
    "stage_target": "stage.discover"
  }
]
```

## 4. 三层生成策略

稳定性来自缩小生成面，优先级：

- **Tier 1 — 复用内置方法模板**：`insert_template` + `template_id`。HTML/几何来自内置模板。
  当前内置：`business_model_canvas`。生成前先查 `GET /api/canvas-templates`（也在
  agent-context 的 `available_templates` 中）。
- **Tier 2 — 内置模板 + `seed` 内容**：仍走 `insert_template`，但用 `seed` 把智能体分析出的
  内容按 slot 预填为浅色 AI 草稿，并在 meta/语义层标记待确认。学生在草稿基础上修改确认。
- **Tier 3 — 自由结构组合**：内置模板覆盖不了时，用 `add_node` 组合 `section` + `slot` +
  提示语 + 一句话说明 + `vd_method_source` meta。**这是方法模板的一等公民路径**——6 母型中除商业模式画布外，绝大多数
  方法模板都走 Tier 3 现场组合。

Tier 3 组合骨架：

```json
[
  { "op": "add_node", "id": "persona-x", "kind": "section", "stage": "discover",
    "title": "Persona：犹豫型申请者", "role": "scaffold.root",
    "meta": {
      "vd_layout_archetype": "card_fields",
      "vd_layout_signature": "two-column persona field card with evidence check",
      "vd_method_source": {
        "method_id": "persona",
        "class": "B",
        "experts": [{ "name": "马谨", "domain": "服务/系统设计" }]
      }
    } },
  { "op": "add_node", "id": "persona-x.header", "kind": "text", "parent": "persona-x",
    "bounds": { "x": 44, "y": 28, "w": 760, "h": 92 },
    "text_size": "xl", "font": "sans",
    "content": "Persona：犹豫型申请者\n请从真实证据填写这个人的情境、动机、行为和来源。" },
  { "op": "add_node", "id": "persona-x.basic", "kind": "slot", "parent": "persona-x",
    "bounds": { "x": 44, "y": 150, "w": 360, "h": 180 },
    "title": "基本信息", "content": "给这个人一个具体锚点（浅色草稿，待确认）" },
  { "op": "add_node", "id": "persona-x.evidence", "kind": "slot", "parent": "persona-x",
    "bounds": { "x": 436, "y": 150, "w": 360, "h": 180 },
    "title": "数据来源标注 ⚠️", "content": "强制自检：基于真实访谈聚类还是假设草拟？" }
]
```

`stage` 决定落入哪个阶段带；不传 `parent` 时按 `stage` 自动落位。方法内部板块用 `parent`
指到 root section。

## 4.5 内部布局由你设计（给坐标，不靠自动排）

这是本次最重要的规则：**每个脚手架的内部布局由智能体亲手设计，用显式相对坐标画出来，
而不是发一堆语义节点让后端按规则流式排布**。后端的旧规则会把所有东西挤成雷同的竖条，
让不同框架看起来一模一样，失去视觉脚手架的意义。

**分工：**

- **外层（后端硬写死，你不用管）**：每个阶段是一排**横向**脚手架，从左到右排；脚手架
  自动**占满阶段高度**（约 1500，多出的空白就是学生工作区）；阶段不够就往右加宽。过大的
  脚手架会按可用高度 / 最大宽度等比例缩小；你也可以在 root `meta.vd_scaffold_scale` 给建议
  缩放。你**不需要**给脚手架根 frame 的外层位置——后端负责。
- **内层（你来设计）**：脚手架根 frame 内部，用 `bounds: { x, y, w, h }` 给每个子节点
  **相对根 frame 左上角**的坐标，画出这个框架该有的形状。后端尊重你的坐标，不再自动重排。

**通用要求：**

- **横向优先**：内部主体尽量横向展开（时间轴横排、网格多列），贴合"每个阶段是横向一排"。
- **占满高度**：把主体 + 学生工作区布置到约 1200–1400 高，让脚手架不显空、比例舒服。
- **按教学价值控大小**：只把本轮最有训练价值的维度做大；辅助信息做小或进侧栏。单个脚手架
  不应靠巨大面积显得重要，必要时用 `meta.vd_scaffold_scale` 缩到能在阶段区域里舒服放下。
- **root frame 名称 = 脚手架标题**：`scaffold.root` 的 `title` 会成为可见 frame 名称，命名要短、
  具体、可导航。
- 顶部放一句话说明（大标题 + 灰色小字，见 §6），**不放署名、不放 AI 元信息**。
- 关系用 `add_connector`（两个已放置节点之间），不要用坐标硬画箭头。

**样式字段**（`add_node` 可选，用来做出参考图观感）：

| 字段 | 取值 | 用途 |
| --- | --- | --- |
| `text_size` | `s` / `m` / `l` / `xl` | 大标题用 `xl`、分区标题 `l`、引导问题/正文 `s` |
| `font` | `draw` / `sans` / `serif` / `mono` | 画布标题用 `sans` 更像正式画布 |
| `color` | 语义色名 | 引导问题用 `grey`；强调用色名 |
| `text_align` | `start` / `middle` / `end` | 居中标签用 `middle` |
| `fill`（geo） | `none` / `semi` / `solid` | **包围形用 `none` 只描边不遮内容**；中心特征用 `semi` |
| `dash`（geo） | `draw` / `solid` / `dashed` / `dotted` | 分隔线 / 阶段列用 `dotted` |

**按母型给坐标（必须形成不同 layout signature）：**

- `card_fields`：字段卡。root 内放 4-8 个 slot；可用 `2 columns x 3 rows`，或左侧主字段
  + 右侧证据栏。公式：`col = i % cols`，`row = floor(i / cols)`。
- `collection_zones`：分区墙。root 内放 3-5 个分区 section，每个分区内部留空给 sticky；
  分区可以横向列、上下带或不规则网格，但必须有清楚边界和引导问题。
- `matrix_grid`：矩阵。必须出现行/列或双轴；至少 2×2。公式：`x = x0 + col*(cellW+gapX)`，
  `y = y0 + row*(cellH+gapY)`。不要把矩阵画成竖向清单。
- `timeline_swimlane`：时序泳道。时间点横排，泳道纵向；顶部是阶段/触点标签，下面是行为、
  感受、机会、证据等泳道。至少 3 个时间点。
- `radial_network`：关系网络。中心节点在 `(cx, cy)`，环绕节点按角度分布：
  `x = cx + r*cos(angle) - w/2`，`y = cy + r*sin(angle) - h/2`，再用 connector 连向中心或分群。
- `evidence_chain`：证据链。节点横向有向排列，表达"证据 -> 判断 -> 问题 -> 动作"；
  至少 3 个节点，相邻节点用 connector，链路旁可放小证据 note。

带坐标的 Tier 3 骨架（触点链示例，横向时间轴）：

```json
[
  { "op": "add_node", "id": "chain", "kind": "section", "stage": "discover",
    "title": "可玩体验触点链", "role": "scaffold.root",
    "meta": {
      "vd_layout_archetype": "evidence_chain",
      "vd_layout_signature": "left-to-right play touchpoint chain with connector arrows",
      "vd_method_source": { "method_id": "touchpoint-chain", "class": "C",
        "experts": [{ "name": "辛向阳", "domain": "交互设计理论" }] }
    } },
  { "op": "add_node", "id": "chain.h", "kind": "text", "parent": "chain",
    "bounds": { "x": 44, "y": 20, "w": 1180, "h": 96 },
    "text_size": "xl", "font": "sans",
    "content": "可玩体验触点链\n请按现场观察记录每个环节的行为、证据和可退出性。" },
  { "op": "add_node", "id": "chain.t1", "kind": "shape", "shape_type": "rectangle", "parent": "chain",
    "bounds": { "x": 44, "y": 150, "w": 195, "h": 150 }, "content": "看见" },
  { "op": "add_node", "id": "chain.t2", "kind": "shape", "shape_type": "rectangle", "parent": "chain",
    "bounds": { "x": 283, "y": 150, "w": 195, "h": 150 }, "content": "靠近" },
  { "op": "add_connector", "from": "chain.t1", "to": "chain.t2" }
]
```

## 5. 方法模板的三段生命周期

方法模板没有 Widget 那样的状态机，但有自己的三段：

```text
① 空脚手架   智能体本体按专家方法搭结构 + 一句话说明 + slot 提示（内容留空 / 只放浅色草稿）
② 学生填充   学生亲手往 slot 填；不足处标紫色 region_annotation
③ 确认固化   学生确认 → 成为长期设计知识；Widget 的稳定结果也物化到这里
```

这三段决定"谁做什么"：**①专家定结构 + 智能体搭 → ②学生填 → ③学生确认**。

**区域批注回路**（方法模板版的"请求回路"，对应 Widget 的 emit/state）：学生在某个 slot
标紫色区域批注，进入 agent-context 的 `open_region_annotations`；旧
`open_completion_requests` 仅作为兼容别名读取。智能体下一轮读取，在指定区域补一版浅色草稿，
不替学生裁决。

## 6. 脚手架说明与分区规范（画布只放"说明 + 提问 + 留白"）

脚手架要像一张**真实的设计画布**（商业模式画布、客户旅程画布那种），不是"框里堆便签 + 一大段
AI 说明"。画布上只呈现三样东西：**一句话说明、每个分区的一句引导问题、留白**。

**① 顶部一句话说明**（取代旧的 7 字段方法头卡）：

```text
{大标题：脚手架名}          text_size: xl, font: sans
{一句灰色小字：你要做什么}   text_size: s, color: grey
```

两种填写模式，小字说清楚是哪种：
- **空脚手架（你来填）**："这是……，请你观察 / 思考 / 在每个分区填入……"
- **AI 预填（你来确认）**："我先草拟了几条（浅色），请你确认、修改或讨论。" —— 草稿内容用
  浅色便签/文本放进对应分区，**不要**逐条标注冗长的"AI 草稿，待确认"，浅色本身就是信号。

**② 每个分区**：标题（frame 自带标签，或一条 sans 小标题）+ **一句灰色引导问题**（`text_size: s,
color: grey`，如"哪些空间要素触发了这些行为？"）+ 大片留白。分区不是塞满内容的格子，是让学生
往里填的空间。

**③ 画布上不出现的东西**（这些是 agent 的思路，不是画布内容）：
- 训练什么判断 / 可能遮蔽 / AI 边界 / 为什么创建这个 / AI 提供什么 —— 全部**不上画布**。
- **专家署名不上画布**。归属只写进机器可读 meta：

```text
meta.vd_method_source = { method_id, class: "B"|"A"|"C", experts: [{ name, domain, virtual }] }
```

  运行时据此让**左侧专家坝**亮起对应专家，并把该脚手架连到专家 —— 学生想知道"这来自谁"，
  看左侧专家、悬停连线即可，画布本身保持干净。类别（A/B/C）只决定 meta 与加载规则，不再在
  画布上写 caveat 文字。

**④ 视觉细节**（用 §4.5 的样式字段实现参考图观感）：
- 大标题 `text_size: xl` + `font: sans`；引导问题 `text_size: s` + `color: grey`。
- 分区标题用 frame 标签即可，**不要再额外加一条重复的大标题**（避免同名出现两次）。
- 包围形（放射圈、系统椭圆、双钻圆）用 `fill: none` 只描边，不遮住内部内容；
  中心特征（心形内核等）用 `fill: semi`。

⚠️ 高频低门槛方法（Persona、HMW）仍要有一个"使用前提检查"分区，其引导问题写成自检式
（如"这是基于真实访谈，还是团队猜测？"）；留空或填"团队共识/推测"时触发专家警示。

## 7. 结构完整性自检（质量闸）

Widget 有校验阶梯；方法模板的对应物是**结构完整性自检**。Tier 3 自由组合出来的模板，挂上
画板前智能体应确认：

1. 有根 frame（`scaffold.root` 或方法自有 root），不是散落的 sticky。
2. root 有 `stage`，且写入后位于对应 stage frame；不在画布根层散落。
3. root 有 `vd_method_source`、`vd_layout_archetype`、`vd_layout_signature` meta；画布上**没有**署名文字。
4. root 内所有子节点都有 `parent: root_id` 和相对 root 的 `bounds`。
5. 顶部有一句话说明（大标题 + 灰色"你要做什么"），没有 7 字段 AI 元信息。
6. 每个分区有标题 + 一句引导问题，不是空格子、也不是塞满的格子。
7. 内部用显式坐标画出该框架的形状（§4.5），不是雷同竖条。
8. 同一批次多个专家 frame 满足母型差异：2-3 个至少 2 种，4-5 个至少 3 种。
9. AI 预填内容用浅色区分；空脚手架和学生动作区留白充足。

## 8. 专家智能体在方法模板生成上的角色

这是方法模板和 artifact / Widget 最不同的一点：

```text
artifact 生成：专家不碰（智能体本体生成草案，专家只评审）
widget  生成：专家不决定（智能体按 skill 判断是否邀专家）
template 生成：专家是源头（结构、一句话说明、介入点来自专家方法论）
```

方法模板不是 artifact，而是**专家方法论的显性外化**。"专家来源 / 训练判断 / 可能遮蔽 /
AI 边界"本来就是专家显性方法 + 隐性审美的沉淀；这些信息进入 meta、agent-context 和专家意见流。
所以在方法模板上，专家不是可选评审者，而是结构的来源。

| 动作 | 谁负责 |
| --- | --- |
| 选哪个方法 / 哪个母型 | 专家分身（按阶段 + 专家路由：B 类默认，A 类领域特色） |
| 定结构、slots、提示语、证据要求 | 专家分身（方法论外化，署名） |
| 写一句话说明与 meta（训练判断 / 学生动作 / 遮蔽 / AI 边界） | 专家分身 |
| 设置专家介入点（⚠️ 使用前提检查、证据不足触发警示） | 专家分身 |
| 实际 `insert_template` / `add_node` 搭结构、按 seed 填草稿、处理 region_annotation | 智能体本体（执行层） |
| 往 slot 填真实内容、接受 / 拒绝、决定保留 | 用户 / 学生（主权层） |
| slot 里给草稿 / 示例 / 风险提示 | 智能体本体，但不代替学生裁决 |

一条红线（和 Widget 完全一致）：**专家和智能体都不替学生填 slot**。slot 是学生动作区；他们
只给结构、草稿、风险和署名批注。

## 9. 命令与端点

```text
GET  /api/canvas-templates                         内置方法模板目录（Tier 1）
POST /api/canvas-workspaces/{ID}/commands          insert_template / add_node ops
GET  /api/canvas-workspaces/{ID}/agent-context     含 available_templates、open_region_annotations、legacy open_completion_requests
```

agent-context 相关字段：

- `available_templates`：内置方法模板（Tier 1 可复用）。
- `open_region_annotations`：学生在 slot 上的紫色区域批注（生命周期 ② → ③ 的回路）。
- `open_completion_requests`：旧字段，仅为兼容旧 agent 和旧运行时读取。
- `current_ir_summary` / `recent_events` / `edit_summary`：学生对模板的填充和编辑变化。

## 10. 与 Widget、artifact 的关系

```text
专家用方法模板把"怎么想"变清楚（结构 + 一句话说明 + meta 归属）
学生用方法模板把"想什么"填进去（内容主权）
智能体本体负责搭建、草稿、补全的执行
Widget 是过程中的动作工具，artifact 是学生最终的作品
Widget / 生成器的稳定结果，物化成方法模板长期留存
```
