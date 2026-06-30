# Visual Delivery Skill V4 Implementation Plan

> 本文档用于约束 V4 实现方向。V4 不再围绕一次性 delivery page，也不以
> long-horizon 监管或里程碑机制为核心，而是面向 AI 员工模式下的项目级
> 视觉沟通工作空间。

## 1. 产品定位

Visual Delivery Skill V4 是一个项目级视觉沟通平台，帮助 agent 像 AI 员工一样
和用户协作。

它解决三类问题：

1. **透明度**：用户知道 agent 做了什么。
2. **对齐**：agent 能用可视化页面和用户确认需求、方向、取舍。
3. **评审交付**：agent 能优雅汇报产出、思路和待决策点，并收集反馈。

V4 不把以下内容作为实现主线：

- long-horizon task 下的实时监管和干预机制
- milestone / 里程碑机制
- 中期汇报用于信任度校准的研究问题
- 复杂项目进度管理系统

这些可以作为未来研究方向，但不进入当前 implementation plan。

## 2. 核心原则

- **项目级工作空间**：`.visual-delivery/` 是当前项目的数据、界面和配置空间。
- **汇报是核心交互**：汇报页面同时呈现产出、解释、决策点和反馈入口。
- **日志接入项目本身**：优先连接项目已有 harness、文档和记忆文件，不重复
  生成一套平行日志。
- **反馈是项目资产**：反馈不只属于某一次汇报，而是在项目级反馈池中持续追踪。
- **反馈闭环必须可见**：后续汇报需要说明根据用户反馈做了哪些调整。
- **平台外壳服务于协作**：主页、导航、设置、主题只是容器，不是 V4 主线。

## 3. MVP 范围

第一版 MVP 应实现：

1. Project workspace 初始化
2. Report 数据模型
3. Project harness / document discovery
4. Project-level feedback pool
5. Report 模板路由
6. Report 呈现层模板基础实现：文本文档、表格、画布、Slides
7. Complex-review 汇报模板
8. Feedback change record
9. 汇报后更新项目已有日志或工作文档

第一版不做：

- milestone
- long-horizon supervision
- 复杂进度追踪
- 多用户权限
- 完整远程 host
- canvas / slides 高级编辑器能力，例如多人实时协作、复杂矢量编辑、完整演示文稿编辑
- 大规模视觉个性化系统

## 4. Phase 1：项目级工作空间

初始化 `.visual-delivery/`，作为当前项目的数据与界面空间。

建议目录结构：

```text
.visual-delivery/
  server/
  ui/
  data/
    project.json
    harness.json
    reports/
    logs/
    documents/
    document-index.json
    feedback/
    settings.json
  design/
```

关键要求：

- 一个 skill runtime 默认服务一个项目。
- `project.json` 保存项目名称、摘要、阶段、视觉设置、host 设置。
- `reports/` 保存所有汇报内容和汇报级反馈引用。
- `harness.json` 保存项目已有文档、记忆、日志体系的发现结果和接入配置。
- `logs/` 仅在项目没有外部日志体系时保存 skill 托管日志。
- `documents/` 仅保存 skill 托管文档；外部文档不复制，只通过索引接入。
- `document-index.json` 保存可在平台查看的内外部文档索引。
- `feedback/` 保存项目级反馈池。

## 5. Phase 2：初始化流程

初始化不是单纯启动服务器，而是一次“开项”。

初始化流程：

1. 识别项目名称和摘要。
2. 创建项目主页。
3. 初始化导航：主页 / 日志 / 汇报 / 设置。
4. 初始化本地数据目录。
5. 扫描项目目录，发现已有 harness、文档目录、记忆文件和日志位置。
6. 让用户确认哪些项目外部文档接入平台。
7. 初始化视觉样式配置。
8. 选择 host 模式：本地 / 局域网 / 远程预留。
9. 预留访问密钥能力。

需要避免：

- 让用户面对过多技术配置。
- 把初始化做成简单服务启动。
- 默认生成空白或无意义项目。
- 在项目已有文档体系时重复创建一套日志或工作文档。

## 6. Phase 3：汇报系统

汇报是 V4 的核心产出。

汇报页面必须同时包含：

- 任务产出 artifact
- agent 的解释和思路
- 关键决策点
- 用户可反馈区域

### 6.1 模板两层结构

结构层：

- `standard-report`
- `complex-review`

呈现层：

- 文本文档
- 表格
- 画布（参考 Cowart 类无限画布协作体验，使用 tldraw 实现）
- slides
- 混合 section

### 6.2 Agent 模板路由

agent 自动选择模板，并说明理由。

路由逻辑：

1. 判断是否需要 complex-review。
2. 判断产出更适合文档、表格、画布、slides 还是混合呈现。
3. 告诉用户选择理由。
4. 用户可以否决。

示例：

```text
这次汇报包含多个方案对比和待决策项，我会使用 complex-review 结构；
其中数据部分用表格呈现，结论部分用文档呈现。
```

### 6.3 汇报模板实施范围

V4 的几类汇报模板都需要实现基础版本，不能只停留在 `generated_html` 的通用渲染。
模板系统应提供可被 agent 路由、可被 UI 渲染、可接入反馈池的数据结构。

| 模板 | 第一版能力 | 关键数据 |
|------|-----------|---------|
| `document` | Markdown / HTML 内容、目录导航、段落级反馈、决策点组件 | sections、headings、feedback_targets |
| `table` | 表格展示、筛选/排序、行级和字段级反馈 | columns、rows、views、feedback_targets |
| `canvas` | tldraw 无限画布、section/frame 容器、文本/图片/卡片节点、批注节点、选区反馈、全屏查看、画布状态保存 | tldraw_snapshot、semantic_index.sections、assets、node_feedback_targets |
| `slides` | slide 导航、逐页汇报、页级反馈、重点决策页 | slides、speaker_notes、feedback_targets |
| `complex-review` | 多 section 汇报、artifact + 叙事 + 决策点、多模板混排 | sections、artifacts、decisions、template_refs |

画布模板使用 tldraw 作为实现内核。产品体验参考 GitHub 开源项目 Cowart
（https://github.com/zhongerxin/cowart）的本地无限画布协作方向：agent 和用户围绕
同一个项目画布推进工作，而不是只查看一次性静态交付物。
画布模式适用于设计创意、头脑风暴、灵感采集、产品设计思路推进等场景。Agent 可以在
无限画布中持续添加内容、整理素材、摆放方案、生成解释和推进下一步思路；用户可以在
画布上批注、补充素材、圈选区域并提交反馈。

当任务路由到 `canvas_workspace` 时，页面不再把画布作为某个 report section
嵌入文档流。任务上下文、产出、素材、方案推进、待确认决策和用户反馈区应持续沉淀在
tldraw 无限画布工作区中。画布页提供全屏查看，选中画布元素后可提交
`canvas_selection` 反馈。

第一版必须保存 tldraw snapshot，并把画布节点或选区映射到项目级反馈池。画布数据应
归属于当前项目工作空间，后续汇报可以引用画布页面、节点、选区或截图作为 artifact。
画布默认结构应包含 agent 工作区、用户反馈区和共享决策区。暂不实现多人实时协作、
复杂矢量设计工具能力和完整素材管理系统。

当前实现要求：

- `/api/reports` 在缺省 content 时生成 `document_report`，`standard-report` 使用单 section，`complex-review` 使用多文档 section。
- `document`、`table`、`slides` 和 `report_template` 是兼容别名，都会归一到 `document_report`；表格和类 slides 内容应进入文档结构。
- `canvas` 是兼容别名，会归一到 `canvas_workspace`；新画布协作通过 `/api/canvas-workspaces/select` 选择或创建项目级画布。
- 文档模板从 Markdown heading 自动生成目录导航。
- 文档模板对段落生成 `document_paragraph` feedback target，包含段落行号和摘录。
- 表格模板支持按 view 分类、全文查询、列排序。
- 表格模板对行生成 `table_row` feedback target，对字段生成 `table_field` feedback target。
- 画布模板默认 seed node 区分 `agent`、`user`、`shared` 角色区域。
- 自建画布使用 tldraw frame 作为 `canvas_section` 容器，section 名称显示在左上角，子节点通过 parent/child 层级和 `contains` relationship 写入 semantic index。
- 画布模板对 seed node 生成 `canvas_node` feedback target。
- 画布模板对当前 tldraw 选区生成 `canvas_selection` feedback target，包含 shape ids 和 bounds。
- Slides 模板支持左侧页导航、上一页/下一页逐页浏览。
- Slides 模板对页面生成 `slide_page` feedback target，对待确认决策生成 `slide_decision` feedback target。

## 7. Phase 4：日志与项目 Harness 接入

日志解决透明度问题：用户需要知道 agent 做了什么、为什么这么做。

V4 的日志系统不是独立笔记系统，而是项目文档体系的可视化入口和补缺层。
初始化时应扫描项目目录，寻找已有的 harness、项目文档、记忆文件、工作日志和
agent 指令文件。平台默认接入这些“skill 外部”的文档，让用户可以在视觉交付
平台中查看、跳转和标注。

优先接入的候选位置包括：

- 项目根目录说明文件，例如 `README.md`、`AGENTS.md`、`CLAUDE.md`。
- 项目文档目录，例如 `docs/`、`references/`、`notes/`。
- 项目记忆或上下文文件，例如 memory、context、journal、log 相关文件。
- 已有 agent harness 或任务记录目录。

原则：

- **不重复写日志**：如果项目已有工作日志或记忆文件，skill 应更新既有位置或
  创建指向既有位置的记录，而不是再写一份重复日志。
- **索引优先，复制例外**：外部文档默认只建立索引和元数据，不复制到
  `.visual-delivery/`。只有用户明确要求托管副本时才复制。
- **用户可调整接入**：初始化后的设置页应支持重新扫描、手动添加、移除或改名
  文档来源。
- **托管文档是 fallback**：只有当项目没有合适的文档/日志位置，或用户明确希望
  skill 托管，才在 `.visual-delivery/data/logs/` 与 `documents/` 中创建内容。

每次重要动作都应更新透明度记录，但目标位置由 harness 配置决定：

- 创建汇报
- 提交汇报
- 处理反馈
- 修改 artifact
- 发现风险
- 等待用户确认

记录内容应包含：

- 发生了什么
- 为什么发生
- 关联的 report / document / feedback
- 下一步动作

建议数据模型：

```json
{
  "id": "doc_...",
  "source": "external",
  "kind": "project_memory",
  "path": "AGENTS.md",
  "title": "Agent project instructions",
  "writable": true,
  "last_seen_at": "ISO_TIME",
  "last_indexed_at": "ISO_TIME"
}
```

如果项目已有工作文档，则平台提供查看、跳转、标注和关联反馈的能力。

如果项目没有工作文档，则 skill 帮 agent 生成托管工作文档，并可在平台中查看、
标注和后续迁移到项目自己的文档体系。

## 8. Phase 5：项目级反馈池

反馈是项目级资产，不只属于某一次汇报。

反馈状态：

```text
tracked -> addressed -> confirmed -> archived
```

每条反馈记录：

- 来源页面
- 来源 report / section / artifact
- 用户原始反馈
- 当前状态
- agent 处理结果
- change record
- 创建时间
- 处理时间

建议数据模型：

```json
{
  "id": "fb_...",
  "status": "tracked",
  "source": {
    "type": "report",
    "report_id": "r_...",
    "section_id": "sec_...",
    "target": {}
  },
  "content": "用户原始反馈",
  "change_record": null,
  "created_at": "ISO_TIME",
  "updated_at": "ISO_TIME"
}
```

## 9. Phase 6：反馈闭环展示

用户反馈后，agent 后续修改必须可追踪。

后续汇报顶部应显示：

```text
根据你之前的反馈，我做了这些调整：
1. ...
2. ...
3. ...
```

每条 change record 至少包含：

- 处理了哪条反馈
- 做了什么修改
- 修改体现在哪里
- 是否需要用户确认

这不是 milestone 机制，而是普通汇报中的反馈闭环。

## 10. Phase 7：平台外壳

平台外壳支持协作，但不是 V4 主线。

需要支持：

- 固定导航
- 项目主页
- 日志页
- 汇报页
- 设置页
- light / dark theme
- 视觉样式配置
- 本地 / 局域网 host
- 密钥访问预留

今天围绕 sidebar / dashboard / topbar 的 UI 调整，只能算平台外壳探索，不应继续主导 V4。

## 11. 与当前代码的关系

### 建议保留

- `.gitignore` 对 `.visual-delivery*` 的排除。
- 安装脚本对运行时目录和本地工具目录的排除。
- `start.js` 中的项目名和摘要初始化推断。

### 建议冻结或重新评估

- dashboard 细节反复调整。
- sidebar 动效和布局微调。
- 删除 topbar。
- 删除 report / log 添加按钮。

这些改动不是 V4 核心能力。是否保留应基于后续平台外壳设计统一判断。

## 12. 推荐实施顺序

1. 整理数据模型：project / harness / document_index / report / log / feedback /
   change_record。
2. 修正当前 API 与 SKILL.md 的不一致，例如 `generated_html`、locale API。
3. 实现项目 harness / 外部文档发现与索引。
4. 实现日志写入策略：优先更新项目已有位置，缺失时使用 skill 托管 fallback。
5. 实现 project-level feedback pool。
6. 实现 report 创建与模板路由。
7. 实现基础汇报模板：document、table、canvas(tldraw)、slides。
8. 实现 complex-review 的 section schema，并允许混合引用基础模板。
9. 实现 report 提交后更新日志或工作文档。
10. 实现 feedback addressed / confirmed / archived 生命周期。
11. 实现下一次汇报中的 change record 展示。
12. 最后统一平台外壳 UI。

## 13. 成功标准

V4 MVP 成功不是界面是否更漂亮，而是能否完成以下闭环：

1. 用户初始化一个项目工作空间。
2. 初始化过程发现并接入项目已有文档、记忆或日志体系。
3. agent 生成一次结构化汇报。
4. 用户在汇报中提交反馈。
5. 反馈进入项目级反馈池。
6. agent 后续处理反馈。
7. 下一次汇报明确展示“根据反馈改了什么”。
8. 过程记录到项目已有 harness；只有缺少合适位置时才写入 skill 托管日志。

如果这个闭环成立，V4 才算成立。
