"""Run with Python + jsonschema; verifies public package without source paths or network."""
import collections
import csv
import hashlib
import importlib.util
import json
import sys
sys.dont_write_bytecode = True
from pathlib import Path
import jsonschema

root = Path(__file__).resolve().parent

def read(name):
    return json.loads((root / name).read_text())

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

for line in (root / 'CHECKSUMS.sha256').read_text().splitlines():
    checksum, filename = line.split('  ', 1)
    assert digest(root / filename) == checksum, filename
spec = importlib.util.spec_from_file_location('official', root / 'official-validate_submission.py')
validator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(validator)
doc = read('submission.json')
jsonschema.Draft202012Validator(read('official-submission.schema.json')).validate(doc)
assert doc['group']['setting']['setting_id'] == 'sha256:' + digest(root / 'setting-config.json')
annotations = {r['run_id']: r for r in read('event_annotations.json')}
native = {r['run_id']: r for r in read('native_metrics.json')}
flat = read('events.json')
aux_csv = {r['run_id']: r for r in csv.DictReader((root / 'run_auxiliary.csv').open())}
coverage = list(csv.DictReader((root / 'review_coverage.csv').open()))
indices = {(r['run_id'], r['camera']): r for r in read('review_inspected_frames.json')}
assert len(doc['runs']) == len(annotations) == len(native) == 42
assert len(flat) == 244 and len(coverage) == len(indices) == 126
assert set(annotations) == set(native) == {r['run_id'] for r in doc['runs']}
for run in doc['runs']:
    rid = run['run_id']
    canonical = annotations[rid]['canonical_result']
    for i, metric in enumerate(validator.METRICS, 1):
        src = next(m for m in canonical['metrics'] if m['id'] == f'm{i:02}')
        assert run['metrics'][metric] == src['value'], (rid, metric)
        if i > 4 and src['value'] is not None:
            count = sum(e['status'] == 'confirmed' and src['id'] in e['metric_ids'] for e in canonical['events'])
            assert count == src['value'], (rid, metric, count)
    outcome = native[rid]['native_outcome']
    assert run['result'] == dict(success=int(outcome['success']), score=outcome['score'],
                                 turns=outcome['model_decisions'], actions=outcome['native_controls'])
    assert {k: run[k] for k in ['task', 'variant', 'scene', 'seed', 'capability']} == native[rid]['episode']
    aux = annotations[rid]['exported_auxiliary']
    assert aux == native[rid]['auxiliary']
    assert aux['model_responses'] == outcome['model_responses']
    assert aux['all_call_records'] == aux['model_call_records'] + aux['non_model_records']
    assert aux['native_controls'] == outcome['native_controls']
    assert aux['internal_macro_stages'] is None
    for k, value in aux.items():
        assert aux_csv[rid][k] == ('' if value is None else str(value)), (rid, k)
    assert run['events'] == [{k: v for k, v in e.items() if k != 'run_id'} for e in flat if e['run_id'] == rid]
    assert len(canonical['events']) == len(run['events'])
    for src, ev in zip(canonical['events'], run['events']):
        assert src['event_id'] == ev['id'] and src['result'] == ev['result']
        assert (src['status'] == 'confirmed') == (ev['confidence'] == '确认')
        assert src.get('execution_evidence', '') in ev['basis']
        assert src.get('visual_evidence', '') in ev['basis']
for row in coverage:
    idx = indices[row['run_id'], row['camera']]
    assert len(idx['frames']) == int(row['inspected_records'])
    assert row['continuous_full_video_review_complete'] == 'False'
report = validator.Report()
validator.check_submission(doc, report)
validator.check_csv(str(root), doc, report)
validator.check_events(str(root), doc, report)
assert not report.blocking, report.blocking
print(json.dumps(dict(accepted=True, blocking=[], runs=42, metrics=1092, events=len(flat),
                     warnings=len(report.warnings), schema_valid=True, checksums_valid=True), ensure_ascii=False))
