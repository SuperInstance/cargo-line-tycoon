"""Tests for jev_diffusion — substrate segmentation + LLM-as-GAN."""
import unittest
from jev_diffusion import SubstrateCell, substrate_segment, jev_plan_image


class TestSubstrateSegment(unittest.TestCase):
    def test_single_subject_3_cells(self):
        plan = {'regions': 'single_subject'}
        cells = substrate_segment(plan)
        self.assertEqual(len(cells), 3)
        self.assertEqual([c.region for c in cells], ['subject', 'background', 'border'])
    
    def test_landscape_horizon_3_cells(self):
        plan = {'regions': 'landscape_horizon'}
        cells = substrate_segment(plan)
        self.assertEqual(len(cells), 3)
        self.assertEqual([c.region for c in cells], ['sky', 'horizon', 'land'])
    
    def test_three_layer_3_cells(self):
        plan = {'regions': 'three_layer'}
        cells = substrate_segment(plan)
        self.assertEqual(len(cells), 3)
        self.assertEqual([c.region for c in cells], ['foreground', 'midground', 'background'])
    
    def test_complex_scene_5_cells(self):
        plan = {'regions': 'complex_scene'}
        cells = substrate_segment(plan)
        self.assertEqual(len(cells), 5)
    
    def test_abstract_4_cells(self):
        plan = {'regions': 'abstract'}
        cells = substrate_segment(plan)
        self.assertEqual(len(cells), 4)
    
    def test_unknown_falls_back(self):
        plan = {'regions': 'something_new'}
        cells = substrate_segment(plan)
        # Falls back to ['subject', 'background']
        self.assertEqual([c.region for c in cells], ['subject', 'background'])
    
    def test_cell_ids_unique(self):
        plan = {'regions': 'complex_scene'}
        cells = substrate_segment(plan)
        ids = [c.cell_id for c in cells]
        self.assertEqual(len(ids), len(set(ids)))
    
    def test_cell_positions_unique(self):
        plan = {'regions': 'complex_scene'}
        cells = substrate_segment(plan)
        positions = [c.position for c in cells]
        self.assertEqual(len(positions), len(set(positions)))


class TestSubstrateCell(unittest.TestCase):
    def test_cell_creation(self):
        c = SubstrateCell(cell_id='cell-00', region='sky', position=(0, 0))
        self.assertEqual(c.cell_id, 'cell-00')
        self.assertEqual(c.region, 'sky')
        self.assertEqual(c.position, (0, 0))
        # Default fields
        self.assertEqual(c.jev_decision, {})
        self.assertEqual(c.llm_render, '')
        self.assertEqual(c.critic_score, 0.0)


if __name__ == '__main__':
    unittest.main(verbosity=2)
