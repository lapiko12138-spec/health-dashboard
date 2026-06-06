#!/usr/bin/env bash
# 安装 LaunchAgent：开机/登录时自动启动健康板块后端
set -euo pipefail

PLIST="com.zhangjiahui.health-dashboard.plist"
SRC="$(cd "$(dirname "$0")" && pwd)/$PLIST"
DEST="$HOME/Library/LaunchAgents/$PLIST"

# 校验 node 路径与 plist 中一致
NODE_BIN="$(command -v node || true)"
if [ -n "$NODE_BIN" ] && [ "$NODE_BIN" != "/usr/local/bin/node" ]; then
  echo "⚠️  当前 node 路径为 $NODE_BIN，但 plist 中写的是 /usr/local/bin/node"
  echo "   如不一致，请编辑 $PLIST 中的 ProgramArguments 第一项后重试。"
fi

mkdir -p "$HOME/Library/LaunchAgents"
cp "$SRC" "$DEST"

# 重新加载
launchctl unload "$DEST" 2>/dev/null || true
launchctl load "$DEST"

echo "✓ 已安装并启动：$PLIST"
echo "  状态：launchctl list | grep health-dashboard"
echo "  访问：http://localhost:4173/"
echo "  日志：~/hackathon/health-dashboard/logs/server.out.log"
