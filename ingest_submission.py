#!/usr/bin/env python3
"""Validate a submission bundle and convert it into a board group.

Usage:
    python3 ingest_submission.py <submission-dir> --board <dist-dir> [--force]

Writes <dist>/incoming/<group_id>.json. build_board.py picks that up on the next
build, so the group appears in the board's setting selector without manual edits.
Exit 0 = ingested, 1 = rejected by the validator, 2 = usage error.
"""
import glob
import importlib.util
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))

FIELD_TO_KEY = {
    'success': 'success', 'score': 'score', 'turns': 'turns', 'actions': 'actions',
    'empty_retry': 'emptyRetry', 'drop': 'drops', 'empty_regrasp': 'emptyRegrasp',
    'drop_regrasp': 'dropRegrasp', 'direct_attempts': 'directAttempts',
    'direct_success': 'directSuccess', 'table_attempts': 'tableAttempts',
    'table_success': 'tableSuccess', 'support_attempts': 'supportAttempts',
    'support_success': 'supportSuccess', 'view_same': 'viewSame', 'view_opposite': 'viewOpposite',
    'abandon_near_action': 'abandonNearAction', 'abandon_near_turn': 'abandonNearTurn',
    'abandon_action_limit': 'abandonActionLimit', 'abandon_turn_limit': 'abandonTurnLimit',
    'collision_arms': 'collisionArms', 'collision_arm_object': 'collisionArmObject',
    'collision_arm_table': 'collisionArmTable', 'knockdown': 'knockdown',
    'wrong_object': 'wrongObject', 'fine_placement_fail': 'finePlacementFail',
}
CAMERA_LABEL = {'head': '头部', 'left_wrist': '左腕', 'right_wrist': '右腕', 'other': '其他'}


def load_site(dist):
    raw = open(os.path.join(dist, 'data.js'), encoding='utf-8').read()
    prefix = 'window.AUDIT_DATA='
    assert raw.startswith(prefix), 'data.js 格式不符'
    return json.loads(raw[len(prefix):].rstrip().rstrip(';'))


def _collect(groups, key):
    vals = {c['episode'].get(key) for g in groups for c in g.get('cases', [])}
    return {v for v in vals if v is not None}


def merge_into_site(dist, incoming_dir, only=None):
    """把 incoming/*.json 合并进 data.js / audit-data.json（不依赖原始数据）。

    原则：只增不减。既有 filters 内容原样保留，新值并入；不认识的键不碰。
    """
    data = load_site(dist)
    groups = data['groups']
    index = {g['id']: i for i, g in enumerate(groups)}
    added, replaced = [], []
    paths = ([only] if only else sorted(glob.glob(os.path.join(incoming_dir, '*.json'))))
    for path in paths:
        group = json.load(open(path, encoding='utf-8'))
        if group['id'] in index:
            groups[index[group['id']]] = group
            replaced.append(group['id'])
        else:
            groups.append(group)
            index[group['id']] = len(groups) - 1
            added.append(group['id'])

    filters = data.setdefault('filters', {})

    # tasks：保留既有对象（含 instruction / paired 等字段），只追加缺失的任务
    existing_tasks = filters.get('tasks') or []
    by_name = {t['name']: t for t in existing_tasks if isinstance(t, dict)}
    if len(by_name) != len(existing_tasks):  # 旧格式是字符串，做兼容
        by_name = {t if isinstance(t, str) else t['name']: t for t in existing_tasks}
    names_seen = [t if isinstance(t, str) else t['name'] for t in existing_tasks]

    group_count = {}
    case_by_task = {}
    for g in groups:
        for c in g.get('cases', []):
            name = c['episode'].get('task')
            if not name:
                continue
            group_count.setdefault(name, set()).add(g['id'])
            case_by_task.setdefault(name, c)

    paired = {n for n, gs in group_count.items() if len(gs) >= 2}
    merged_tasks = []
    for name in names_seen + [n for n in sorted(case_by_task) if n not in names_seen]:
        prev = by_name.get(name)
        if isinstance(prev, dict):
            prev = dict(prev)
            prev['paired'] = name in paired
            merged_tasks.append(prev)
        elif name in case_by_task:
            c = case_by_task[name]
            e = c['episode']
            merged_tasks.append({'name': name, 'instruction': c.get('instruction', ''),
                                 'variant': e.get('variant'), 'seed': e.get('seed'),
                                 'scene': e.get('scene'), 'capability': e.get('capability'),
                                 'paired': name in paired})
        else:
            merged_tasks.append({'name': name, 'instruction': '', 'paired': name in paired})
    filters['tasks'] = merged_tasks

    # 其余取值集合：并集，不缩
    for key in ('seeds', 'scenes', 'variants', 'capabilities'):
        old = list(filters.get(key) or [])
        new_vals = _collect(groups, key.rstrip('s'))
        merged = old + sorted(new_vals - set(old), key=lambda v: (str(type(v)), v))
        filters[key] = merged

    # settings：既有条目保留顺序与内容，追加新组
    old_settings = {s['id']: s for s in (filters.get('settings') or []) if isinstance(s, dict)}
    settings = []
    for g in groups:
        entry = dict(old_settings.get(g['id']) or {})
        entry.setdefault('id', g['id'])
        entry.setdefault('name', g['name'])
        entry.setdefault('label', (g.get('setting') or {}).get('label', g['name']))
        entry.setdefault('coverage', (g.get('setting') or {}).get('coverage', ''))
        settings.append(entry)
    filters['settings'] = settings

    # 配对口径由看板构建方决定（可能按 task+variant+seed+scene），
    # 增量并入不重算既有值，只在缺失时按 task 级别兜底。
    if filters.get('pairedTasks') is None:
        filters['pairedTasks'] = len(paired)
    if data.get('pairedTasks') is None:
        data['pairedTasks'] = filters['pairedTasks']
    if not filters.get('note'):
        filters['note'] = (f"{len(groups)} 个实验设置，"
                           f"{filters['pairedTasks']} 个任务至少有 2 个设置的结果。")

    (open(os.path.join(dist, 'data.js'), 'w', encoding='utf-8')
     .write('window.AUDIT_DATA=' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';'))
    (open(os.path.join(dist, 'audit-data.json'), 'w', encoding='utf-8')
     .write(json.dumps(data, ensure_ascii=False, indent=2)))
    return added, replaced


def load_validator():
    spec = importlib.util.spec_from_file_location(
        'validate_submission', os.path.join(HERE, 'validate_submission.py'))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def to_group(doc):
    group = doc['group']
    setting = group.get('setting') or {}
    cases = []
    for run in doc['runs']:
        metrics = run.get('metrics') or {}
        status = run.get('metric_status') or {}
        board_metrics = {}
        for field, key in FIELD_TO_KEY.items():
            board_metrics[key] = metrics.get(field)
        events = []
        for e in run.get('events') or []:
            turns = e.get('turns') or []
            evidence = [{
                'turn': turns[0] if turns else None,
                'env_step': e.get('env_step'),
                'frame': e.get('frame'),
                'time_range': e.get('time_range'),
                'precision': e.get('turn_precision'),
                'cameras': sorted({m.get('camera') for m in (e.get('media') or []) if m.get('camera')}),
            }]
            note = e.get('result') or ''
            if e.get('basis'):
                note = f"{note}（依据：{e['basis']}）" if note else e['basis']
            events.append({
                'id': e.get('id'),
                'category': e.get('category'),
                'object': e.get('object'),
                'arm': e.get('arm'),
                'note': note,
                'confidence': e.get('confidence'),
                'turn_precision': e.get('turn_precision'),
                'time_range': e.get('time_range'),
                'turns': turns,
                'view_motion_turns': [],
                'evidence': evidence,
                'uncertain_reason': e.get('uncertain_reason'),
            })
        board_metrics['uncertain'] = sum(1 for e in events if e.get('confidence') == '待确认')
        board_metrics['recoveryOther'] = sum(1 for e in events if e.get('category') == 'recovery_other')
        board_metrics['lowerBound'] = any(status.get(f) == 'lower_bound' for f in FIELD_TO_KEY)
        videos = [{
            'key': v.get('camera'),
            'name': CAMERA_LABEL.get(v.get('camera'), v.get('camera')),
            'url': v.get('url'),
            'sha256': v.get('sha256'),
            'bytes': v.get('bytes'),
        } for v in (run.get('videos') or [])]
        cases.append({
            'run_id': run['run_id'],
            'configuration': run.get('configuration') or {},
            'task': run['task'],
            'instruction': run.get('instruction') or run['task'],
            'note': '',
            'score': (run.get('result') or {}).get('score'),
            'episode': {
                'capability': run.get('capability'),
                'scene': run.get('scene'),
                'seed': run.get('seed'),
                'task': run['task'],
                'variant': run['variant'],
            },
            'controls': (run.get('result') or {}).get('actions'),
            'decisions': (run.get('result') or {}).get('decisions'),
            'turns': (run.get('result') or {}).get('turns'),
            'counts': {},
            'metrics': board_metrics,
            'metricStatus': {m: status.get(m) for m in FIELD_TO_KEY},
            'events': events,
            'gallery': [],
            'videos': videos,
        })

    totals = {'cases': len(cases)}
    for c in cases:
        for k, v in (c['metrics'] or {}).items():
            if k in ('success', 'uncertain') and isinstance(v, (int, float)):
                totals[k] = totals.get(k, 0) + v
        if isinstance(c.get('turns'), int):
            totals['turns'] = totals.get('turns', 0) + c['turns']
    for cat in {e['category'] for c in cases for e in c['events']}:
        totals[cat] = sum(1 for c in cases for e in c['events'] if e['category'] == cat)

    # Preserve audit provenance supplied by standardized packages, including budget
    # decision anchors. These annotations are evidence, not experiment settings.
    by_run = {r['run_id']: r for r in doc['runs']}
    has_audit = False
    for c in cases:
        run = by_run[c['run_id']]
        aux = (run.get('configuration') or {}).get('audit_auxiliary')
        if not aux:
            continue
        has_audit = True
        c['instruction'] = aux.get('instruction', c['instruction'])
        c['decisions'] = aux.get('native_model_decisions', c['turns'])
        c['turns_basis'] = 'model_decisions'
        c['trajectory_stages'] = aux.get('trajectory_stages')
        c['submission_version'] = 'budget-v2' if aux.get('budget_review') else 'protocol-v1'
        c['note'] = (aux.get('budget_review') or {}).get('adjudication', '')
        c['metrics']['lowerBound'] = [FIELD_TO_KEY[f] for f, status in run['metric_status'].items() if status == 'lower_bound']
        c['counts']['view_motions'] = run['metrics']['view_opposite']
        c['counts']['view_same_motions'] = run['metrics']['view_same']
        original = {e['id']: e for e in run['events']}
        annotations = aux.get('event_annotations', {})
        c['counts']['view_episodes'] = len({e.get('gap_id') for e in run['events'] if e.get('gap_id') and annotations.get(e['id'], {}).get('view_type') == 'opposite'})
        for e in c['events']:
            a = annotations.get(e['id'], {})
            raw = original[e['id']]
            for key in ['subcategory', 'related_event_ids', 'metric_contributions', 'trajectory_stages', 'view_type', 'budget_review']:
                if key in a:
                    e[key] = a[key]
            e['gap_id'] = raw.get('gap_id')
            e['media'] = raw.get('media', [])
            e['turn_basis'] = 'model_call'
            e['view_motion_turns'] = [a['executed_stage']] if a.get('executed_stage') is not None else []
            e['evidence'][0]['turn_basis'] = 'model_call'
        c['submission_events'] = run['events']
        c['artifacts'] = run.get('artifacts', [])

    values = [{'name': k, 'value': v, 'known': v is not None}
              for k, v in setting.items() if k not in ('setting_id', 'unknown_reason')]
    converted = {
        'id': group['id'],
        'name': group.get('name') or group['id'],
        'coverage': group.get('coverage') or '',
        'setting': {
            'id': setting.get('setting_id'),
            'label': group.get('name') or group['id'],
            'source': 'submission.json → group.setting',
            'values': values,
            'unknown_reason': setting.get('unknown_reason'),
        },
        'methodology': [group.get('coverage') or ''],
        'totals': totals,
        'cases': cases,
    }
    # Keep semantic audit annotations through every CI regeneration. Other
    # submission formats retain the existing conversion behavior.
    if group['id'] == 'semantic' and all(
            'event_annotations' in r.get('configuration', {}).get('audit_auxiliary', {})
            for r in doc['runs']):
        converted['submission_version'] = 'protocol-v1'
        converted['submission_links'] = {
            key: 'submissions/semantic/' + name for key, name in {
                'bundle': 'submission.json', 'csv': 'task_metrics.csv',
                'events': 'events.json', 'validation': 'validation_report.json',
            }.items()
        }
        first_aux = doc['runs'][0]['configuration']['audit_auxiliary']
        converted['methodology'] += [
            first_aux['budget_interpretation'], first_aux['turn_definition'],
            first_aux['action_definition'], first_aux['frame_mapping'],
            '空夹包括无重试尝试；主动释放后落下不计掉落。',
            '没有已知公开原始媒体URL，证据以三视角sha256、帧号和执行区间登记。',
        ]
        for case, run in zip(cases, doc['runs']):
            aux = run['configuration']['audit_auxiliary']
            case.update(submission_version='protocol-v1',
                        decisions=run['result']['turns'], turns_basis='model_decisions',
                        trajectory_stages=aux['executed_stages'],
                        trajectory_records=aux['trajectory_records'],
                        note='按协议同步；†为确认下界。动作与turn预算独立判断，媒体无公开URL时保留哈希与定位。')
            case['metrics']['lowerBound'] = [
                FIELD_TO_KEY[k] for k, s in run['metric_status'].items() if s == 'lower_bound']
            raw_events = {e['id']: e for e in run['events']}
            annotations = aux['event_annotations']
            case['counts'] = {
                'view_motions': run['metrics']['view_opposite'],
                'view_same_motions': run['metrics']['view_same'],
                'view_episodes': len({raw_events[eid].get('gap_id')
                                      for eid, a in annotations.items()
                                      if a['view_type'] == 'opposite'}),
            }
            for event in case['events']:
                annotation = annotations[event['id']]
                raw = raw_events[event['id']]
                event.update(annotation)
                event.update(gap_id=raw.get('gap_id'), media=raw['media'],
                             turn_basis='model_call',
                             view_motion_turns=annotation['trajectory_stages']
                             if annotation['view_type'] else [])
                event['evidence'][0].update(
                    turn_basis='model_call', env_end=annotation['env_end_inclusive'],
                    frame_end=annotation['frame_end'], tool=annotation['primitive'])
            case['submission_events'] = run['events']
            case['artifacts'] = run['artifacts']
        converted['totals'].update({key: sum(c['metrics'].get(key) or 0 for c in cases)
                                   for key in ('emptyRetry', 'drops', 'emptyRegrasp',
                                               'dropRegrasp', 'directAttempts', 'directSuccess',
                                               'tableAttempts', 'tableSuccess', 'supportAttempts',
                                               'supportSuccess', 'viewSame', 'viewOpposite')})
    return converted

    if has_audit:
        converted['submission_version'] = cases[0].get('submission_version', 'protocol-v1')
        converted['submission_links'] = {key: 'submissions/' + group['id'] + '/' + name for key, name in {
            'bundle':'submission.json', 'csv':'task_metrics.csv', 'xlsx':'metrics.xlsx',
            'validation':'validation_report.json', 'budget_review':'budget_review.html'}.items()}
        budget = [c['configuration']['audit_auxiliary'].get('budget_review') for c in cases]
        if all(budget):
            converted['budget_summary'] = {field: {
                'confirmed_sum': sum(c['metrics'][FIELD_TO_KEY[field]] or 0 for c in cases),
                'known_runs': sum(c['metrics'][FIELD_TO_KEY[field]] is not None for c in cases),
                'unknown_tasks': [c['task'] for c in cases if c['metrics'][FIELD_TO_KEY[field]] is None]
            } for field in ['abandon_near_action','abandon_near_turn','abandon_action_limit','abandon_turn_limit']}
    return converted


def main(argv):
    args = [a for a in argv[1:] if not a.startswith('-')]
    if not args or '--board' not in argv:
        print(__doc__.strip())
        return 2
    path = args[0]
    board = argv[argv.index('--board') + 1]
    force = '--force' in argv
    do_merge = '--merge' in argv

    v = load_validator()
    sub = os.path.join(path, 'submission.json')
    if not os.path.exists(sub):
        print(f'缺少 submission.json：{path}')
        return 2
    doc = json.load(open(sub, encoding='utf-8'))
    rep = v.Report()
    v.check_submission(doc, rep)
    v.check_csv(path, doc, rep)
    v.check_events(path, doc, rep)
    if rep.blocking:
        print(f'拒绝：{len(rep.blocking)} 个阻断项')
        for b in rep.blocking:
            print('  ✗ ' + b)
        return 1

    group = to_group(doc)
    out_dir = os.path.join(board, 'incoming')
    os.makedirs(out_dir, exist_ok=True)
    out = os.path.join(out_dir, group['id'] + '.json')
    if os.path.exists(out) and not force:
        print(f'已存在 {out}；确认覆盖请加 --force')
        return 1
    json.dump(group, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    print(f'已写入 {out}')
    print(f"组 {group['id']}：{len(group['cases'])} 个 run，"
          f"{sum(len(c['events']) for c in group['cases'])} 个事件")
    if do_merge:
        added, replaced = merge_into_site(
            board, out_dir, only=out)
        print(f'已合并进 data.js：新增 {added or "无"}；更新 {replaced or "无"}')
        print('刷新看板即可看到新组（无需原始数据）。')
    else:
        print('下一步：加 --merge 直接写入 data.js，'
              '或运行 build_board.py 做完整重建。')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
