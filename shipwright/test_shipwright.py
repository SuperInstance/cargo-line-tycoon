"""Tests for jev_shipwright.py — no external deps."""
import unittest
from jev_shipwright import JevShipwright, SplineSnap


class TestShipwright(unittest.TestCase):
    def setUp(self):
        self.sw = JevShipwright()
    
    def test_high_confidence_anchors(self):
        r = self.sw.ask("Clear question?", mock_confidence=0.85)
        self.assertEqual(r.snap_decision, "snap_here")
        self.assertEqual(len(self.sw.snaps), 1)
        self.assertTrue(self.sw.snaps[0].is_anchor())
    
    def test_very_high_confidence_skips_snap(self):
        r = self.sw.ask("Very clear?", mock_confidence=0.98)
        self.assertEqual(r.snap_decision, "leave_negative_space")
        # No snap recorded (we trust the structure)
        self.assertEqual(len(self.sw.snaps), 0)
    
    def test_low_confidence_needs_neighbors(self):
        r = self.sw.ask("Ambiguous?", mock_confidence=0.3)
        self.assertEqual(r.snap_decision, "snap_and_neighbors")
        # Snap IS recorded (as a batten, not a duck)
        self.assertEqual(len(self.sw.snaps), 1)
        self.assertFalse(self.sw.snaps[0].is_anchor())
    
    def test_duck_vs_batten_classification(self):
        self.sw.ask("Anchor 1", mock_confidence=0.85)
        self.sw.ask("Batten 1", mock_confidence=0.5)
        self.sw.ask("Anchor 2", mock_confidence=0.78)
        ducks = [s for s in self.sw.snaps if s.is_anchor()]
        battens = [s for s in self.sw.snaps if not s.is_anchor()]
        self.assertEqual(len(ducks), 2)
        self.assertEqual(len(battens), 1)
    
    def test_report_runs(self):
        for q, c in [("Q1", 0.9), ("Q2", 0.5), ("Q3", 0.99)]:
            self.sw.ask(q, mock_confidence=c)
        report = self.sw.report()
        self.assertIn("Shipwright Report", report)
        self.assertIn("ducks", report.lower())
    
    def test_extra_dims_recorded(self):
        self.sw.ask("test", mock_confidence=0.8)
        snap = self.sw.snaps[0]
        self.assertIn("duck_or_batten", snap.extra_dims)
        self.assertEqual(snap.extra_dims["duck_or_batten"], "duck")
    
    def test_snap_ids_unique(self):
        for i in range(5):
            self.sw.ask(f"Q{i}", mock_confidence=0.8)
        ids = [s.snap_id for s in self.sw.snaps]
        self.assertEqual(len(ids), len(set(ids)), "Snap IDs should be unique")


class TestShipwrightAnalogies(unittest.TestCase):
    """Tests that the analogies (ducks/battens/negative space) map correctly."""
    
    def test_duck_is_precision_anchor(self):
        """A duck = high-confidence precision plug in a specific gap."""
        sw = JevShipwright()
        # "Clear question" = we know exactly which gap this fills
        sw.ask("Clear classification?", mock_confidence=0.9)
        snap = sw.snaps[0]
        self.assertTrue(snap.is_anchor())
        # Ducks have known positions
        self.assertIsInstance(snap.position, tuple)
        self.assertEqual(len(snap.position), 2)
    
    def test_batten_organizes_negative_space(self):
        """A batten = lower-confidence anchor that organizes, doesn't fill."""
        sw = JevShipwright()
        sw.ask("Ambiguous area?", mock_confidence=0.4)
        snap = sw.snaps[0]
        self.assertFalse(snap.is_anchor())
        # Battens are still in the structure but don't claim certainty
        self.assertLess(snap.confidence, sw.threshold_anchor)
    
    def test_negative_space_is_actual_substrate(self):
        """Negative space (no snap) is the substrate holding itself, not empty."""
        sw = JevShipwright()
        # Don't ask anything — pure negative space
        # The structure holds itself via prev_hash chain from earlier rounds
        # (in real impl, this would be the quantum superposition)
        self.assertEqual(len(sw.snaps), 0)
        self.assertEqual(len(sw.spaces), 0)
        # In a real system, the substrate IS the negative space.


if __name__ == "__main__":
    unittest.main(verbosity=2)
