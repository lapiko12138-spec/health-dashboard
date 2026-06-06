# 健康板块 · Health Dashboard

个人健康与屏幕使用数据看板。整合 Apple Health（步数、距离、心率、HRV、血氧、睡眠、运动、体重…）与 macOS 屏幕使用数据，统一以**北京时间**展示，界面参考 Wellora 风格。

**一套代码，双运行模式（页面自动探测）：**

- 🟢 **本地实时** —— Node 后端实时读取本机数据（含 SQLite 屏幕历史），数据随后台采集自动更新。
- ⚪ **静态快照** —— GitHub Pages 上读取仓库内的数据快照，用于在线演示。连不上本地后端时自动降级。

🔗 **在线演示**：https://lapiko12138-spec.github.io/health-dashboard/

---

## 快速开始（本地实时模式）

```bash
cd ~/hackathon/health-dashboard
npm start
# 浏览器打开 http://localhost:4173/
```

默认数据目录为 `~/Documents/黑客松/data/`，可用环境变量覆盖：

```bash
HEALTH_DATA_DIR=/path/to/data PORT=4173 npm start
```

## 开机自启（LaunchAgent）

```bash
bash scripts/install-launchagent.sh    # 安装并立即启动
bash scripts/uninstall-launchagent.sh  # 停止并卸载
```

安装后，每次登录都会在 4173 端口自动拉起后端（`KeepAlive` 崩溃自动重启）。日志见 `logs/server.out.log` 与 `logs/server.err.log`。

## API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | Apple Health 摘要（autosync-summary.json） |
| GET | `/api/screen` | 今日屏幕使用（screen-time-latest.json） |
| GET | `/api/screen-history` | 近 14 日屏幕时长（查 SQLite 汇总） |
| GET | `/api/status` | 后端 / 数据源状态 |
| POST | `/api/refresh` | 触发本地刷新脚本（best-effort） |

## Deep-link（hash 路由）

从外部网站直接链接到指定视图与日期：

| 链接 | 打开 |
|---|---|
| `…/#home` | 首页 |
| `…/#heart` | 实时心率 & HRV |
| `…/#screen?date=2026-06-06` | 屏幕使用（指定日） |
| `…/#steps?date=2026-06-05` | 步数统计（指定日） |

视图名：`home / steps / heart / sleep / screen / workouts / ai / settings / sources`；`date` 支持 `YYYY-MM-DD` 或 `YYYYMMDD`，仅当该日有健康数据时生效。

## 数据来源与刷新

- **健康**：Health Auto Export → `autosync-summary.json`，macOS LaunchAgent 每 15 分钟刷新
- **屏幕**：macOS 前台窗口采样 → SQLite (`agent-context.sqlite`) + `screen-time-latest.json`，每 60 秒采样
- **时区**：原始时间戳为 UTC，页面统一换算并显示为北京时间（UTC+8）

## 目录结构

```
health-dashboard/
├── index.html                 # 前端（单文件，原生 HTML/CSS/JS）
├── data/                      # 数据快照（GitHub Pages 静态模式读取）
│   ├── autosync-summary.json
│   └── screen-time-latest.json
├── server/
│   └── server.mjs             # 本地 API 后端（零依赖）
├── scripts/
│   ├── com.zhangjiahui.health-dashboard.plist
│   ├── install-launchagent.sh
│   ├── uninstall-launchagent.sh
│   └── generate-demo-data.py      # 重新生成公开展示用的合成数据
├── logs/                      # 后端日志（gitignore）
├── package.json
└── README.md
```

## 隐私说明

⚠️ 本仓库为 **Public**，`data/` 下包含**真实健康数据快照**（已移除本机绝对路径等系统元数据，健康数值保持真实）。这是仓库所有者的明确选择。

本地运行时，后端读取的是本机最新数据，**不经过任何云服务**。静态快照仅在你主动提交时更新。

## 技术栈

零运行时依赖。前端为单文件原生 HTML/CSS/JS（含内联 SVG 图表）；后端为 Node 原生 `http`；屏幕历史经系统 `sqlite3` CLI 查询。
