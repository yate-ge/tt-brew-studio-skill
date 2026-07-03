# 视觉脚手架图库（框架级画布配方）

本文是给智能体的**视觉脚手架样式库**：把既有设计框架/方法论渲染成像真实设计画布（商业模式
画布、客户旅程画布那样）或概念框架图（双钻、放射、分层面）的干净结构，而不是"框里堆便签"。

它不是固定模板库——是**观感目标 + 坐标配方**。智能体按 canvas-templates.md §4.5（内部给坐标）
和 §6（一句话说明 + 分区引导问题 + 留白，署名只入 meta 连专家坝）现场生成，按项目改写内容。

**目标观感**（来自参考图）：干净的命名分区 + 每区一句引导问题 + 大片留白；标题 `xl sans`，
提问 `s grey`；包围形 `fill:none` 只描边；至多一两个强调色。**画布上不出现**署名、"训练什么
判断/AI 边界"等元信息。

下面每个配方给出：**何时用 · 几何 · 分区+引导问题 · 坐标要点**。坐标相对脚手架根 frame 左上角。

---

## 1. 设计画布 / 商业模式画布（不规则分区网格）

- **何时**：需要把一个设计对象拆成若干并列维度让学生逐格填（定位、用户、行为、价值、标准…）。
- **几何**：外框 + 一句话说明；下方不规则 `slot` 网格，每格标题（frame 标签）+ 一句引导问题 + 留白。
- **坐标要点**：说明区 y≈18–164；分区从 y≈200 起，按逻辑分列，大小不必相等（主维度更大）。

```json
[
  { "op":"add_node","id":"canvas","kind":"section","stage":"discover","title":"可玩城市设计画布",
    "role":"scaffold.root","meta":{"vd_scaffold_root":true,
    "vd_method_source":{"method_id":"design-canvas","class":"C","experts":[{"name":"刘洋"}]}}},
  { "op":"add_node","id":"canvas.cap","kind":"text","parent":"canvas","bounds":{"x":40,"y":18,"w":1560,"h":92},
    "content":"可玩城市设计画布","text_size":"xl","font":"sans" },
  { "op":"add_node","id":"canvas.todo","kind":"text","parent":"canvas","bounds":{"x":40,"y":118,"w":1560,"h":46},
    "content":"每个分区先回答那一句提示，再往下填你的观察与证据。","text_size":"s","color":"grey" },
  { "op":"add_node","id":"canvas.pos","kind":"slot","parent":"canvas","title":"研究定位","bounds":{"x":40,"y":200,"w":380,"h":470}},
  { "op":"add_node","id":"canvas.pos.q","kind":"text","parent":"canvas.pos","bounds":{"x":18,"y":46,"w":344,"h":60},
    "content":"你到底在研究老人的什么？一句话说清。","text_size":"s","color":"grey" }
]
```
（其余分区同 `pos` 复制：老年用户 / 可玩行为 / 空间条件 / 社交关系 / 价值主张 / 评价标准。）

## 2. 心形中心评价画布（中心特征 + 环绕维度）

- **何时**：一个内核价值 + 多维评价（如可玩性六维），想强调"围绕内核"。参考 Culture Design Canvas。
- **几何**：中心 `heart`（`fill:semi`）放内核词；左右各若干 `slot` 维度，每格标题 + 引导问题。
- **坐标要点**：心形居中（如 x≈560 w≈380 h≈340）；左列 x≈40、右列 x≈1060，各 3 格纵向排开。

```json
[
  { "op":"add_node","id":"heart.core","kind":"shape","shape_type":"heart","parent":"heart",
    "bounds":{"x":560,"y":300,"w":380,"h":340},"content":"可玩性","color":"light-violet","fill":"semi","text_size":"xl" },
  { "op":"add_node","id":"heart.body","kind":"slot","parent":"heart","title":"身体可玩","bounds":{"x":40,"y":210,"w":400,"h":180}},
  { "op":"add_node","id":"heart.body.q","kind":"text","parent":"heart.body","bounds":{"x":18,"y":46,"w":364,"h":50},
    "content":"是否支持慢走、停留、轻运动？","text_size":"s","color":"grey" }
]
```
（六维：身体/社交/认知可玩在左，情感/时间/边界可玩在右。）

## 3. 放射框架（中心 + 放射环 + 连线）

- **何时**：一个核心概念 + 一圈同级要素/关系（可玩性=关系、设计卓越 N 维）。参考 AIA Framework。
- **几何**：中心 `ellipse`（`fill:semi`）；环上 N 个 `ellipse`（`fill:none` 只描边，标题 + 提问）；
  每个环节点 `add_connector` 指向中心。
- **坐标要点**：中心 (cx,cy)；环节点角度 `ang = -90 + i*360/n`，`x = cx + r*cos(ang) - w/2`，`y` 同理。

```json
[
  { "op":"add_node","id":"radial.core","kind":"shape","shape_type":"ellipse","parent":"radial",
    "bounds":{"x":610,"y":510,"w":300,"h":220},"content":"可玩性 = 关系","color":"violet","fill":"semi","text_size":"l" },
  { "op":"add_node","id":"radial.phys","kind":"shape","shape_type":"ellipse","parent":"radial",
    "bounds":{"x":630,"y":190,"w":260,"h":180},"content":"身体关系\n\n身体如何与空间互动？","color":"light-blue","fill":"none","text_size":"m" },
  { "op":"add_connector","from":"radial.phys","to":"radial.core" }
]
```

## 4. 客户旅程 / 服务蓝图（时序层带：行 × 阶段列）

- **何时**：过程随时间展开，多条泳道（需求/触点/情绪/后台）× 若干阶段列。
- **几何**：左侧几行泳道标签（`text` + 引导问题）；顶部/纵向用 `dotted` 竖线分阶段列；交叉处放 `slot` 或留白；
  情绪行可用表情或折线。
- **坐标要点**：泳道标签固定在 x≈40 各行 y；阶段分隔线用细高 `geo rectangle`（`dash:dotted, fill:none`）等距排列。

## 5. 2×2 优先级 / 决策矩阵

- **何时**：两轴权衡（影响×可行、价值×成本）。
- **几何**：两条轴线（`geo line`/箭头）+ 四象限 `slot`（各带象限名 + 一句提问）+ 轴端标签 `text`。
- **坐标要点**：中心十字，四个 380×300 象限对称分布；轴标签放四端外侧。

## 6. 双钻 / 分层面（概念过程图）

- **双钻**：两个 `diamond`（发散→收敛）水平排列 + 阶段标签，或"双钻在圆里"（外层 `ellipse fill:none` 圈住）。
- **Garrett 五层面**：五个横向平行四边形（`geo` 无内置平行四边形时用 `rectangle` + 左侧层名 `text`）自下而上堆叠，
  每层 2 个概念标签；中间一条竖带表示贯穿。用 `fill:semi` 分层配色。

## 7. 共情图（四象限 + 中心人物）

- **几何**：中心 `ellipse` 放人物；四象限 `slot`：说 / 想 / 做 / 感受，各一句提问；可加"痛点 / 收获"底部两格。
- **坐标要点**：中心人物在正中；四象限围绕，标题 + 提问 + 留白。

---

## 复用要点

- 换项目时保持**观感规范**（一句话说明 + 分区提问 + 留白 + 署名只入 meta），替换的是**内容与选型**：
  按项目本质选哪个几何、每格问什么。
- 一个走通的完整案例（开题全景 5 框架 + 三层框架 + 六维评价 + 证据链）见
  [case-playable-city.md](case-playable-city.md)。
- 样式字段与坐标配方见 [canvas-templates.md](canvas-templates.md) §4.5 / §6。
