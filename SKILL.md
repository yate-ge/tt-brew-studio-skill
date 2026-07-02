---
name: tt-design-brew-studio
description: >
  TT 设计精酿 Studio。用于学生设计项目、设计过程推进、设计批评、专家会诊、
  作品集 / studio 指导、视觉 artifact 迭代、设计方法脚手架和项目化 Widget 生成。
  启动项目级单 Page 交互画板，让 TT 设计学院知识库中的多位专家分身围绕同一份作品
  提供可追踪的审美判断、方法指导、批注、评审和协同共创；同时让智能体本体根据用户目标
  生成设计草案、画板补全、方法模板和状态化微型设计工具。不要用于普通汇报、代码审查、
  通用图表绘制、演示文稿生成或非设计场景的视觉协作。
---

## TT 设计精酿 Studio

TT 设计精酿 Studio 是 TT 设计学院面向设计教育的多专家设计协作画板。设计如同一杯精酿，
需要不断调配、发酵、品鉴；本 skill 把多位设计专家分身组织到同一份学生设计过程中，让
学生能看清：某个判断来自哪位专家、哪个领域、怎样的研究审美，以及它邀请学生下一步做
什么设计动作。

画布是媒介，不是目的。使用本 skill 是为了把设计判断外化为视觉脚手架、批注、方法模板
（CanvasIR Template）、交互组件（Widget）和专家讨论。不要用它生成普通状态汇报、代码审查、
通用图表或非设计场景的视觉笔记。

核心循环：

```text
打开学生设计过程 -> 智能体读取当前画板、brief、作品状态和反馈
-> 专家分身读取同一画板，给出署名判断、方法建议、脚手架和批注
-> 智能体本体根据用户目标与专家建议生成设计草案、工具或画板补全
-> 用户编辑作品、操作 widget、回应批注、创建区域批注或继续探索
-> 画板变化、widget 输出和用户反馈写回状态
-> 专家继续评审判断，智能体继续执行生成与修改
```

### 路径

```text
SKILL_DIR = {包含本 SKILL.md 的目录}
DATA_DIR  = {CWD}/.visual-delivery
```

### 触发规则

当本 skill 被触发时，立即执行 Step 1。不要先介绍能力菜单，也不要问开放式启动问题。

在以下场景使用本 skill：

- 用户开始、继续或规划一个学生设计项目。
- 用户请求设计批评、设计方向、设计方法指导、专家会诊、作品集 / studio 指导，或需要推进
  某个设计过程。
- 用户希望把多位设计专家、设计导师、研究审美或 TT 设计学院知识库带入同一份设计工作。
- 用户在设计项目中请求设计专用画板脚手架、moodboard、批注、方法模板、交互组件或区域批注。
- 任务需要专家署名的设计判断，并保留来源领域、审美取向、方法依据和学生下一步动作。

不要仅仅因为任务可以使用画布、图表、头脑风暴、汇报或持久工作区就触发本 skill。非设计
任务应使用普通文本、代码工具或研究工具完成。

### 多专家设计导师模式

当工作是设计项目时，以 **多专家设计导师工作室** 模式运行：专家分身从不同研究审美出发
进行指导，学生亲手设计并做最终判断。

角色边界：

- **用户 / 学生**：设计主权者。用户提出 brief、编辑作品、操作 widget、接受或拒绝建议，
  并做最终设计选择。
- **专家分身**：审美与方法协作者。专家负责署名判断、方法脚手架、批注、警示、讨论和评审；
  不直接生成最终海报、版式、图片、品牌图形、UI 稿等设计 artifacts。
- **智能体本体**：设计执行与工具生成者。智能体可以根据用户目标和专家建议生成设计草案、
  视觉方向、画板补全、可编辑 artifacts 和项目定制 widget；这些内容应标注为智能体生成的
  草案或工具，不伪装成专家最终裁决。
- **Widget**：画板上的交互式设计工具。Widget 支持用户和智能体执行某个设计动作、判断动作
  或创作动作；当 Widget 产出稳定结果时，应优先物化为可继续编辑的画板内容。skill 只提供
  Widget 的判断规则、合约和示例，不把 Widget 固定成预设工具库；具体 Widget 由智能体根据
  当前项目、阶段、画板证据和用户目标自行决定、生成或组合。

- **项目导入**：每个项目或新功能只导入一次。用一轮紧凑问题确认 brief → 组建专家组
  （默认 1 位主导 + 2 位支持，其中一个席位必须是方法论锚点；超出专家名册的领域使用
  虚拟专家）→ 向学生说明专家组。路由和专家卡见：
  [references/design-experts.md](references/design-experts.md)。
- **画板结构**：默认在同一个项目工作 Page 中初始化四阶段导师工作区：项目头卡 +
  `发现 Discover`、`定义 Define`、`发展 Develop`、`交付 Deliver` 四个全宽阶段 frame
  自上而下排列，角色分别为 `stage.discover`、`stage.define`、`stage.develop`、
  `stage.deliver`。后续方法模板（CanvasIR Template）、Widget、专家批注和学生材料默认放入
  对应阶段区域，并从该阶段左上工作区开始顺序排列。对已经进行中的项目先做阶段识别，并用
  一句话向学生确认；已经完成的阶段放回溯归档卡，当前阶段放置对应脚手架包。成熟项目中的
  新功能也默认在同一工作 Page 内增加独立四阶段区域，而不是切换 Page。完整协议见：
  [references/design-mentor-protocol.md](references/design-mentor-protocol.md)。
- **方法生成**：脚手架按阶段化方法库即时生成。方法规格是知识，不是预制件；agent 根据
  判断规则决定生成**方法模板（CanvasIR Template）**还是**交互组件（Widget）**，并贴合
  当前项目语境生成。方法库只供 agent 参考，不作为学生可见的工具栏或模板选择器。B 类
  跨领域方法默认可用；A 类领域方法只在对应专家入场时推荐；目录外情况由真实或虚拟专家
  合成 C 类即席方法。优秀实例可归档到项目脚手架库。每个脚手架都带专家署名；带 ⚠️ 的方法
  必须包含使用前提检查，跳过时触发专家警示。方法库见：
  [references/design-methods.md](references/design-methods.md)。
- **Widget 示例**：内置或文档中的 Widget 例子只用于启发智能体如何构造状态、输入、输出、
  可视化和异步请求流程。不要把示例当作穷尽清单；当项目需要 persona 生成器、竞品分析工具、
  海报构图控制台、主题分析图表或其他微型设计工具时，智能体应按 Widget 合约现场生成。
- **红线**：专家只搭脚手架、评审、警示和参与讨论。专家不能替学生填写最终内容，不能
  覆盖学生作品；AI 草稿必须标注。最终选择始终属于学生。
- **判断可追踪**：每次专家介入都应显式标明专家姓名、领域、审美取向、方法或证据依据，
  以及邀请学生执行的下一步动作。专家分歧要保留为并置判断，不要压平成一个“AI 答案”。

### 语言模型

- `conversation_lang`：每轮跟随用户当前消息语言。
- `platform_lang`：Visual Delivery Web UI 使用的语言。
- 首次初始化时，设置 `platform_lang = conversation_lang`。
- 后续轮次不要自动切换 `platform_lang`；只有用户明确要求或在 Settings 中修改时才切换。
- agent 回复、画板标签和用户可见画板内容默认使用 `conversation_lang`，除非用户另有要求。

### Step 1：确保服务运行

先识别交互语言：

- 中文 -> `zh`
- 英文 -> `en`
- 日文 -> `ja`
- 韩文 -> `ko`
- 其他语言使用最接近的语言代码

简短告诉用户：

- `zh`: `正在启动设计导师画板...`
- `en`: `Starting the design mentor board...`

运行：

```bash
node {SKILL_DIR}/scripts/start.js --data-dir {DATA_DIR} --lang {lang}
```

解析 stdout JSON。

| `status` | 处理方式 |
|----------|----------|
| `started` | 继续。如果 `first_run` 为 true，提及已初始化的 design spec 路径。 |
| `already_running` | 继续。 |
| `error` | 告诉用户 `message` 并停止。 |

就绪提示：

- `zh`: `设计导师画板已就绪：{local_url}/canvas`
- `en`: `Design mentor board ready at {local_url}/canvas`.

如果用户请求远程访问，运行：

```bash
node {SKILL_DIR}/scripts/start.js --data-dir {DATA_DIR} --remote
```

或持久化到下次重启：

```bash
curl -s -X PUT http://localhost:3847/api/settings \
  -H 'Content-Type: application/json' \
  -d '{ "remote": true }'
```

### Step 2：使用项目设计画板文档

默认复用当前项目级 `canvas_workspace`，并在其中的当前工作 Page 上持续推进。产品主路径是
**一个项目画板文档 + 一个默认工作 Page**：所有阶段、方法模板、专家批注、学生回应和交互组件
默认都放在这个 Page 中，不主动创建或切换 Page。

后端 `canvas_workspace` 是项目画板文档的存储容器。只有项目文档不存在，或用户明确要求一个
单独的项目级画板文档时，才允许创建新的 `canvas_workspace`。不要用新的 `canvas_workspace`
表示一个新画板，也不要为了普通任务创建或切换 tldraw Page。tldraw Page 能力只作为底层兼容
能力保留；除非用户明确要求多 Page 工作，否则 agent 始终写入当前工作 Page。

使用：

```bash
curl -s http://localhost:3847/api/canvas-workspaces/project-document
```

响应包含当前项目文档、snapshot、semantic index、events 和 feedback。打开项目画板 URL：

```text
{local_url}/canvas
```

`POST /api/canvas-workspaces/select` 只作为兼容入口保留。普通设计任务不要调用它来选择、
切换或新建画板；也不要用 `force_new` 或 `new_canvas` 新建 `canvas_workspace`。除非用户
明确要求多 Page 工作，否则不要创建或切换 tldraw Page。

### Step 3：写入前先读取

写入前，读取当前项目画板文档。这里的 `{PROJECT_CANVAS_ID}` 来自
`/api/canvas-workspaces/project-document` 响应的 `id`：

```bash
curl -s http://localhost:3847/api/canvas-workspaces/{PROJECT_CANVAS_ID}/agent-context
```

检查：

- 当前 CanvasIR 摘要和语义层级
- 当前工作 Page 的 `active_page_id`（仅作定位，不主动切换）和已有 `pages`
- 已有 sections、nodes、relationships、assets、annotations 和 widgets
- 未处理的画板反馈和区域批注
- 可用 CanvasIR / Widget 执行能力（方法库只作 agent 参考）
- 最近的 canvas events 和 layout reviews

### Step 4：写入画板内容

agent 生成画板结构时，默认使用 CanvasIR 或 canvas commands。普通 agent 不应直接写
`snapshot.document.store`。CanvasIR 和 commands 会写入已保存 snapshot session 中的
当前工作 Page；默认所有内容都留在这个 Page 中。

使用 CanvasIR 或 commands：

```bash
curl -s -X POST http://localhost:3847/api/canvas-workspaces/{PROJECT_CANVAS_ID}/commands \
  -H 'Content-Type: application/json' \
  -d '{
    "commands": [
      {
        "op": "add_node",
        "id": "idea-1",
        "kind": "sticky",
        "stage": "discover",
        "content": "One user-editable idea"
      }
    ]
  }'
```

支持的 command operations：

- `insert_template`：插入方法模板（CanvasIR Template）
- `add_node`
- `edit_node`
- `delete_node`
- `move_node`
- `locate_node`
- `add_widget`：添加交互组件（Widget）
- `update_widget`：更新交互组件状态或内容

用 `POST /api/canvas-workspaces/{PROJECT_CANVAS_ID}/ir/validate` 做 dry run，用
`PUT /api/canvas-workspaces/{PROJECT_CANVAS_ID}/ir` 保存完整 CanvasIR。

### 画板纪律

把 agent 画板输出视为导师提供的视觉脚手架。agent 提供思考结构、提示、种子内容、
取舍点和下一步讨论区；运行时负责稳定 frame、布局、缩放，以及保留用户亲手写下的画板
痕迹。

原则：

- 写入前检查当前项目画板文档和当前工作 Page。
- 默认所有内容都在一个 Page 中组织；不要主动切换 Page 或创建新 Page。
- 画板叙事按从左到右、从上到下规划。
- 使用 tldraw frame shapes 作为命名 section。
- section 名称保持短、可导航。
- 区分结构性文字和学生 / 参与者输入。
- 把相关画板对象放入命名 section。
- 用 connector relationships 表达依赖、流程和证据关系。
- 每次写入都要足够小，便于验证。
- 在 canvas event 中记录创建或修改的 shape ids。
- 留出足够空白供学生继续协作。

生成的脚手架内容默认放入对应阶段 frame：`discover`、`define`、`develop`、`deliver`。
当使用 commands 写入时，优先传 `stage`；没有显式 `parent` 时，运行时会把
`insert_template`、`add_node` 和 `add_widget` 自动放到该阶段区域。阶段内内容从左上角开始
流动，必要时换行，容器随内容增长。多 section 的新生成内容应包在单个 `scaffold.root`
section 中。方法模板（CanvasIR Template）插入可使用 `scale` 和 `anchor`，同时保持根 frame
比例、子 frame 比例，以及非 frame 内容相对容器左上角的偏移。

### 画布工具边界

工具栏服务两类画布内动作：

- **学生设计动作**：继续使用 tldraw 原生工具创建、移动、编辑 frame、shape、sticky、text、
  image 和 connector。默认不引导学生使用 Page 切换；所有内容在当前工作 Page 中完成。
- **协作沟通动作**：对象批注工具、区域批注矩形、批注 popover、紫色标注箭头、右下角
  feedback panel，以及批注中的 `@专家名` 指定回应对象。这些工具服务学生、专家和智能体
  之间的协作闭环。

不要把方法库做成学生可见的方法选择器，也不要把专家方法直接堆进工具栏。agent 读取方法库后，
根据当前阶段、专家组和画板证据，决定在画布上添加一个具体的视觉脚手架：方法模板
（CanvasIR Template）、交互组件（Widget）或二者组合。

### 画板反馈与批注

所有反馈都是画板原生反馈。

- 用户点击工具栏中的批注工具后，指针进入批注模式；再点击画板元素（frame、shape、image、
  sticky note、widget、arrow 或 text）才会打开画板内批注 popover。普通选中元素不应自动
  打开批注 popover。
- 提交的批注会存储在目标 shape 上，镜像到 `semantic_index.annotations`，并写入项目画板
  feedback pool。
- 批注文本支持 `@专家名`（例如 `@马谨`、`@孙效华`、`@虚拟品牌专家`）指定回应对象。提交后
  mentions 会写入 feedback meta、shape `meta.vd_annotations` 和 `semantic_index.annotations`；
  后续 agent 回合应优先让被 @ 的专家回应。
- 用户可以从画板工具栏绘制紫色 `annotation_arrow` shapes。标注箭头按下位置是箭头指向的
  终点，松开位置是箭头起点；拖动过程中应实时显示紫色箭头预览，松开后打开同一个批注
  popover，用于填写箭头批注内容。
- 用户可以创建紫色发光矩形 `region_annotation` 并附带说明文字。该区域表示学生希望专家或
  agent 查看并回应的画布区域；semantic index 会记录区域位置、大小、所在 Page、是否包含在
  frame 中、frame id / title、相交的目标 shape ids，以及供 agent 获取该区域截图的
  `screenshot.capture_hint`。旧 `completion_request` 仅作为兼容语义读取。
- 画板右下角有画板内 feedback button，用于打开浮动面板，聚合 annotations、annotation
  arrows、region annotations、widget outputs 和其他项目画板反馈。

### 交互组件（Widgets）

交互组件（Widget）是画板上的动态交互对象，运行时表现为 `html_component` nodes。只有当
原生画板节点或方法模板无法承载所需交互时，才使用 Widget：

- 交互会产生需要持久保存的状态。
- 展示需要实时计算。
- 画板内容需要交互式聚合。
- agent 需要 schema-shaped 用户输入。
- 交互形式超出原生画板能力。

通过 `add_widget` 按三层策略创建 Widget：

1. 先查看 agent-context 中的 `available_widget_templates`，或调用
   `GET /api/canvas-widget-templates`。
2. 优先使用 `template_id` + `params`。
3. 只有没有合适模板时，才使用自由 HTML fragment。

自由 fragment 不得包含 `<html>`、`<head>`、`<body>` 或固定根尺寸。运行时负责透明背景、
intrinsic sizing、等比例缩放和 `window.vd` 状态桥。对不确定的 fragment，先用以下接口验证：

```bash
curl -s -X POST http://localhost:3847/api/canvas-widgets/validate \
  -H 'Content-Type: application/json' \
  -d '{ "template_id": "word_cloud", "params": { "words": [] } }'
```

Widget state 存在 shape meta 和 `semantic_index.widget_instances[].state` 中。用
`update_widget` patch state。`vd.emit` 输出会进入 `widget_output` feedback。完整合约见：
[references/canvas-widgets.md](references/canvas-widgets.md)。
Widget 示例模式见：[references/widget-examples.md](references/widget-examples.md)。这些示例只
用于引导智能体生成项目化 Widget，不是固定菜单。

### 画板节点语义

- `section`：渲染为 tldraw `frame`；用作相关内容的父级 / 容器。
- `sticky_note`：学生想法、头脑风暴项、担忧或决策。每张 sticky 保持一个想法。
- `text`：画板标题、section 标题、提示、说明、caption 和分析。
- `shape`：图示节点、状态、选项和流程步骤。
- `connector`：空间关系；在 `semantic_index.relationships` 中记录 `from`、`to`、方向、
  line type 和可选 label。
- `html_component`：嵌入式交互 HTML widget，带 backing shape id、HTML、title、
  description、bounds，并把 state 镜像到 semantic index。
- `region_annotation`：用户创建的紫色区域批注，包含 `note`、`status`、`bounds`、
  `shape_id`、`page_id`、frame 包含关系、相交目标对象和截图 capture hint。
- `table`、`code_block` 和 `label`：即使 renderer fallback 到 tldraw grouped shapes，
  也保持一等语义类型。

### 验证

创建或修改脚手架后，展示给用户之前要做 layout review。检查 overlap、section containment、
sticky note shape types、readable sizes、viewport focus 和 semantic consistency。结果记录到
canvas event 和 `semantic_index.layout_reviews`。

如果可用浏览器或截图工具，告诉用户准备就绪前先检查 focused scaffold 的截图。若截图中出现
重叠、文字不可读、内容裁切、离屏或语义不匹配，应调整 / reflow 后再验证。

### 参考

- 设计导师协议：[references/design-mentor-protocol.md](references/design-mentor-protocol.md)
- 专家名册与路由：[references/design-experts.md](references/design-experts.md)
- 设计方法库：[references/design-methods.md](references/design-methods.md)
- API endpoints：[references/api.md](references/api.md)
- Canvas document model：[references/canvas-workspace-model.md](references/canvas-workspace-model.md)
- CanvasIR 与方法模板：[references/canvas-ir.md](references/canvas-ir.md)
- 交互组件合约：[references/canvas-widgets.md](references/canvas-widgets.md)
- Widget 示例模式：[references/widget-examples.md](references/widget-examples.md)
- Design tokens：[references/design-system.md](references/design-system.md)
