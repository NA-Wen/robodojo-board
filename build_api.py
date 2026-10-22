#!/usr/bin/env python3
"""把 audit-data.json 展开成面向前置 agent 的静态 API（api/v1/）。

静态站点没有服务端，因此这里是"预生成端点"：每个 URL 是一个固定 JSON 文件，
支持 GET、无鉴权、CORS 通配。agent 取小文件即可，不必拉 17MB 的全量 dump。

用法：
    python3 build_api.py            # 读 audit-data.json，写 api/v1/
    python3 build_api.py --board .  # 指定看板根目录
"""
from __future__ import annotations

import argparse
import hashlib
import json
import pathlib
import sys
from datetime import datetime, timezone

API_VERSION = "v1"


def load(board: pathlib.Path) -> dict:
    src = board / "audit-data.json"
    if not src.exists():
        sys.exit(f"找不到 {src}；请先运行 ingest_submission.py 生成看板数据")
    with src.open(encoding="utf-8") as fh:
        return json.load(fh)


def case_events(group: dict) -> list[dict]:
    out = []
    for case in group.get("cases", []):
        for ev in case.get("events") or []:
            out.append({
                "run_id": case.get("run_id"),
                "group_id": group.get("id"),
                "task": case.get("task"),
                **{k: ev.get(k) for k in (
                    "id", "category", "object", "arm", "turns", "frame_start", "frame_end",
                    "time_range", "turn_precision", "review_status", "confidence",
                    "chain_id", "recovery_event_id", "view_type",
                ) if k in ev},
            })
    return out


def flatten_run(group: dict, case: dict) -> dict:
    ep = case.get("episode") or {}
    metrics = case.get("metrics") or {}
    status = case.get("metricStatus") or {}
    status_counts: dict[str, int] = {}
    for v in status.values():
        status_counts[v] = status_counts.get(v, 0) + 1
    ev_counts: dict[str, int] = {}
    for ev in case.get("events") or []:
        k = ev.get("category")
        if k:
            ev_counts[k] = ev_counts.get(k, 0) + 1
    return {
        "run_id": case.get("run_id"),
        "group_id": group.get("id"),
        "group_name": group.get("name"),
        "task": case.get("task"),
        "variant": ep.get("variant"),
        "seed": ep.get("seed"),
        "scene": ep.get("scene"),
        "success": metrics.get("success"),
        "score": case.get("score") if case.get("score") is not None else metrics.get("score"),
        "turns": metrics.get("turns"),
        "actions": metrics.get("actions"),
        "turns_basis": case.get("turns_basis"),
        "audit_completion": case.get("audit_completion"),
        "submission_version": case.get("submission_version"),
        "metrics": metrics,
        "metric_status": status,
        "metric_status_counts": status_counts,
        "event_counts": ev_counts,
        "counts": case.get("counts") or {},
        "events": len(case.get("events") or []),
    }


def task_rows(groups: list[dict]) -> list[dict]:
    by: dict[tuple, dict] = {}
    for g in groups:
        for c in g.get("cases", []):
            key = (g.get("id"), c.get("task"))
            row = by.setdefault(key, {
                "group_id": g.get("id"), "group_name": g.get("name"), "task": c.get("task"),
                "runs": 0, "successes": 0, "score_sum": 0.0, "turns_sum": 0,
                "actions_sum": 0, "empty_retry": 0, "drops": 0,
            })
            m = c.get("metrics") or {}
            row["runs"] += 1
            row["successes"] += 1 if m.get("success") == 1 else 0
            row["score_sum"] += m.get("score") or 0
            row["turns_sum"] += m.get("turns") or 0
            row["actions_sum"] += m.get("actions") or 0
            row["empty_retry"] += m.get("emptyRetry") or 0
            row["drops"] += m.get("drops") or 0
    out = []
    for row in by.values():
        n = row["runs"] or 1
        out.append({
            "group_id": row["group_id"], "group_name": row["group_name"], "task": row["task"],
            "runs": row["runs"], "successes": row["successes"],
            "success_rate": round(row["successes"] / n, 4),
            "mean_score": round(row["score_sum"] / n, 4),
            "mean_turns": round(row["turns_sum"] / n, 2),
            "mean_actions": round(row["actions_sum"] / n, 2),
            "empty_retry": row["empty_retry"], "drops": row["drops"],
        })
    out.sort(key=lambda r: (r["group_id"], r["task"]))
    return out


def write(path: pathlib.Path, obj, *, compact: bool = False) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    if compact:
        text = json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
    else:
        text = json.dumps(obj, ensure_ascii=False, indent=2, sort_keys=True)
    path.write_text(text + "\n", encoding="utf-8")
    return len(text.encode("utf-8"))


def write_jsonl(path: pathlib.Path, rows: list[dict]) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    text = "".join(json.dumps(r, ensure_ascii=False, separators=(",", ":")) + "\n" for r in rows)
    path.write_text(text, encoding="utf-8")
    return len(text.encode("utf-8"))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--board", default=".", help="看板根目录（含 audit-data.json）")
    args = ap.parse_args()
    board = pathlib.Path(args.board).resolve()
    data = load(board)
    groups = data.get("groups") or []
    out_dir = board / "api" / API_VERSION

    runs: list[dict] = []
    events: list[dict] = []
    for g in groups:
        for c in g.get("cases", []):
            runs.append(flatten_run(g, c))
        events.extend(case_events(g))

    groups_meta = [{
        "id": g.get("id"), "name": g.get("name"),
        "setting": g.get("setting"), "methodology": g.get("methodology"),
        "coverage": g.get("coverage"), "totals": g.get("totals"),
        "audit_completion": g.get("audit_completion"),
        "submission_version": g.get("submission_version"),
        "submission_links": g.get("submission_links"),
        "runs": len(g.get("cases") or []),
        "tasks": len({c.get("task") for c in g.get("cases") or []}),
    } for g in groups]

    tasks = task_rows(groups)
    definitions = data.get("definitions") or []
    labels = data.get("labels") or {}

    sizes = {
        "groups.json": write(out_dir / "groups.json", groups_meta),
        "definitions.json": write(out_dir / "definitions.json", {"definitions": definitions, "labels": labels}),
        "runs.json": write(out_dir / "runs.json", runs, compact=True),
        "runs.jsonl": write_jsonl(out_dir / "runs.jsonl", runs),
        "events.json": write(out_dir / "events.json", events, compact=True),
        "events.jsonl": write_jsonl(out_dir / "events.jsonl", events),
        "tasks.json": write(out_dir / "tasks.json", tasks, compact=True),
    }

    schema = {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$id": "robodojo-board/api/v1/schema.json",
        "title": "RoboDojo board API v1",
        "type": "object",
        "properties": {
            "run": {
                "type": "object",
                "required": ["run_id", "group_id", "task"],
                "properties": {
                    "run_id": {"type": "string"},
                    "group_id": {"type": "string"},
                    "group_name": {"type": "string"},
                    "task": {"type": "string"},
                    "variant": {"type": ["string", "null"]},
                    "seed": {"type": ["integer", "null"]},
                    "scene": {"type": ["integer", "null"]},
                    "success": {"type": ["integer", "null"], "description": "1=完全成功；由原生 success 判定，score==1 才算成功"},
                    "score": {"type": ["number", "null"], "description": "原生任务得分 0–1"},
                    "turns": {"type": ["integer", "null"]},
                    "actions": {"type": ["integer", "null"]},
                    "metrics": {"type": "object", "description": "26 项指标全量，键见 definitions.json"},
                    "metric_status": {"type": "object", "description": "每项指标的可信度：confirmed / lower_bound / unknown"},
                    "event_counts": {"type": "object", "description": "按 category 汇总的事件数"},
                },
            },
            "event": {
                "type": "object",
                "required": ["run_id", "category"],
                "properties": {
                    "run_id": {"type": "string"},
                    "group_id": {"type": "string"},
                    "task": {"type": "string"},
                    "id": {"type": "string"},
                    "category": {"type": "string"},
                    "turns": {"type": "array", "items": {"type": "integer"}},
                    "review_status": {"type": ["string", "null"]},
                    "confidence": {"type": ["string", "null"]},
                },
            },
        },
    }
    sizes["schema.json"] = write(out_dir / "schema.json", schema)

    base = "https://na-wen.github.io/robodojo-board/api/v1"
    index = {
        "name": "robodojo-board",
        "api_version": API_VERSION,
        "dataset_version": data.get("version"),
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source_dump": "../audit-data.json",
        "source_bytes": (board / "audit-data.json").stat().st_size,
        "source_sha256": hashlib.sha256((board / "audit-data.json").read_bytes()).hexdigest()[:16],
        "access": {
            "method": "GET", "auth": None, "cors": "*",
            "content_type": "application/json; charset=utf-8",
            "base_url": base,
            "note": "静态托管，无查询参数；请在客户端过滤，或使用 *.jsonl 流式读取。",
        },
        "counts": {"groups": len(groups_meta), "runs": len(runs), "events": len(events), "task_rows": len(tasks)},
        "endpoints": {
            "groups": {"path": "groups.json", "records": len(groups_meta), "bytes": sizes["groups.json"],
                       "description": "实验组元数据：设置、方法论、覆盖度、审计完成状态"},
            "definitions": {"path": "definitions.json", "bytes": sizes["definitions.json"],
                            "description": "26 项指标与 10 类事件的定义、kind、说明"},
            "runs": {"path": "runs.json", "jsonl": "runs.jsonl", "records": len(runs), "bytes": sizes["runs.json"],
                     "description": "每条运行一行：任务、seed、scene、success、score、turns、actions、26 项指标、可信度"},
            "events": {"path": "events.json", "jsonl": "events.jsonl", "records": len(events), "bytes": sizes["events.json"],
                       "description": "每条事件一行：run_id、category、turns、审核状态"},
            "tasks": {"path": "tasks.json", "records": len(tasks), "bytes": sizes["tasks.json"],
                      "description": "按 (实验组, 任务) 聚合：成功率、均分、均轮数、均动作、空夹与掉落合计"},
            "schema": {"path": "schema.json", "bytes": sizes["schema.json"]},
        },
        "examples": [
            f"curl -s {base}/index.json",
            f"curl -s {base}/runs.jsonl | jq -c 'select(.success==1)'",
            f"curl -s {base}/tasks.json | jq -c '.[] | select(.group_id==\"action_horizon\")'",
            f"curl -s {base}/events.jsonl | jq -c 'select(.category==\"empty_retry\")'",
        ],
        "caveats": [
            "success 由原生 success 判定，score==1 才算成功，不得用模型自述或 note 推断。",
            "事件类指标（空夹、掉落、视野）受审计深度影响：先查 runs.json 的 metric_status_counts。",
            "persistent 组没有 metric_status，事件计数仅作原始记录，不可与其他组直接横比。",
            "每个任务多为单次运行，单次结果无法区分设置差异与随机波动。",
        ],
    }
    write(out_dir / "index.json", index)

    total = sum(sizes.values())
    print(f"api/{API_VERSION}/ 已生成：{len(runs)} runs · {len(events)} events · {len(tasks)} task rows")
    for name, size in sorted(sizes.items()):
        print(f"  {name:<18} {size/1024:8.1f} KB")
    print(f"  合计 {total/1024:.1f} KB（源 dump {(board/'audit-data.json').stat().st_size/1024/1024:.1f} MB）")


if __name__ == "__main__":
    main()
