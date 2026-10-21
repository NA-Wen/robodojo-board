# RoboDojo · 行为评估看板

双臂机器人 L3 操作任务的逐次行为核查看板：semantic-eef 23 个任务 / 69 条运行 + persistent-cap20 42 条运行，逐 run 记录成功率、空夹、掉落、换手、补视野与异常碰撞，并把每个事件指回原始证据（semantic-eef 本地审核报告；persistent-cap20 原始公开视频）。

- 看板：`index.html`（首页即入口，hash 路由）
- 提交标准：**[protocol.md](protocol.md)** — 给 agent 的机读契约，同一份内容的表格版在页面 `#protocol`
- 机读规范：**[protocol.json](protocol.json)** · 索引：[llms.txt](llms.txt)

## 目录

| 路径 | 说明 |
| --- | --- |
| `index.html` `app.js` `style.css` `charts.js` | 看板前端，纯静态，无构建步骤 |
| `data.js` `audit-data.json` | 看板数据（**构建产物**，见下文） |
| `protocol.md` `protocol.json` `llms.txt` | 提交标准的三份同源产物 |
| `submission.schema.json` | 提交包的 JSON Schema（2020-12） |
| `validate_submission.py` | 离线校验器，仅用标准库；0 阻断 = 可被接受 |
| `ingest_submission.py` | 校验并把提交包转成看板组数据 |
| `example/` | 一个通过校验的最小提交包，可直接跑校验器 |
| `submissions/` | 外部提交目录，一个组一个子目录 |
| `.nojekyll` | 关闭 Jekyll，按原样发布 |

## 本地预览

```bash
python3 -m http.server 8765
# 打开 http://127.0.0.1:8765/
```

## 提交

1. 读 [protocol.md](protocol.md)，按规范产出 `submission.json`、`task_metrics.csv`、`events.json`（`report.html` 可选）。
2. 自检：`python3 validate_submission.py <你的目录>`，必须是 0 阻断。
3. 把目录放到 `submissions/<group_id>/`，提 PR。CI 会自动跑校验并把结果写在 PR 里。
4. 合并后由维护者执行 `ingest_submission.py` + 重建 `data.js`，新组即出现在“实验设置”选择器里。

## 关于 `data.js`

`data.js` 由原始执行数据离线构建，是**提交进仓库的构建产物**，不是手写文件。原始数据（`outputs/`、`demos/` 视频包）体积大且含本地路径，不入库。

因此在本仓库里**不能**从零重建看板；能重建的是“新增组的并入”，见 `ingest_submission.py`。

## 数据与素材

- 看板不托管图片或视频。事件证据指向原始公开视频文件；没有公开 URL 的证据只显示文字。
- 视频与原始素材的版权归其原始发布方所有，本仓库不重新分发。
- 指标口径与已知限制见 `#protocol` 与每组的 coverage 说明；`na` 表示未覆盖，**不是 0**。

## semantic-eef 69-case 更新

本地可用 `python3 work/update_semantic69.py`（从工作区根目录）复现更新；此适配器只替换 semantic 组，保留其他组与提交规范。旧构建脚本 `build_board.py` 对应早期 42-case 数据，不应用于重建当前批次。

审核报告和关键帧由独立本机服务提供，不复制进看板：

```bash
python3 -m http.server 8766 --bind 127.0.0.1 --directory /Users/yufan/Documents/Codex/2026-10-21/users-yufan-projects-demos-semantic-eef-2/outputs
```

两组当前无相同 task / variant / seed / scene 的可配对运行。数据源、审核口径差异与未覆盖指标见看板配置区。
