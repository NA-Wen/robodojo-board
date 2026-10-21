# submissions/

每个实验组一个子目录：`submissions/<group_id>/`。`group_id` 必须与 `submission.json` 里的 `group.id` 一致。

必含文件：

```
submissions/<group_id>/
├─ submission.json      # 权威数据
├─ task_metrics.csv     # 与 submission.json 逐值一致
├─ events.json          # 事件明细
└─ report.html          # 可选
```

## 自检

```bash
python3 validate_submission.py submissions/<group_id>
```

0 阻断项才算合格。也可以先对着 `example/` 跑一遍确认环境正常：

```bash
python3 validate_submission.py example
```

## 规则

- 不要手改 `data.js`。看板数据由 `ingest_submission.py` 生成。
- 一个组一个目录，不要在一个 PR 里改既有组的数值；纠错发新版本并说明原因。
- 提交后不要删除历史，审核记录以 PR 为准。
- 媒体只放公开 URL，不要把视频或截图提交进本仓库。
