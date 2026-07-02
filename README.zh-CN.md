[中文 README](./README.md)

# TT 设计精酿 Studio Skill

一个面向设计教育的多专家设计协作 Agent Skill。设计如同一杯精酿，需要不断调配、发酵、
品鉴；本 skill 把 TT 设计学院知识库中的多位设计专家分身组织到同一份学生设计过程中：
每位专家从自己的领域、研究方法和审美取向出发，在本地持久画布上进行引导、批注、评审
与共创；智能体本体则根据用户目标生成设计草案、画板补全、方法模板和项目化 Widget。

画布不是通用汇报工具，而是设计学习的工作台。它把显性方法论和难以言传的隐性审美，
沉淀为可追踪的专家判断、可操作的方法模板（CanvasIR Template），以及可交互的交互组件
（Widget），让学生在持续调整自己的设计配方时逐步内化设计判断力。

## 核心特性

- **多专家审美引导**：专家分身围绕同一份学生设计过程协同判断，并标明专家、领域、
  审美取向、方法依据和下一步动作。
- **持久设计画板**：运行时在 `.visual-delivery/` 下保存一个项目画布文档；默认所有阶段、
  方法模板、专家批注、学生回应和交互组件都在同一个工作 Page 中完成。
- **设计方法脚手架**：专家可以添加 frame、提示、方法模板、关系线、示例草稿和下一步讨论区。
- **画布内批注与共创**：学生可以选中画布对象提交标注，绘制紫色标注箭头，或创建紫色补全矩形。
- **交互组件**：专家可以通过交互组件模板添加沙箱 HTML 组件，例如投票、rubric、柱状图、词云、计时器和对齐量表。
- **CanvasIR 命令**：智能体优先写语义化 canvas command，而不是直接写 tldraw snapshot。
- **本地优先运行时**：默认运行在 `localhost:3847`，需要时可通过服务设置开启远程访问。

## 安装

将本仓库克隆或复制到 Agent 框架的 skills 目录下：

```bash
# Claude Code
cp -r visual-delivery-skill your-project/.claude/skills/

# Codex
cp -r visual-delivery-skill your-project/.codex/skills/
```

Agent 会自动发现并加载该技能。

## 使用方法

让 Agent 启动设计导师画板：

```text
启动设计导师画板
```

Agent 会依次：

1. 启动本地 Visual Delivery 服务。
2. 打开或初始化项目设计画板。
3. 返回 `http://localhost:3847/canvas`。
4. 通过读取和写入画布上下文继续设计指导与共创。

## 架构

```text
visual-delivery-skill/
├── SKILL.md                  # canvas-only Agent 指令
├── scripts/
│   ├── start.js              # 启动服务 + 构建前端
│   ├── reinitialize.js       # 清空运行时数据后重新初始化
│   └── stop.js               # 优雅停止
├── references/
│   ├── api.md                # canvas-only API 参考
│   ├── canvas-ir.md          # CanvasIR 与模板命令模型
│   ├── canvas-widgets.md     # 交互组件合约
│   ├── canvas-workspace-model.md
│   └── design-system.md
└── templates/
    ├── server/               # Express + WebSocket 后端
    ├── ui/                   # React + Vite 画布前端
    ├── locales/              # 内置语言包
    └── design/               # 默认设计令牌
```

## 运行时

首次启动时，`start.js` 会将 `templates/` 复制到项目的 `.visual-delivery/` 目录，
安装依赖、构建前端并启动服务。后续 `start.js` 会保留已有画布数据，只同步模板并重启服务。

需要重新初始化干净运行时时，使用 `scripts/reinitialize.js`；它会先备份旧
`.visual-delivery/`，再生成新的运行时目录。运行时目录已被 gitignore，会按需重新生成。

## 许可证

本项目基于 [MIT 许可证](./LICENSE) 开源。
