# AGENTS.md

面向在本仓库工作的 AI coding agents。根目录的这份说明适用于整个
`tt-design-brew-studio` 项目。

## 项目定位

`tt-design-brew-studio` 是一个面向设计教育的 Agent Skill：把 TT 设计学院
知识库中的多位设计专家分身组织到同一份学生设计过程中，通过本地交互画板进行
专家署名的引导、批注、评审、方法脚手架和 widget 共创。默认所有内容在同一个
项目工作 Page 中完成；tldraw Pages 只作为底层兼容能力保留，不作为默认多画板机制。
核心入口是 `SKILL.md`，
运行时代码模板在 `templates/`，启动与安装脚本在 `scripts/`，补充规范在
`references/`。

## 路径与运行时

默认项目路径以当前仓库为准：

```text
SKILL_DIR=<本仓库根目录>
RUNTIME_DIR=<本仓库根目录>/.visual-delivery
```

`.visual-delivery/` 是本地运行时目录，已在 `.gitignore` 中排除。不要把运行时
数据、构建产物或本地依赖提交进仓库。

## 常用命令

启动本仓库自己的 TT 设计精酿 Studio 服务：

```bash
node scripts/start.js --data-dir .visual-delivery --lang zh
```

健康检查：

```bash
curl -s http://localhost:3847/health
```

安装到各 Agent 平台：

```bash
bash scripts/install-to-platforms.sh
```

安装脚本会同步到：

- `~/.claude/skills/tt-design-brew-studio`
- `~/.codex/skills/tt-design-brew-studio`
- `~/.learnbuddy/skills/tt-design-brew-studio`

## 开发流程

涉及 skill 行为的修改按以下顺序处理：

1. 先阅读相关入口文件和参考文档，不凭记忆改协议或模板。
2. 保持变更范围小，优先沿用现有结构。
3. 测试前重启 TT 设计精酿 Studio 服务，确保验证的是最新代码和模板。
4. 修改 `templates/` 后，重启服务并确认运行时模板同步正常。
5. 修改 `SKILL.md` 后，检查触发条件、边界和参考文档是否一致。
6. 修改 `scripts/` 后，重启服务并检查启动与健康检查。
7. 修改完成后，在最终回复中说明改动、影响范围和验证结果。
8. 用户确认后，再运行安装脚本同步到平台目录。

## 验收清单

根据变更类型选择验证项：

- 测试前重启：重新执行 `scripts/start.js`，不要复用旧服务状态
- 服务启动：`curl -s http://localhost:3847/health`
- 画布加载：打开 `http://localhost:3847/canvas`
- 单 Page 主路径：默认所有阶段、脚手架、批注和 widget 都写入当前工作 Page
- 画布写入：CanvasIR 或 commands 能更新当前工作 Page，并在存在其他 Pages 时不破坏它们
- 反馈收集：选中画布元素可提交标注，右下角面板可查看提交内容
- 前端模板：在 `.visual-delivery/ui` 中确认构建与页面加载正常
- 安装同步：执行 `scripts/install-to-platforms.sh`

没有自动化测试覆盖时，在最终回复中明确说明已做的手动验证和未验证风险。

## 代码与文档约定

- 默认使用 ASCII；中文文档和用户可见中文文案可使用中文标点。
- 不提交 `.visual-delivery/`、`node_modules/`、`dist/` 或本地编辑器文件。
- 不回退用户已有变更；遇到工作区脏状态时只处理当前任务相关文件。
- 不随意改端口、CanvasIR schema、iframe bridge、设计令牌命名或运行时目录结构。
- UI 文案语言遵循当前用户语言；平台语言遵循 `SKILL.md` 中的语言模型规则。
- 文档修改保持可执行：命令、路径、API 名称必须与仓库实际实现一致。

## 提交说明

如果需要提交，使用以下格式：

```text
[dev] {类型}: {描述}
```

类型包括：

- `skill`：`SKILL.md` 修改
- `template`：`templates/` 修改
- `script`：`scripts/` 修改
- `ref`：`references/` 修改
- `docs`：文档修改
