[中文](./README.zh-CN.md)

# TT 设计精酿 Studio Skill

一个面向设计教育的多专家设计协作 Agent Skill。设计如同一杯精酿，需要不断调配、发酵、
品鉴；本 skill 把 TT 设计学院知识库中的多位设计专家分身组织到同一份学生设计过程中：
每位专家从自己的领域、研究方法和审美取向出发，在本地持久画板上进行引导、批注、评审
与共创；智能体本体则根据用户目标生成设计草案、画板补全、方法模板和项目化 Widget。

本仓库的项目名是 `tt-brew-studio-skill`。它不是通用视觉交付工具，而是围绕
TT 设计学院教学场景定制的设计导师画板 skill。

画板不是通用汇报工具，而是设计学习的工作台。它把显性方法论和难以言传的隐性审美，沉淀为
可追踪的专家判断、可操作的方法模板（CanvasIR Template），以及可交互的交互组件（Widget），
让学生在持续调整自己的设计配方时逐步内化设计判断力。

## 核心特性

- **多专家审美引导**：专家分身围绕同一份学生设计过程协同判断；专家意见统一沉淀在左侧
  专家栏，并通过连线定位到具体画板对象。
- **持久设计画板**：运行时在 `.visual-delivery/` 下保存一个项目画板文档；默认所有阶段、
  方法模板、专家批注、学生回应和交互组件都在同一个工作 Page 中完成。
- **设计方法脚手架**：专家可以添加 frame、提示、方法模板、关系线、示例草稿和下一步讨论区；
  脚手架会按阶段区域自动控尺寸，并在写入时修复重叠、越界和比例问题。
- **可缩放便利贴**：便利贴使用 tldraw note 的 `scale`，既能跟随脚手架整体缩放，也能被用户
  选中后通过边缘拖拽单独缩放。
- **画板内批注与共创**：学生可以选中画板对象提交标注，绘制紫色标注箭头，或创建紫色补全矩形。
- **交互组件**：专家可以通过交互组件模板添加沙箱 HTML 组件，例如投票、rubric、柱状图、
  词云、计时器和对齐量表。
- **CanvasIR 命令**：智能体优先写语义化 canvas command，而不是直接写 tldraw snapshot。
- **本地优先运行时**：默认运行在 `localhost:3847`，需要时可通过服务设置开启远程访问。

## 安装

将本仓库克隆或复制到 Agent 框架的 skills 目录下：

```bash
# Claude Code
cp -r tt-brew-studio-skill your-project/.claude/skills/

# Codex
cp -r tt-brew-studio-skill your-project/.codex/skills/
```

Agent 会自动发现并加载该技能。

## 使用方法

让 Agent 启动设计导师画板：

```text
启动设计导师画板
```

Agent 会依次：

1. 启动本地 TT 设计精酿 Studio 服务。
2. 打开或初始化项目设计画板。
3. 返回 `http://localhost:3847/canvas`。
4. 通过读取和写入画板上下文继续设计指导与共创。

## 画板协作规则

- 默认使用一个项目画板文档和一个工作 Page；tldraw Pages 只作为底层兼容能力保留。
- 新建视觉脚手架的 root frame 名称使用脚手架标题，便于选择、导航和专家归属定位。
- 添加脚手架时，运行时会根据阶段区域、教学价值和可用尺寸自动控制大小；若直接子元素重叠、
  越界或低于可读尺寸，会自动重排为不重叠的行列。
- 用户拖拽脚手架 root frame 边缘时，内部 frame、文字、形状、便签和图片会按比例同步缩放。
- 专家智能体的批注不额外生成画布卡片或头像组件；它们统一进入左侧专家栏，悬停或选中时用
  连线指向对应画板对象。

## 架构

```text
tt-brew-studio-skill/
├── SKILL.md                  # 中文 Agent 指令
├── scripts/
│   ├── start.js              # 启动服务 + 构建前端
│   ├── reinitialize.js       # 清空运行时数据后重新初始化
│   └── stop.js               # 优雅停止
├── references/
│   ├── api.md                # API 参考
│   ├── canvas-ir.md          # CanvasIR 与模板命令模型
│   ├── canvas-widgets.md     # 交互组件合约
│   ├── canvas-workspace-model.md
│   └── design-system.md
└── templates/
    ├── server/               # Express + WebSocket 后端
    ├── ui/                   # React + Vite 画板前端
    ├── locales/              # 内置语言包
    └── design/               # 默认设计令牌
```

## 技术底座

- **画板内核**：基于 `tldraw` 改造，使用其 frame、note、geo、arrow、image 等原生画板能力，
  并扩展视觉脚手架、专家栏、区域批注、Widget 锚点和状态同步。
- **前端运行时**：`React` + `Vite`，负责画板 UI、专家栏、反馈面板、HTML Widget 容器和
  tldraw shape 行为扩展。
- **后端运行时**：`Express` + `ws`，提供本地 API、WebSocket 更新广播、CanvasIR 编译、
  快照保存、反馈线程和运行时模板同步。
- **语义协议**：CanvasIR command / semantic index 描述设计脚手架、Widget、专家意见、
  用户反馈和区域补全请求，避免 agent 直接手写 tldraw snapshot。

## 运行时

首次启动时，`start.js` 会将 `templates/` 复制到项目的 `.visual-delivery/` 目录，安装依赖、
构建前端并启动服务。后续 `start.js` 会保留已有画板数据，只同步模板并重启服务。

需要重新初始化干净运行时时，使用 `scripts/reinitialize.js`；它会先备份旧 `.visual-delivery/`，
再生成新的运行时目录。运行时目录已被 gitignore，会按需重新生成。

## 许可证

本项目基于 [MIT 许可证](./LICENSE) 开源。
