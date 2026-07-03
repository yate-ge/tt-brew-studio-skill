# 方法模板示例

本文是给智能体使用的方法模板示例参考，不是固定模板库。智能体应结合当前阶段、专家组、画板
证据和用户目标，自行决定是否生成方法模板、用哪个结构母型、以及具体板块与提示语。合约见
[canvas-templates.md](canvas-templates.md)，方法规格见 [design-methods.md](design-methods.md)。
一个已在真实运行时走通的完整案例（开题全景 5 个专家框架 + 三层框架 + 六维评价 + 证据链）
见 [case-playable-city.md](case-playable-city.md)。

## 怎么读这些示例

每个示例给出：

```text
母型 / 阶段 / 是否 ⚠️
一句话说明（大标题 + 灰色学生动作）
结构（root section + 板块 slot + slot 提示语）
生成命令草图（insert_template 或 add_node 组合）
角色分工（专家定结构 / 智能体搭建 / 学生填内容）
证据与 AI 边界
区域批注与物化
边界（什么时候不该用 / 该转 Widget）
```

## 通用结构骨架

所有方法模板都遵循同一骨架（合约 §7 结构自检）：

```text
root section（scaffold.root，落入某个 stage）
├─ 一句话说明 text（大标题 + 灰色学生动作）
├─ 板块 slot 1（标题 + 一句 slot 提示语）
├─ 板块 slot 2
├─ …
├─ ⚠️ 使用前提检查 slot（仅 ⚠️ 方法）
└─ root meta：`vd_method_source` + `vd_layout_archetype` + `vd_layout_signature`
```

学生内容留空；AI 预填用浅色草稿并在 meta/语义层标记待确认。

所有示例都默认遵守：root 写 `stage`；root 内子节点写 `parent` 和相对 root 的 `bounds`；
专家来源、训练判断、AI 边界只进 meta / agent-context，不写成画布可见长头卡。

---

## 示例 1 — Persona 用户画像卡

- 母型：卡片字段型｜阶段：Discover｜⚠️ 强制自检
- 说明：入门级但风险最高。画像必须从数据里长出来，不能凭假设画。

一句话说明：

```text
Persona 用户画像卡
请从真实证据填写这个人的情境、动机、行为和数据来源。
```

结构（root section + 7 板块 slot）：

| slot id | 标题 | slot 提示语 |
| --- | --- | --- |
| `basic` | 基本信息 | 给这个人一个具体锚点：名字、年龄、身份，不要写成人群标签 |
| `context` | 情境画像 | 扎根具体情境，不是悬空的特征清单 |
| `goals` | 目标与动机 | 区分"说出来的需求"和"真正的动机" |
| `pains` | 痛点与障碍 | 每条标注"观察到的"还是"团队推测的" |
| `behaviors` | 行为习惯 | 记录"做什么"，而非"怎么说自己" |
| `quote` | 一句话引言 | 用这个人自己的语气，别让设计师替他说话 |
| `evidence` ⚠️ | 数据来源标注 | 强制自检：基于真实访谈聚类，还是假设草拟？ |

生成命令草图（Tier 3 自由组合）：

```json
[
  { "op": "add_node", "id": "persona-hesitant", "kind": "section", "stage": "discover",
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
  { "op": "add_node", "id": "persona-hesitant.header", "kind": "text", "parent": "persona-hesitant",
    "bounds": { "x": 44, "y": 28, "w": 780, "h": 92 },
    "text_size": "xl", "font": "sans",
    "content": "Persona 用户画像卡\n请从真实证据填写这个人的情境、动机、行为和数据来源。" },
  { "op": "add_node", "id": "persona-hesitant.basic", "kind": "slot", "parent": "persona-hesitant",
    "bounds": { "x": 44, "y": 150, "w": 360, "h": 180 },
    "title": "基本信息", "content": "给这个人一个具体锚点（留空待填）" },
  { "op": "add_node", "id": "persona-hesitant.evidence", "kind": "slot", "parent": "persona-hesitant",
    "bounds": { "x": 436, "y": 150, "w": 360, "h": 180 },
    "title": "数据来源标注 ⚠️", "content": "强制自检：基于真实访谈聚类还是假设草拟？" }
]
```

（其余 5 个 slot 同 `basic` 模式追加。）

角色分工：专家定 7 板块和⚠️自检项；智能体本体从访谈笔记 Tier 2 `seed` 出浅色画像草稿；
学生亲手改写并逐条标来源。

证据与 AI 边界：`evidence` slot 留空或填"团队共识/推测"→ 触发红色警示批注（协议红线 3）。

区域批注与物化：学生在某 slot 标紫色区域批注 → 智能体补草稿。Persona 生成器 Widget 的
确认结果，物化成这张卡。

边界：不要做成需要用户在组件里填表的 Widget——Persona 是静态知识结构，填写发生在画板上。

---

## 示例 2 — 用户旅程地图

- 母型：时序层带型｜阶段：Discover → Define
- 说明：旅程是跟着真实用户走出来的，不是设计出来的；人机场景需标控制权转移。

一句话说明：

```text
用户旅程地图
请从真实观察提炼阶段，并逐层填写触点、行为、感受、痛点和机会。
```

结构（横向阶段列 × 纵向层泳道）：

```text
root section「用户旅程：开放日报名」
├─ 一句话说明 text
├─ 阶段列（横向，从真实观察提炼，不套通用模板）：知晓 → 了解 → 报名 → 到场 → 离场
└─ 纵向层 slot（每个阶段一格）：
     触点（物理+数字都记）
     用户行为（客观动作，不猜意图）
     想法与感受（要有观察依据）
     痛点
     机会点（标"初步想法"）
     情绪值（-5 ~ +5，定位关键转折）
```

生成命令草图：用 `add_node` 建 root section，再对每个"阶段 × 层"建一个 slot（`parent`
指向 root，`area` 排成网格），slot 标题写"阶段名 · 层名"，提示语写该层要记什么。情绪曲线
可另起一行 slot 记 -5~5 数值；若需要可拖拽的动态情绪曲线，则转 Widget。

角色分工：专家定层结构和"控制权转移"关注点；智能体按 Persona `seed` 阶段骨架草稿；学生走
访谈重排阶段、填每格。

物化：上游读 Persona（`persona-hesitant`），下游供服务蓝图、HMW。用 connector 标数据关系。

边界：只记录一次静态旅程 → 方法模板；若要实时调阶段、切换多路径视图 → Widget。

---

## 示例 3 — HMW 问题卡 + 证据链

- 母型：序列链型｜阶段：Define｜⚠️ 强制自检
- 说明：HMW 最容易被草率套用。问题必须从证据链里长出来，且不能过早方案化。

一句话说明：

```text
HMW 问题定义
请从前置证据写出开放问题，并逐项检查它是否具体、非方案化且可继续探索。
```

结构（有向证据链，从左到右）：

```text
root section「HMW：如何让犹豫型申请者更快找到方向」
├─ 一句话说明 text
├─ ① 前置证据 slot ⚠️        来自哪个洞察 / Persona / 旅程节点？（强制，不能空）
├─ ② HMW 陈述 slot           How might we … （一句，具体、开放、非方案）
├─ ③ 质量自检 slot ⚠️        具体？基于证据？非方案化？足够开放？（逐项打勾）
├─ ④ 候选版本并置 slot       同一张力的 2-3 个 HMW 版本，保留不压平
└─ `vd_method_source` meta（不上画布）
```

用 connector 把 ①→②→③→④ 连成有向链，让学生看见"问题从证据来"。

生成命令草图：

```json
[
  { "op": "add_node", "id": "hmw-direction", "kind": "section", "stage": "define",
    "title": "HMW：帮犹豫型申请者更快找到方向", "role": "scaffold.root",
    "meta": { "vd_method_source": { "method_id": "hmw", "class": "B", "experts": ["马谨","孙效华","辛向阳","娄永琪","王受之","刘洋","吴端","魏佛兰"] } } },
  { "op": "add_node", "id": "hmw-direction.evidence", "kind": "slot", "parent": "hmw-direction",
    "title": "① 前置证据 ⚠️", "content": "这个 HMW 来自哪条洞察 / 哪个 Persona 痛点 / 旅程哪个断点？（不能空）" },
  { "op": "add_node", "id": "hmw-direction.statement", "kind": "slot", "parent": "hmw-direction",
    "title": "② HMW 陈述", "content": "How might we …（具体、开放、非方案）" },
  { "op": "add_node", "id": "hmw-direction.check", "kind": "slot", "parent": "hmw-direction",
    "title": "③ 质量自检 ⚠️", "content": "具体？基于证据？非方案化？足够开放？" }
]
```

角色分工：专家定"证据→问题"链和自检项；智能体给改写候选和质量提示（HMW 检查 Widget 的
结果可回写到这里）；学生认定最终问题。

证据与 AI 边界：① 留空 → 警示批注。智能体不得替学生把某个 HMW 定为最终问题。

物化：上游读 Persona / 旅程 / 洞察；下游供 AI 方案发散。HMW 质量检查 Widget 的评分和改写
建议，物化成 ③④ 的内容。

---

## 其余母型精简示例

### 继续推进包 — 从 Define 进入 Develop

- 阶段：Define → Develop。
- 说明：用于"继续推进 / 下一步 / 接着做"。不是诊断；目标是把已定义的问题转成可发散的方案动作。

结构：

```text
Define root「阶段小结：问题定义」
├─ 已确认 HMW / 设计张力 slot
├─ 评价标准 slot
├─ 证据来源 slot（Persona / 旅程 / 调研）
└─ 搁置问题 slot

Develop root「方案发散与筛选」
├─ 一句话说明
├─ 方案方向 slot
├─ 待验证假设 slot
├─ 低精度原型计划 slot
└─ 筛选标准 slot
```

生成要点：先补 Define 阶段小结，再在 Develop 放方案脚手架；用 connector 从 HMW / 评价标准连到
方案方向。AI 可以预填 3-5 个浅色方案方向，并在 meta/语义层标记待确认；专家意见绑定到"待验证假设"
或"筛选标准"，而不是写总评。

### 四阶段项目诊断包 — 全项目诊断

- 阶段：Discover + Define + Develop + Deliver。
- 说明：用于"诊断 / 评审 / 优化整个项目"。不是一个模板，而是四个阶段 root 的组合。

结构：

```text
Discover root「资料与前期想法盘点」
├─ 一句话说明
├─ 已有资料 slot（文档 / 文件 / 画布 / 上传材料）
├─ 前期想法 slot（用户已经表达过的发散方向）
├─ 调研与观察 slot（找到则填，没找到写未发现 / 待补）
└─ 待补资料 slot

Define root「定位与问题定义」
├─ 产品/服务定位 slot
├─ 目标用户 / 利益相关者 slot
├─ 关键场景 slot
├─ HMW / 设计张力 slot
└─ 评价标准 ⚠️ slot

Develop root「方案结构与迭代」
├─ 方案 / 功能清单 slot
├─ 信息架构 / 流程 slot
├─ 版本链 / 迭代记录 slot
├─ 决策依据 slot
└─ 下一轮验证 slot

Deliver root「交付与风险」
├─ 当前产物 / UI / artifact slot
├─ 系统或内容架构 slot
├─ 设计原则 / 导则 slot
├─ 风险与搁置 slot
└─ 交付准备 slot
```

生成要点：先创建四个 root，再填 seed；每个 seed 都标来源，AI 预填用浅色草稿并在 meta/语义层标记待确认。若某阶段无证据，
不要空着，写 `未发现 / 待补：需要补充...`。专家意见绑定到具体 slot，例如 Persona、HMW、
信息架构、风险清单，而不是只绑定到总标题。

边界：跨阶段"针灸式诊断"Widget 只能在四个 root 已有证据后创建；它引用这些 slot 里的问题点，
让学生校正严重度和传导力。

### 分区收集型 — 田野日志 / 证据墙

- 阶段：Discover。root section 下建若干**分区 section**（日期分区 / 主题分区 / 证据类型分区），
  学生把 sticky 放进对应区。田野日志每天一个新 frame，以日期命名。
- 证据墙关键：每张 sticky 标"观察到 / 访谈中说到 / 数据 / 推测"。
- AI 边界：田野日志阶段 AI 克制，不主动补全；多天积累后才做一次跨日主题聚合。
- 边界：只是分类放卡 → 方法模板；要动态聚类 / 词云 / 筛选 → 转可视化 Widget。

### 网格矩阵型 — 优先级矩阵（静态记录版）

- 阶段：Define。root section + 两轴交叉 slot 格（如 影响力 × 可行动性），学生把问题卡放格。
- 记录版只承载"这次排完的结果 + 取舍理由"。
- 边界：**要拖动、调权重、实时重排 → 转 Widget（本地操作型）**；这里只记录一次判断。

### 关系网络型 — 利益相关者地图（静态版）

- 阶段：Discover。root section + 角色 sticky 节点 + connector（`relationships`，类型：合作 /
  冲突 / 依赖）。节点大小可暗示权力，但静态版不做交互。
- 专家介入点（马谨 / 娄永琪 / 王受之）：谁有权定义问题、谁的声音被忽略。
- 边界：**这是 template↔Widget 的重叠区**。静态描摹一次关系 → 方法模板；需要拖拽节点、
  调权力/声量、切换"关系视图 ↔ 权力-声量四象限" → 转关系网络 Widget（design-methods 已把
  "利益相关者框架地图"标为交互组件）。

---

## 阶段 × 母型 速查

| 阶段 | 常用母型 | 代表方法 |
| --- | --- | --- |
| Discover | 卡片字段 / 分区收集 / 关系网络(静态) | Persona、田野日志、证据墙、利益相关者地图 |
| Define | 序列链 / 网格矩阵 / 分区收集 | HMW+证据、优先级矩阵、约束墙、张力板 |
| Develop | 分区收集 / 序列链 / 卡片字段 | 方向墙、方案变体、版本链、决策记录 |
| Deliver | 卡片字段 / 序列链 / 分区收集 | 设计规范卡、决策依据链、交付清单、可复用模式 |

## 反例与修正

**反例 1：所有专家 frame 都是竖向列表**

```json
[
  { "op": "add_node", "id": "majin", "kind": "section", "stage": "discover", "title": "马谨建议" },
  { "op": "add_node", "id": "majin.1", "kind": "text", "content": "已有资料" },
  { "op": "add_node", "id": "majin.2", "kind": "text", "content": "待补资料" }
]
```

失败原因：没有 `role:"scaffold.root"`；子节点没有 `parent` 和 `bounds`；没有母型；
内容是通用空桶；专家名变成可见标题，缺少 `vd_method_source`。

修正：把它改成一个具体母型，例如 `evidence_chain`，root 写 stage/meta，子节点横向排布：

```json
[
  { "op": "add_node", "id": "majin-question-chain", "kind": "section", "stage": "discover",
    "title": "研究问题拆解链", "role": "scaffold.root",
    "meta": {
      "vd_layout_archetype": "evidence_chain",
      "vd_layout_signature": "left-to-right question chain from phenomenon to research cut",
      "vd_method_source": { "method_id": "question-framing", "class": "C",
        "experts": [{ "name": "马谨", "domain": "服务/系统设计" }] }
    } },
  { "op": "add_node", "id": "majin-question-chain.h", "kind": "text", "parent": "majin-question-chain",
    "bounds": { "x": 44, "y": 28, "w": 980, "h": 90 },
    "text_size": "xl", "font": "sans",
    "content": "研究问题拆解链\n请把模糊兴趣拆成现象、证据、张力和可研究切口。" },
  { "op": "add_node", "id": "majin-question-chain.n1", "kind": "slot", "parent": "majin-question-chain",
    "bounds": { "x": 44, "y": 160, "w": 220, "h": 160 }, "title": "现象", "content": "你观察到什么具体行为？" },
  { "op": "add_node", "id": "majin-question-chain.n2", "kind": "slot", "parent": "majin-question-chain",
    "bounds": { "x": 320, "y": 160, "w": 220, "h": 160 }, "title": "证据", "content": "它来自照片、访谈还是现场记录？" },
  { "op": "add_connector", "from": "majin-question-chain.n1", "to": "majin-question-chain.n2" }
]
```

**反例 2：不同专家 frame 长得一样**

失败原因：即使每个 frame 都有 `stage`，如果 5 个专家都用同一组纵向 slot，学生无法看见不同专家的
研究审美。修正：开题全景 5 个专家至少用 3 种母型，例如马谨 `evidence_chain`、刘洋
`matrix_grid`、魏佛兰 `collection_zones`、吴端 `radial_network`、王受之 `card_fields`。

## 生成后自检

生成方法模板后，智能体应确认（合约 §7）：

1. 有 `scaffold.root`，root 有 `stage` 并落入对应 stage section。
2. root meta 有 `vd_method_source`、`vd_layout_archetype`、`vd_layout_signature`。
3. root 内每个子节点都有 `parent` 和相对 root 的 `bounds`。
4. 顶部有一句话说明（大标题 + 灰色"你要做什么"），没有 7 字段 AI 元信息。
5. 每个 slot 有标题 + 一句提示语，不是空格子。
6. 证据链类有来源标注区；⚠️ 方法有强制自检板块。
7. 多专家 frame 满足母型差异，不是同一种竖向列表。
8. 画布上没有专家署名文字；AI 预填用浅色样式区分，并在 meta/语义层标记待确认。
9. 学生动作区留白充足。

## 测试生成的模板示例

> 本区用于收录后续实际测试生成、并经人工确认合格的方法模板，作为高保真参考。
> 每条建议记录：项目语境 / 母型 / 生成命令 / 生成结果截图或 IR 摘要 / 复盘（哪里好、哪里需修）。

（待补充）
