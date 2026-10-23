"""Position evidence must survive ingestion without inventing synchronization."""
import copy
import json
from pathlib import Path
import unittest

import ingest_submission as ingest

ROOT = Path(__file__).parent
BUNDLE = ROOT / 'submissions/semantic'


class SemanticPositionsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.doc = json.loads((BUNDLE / 'submission.json').read_text())
        cls.annotations = json.loads((BUNDLE / 'event_annotations.json').read_text())
        cls.coverage = json.loads((BUNDLE / 'coverage.json').read_text())
        cls.group = ingest.to_group(cls.doc, cls.annotations, cls.coverage)

    def test_all_82_failures_have_video_positions_but_only_56_have_decisions(self):
        video_bins = [0] * 5
        decision_bins = [0] * 5
        failures = 0
        for case, run in zip(self.group['cases'], self.doc['runs']):
            self.assertEqual(case['run_id'], run['run_id'])
            for field, key in ingest.FIELD_TO_KEY.items():
                self.assertEqual(case['metrics'][key], run['metrics'][field])
            for event, original in zip(case['events'], run['events']):
                self.assertEqual(event['turns'], original['turns'])
                self.assertEqual(event['time_range'], original['time_range'])
                if event['category'] not in ('empty_retry', 'drop'):
                    continue
                failures += 1
                start, end = event['time_range']
                duration = case['video_duration_seconds']
                self.assertTrue(0 <= start <= end <= duration)
                video_bins[min(4, int(start / duration * 5))] += 1
                if 'decision_window' in event:
                    start, end = event['decision_window']
                    self.assertTrue(0 <= start <= end < case['metrics']['turns'])
                    decision_bins[min(4, int(start / case['metrics']['turns'] * 5))] += 1
        self.assertEqual(failures, 82)
        self.assertEqual(video_bins, [15, 17, 24, 17, 9])
        self.assertEqual(decision_bins, [13, 11, 14, 14, 4])

    def test_missing_or_inconsistent_duration_stays_unknown(self):
        for replacement in (None, -1, self.coverage['coverage'][0]['duration_seconds'] + 1):
            coverage = copy.deepcopy(self.coverage)
            coverage['coverage'][0]['duration_seconds'] = replacement
            group = ingest.to_group(self.doc, self.annotations, coverage)
            self.assertNotIn('video_duration_seconds', group['cases'][0])

    def test_annotations_are_not_inferred_from_video(self):
        annotations = copy.deepcopy(self.annotations)
        annotations[0]['source_events'][0]['decision_start'] = None
        group = ingest.to_group(self.doc, annotations, self.coverage)
        self.assertNotIn('decision_window', group['cases'][0]['events'][0])
        self.assertEqual(group['cases'][0]['events'][0]['turns'], [])


if __name__ == '__main__':
    unittest.main()
