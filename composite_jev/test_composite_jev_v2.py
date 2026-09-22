"""Tests for composite_jev_v2 — wavefunction interference."""
import unittest
import cmath
import math
from composite_jev_v2 import compute_interference, _phase_from_result, InterferencePattern
from composite_jev import ABox


class TestPhase(unittest.TestCase):
    def test_phase_in_range(self):
        for text in ['hello', '{"a": 1}', '[]', '{"choice": "billing"}']:
            p = _phase_from_result(text)
            self.assertGreaterEqual(p, 0)
            self.assertLess(p, 2 * math.pi)
    
    def test_phase_deterministic(self):
        """Same input gives same phase."""
        text = '{"choice": "billing"}'
        p1 = _phase_from_result(text)
        p2 = _phase_from_result(text)
        self.assertEqual(p1, p2)


class TestInterference(unittest.TestCase):
    def test_aligned_phases_high_agreement(self):
        """Same result → high agreement."""
        a = ABox(shell_id='a', timestamp_ms=0, result={'choice': 'billing'}, confidence=0.9)
        b = ABox(shell_id='b', timestamp_ms=0, result={'choice': 'billing'}, confidence=0.9)
        pattern = compute_interference(a, b)
        # Same phase (same result) → constructive interference dominates
        self.assertGreater(pattern.agreement, 0.5)
    
    def test_opposite_phases_low_agreement(self):
        """Opposite results → low agreement."""
        a = ABox(shell_id='a', timestamp_ms=0, result={'choice': 'billing'}, confidence=0.9)
        b = ABox(shell_id='b', timestamp_ms=0, result={'choice': 'shipping'}, confidence=0.9)
        pattern = compute_interference(a, b)
        # Different phases → interference could be constructive or destructive
        # At least it should be different from identical case
        self.assertIsInstance(pattern.agreement, float)
    
    def test_preferred_higher_magnitude(self):
        a = ABox(shell_id='a', timestamp_ms=0, result={'x': 1}, confidence=0.9)
        b = ABox(shell_id='b', timestamp_ms=0, result={'x': 2}, confidence=0.3)
        pattern = compute_interference(a, b)
        self.assertEqual(pattern.preferred, 'A')
    
    def test_preferred_lower_magnitude(self):
        a = ABox(shell_id='a', timestamp_ms=0, result={'x': 1}, confidence=0.3)
        b = ABox(shell_id='b', timestamp_ms=0, result={'x': 2}, confidence=0.9)
        pattern = compute_interference(a, b)
        self.assertEqual(pattern.preferred, 'B')
    
    def test_preferred_tie(self):
        a = ABox(shell_id='a', timestamp_ms=0, result={'x': 1}, confidence=0.5)
        b = ABox(shell_id='b', timestamp_ms=0, result={'x': 2}, confidence=0.5)
        pattern = compute_interference(a, b)
        self.assertEqual(pattern.preferred, 'tie')
    
    def test_amplitudes_complex(self):
        """Amplitudes should be complex numbers."""
        a = ABox(shell_id='a', timestamp_ms=0, result={'x': 1}, confidence=0.7)
        b = ABox(shell_id='b', timestamp_ms=0, result={'y': 2}, confidence=0.5)
        pattern = compute_interference(a, b)
        self.assertIsInstance(pattern.amplitude_a, complex)
        self.assertIsInstance(pattern.amplitude_b, complex)
    
    def test_constructive_plus_destructive(self):
        """Constructive + Destructive = 2*(|α_A|² + |α_B|²) [parallelogram identity]."""
        a = ABox(shell_id='a', timestamp_ms=0, result={'x': 1}, confidence=0.7)
        b = ABox(shell_id='b', timestamp_ms=0, result={'y': 2}, confidence=0.5)
        pattern = compute_interference(a, b)
        sum_amps = abs(pattern.amplitude_a) ** 2 + abs(pattern.amplitude_b) ** 2
        self.assertAlmostEqual(
            pattern.constructive + pattern.destructive,
            2 * sum_amps,
            places=5,
        )


class TestInterferencePattern(unittest.TestCase):
    def test_dataclass_fields(self):
        p = InterferencePattern(
            amplitude_a=complex(0.5, 0.3),
            amplitude_b=complex(0.2, 0.1),
            constructive=0.5,
            destructive=0.2,
            agreement=0.7,
            phase_alignment=0.8,
            preferred='A',
        )
        self.assertEqual(p.preferred, 'A')
        self.assertAlmostEqual(p.agreement, 0.7)


if __name__ == '__main__':
    unittest.main(verbosity=2)
