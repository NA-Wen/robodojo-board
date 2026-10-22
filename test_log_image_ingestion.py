"""Regression checks for lossless ingestion of the 42-run log/image audit."""
import json
import pathlib
import tempfile
import unittest

import ingest_submission as ingest

ROOT = pathlib.Path(__file__).parent
GROUP = 'dual42-sequence-medium-20261016'
BUNDLE = ROOT / 'submissions' / GROUP


class LogImageIngestionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.doc = json.loads((BUNDLE / 'submission.json').read_text())
        cls.audit = json.loads((BUNDLE / 'audit_data.json').read_text())
        cls.group = ingest.to_group(cls.doc)

    def test_scope_values_and_event_totals(self):
        expected = {r['run_id']: r for r in self.audit['runs']}
        self.assertEqual(len(expected), 42)
        self.assertEqual(len(self.doc['runs']), 42)
        self.assertEqual({c['run_id'] for c in self.group['cases']}, set(expected))
        events = self.audit['events']
        self.assertEqual(len(events), 284)
        self.assertEqual(len({e['event_id'] for e in events}), len(events))
        for run in self.doc['runs']:
            source = expected[run['run_id']]
            for index, field in enumerate(ingest.FIELD_TO_KEY, 1):
                self.assertEqual(run['metrics'][field], source['metrics'][f'm{index:02}']['value'])
                self.assertNotEqual(run['metric_status'][field], 'pending')
                if index > 4 and run['metrics'][field] is not None:
                    counted = sum(index in e['metric_ids'] for e in events
                                  if e['run_id'] == run['run_id'] and e['status'].startswith('confirmed'))
                    self.assertEqual(run['metrics'][field], counted, (run['run_id'], field))
            self.assertEqual(source['control_count_difference'], 0)
        self.assertEqual(sum(r['metrics']['actions'] for r in self.doc['runs']), 26453)

    def test_evidence_coverage_and_budget_survive(self):
        self.assertEqual(self.group['audit_completion'], 'completed_logs_and_images')
        self.assertEqual(sum(len(c['events']) for c in self.group['cases']), 280)
        self.assertEqual(sum(len(c['review_coverage']) for c in self.group['cases']), 126)
        for case in self.group['cases']:
            self.assertIsInstance(case['metrics']['lowerBound'], list)
            for coverage in case['review_coverage']:
                self.assertFalse(coverage['continuous_video_watched'])
                self.assertTrue(coverage['complete_available_trajectory_read'])
                self.assertTrue(coverage['complete_available_model_text_read'])
                self.assertTrue(coverage['reviewed_image_frame_indices'])
            for event in case['events']:
                self.assertEqual(event['audit_annotation']['event_id'], event['id'])
        budget = [e for c in self.group['cases'] for e in c['events']
                  if e['audit_annotation']['status'] == 'confirmed_self_report_only']
        self.assertEqual(len(budget), 2)
        for event in budget:
            a = event['audit_annotation']
            self.assertTrue(a['quote'])
            self.assertIsNone(a['budget_limit'])
            self.assertFalse(a['threshold_independently_verified'])

    def test_merge_refreshes_label_and_preserves_other_groups(self):
        original = ingest.load_site(ROOT)
        original['groups'] = [g for g in original['groups'] if g['id'] != GROUP]
        original['groups'].append({'id': GROUP, 'name': 'old label', 'cases': []})
        with tempfile.TemporaryDirectory() as directory:
            dest = pathlib.Path(directory)
            (dest/'data.js').write_text('window.AUDIT_DATA='+json.dumps(original)+';')
            (dest/'protocol.json').write_bytes((ROOT/'protocol.json').read_bytes())
            incoming = dest/'incoming.json'
            incoming.write_text(json.dumps(self.group))
            ingest.merge_into_site(dest, dest, only=incoming)
            merged = ingest.load_site(dest)
        self.assertEqual([g for g in original['groups'] if g['id'] != GROUP],
                         [g for g in merged['groups'] if g['id'] != GROUP])
        setting = next(s for s in merged['filters']['settings'] if s['id'] == GROUP)
        self.assertEqual(setting['name'], self.group['name'])
        self.assertEqual(setting['coverage'], self.group['coverage'])


if __name__ == '__main__':
    unittest.main()
