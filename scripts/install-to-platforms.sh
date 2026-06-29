#!/bin/bash
# install-to-platforms.sh
# 将 visual-delivery-skill 安装到各智能体平台

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(dirname "$SCRIPT_DIR")"
SKILL_NAME="visual-delivery-skill"

# 目标平台
PLATFORMS=(
  "~/.claude/skills"
  "~/.codex/skills"
  "~/.learnbuddy/skills"
)

echo "Installing $SKILL_NAME to all platforms..."
echo "Source: $SKILL_DIR"

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

    # 复制新版本（排除仓库、依赖、运行时目录和本地工具数据）
    echo "  Installing to: $DEST"
    rsync -av --exclude='.git' \
           --exclude='.DS_Store' \
           --exclude='node_modules' \
           --exclude='.visual-delivery*' \
           --exclude='.codebuddy' \
           --exclude='.learnbuddy' \
           --exclude='.workbuddy' \
           --exclude='templates/ui/node_modules' \
           --exclude='templates/ui/dist' \
           "$SKILL_DIR/" "$DEST/"

    echo "  ✓ Installed to $EXPANDED_DIR"
  else
    echo "  ⚠ Skipped $EXPANDED_DIR (directory not found)"
  fi
done

echo ""
echo "Done. Verify with:"
echo "  ls -la ~/.claude/skills/$SKILL_NAME/SKILL.md"
echo "  ls -la ~/.codex/skills/$SKILL_NAME/SKILL.md"
echo "  ls -la ~/.learnbuddy/skills/$SKILL_NAME/SKILL.md"
