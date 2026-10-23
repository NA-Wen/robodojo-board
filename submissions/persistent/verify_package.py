#!/usr/bin/env python3
"""Recompute the portable package's metrics, event counts, setting and coverage."""
import collections
import hashlib
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parent
read = lambda name: json.loads((ROOT / name).read_text())
digest = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
doc = read('submission.json')
annotations = {r['run_id']: r for r in read('event_annotations.json')}
native = {r['run_id']: r for r in read('native_metrics.json')}
fields = list(doc['runs'][0]['metrics'])
cells = 0
events = []
for run in doc['runs']:
    rid = run['run_id']
    source = annotations[rid]
    assert len(fields) == len(run['metrics']) == len(source['source_metrics'])
    assert run['result'] == native[rid]['native_result']
    assert run['result']['turns'] == native[rid]['distinct_model_decisions']
    assert run['result']['actions'] == native[rid]['summed_actual_controls']
    for i, field in enumerate(fields, 1):
        metric = next(m for m in source['source_metrics'] if m['id'] == f'm{i:02}')
        assert run['metrics'][field] == metric['value'], (rid, field)
        confirmed = [e for e in source['events']
                     if metric['id'] in e['metric_ids'] and e['status'] == 'confirmed']
        if i > 4 and metric['value'] is not None:
            assert len(confirmed) == metric['value'], (rid, field)
        physical_ids = [e['physical_event_id'] for e in confirmed if e.get('physical_event_id')]
        assert len(physical_ids) == len(set(physical_ids)), (rid, field)
        if i in (7, 8):
            chains = [e['recovery_chain_id'] for e in confirmed if e.get('recovery_chain_id')]
            assert len(chains) == len(set(chains))
        cells += 1
    assert {e['id'] for e in run['events']} == {e['event_id'] for e in source['events']}
    assert len(run['events']) == len(source['events'])
    for event, original in zip(run['events'], source['events']):
        assert event['id'] == original['event_id']
        assert (event['confidence'] == '确认') == (original['status'] == 'confirmed')
    events.extend({'run_id': rid, **e} for e in run['events'])
assert events == read('events.json')
fp = read('setting_fingerprint.json')
canonical = json.dumps(fp['configuration'], ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()
assert 'sha256:' + hashlib.sha256(canonical).hexdigest() == fp['setting_id'] == doc['group']['setting']['setting_id']
review = read('main_review.json')
assert review['approved'] and not review['recheck_requests']
assert set(review['approved_run_ids']) == {r['run_id'] for r in doc['runs']}
assert review['submission_sha256'] == digest(ROOT / 'submission.json')
inspected = {(r['run_id'], r['camera']): r for r in read('review_inspected_frames.json')}
coverage = read('coverage.json')
for c in coverage:
    frames = inspected[(c['run_id'], c['camera'])]['frames']
    ids = {f['frame_index'] for f in frames}
    assert len(ids) == len(frames) == c['inspected_records']
    required = set(range(0, c['frame_count'], int(c['fps'] * c['base_interval']))) | {c['frame_count'] - 1}
    assert not required - ids
    for window in c['dense_intervals']:
        first = max(0, math.ceil(window['start'] * c['fps'] - 1e-5))
        last = min(c['frame_count'] - 1, math.floor(window['end'] * c['fps'] + 1e-5))
        assert not set(range(first, last + 1)) - ids
    assert c['base_complete'] and c['action_review_complete']
for line in (ROOT / 'CHECKSUMS.sha256').read_text().splitlines():
    expected, name = line.split('  ', 1)
    assert digest(ROOT / name) == expected, name
print(json.dumps({'runs': len(doc['runs']), 'metric_cells': cells, 'events': len(events),
                  'confidence': dict(collections.Counter(e['confidence'] for e in events)),
                  'coverage_views': len(coverage), 'blocking': []}, ensure_ascii=False, indent=2))
