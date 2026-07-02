# AGENTS.md

面向在本仓库工作的 AI coding agents。根目录的这份说明适用于整个
`visual-delivery-skill` 项目。

## 项目定位

`visual-delivery-skill` 是一个 Agent Skill：把任务结果生成成本地可交互的
Visual Delivery 页面，并通过页面内反馈形成审查闭环。核心入口是
`SKILL.md`，运行时代码模板在 `templates/`，启动与安装脚本在 `scripts/`，
补充规范在 `references/`。

## 自举开发模式

修改本 skill 自身时，先阅读并遵守
`agents/visual-delivery-self-dev.md`。该文件定义了 Self-Dev Loop：

1. 修改 skill 代码或文档。
2. 用本仓库的 Visual Delivery 服务交付变更说明。
3. 收集页面反馈并继续修改。
4. 完成后执行安装脚本同步到各平台。

触发自举模式的范围包括：

- `SKILL.md`
- `templates/`
- `scripts/`
- `references/`
- 与 skill 行为、交付流程、反馈协议有关的文档

## 路径与运行时

默认项目路径：

```text
SKILL_DIR=/Users/yatege/WorkingProject/visual-delivery-skill
RUNTIME_DIR=/Users/yatege/WorkingProject/visual-delivery-skill/.visual-delivery
```

`.visual-delivery/` 是本地运行时目录，已在 `.gitignore` 中排除。不要把运行时
数据、构建产物或本地依赖提交进仓库。

## 常用命令

启动本仓库自己的 Visual Delivery 服务：

```bash
node /Users/yatege/WorkingProject/visual-delivery-skill/scripts/start.js \
  --data-dir /Users/yatege/WorkingProject/visual-delivery-skill/.visual-delivery \
  --lang zh
```

重新初始化并清空运行时数据：

```bash
node /Users/yatege/WorkingProject/visual-delivery-skill/scripts/reinitialize.js \
  --data-dir /Users/yatege/WorkingProject/visual-delivery-skill/.visual-delivery \
  --lang zh
```

`reinitialize.js` 会先停止服务，再把旧 `.visual-delivery/` 备份为
`.visual-delivery.bak.YYYYMMDDHHMMSS`，最后重新创建干净运行时。普通
`start.js` 只重启和同步模板，不清空历史数据。

健康检查：

```bash
curl -s http://localhost:3847/health
```

读取项目信息：

```bash
curl -s http://localhost:3847/api/project
```

安装到各 Agent 平台：

```bash
bash /Users/yatege/WorkingProject/visual-delivery-skill/scripts/install-to-platforms.sh
```

安装脚本会同步到：

- `~/.claude/skills/visual-delivery-skill`
- `~/.codex/skills/visual-delivery-skill`
- `~/.learnbuddy/skills/visual-delivery-skill`

## 开发流程

涉及 skill 行为的修改按以下顺序处理：

1. 先阅读相关入口文件和参考文档，不凭记忆改协议或模板。
2. 保持变更范围小，优先沿用现有结构。
3. 进行任何测试前，必须重启 Visual Delivery 服务，确保验证的是最新代码和最新模板。
4. 修改 `templates/` 后，重启服务并确认运行时模板同步正常。
5. 修改 `SKILL.md` 后，重启服务并用实际任务验证新指令能被正确执行。
6. 修改 `scripts/` 后，重启服务并检查启动、健康检查和日志输出。
7. 修改完成后，通过 Visual Delivery 创建交付页，说明改动、影响范围和验证结果。
8. 用户确认后，再运行安装脚本同步到平台目录。

交付页应至少包含：

- 任务标题
- 修改摘要
- 涉及文件
- 关键 diff 或行为变化
- 验证结果
- 逐项反馈按钮与可见的其他意见输入框

## 验收清单

根据变更类型选择验证项：

- 测试前重启：重新执行 `scripts/start.js`，不要复用旧服务状态
- 服务启动：`curl -s http://localhost:3847/health`
- 页面创建：向 `POST /api/deliveries` 创建测试 delivery
- 反馈收集：读取 `GET /api/deliveries/{DELIVERY_ID}/feedback`
- 前端模板：在 `.visual-delivery/ui` 中确认构建与页面加载正常
- 安装同步：执行 `scripts/install-to-platforms.sh`

没有自动化测试覆盖时，在最终回复中明确说明已做的手动验证和未验证风险。

## 代码与文档约定

- 默认使用 ASCII；中文文档和用户可见中文文案可使用中文标点。
- 不提交 `.visual-delivery/`、`node_modules/`、`dist/` 或本地编辑器文件。
- 不回退用户已有变更；遇到工作区脏状态时只处理当前任务相关文件。
- 不随意改端口、反馈 schema、iframe bridge、设计令牌命名或运行时目录结构。
- UI 文案语言遵循当前用户语言；平台语言遵循 `SKILL.md` 中的语言模型规则。
- 文档修改保持可执行：命令、路径、API 名称必须与仓库实际实现一致。

## 提交说明

如果需要提交，使用自举文档中的格式：

```text
[dev] {类型}: {描述}
```

类型包括：

- `skill`：`SKILL.md` 修改
- `template`：`templates/` 修改
- `script`：`scripts/` 修改
- `ref`：`references/` 修改
- `docs`：文档修改
