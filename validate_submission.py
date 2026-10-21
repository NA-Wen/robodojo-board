#!/usr/bin/env python3
"""RoboDojo board submission validator (standard library only).

Usage:
    python3 validate_submission.py <submission-dir> [--json]

Exit code 0 = accepted (no blocking issue). 1 = rejected. 2 = bad usage.
Blocking rules follow protocol.md §6.1; warnings follow §6.2.
"""
import csv
import hashlib
import json
import os
import re
import sys

SCHEMA_VERSION = 'robodojo-submission-v1'
COLUMNS = ['run_id', 'group', 'task', 'variant', 'scene', 'seed', 'capability', 'setting_id',
           'success', 'score', 'turns', 'actions',
           'empty_retry', 'drop', 'empty_regrasp', 'drop_regrasp',
           'direct_attempts', 'direct_success', 'table_attempts', 'table_success',
           'support_attempts', 'support_success', 'view_same', 'view_opposite',
           'abandon_near_action', 'abandon_near_turn', 'abandon_action_limit', 'abandon_turn_limit',
           'collision_arms', 'collision_arm_object', 'collision_arm_table',
           'knockdown', 'wrong_object', 'fine_placement_fail']
METRICS = COLUMNS[8:]
STATUSES = ('confirmed', 'lower_bound', 'na', 'unknown', 'pending')
CATEGORIES = ('empty_retry', 'drop', 'direct_transfer', 'direct_failed', 'table_transfer',
              'support_transfer', 'recovery_other', 'view', 'uncertain', 'other')
SHA256 = re.compile(r'^[a-f0-9]{64}$')

# metric -> categories that may legitimately back it
CATEGORY_METRIC = {
    'empty_retry': 'empty_retry',
    'drop': 'drop',
    'direct_transfer': 'direct_attempts',
    'direct_failed': 'direct_attempts',
    'table_transfer': 'table_attempts',
    'support_transfer': 'support_attempts',
    'view': 'view_same',
}


class Report:
    def __init__(self):
        self.blocking = []
        self.warnings = []
        self.notes = []

    def fail(self, msg):
        self.blocking.append(msg)

    def warn(self, msg):
        self.warnings.append(msg)

    def note(self, msg):
        self.notes.append(msg)


def num(v):
    return v is None or isinstance(v, (int, float))


def check_submission(doc, rep):
    if doc.get('schema_version') != SCHEMA_VERSION:
        rep.fail(f"schema_version 必须是 {SCHEMA_VERSION}，实际 {doc.get('schema_version')!r}")
    group = doc.get('group') or {}
    for k in ('id', 'name', 'coverage'):
        if not group.get(k):
            rep.fail(f"group.{k} 缺失")
    gid = group.get('id') or ''
    if gid and not re.match(r'^[a-z0-9][a-z0-9._-]*$', gid):
        rep.fail(f"group.id 只能用小写字母数字与 . _ -：{gid!r}")
    setting = group.get('setting') or {}
    if not setting.get('setting_id') or len(str(setting.get('setting_id'))) < 8:
        rep.fail('group.setting.setting_id 缺失或过短（不得用组名代替配置指纹）')
    unknown = [k for k in ('profile', 'model', 'client_version') if setting.get(k) is None]
    if unknown:
        if not setting.get('unknown_reason'):
            rep.fail(f"group.setting 有未知字段 {unknown}，必须给 unknown_reason")
        else:
            rep.warn(f"group.setting 未知字段 {unknown}（原因：{setting['unknown_reason']}）")

    runs = doc.get('runs') or []
    if not runs:
        rep.fail('runs 为空')
        return
    seen_ids, seen_episode = set(), {}
    for i, run in enumerate(runs):
        tag = run.get('run_id') or f'runs[{i}]'
        if not run.get('run_id') or len(str(run['run_id'])) < 8:
            rep.fail(f"{tag}: run_id 缺失或过短")
            continue
        if run['run_id'] in seen_ids:
            rep.fail(f"{tag}: run_id 重复")
        seen_ids.add(run['run_id'])
        for k in ('task', 'variant', 'capability'):
            if not run.get(k):
                rep.fail(f"{tag}: {k} 缺失")
        for k in ('scene', 'seed'):
            if not isinstance(run.get(k), int):
                rep.fail(f"{tag}: {k} 必须是整数")

        res = run.get('result') or {}
        for k in ('success', 'score', 'turns', 'actions'):
            if k not in res:
                rep.fail(f"{tag}: result.{k} 缺失")
        success, score = res.get('success'), res.get('score')
        if success == 1 and score != 1:
            rep.fail(f"{tag}: success=1 但 score={score}（必须为 1）")
        if success == 0 and score is not None and not (0 <= score < 1):
            rep.fail(f"{tag}: success=0 但 score={score}（必须 <1 或 null）")
        if success is None:
            rep.warn(f"{tag}: success 未知")

        metrics = run.get('metrics') or {}
        status = run.get('metric_status') or {}
        for m in METRICS:
            if m not in metrics:
                rep.fail(f"{tag}: metrics.{m} 缺失（26 项必须齐全）")
            elif not num(metrics[m]):
                rep.fail(f"{tag}: metrics.{m} 必须是数值或 null")
            if m not in status:
                rep.fail(f"{tag}: metric_status.{m} 缺失")
            elif status[m] not in STATUSES:
                rep.fail(f"{tag}: metric_status.{m}={status[m]!r} 不在枚举内")
            elif status[m] == 'pending' and metrics.get(m) is not None:
                rep.fail(f"{tag}: 待审核指标 {m} 必须留空；旧版值应单列保留")
        for m in ('success', 'score', 'turns', 'actions'):
            if m in metrics and m in res and metrics[m] != res[m]:
                rep.fail(f"{tag}: metrics.{m}={metrics[m]!r} 与 result.{m}={res[m]!r} 不一致")

        def val(m):
            v = metrics.get(m)
            return v if isinstance(v, (int, float)) else 0

        pairs = [('direct_success', 'direct_attempts'), ('table_success', 'table_attempts'),
                 ('support_success', 'support_attempts'), ('drop_regrasp', 'drop'),
                 ('empty_regrasp', 'empty_retry')]
        for sub, base in pairs:
            if val(sub) > val(base):
                rep.fail(f"{tag}: {sub}({val(sub)}) > {base}({val(base)})")

        na = [m for m in METRICS if status.get(m) in ('na', 'unknown')]
        if na:
            rep.warn(f"{tag}: {len(na)} 项标为 na/unknown：{','.join(na)}")
        pending = [m for m in METRICS if status.get(m) == 'pending']
        if pending:
            rep.warn(f"{tag}: {len(pending)} 项待审核，仅可作为阶段性结果：{','.join(pending)}")

        key = (run.get('task'), run.get('variant'), run.get('scene'), run.get('seed'))
        if key in seen_episode:
            seen_episode[key].append(run['run_id'])
            if not run.get('repeat'):
                rep.warn(f"{tag}: 与 {seen_episode[key][0]} 是同一条任务条件，但 repeat 未标注")
        else:
            seen_episode[key] = [run['run_id']]

        events = run.get('events')
        if events is None:
            rep.fail(f"{tag}: events 缺失（无事件请给空数组并在 report 说明核查范围）")
            continue
        if not events:
            rep.warn(f"{tag}: 没有任何事件证据，报告需说明核查覆盖范围")
        ids, uncertain = set(), []
        for e in events:
            eid = e.get('id')
            if not eid:
                rep.fail(f"{tag}: 事件缺少 id")
                continue
            if eid in ids:
                rep.fail(f"{tag}: 事件 id 重复：{eid}")
            ids.add(eid)
            if e.get('category') not in CATEGORIES:
                rep.fail(f"{tag}/{eid}: category={e.get('category')!r} 不在枚举内")
            turns = e.get('turns')
            precision = e.get('turn_precision')
            if precision not in ('exact', 'approx', 'unknown'):
                rep.fail(f"{tag}/{eid}: turn_precision 必须是 exact / approx / unknown")
            if turns is None:
                turns = []
            if not isinstance(turns, list) or any(not isinstance(t, int) or t < 1 for t in turns):
                rep.fail(f"{tag}/{eid}: turns 必须是 >=1 的整数数组（可为空）")
                turns = []
            elif turns and turns != sorted(turns):
                rep.fail(f"{tag}/{eid}: turns 未升序")
            frame = e.get('frame')
            tr = e.get('time_range')
            has_time = (isinstance(tr, list) and len(tr) == 2
                        and all(isinstance(x, (int, float)) for x in tr) and tr[0] <= tr[1])
            if tr is not None and not has_time:
                rep.fail(f"{tag}/{eid}: time_range 必须是 [start, end] 且 start <= end")
            if not turns and not isinstance(frame, int) and not has_time:
                rep.fail(f"{tag}/{eid}: 事件无法定位——turns / frame / time_range 至少要有一个")
            if precision in ('exact', 'approx') and not turns:
                rep.fail(f"{tag}/{eid}: turn_precision={precision} 但 turns 为空")
            if precision == 'unknown' and turns:
                rep.warn(f"{tag}/{eid}: turn_precision=unknown 却给了 turns，请确认不是推测值")
            for f in ('object', 'arm', 'result', 'basis'):
                if not e.get(f):
                    rep.fail(f"{tag}/{eid}: {f} 缺失")
            if e.get('confidence') not in ('确认', '待确认'):
                rep.fail(f"{tag}/{eid}: confidence 必须是 确认 / 待确认")
            if e.get('confidence') == '待确认' and not e.get('uncertain_reason'):
                rep.fail(f"{tag}/{eid}: 待确认事件必须给 uncertain_reason")
            media = e.get('media')
            if media is None:
                rep.fail(f"{tag}/{eid}: media 缺失（无公开素材时给空数组）")
                media = []
            for m in media:
                if not m.get('camera'):
                    rep.fail(f"{tag}/{eid}: media.camera 缺失")
                url = m.get('url')
                if url is not None and not str(url).startswith('https://'):
                    rep.fail(f"{tag}/{eid}: media.url 必须 https 或 null")
                if url is None:
                    rep.warn(f"{tag}/{eid}: media.url 为空，看板只显示文字证据")
                if not SHA256.match(str(m.get('sha256') or '')):
                    rep.fail(f"{tag}/{eid}: media.sha256 必须是 64 位小写十六进制")
            if e.get('confidence') == '待确认':
                uncertain.append(e)
        if uncertain:
            backing = {}
            for e in uncertain:
                backing[CATEGORY_METRIC.get(e.get('category'), '')] = True
            for m in backing:
                if m and status.get(m) == 'confirmed' and val(m) > 0:
                    rep.warn(f"{tag}: 存在待确认事件，但 {m} 标为 confirmed；确认该项未把待确认事件计入")

        for v in (run.get('videos') or []):
            if v.get('url') is not None and not str(v['url']).startswith('https://'):
                rep.fail(f"{tag}: videos.url 必须 https 或 null")
            if not SHA256.match(str(v.get('sha256') or '')):
                rep.fail(f"{tag}: videos.sha256 必须是 64 位小写十六进制")
        if not (run.get('videos') or []):
            rep.warn(f"{tag}: 没有登记任何原始视频引用")


def check_csv(dirpath, doc, rep):
    path = os.path.join(dirpath, 'task_metrics.csv')
    if not os.path.exists(path):
        rep.fail('缺少 task_metrics.csv')
        return
    with open(path, newline='', encoding='utf-8') as fh:
        rows = list(csv.reader(fh))
    if not rows:
        rep.fail('task_metrics.csv 为空')
        return
    header = rows[0]
    if header != COLUMNS:
        extra = [c for c in header if c not in COLUMNS]
        missing = [c for c in COLUMNS if c not in header]
        rep.fail(f"task_metrics.csv 表头不匹配；缺 {missing}；多 {extra}")
        return
    runs = {r['run_id']: r for r in doc.get('runs') or [] if r.get('run_id')}
    seen = set()
    for line_no, row in enumerate(rows[1:], 2):
        if not row or not any(c.strip() for c in row):
            continue
        rec = dict(zip(header, row))
        rid = rec.get('run_id')
        if rid not in runs:
            rep.fail(f"task_metrics.csv 第 {line_no} 行 run_id={rid!r} 不在 submission.json 中")
            continue
        if rid in seen:
            rep.fail(f"task_metrics.csv run_id 重复：{rid}")
        seen.add(rid)
        run, metrics = runs[rid], runs[rid].get('metrics') or {}
        for col in METRICS:
            raw = (rec.get(col) or '').strip()
            expect = metrics.get(col)
            if raw == '':
                if expect is not None:
                    rep.fail(f"task_metrics.csv 第 {line_no} 行 {col} 为空，但 submission.json 为 {expect!r}")
                continue
            try:
                got = float(raw)
            except ValueError:
                rep.fail(f"task_metrics.csv 第 {line_no} 行 {col}={raw!r} 不是数值")
                continue
            if expect is None:
                rep.fail(f"task_metrics.csv 第 {line_no} 行 {col}={got}，但 submission.json 为 null")
            elif abs(got - float(expect)) > 1e-9:
                rep.fail(f"task_metrics.csv 第 {line_no} 行 {col}={got} 与 submission.json {expect} 不一致")
    missing = set(runs) - seen
    if missing:
        rep.fail(f"task_metrics.csv 缺少 run：{sorted(missing)[:5]}")


def check_events(dirpath, doc, rep):
    path = os.path.join(dirpath, 'events.json')
    if not os.path.exists(path):
        rep.fail('缺少 events.json')
        return
    try:
        payload = json.load(open(path, encoding='utf-8'))
    except json.JSONDecodeError as exc:
        rep.fail(f'events.json 不是合法 JSON：{exc}')
        return
    items = payload.get('events') if isinstance(payload, dict) else payload
    if not isinstance(items, list):
        rep.fail('events.json 必须是数组，或 {"events": [...]}')
        return
    by_run = {}
    for e in items:
        by_run.setdefault(e.get('run_id'), set()).add(e.get('id'))
    for run in doc.get('runs') or []:
        rid = run.get('run_id')
        want = {e.get('id') for e in (run.get('events') or [])}
        got = by_run.get(rid, set())
        if want != got:
            rep.fail(f"events.json 与 submission.json 中 {rid} 的事件不一致：缺 {sorted(want - got)[:3]} 多 {sorted(got - want)[:3]}")


def main(argv):
    if len(argv) < 2:
        print(__doc__.strip())
        return 2
    path = argv[1]
    as_json = '--json' in argv
    rep = Report()
    sub = os.path.join(path, 'submission.json')
    if not os.path.isdir(path):
        print(f'目录不存在：{path}')
        return 2
    if not os.path.exists(sub):
        rep.fail('缺少 submission.json')
        doc = {}
    else:
        try:
            doc = json.load(open(sub, encoding='utf-8'))
        except json.JSONDecodeError as exc:
            rep.fail(f'submission.json 不是合法 JSON：{exc}')
            doc = {}
    if doc:
        check_submission(doc, rep)
        check_csv(path, doc, rep)
        check_events(path, doc, rep)
        manifest = os.path.join(path, 'submission.json')
        digest = hashlib.sha256(open(manifest, 'rb').read()).hexdigest()
        rep.note(f'submission.json sha256 = {digest}')
        rep.note(f"runs = {len(doc.get('runs') or [])}, events = {sum(len(r.get('events') or []) for r in doc.get('runs') or [])}")

    ok = not rep.blocking
    if as_json:
        print(json.dumps({'accepted': ok, 'blocking': rep.blocking,
                          'warnings': rep.warnings, 'notes': rep.notes}, ensure_ascii=False, indent=2))
    else:
        print(('通过 · 可被看板直接接收' if ok else '拒绝 · 存在阻断项') + f'（{path}）')
        for n in rep.notes:
            print('  · ' + n)
        if rep.blocking:
            print(f'\n阻断项 {len(rep.blocking)}：')
            for b in rep.blocking:
                print('  ✗ ' + b)
        if rep.warnings:
            print(f'\n警告 {len(rep.warnings)}：')
            for w in rep.warnings:
                print('  ! ' + w)
        if ok and not rep.warnings:
            print('\n无警告。')
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main(sys.argv))
