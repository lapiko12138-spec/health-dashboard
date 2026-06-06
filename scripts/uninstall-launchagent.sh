#!/usr/bin/env bash
# 卸载 LaunchAgent：停止并移除开机自启
set -euo pipefail

PLIST="com.zhangjiahui.health-dashboard.plist"
DEST="$HOME/Library/LaunchAgents/$PLIST"

if [ -f "$DEST" ]; then
  launchctl unload "$DEST" 2>/dev/null || true
  rm -f "$DEST"
  echo "✓ 已卸载：$PLIST"
else
  echo "未找到已安装的 $PLIST"
fi
