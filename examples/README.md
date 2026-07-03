# Examples / 可复现脚手架样例

这些是**已在运行时跑通、渲染验证过**的脚手架生成脚本，作为 example 保存，用来确保 case 能直接
走通、也作为智能体生成时的参照。它们直接调 `http://localhost:3847` 的 CanvasIR commands / feedback
API。先按 SKILL.md 启动服务，再 `node <脚本>`。

## gallery-demo.mjs — 框架级画布观感样板（3 个）

在一个新画布里生成 3 个不同母型的框架级脚手架，演示目标观感（对照桌面参考图）：
1. **可玩城市设计画布** — 不规则分区网格（Design Canvas / BMC 观感）
2. **可玩性评价框架** — 心形中心 + 六维环绕（Culture Design Canvas 观感）
3. **老人与城市的关系** — 放射框架（AIA Framework 观感）

体现新规范：一句话说明（`xl sans` 标题 + 灰色 `s` "你要做什么"）、每分区标题 + 一句引导问题 +
留白、**不上署名/AI 元信息**、样式字段（`text_size`/`font`/`fill:none` 描边包围形）。

```bash
node examples/gallery-demo.mjs
```

## case-walk.mjs — 小雷 case 分幕生成（Discover→Deliver）

按幕生成小雷《老年人可玩城市》的脚手架 + 专家 feedback + 共创角色 Widget + 证据链。
**注意**：此脚本是当前 5 位在场专家规则下的可运行版本，用于验证布局个性化（横向时间轴/放射/网格各异，
零重叠）；权威 case 也遵循最多 5 位在场专家（见 `references/case-playable-city.md`）。

```bash
node examples/case-walk.mjs setup
node examples/case-walk.mjs scene1   # 开题全景：课题卡 + 5 专家各一框架
node examples/case-walk.mjs scene2   # 洞察聚类 + 专家批注 + 共创角色 Widget
node examples/case-walk.mjs scene3   # 补全 → 三层框架 + 六维评价 + 方向卡
node examples/case-walk.mjs scene4   # 批注闭环 + 开题证据链
```

## role-widget.html — 共创角色 Widget（Tier 3 自由 HTML）

`case-walk.mjs` scene2 读取它作为共创角色 Widget（拖拽换组、contenteditable 组名、`vd.emit`
物化、状态写回）。是"局部操作型 / 轻量输入型"Widget 的实测样例。

---

对应参考文档：`references/scaffold-gallery.md`（配方）、`references/case-playable-city.md`（权威
case）、`references/collaboration-model.md`（协同机制与待建项）。
