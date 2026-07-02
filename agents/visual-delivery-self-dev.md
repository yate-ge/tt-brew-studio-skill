---
name: visual-delivery-self-dev
description: >
  Visual Delivery Skill 的自举开发模式：用本 skill 支持本 skill 项目的开发。
  当你需要修改 SKILL.md、templates、scripts 或 references 时启用此模式。
  所有开发交付通过 Visual Delivery 页面进行，支持实时反馈闭环。
---

# Visual Delivery 自举开发模式

## 核心概念

**Self-Dev Loop（自举开发环）**：用 Visual Delivery Skill 开发和测试 Visual Delivery Skill 自身。

```
修改 Skill 代码
    ↓
通过 Visual Delivery 交付并收集反馈
    ↓
处理反馈，继续修改
    ↓
最终交付
```

## 路径定义

```
SKILL_DIR   = /Users/yatege/WorkingProject/visual-delivery-skill
RUNTIME_DIR = /Users/yatege/WorkingProject/visual-delivery-skill/.visual-delivery
```

## 开发阶段

### Phase 1：环境准备

#### 1.1 启动 Visual Delivery 服务

Skill 运行时数据目录指向项目自身：

```bash
node {SKILL_DIR}/scripts/start.js \
  --data-dir {RUNTIME_DIR} \
  --lang zh
```

服务运行在 `http://localhost:3847`，数据存储在 `.visual-delivery/` 目录。
普通启动会保留已有运行时数据。需要重新初始化干净环境时，使用：

```bash
node {SKILL_DIR}/scripts/reinitialize.js \
  --data-dir {RUNTIME_DIR} \
  --lang zh
```

该命令会停止服务、备份旧 `.visual-delivery/`，再重新创建干净运行时。

#### 1.2 验证运行环境

确认服务正常：
```bash
curl -s http://localhost:3847/api/project | jq .
```

确认设计稿路径：
```
RUNTIME_DIR/data/design/
```

---

### Phase 2：开发工作流

#### 2.1 任务发起

当需要开发或修改 skill 时，通过 Visual Delivery 发起任务：

1. 打开 `http://localhost:3847`
2. 创建新汇报（选择 `complex-review` 结构层）
3. 标题格式：`[Skill Dev] {任务描述}`

#### 2.2 开发汇报页面生成

修改代码后，生成开发汇报页面：

```bash
curl -s -X POST http://localhost:3847/api/reports \
  -H 'Content-Type: application/json' \
  -d '{
    "title": "[Skill Dev] SKILL.md 修改：反馈生命周期",
    "structure": "complex-review",
    "presentation": "document",
    "routing_reason": "自举开发需要呈现修改摘要、影响范围、验证证据和待反馈点。",
    "content": {
      "type": "report_template",
      "version": 1,
      "structure": "complex-review",
      "presentation": "document",
      "sections": [
        {
          "id": "sec-summary",
          "title": "修改摘要",
          "presentation": "document",
          "artifact": {
            "type": "document",
            "body": "# 修改摘要\n\n说明改了什么、为什么改、影响哪些文件。"
          }
        }
      ]
    }
  }'
```

#### 2.3 开发汇报页面结构

每页应包含：

| 区块 | 内容 |
|------|------|
| 任务标题 | 修改描述 |
| 修改摘要 | 改了什么 |
| 代码对比 | 前后 diff |
| 影响范围 | 涉及文件 |
| 反馈选项 | 接受/修改/讨论 |

#### 2.4 反馈处理

用户在页面提交反馈后：

```bash
# 读取反馈
curl -s http://localhost:3847/api/reports/{REPORT_ID}/feedback
```

根据反馈类型处理：
- `accept_fix` → 直接修改
- `discuss` → 生成讨论页面
- `defer` → 记录到 backlog

---

### Phase 3：代码同步 & 安装

#### 3.1 修改模板文件

模板文件位于 `templates/` 目录，修改后需要：

1. 在 dev 环境测试
2. 生成开发汇报页面
3. 收集确认反馈
4. **安装到各平台**
5. 同步到正式环境

#### 3.2 修改 SKILL.md

SKILL.md 是 skill 的入口，修改后需要：

1. 创建测试任务
2. 用新 SKILL.md 逻辑生成开发汇报页面
3. 验证指令是否正确执行
4. **安装到各平台**

#### 3.3 修改 scripts/

`scripts/start.js` 和 `scripts/stop.js` 修改后：

1. 重启服务
2. 验证启动流程
3. 检查日志输出
4. **安装到各平台**

#### 3.4 安装到平台

每次 skill 修改后，执行安装脚本：

```bash
bash /Users/yatege/WorkingProject/visual-delivery-skill/scripts/install-to-platforms.sh
```

安装目标：
- `~/.claude/skills/visual-delivery-skill`
- `~/.codex/skills/visual-delivery-skill`
- `~/.learnbuddy/skills/visual-delivery-skill`

安装时会自动备份旧版本。

#### 3.5 重启服务器（关键步骤）

**每次 skill 修改后（尤其是 UI 修改），必须重启服务器才能生效！**

重启流程：

```bash
# 1. 停止旧服务
node /Users/yatege/WorkingProject/visual-delivery-skill/scripts/stop.js

# 2. 重新构建前端
cd /Users/yatege/WorkingProject/visual-delivery-skill/templates/ui
./node_modules/.bin/vite build

# 3. 同步到运行时目录
rsync -av --exclude='.git' --exclude='node_modules' --exclude='.visual-delivery' \
  --exclude='templates/ui/node_modules' --exclude='templates/ui/dist' \
  ./templates/ui/dist/ /Users/yatege/WorkingProject/visual-delivery-skill/.visual-delivery/ui/dist/

rsync -av --exclude='.git' --exclude='node_modules' --exclude='.visual-delivery' \
  --exclude='templates/ui/node_modules' --exclude='templates/ui/dist' \
  ./templates/ui/src/ /Users/yatege/WorkingProject/visual-delivery-skill/.visual-delivery/ui/src/

# 4. 重启服务
cd /Users/yatege/WorkingProject/visual-delivery-skill
node scripts/start.js --data-dir /Users/yatege/WorkingProject/visual-delivery-skill/.visual-delivery --lang zh &
```

**常见问题**：浏览器显示旧版 UI → 硬刷新（Cmd+Shift+R）或清除缓存

---

### Phase 4：测试验收

#### 4.1 单元测试页面

为每个功能生成测试交付页：

```html
<!-- 测试反馈按钮交互 -->
<button data-vd-feedback-action="test_action"
        data-vd-feedback-label="测试反馈"
        data-vd-feedback-item-id="test-1">
  测试
</button>
```

#### 4.2 集成测试

完整流程测试：

1. 创建汇报 → 提交交付页
2. 添加反馈 → 处理反馈
3. 更新页面 → 确认闭环

#### 4.3 回归测试

每次修改后验证：

| 功能 | 验证方式 |
|------|----------|
| 服务启动 | `curl http://localhost:3847/health` |
| 页面生成 | 创建 report，验证 `content.type=report_template` |
| 反馈收集 | 提交反馈，验证写入 |
| 状态更新 | 处理 report feedback 后验证 change record |

---

## 开发约定

### 5.1 提交规范

提交信息格式：

```
[dev] {类型}: {描述}

Types:
- skill: SKILL.md 修改
- template: templates/ 修改
- script: scripts/ 修改
- ref: references/ 修改
- docs: 文档修改
```

### 5.2 分支策略

```
main          → 稳定版本
dev           → 开发版本
dev/{feature} → 功能分支
```

### 5.3 发布流程

1. 在 dev 分支完成开发和测试
2. 生成发布交付页
3. 收集最终反馈
4. 合并到 main
5. 打标签发布

---

## 安装脚本

每次 skill 修改完成后，运行安装脚本将 skill 部署到各平台。

### 平台安装目录

| 平台 | 安装路径 | 说明 |
|------|----------|------|
| Claude Code | `~/.claude/skills/` | Skill 目录 |
| Codex | `~/.codex/skills/` | Skill 目录 |
| WorkBuddy/LearnBuddy | `~/.learnbuddy/skills/` | Skill 目录（格式：`skill_*`） |

### 安装脚本

```bash
#!/bin/bash
# install-to-platforms.sh
# 将 visual-delivery-skill 安装到各智能体平台

set -e

SKILL_DIR="/Users/yatege/WorkingProject/visual-delivery-skill"
SKILL_NAME="visual-delivery-skill"

# 目标平台
PLATFORMS=(
  "~/.claude/skills"
  "~/.codex/skills"
  "~/.learnbuddy/skills"
)

echo "Installing $SKILL_NAME to all platforms..."

for PLATFORM_DIR in "${PLATFORMS[@]}"; do
  EXPANDED_DIR="${PLATFORM_DIR/#\~/$HOME}"
  
  if [ -d "$EXPANDED_DIR" ]; then
    DEST="$EXPANDED_DIR/$SKILL_NAME"
    
    # 备份旧版本
    if [ -d "$DEST" ]; then
      BACKUP="$DEST.bak.$(date +%Y%m%d%H%M%S)"
      echo "  Backup: $BACKUP"
      mv "$DEST" "$BACKUP"
    fi
    
    # 复制新版本（排除 .git 和 node_modules）
    echo "  → $DEST"
    rsync -av --exclude='.git' --exclude='node_modules' --exclude='.visual-delivery' \
      "$SKILL_DIR/" "$DEST/"
    
    echo "  ✓ Installed to $EXPANDED_DIR"
  else
    echo "  ⚠ Skipped $EXPANDED_DIR (not found)"
  fi
done

echo "Done."
```

### 安装命令速查

```bash
# 完整安装（所有平台）
bash /Users/yatege/WorkingProject/visual-delivery-skill/scripts/install-to-platforms.sh

# 单平台安装
cp -r /Users/yatege/WorkingProject/visual-delivery-skill ~/.claude/skills/visual-delivery-skill
cp -r /Users/yatege/WorkingProject/visual-delivery-skill ~/.codex/skills/visual-delivery-skill
cp -r /Users/yatege/WorkingProject/visual-delivery-skill ~/.learnbuddy/skills/visual-delivery-skill
```

### 安装后验证

```bash
# 验证各平台
ls -la ~/.claude/skills/visual-delivery-skill/SKILL.md
ls -la ~/.codex/skills/visual-delivery-skill/SKILL.md
ls -la ~/.learnbuddy/skills/visual-delivery-skill/SKILL.md
```

---

## 故障排查

### 服务启动失败

```bash
# 检查端口占用
lsof -i :3847

# 查看错误日志
cat {RUNTIME_DIR}/logs/startup.log
```

### 前端构建失败

```bash
# 进入模板目录
cd {SKILL_DIR}/templates/ui

# 清理并重建
rm -rf node_modules/.vite
node_modules/.bin/vite build
```

### API 请求失败

```bash
# 测试 API 连通性
curl -v http://localhost:3847/api/settings

# 检查数据目录权限
ls -la {RUNTIME_DIR}/data/
```

### 平台安装失败

```bash
# 检查目标目录是否存在
ls -la ~/.claude/skills/
ls -la ~/.codex/skills/
ls -la ~/.learnbuddy/skills/

# 手动复制
cp -r /Users/yatege/WorkingProject/visual-delivery-skill ~/.claude/skills/
```

---

## 最佳实践

### 使用 skill 开发 skill

```
┌─────────────────────────────────────────────────────────┐
│  当你修改 SKILL.md 或 templates 时：                     │
│                                                         │
│  1. 启动本 skill（Visual Delivery）                       │
│  2. 创建开发任务 delivery                                 │
│  3. 在交付页展示修改内容                                  │
│  4. 收集反馈                                             │
│  5. 根据反馈修改                                          │
│  6. 重复直到完成                                          │
└─────────────────────────────────────────────────────────┘
```

### 保持开发记录

每次开发会话都应在 `.visual-delivery/` 中留下记录：

```bash
# 创建开发日志
curl -s -X POST http://localhost:3847/api/logs \
  -H 'Content-Type: application/json' \
  -d '{
    "type": "manual",
    "title": "[Dev Session] 反馈系统重构",
    "content": "开始重构反馈生命周期...",
    "tags": ["dev", "feedback"]
  }'
```

### Self-Dev 注意事项

1. **避免循环依赖**：skill 依赖运行时服务，运行时服务是 skill 的一部分，确保修改不会导致无法启动
2. **保留回滚能力**：修改前备份关键文件
3. **小步提交**：每次修改尽量小，便于追溯
4. **测试先行**：新功能先写测试用例

---

## 命令速查

```bash
# 启动服务（项目自身）
node /Users/yatege/WorkingProject/visual-delivery-skill/scripts/start.js \
  --data-dir /Users/yatege/WorkingProject/visual-delivery-skill/.visual-delivery \
  --lang zh

# 查看项目状态
curl -s http://localhost:3847/api/project | jq .

# 创建开发汇报
curl -s -X POST http://localhost:3847/api/reports \
  -H 'Content-Type: application/json' \
  -d '{...}'

# 读取反馈
curl -s http://localhost:3847/api/reports/{id}/feedback

# 停止服务
node /Users/yatege/WorkingProject/visual-delivery-skill/scripts/stop.js
```
