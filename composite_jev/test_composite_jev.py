"""Tests for composite_jev — stdlib only."""
import unittest
from composite_jev import Shell, ABox, symmetry_detect, SHELLS, SymmetryReport


class TestShells(unittest.TestCase):
    def test_jev_is_jev(self):
        jev = SHELLS['jev-deep']
        self.assertTrue(jev.is_jev)
        self.assertEqual(jev.model, 'jev-latest')
    
    def test_qwen_not_jev(self):
        qwen = SHELLS['qwen-fast']
        self.assertFalse(qwen.is_jev)
    
    def test_deepseek_not_jev(self):
        ds = SHELLS['deepseek-mid']
        self.assertFalse(ds.is_jev)
    
    def test_frequency_bands_distinct(self):
        freqs = {s.frequency for s in SHELLS.values()}
        self.assertEqual(len(freqs), len(SHELLS))


class TestSymmetryDetect(unittest.TestCase):
    def test_identical_boxes_have_high_agreement(self):
        a = ABox(shell_id='a', timestamp_ms=0, result={'dept': 'billing', 'urgent': 1.5})
        b = ABox(shell_id='b', timestamp_ms=0, result={'dept': 'billing', 'urgent': 1.5})
        report = symmetry_detect(a, b, 'test task')
        self.assertGreater(report.agreement_score, 0.5)
    
    def test_disjoint_boxes_have_low_agreement(self):
        a = ABox(shell_id='a', timestamp_ms=0, result={'alpha': 1})
        b = ABox(shell_id='b', timestamp_ms=0, result={'beta': 2})
        report = symmetry_detect(a, b, 'test')
        self.assertLess(report.agreement_score, 0.5)
    
    def test_preferred_higher_confidence(self):
        a = ABox(shell_id='a', timestamp_ms=0, result={}, confidence=0.9)
        b = ABox(shell_id='b', timestamp_ms=0, result={}, confidence=0.5)
        report = symmetry_detect(a, b, 'test')
        self.assertEqual(report.preferred_shell, 'a')
    
    def test_tie_when_equal_confidence(self):
        a = ABox(shell_id='a', timestamp_ms=0, result={}, confidence=0.5)
        b = ABox(shell_id='b', timestamp_ms=0, result={}, confidence=0.5)
        report = symmetry_detect(a, b, 'test')
        self.assertEqual(report.preferred_shell, 'tie')


class TestABox(unittest.TestCase):
    def test_abox_stores_result(self):
        a = ABox(shell_id='test', timestamp_ms=100, result={'key': 'value'})
        self.assertEqual(a.result['key'], 'value')
        self.assertEqual(a.timestamp_ms, 100)


if __name__ == '__main__':
    unittest.main(verbosity=2)
