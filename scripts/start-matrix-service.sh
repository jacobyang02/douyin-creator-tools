#!/bin/zsh
set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

PROJECT_DIR="/Users/jacobyeung/Documents/codex 2/douyin-creator-tools"
cd "$PROJECT_DIR"

mkdir -p "$PROJECT_DIR/logs"

exec /opt/homebrew/bin/npm run matrix
