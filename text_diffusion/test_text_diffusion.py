"""Tests for text diffusion mitosis engine."""
import unittest
from text_diffusion import MitosisEngine, TextCell


class TestTextCell(unittest.TestCase):
    def test_genesis_creation(self):
        cell = TextCell(
            cell_id='genesis',
            parent_id=None,
            prev_hash='0x0',
            content='hello',
            depth=0,
            max_chars=100,
        )
        self.assertIsNone(cell.parent_id)
        self.assertEqual(cell.depth, 0)
        self.assertFalse(cell.children)
    
    def test_hash_consistency(self):
        c1 = TextCell('a', None, '0x0', 'x', 0, 100)
        c2 = TextCell('a', None, '0x0', 'x', 0, 100)
        self.assertEqual(c1.hash_simple(), c2.hash_simple())
    
    def test_hash_different_for_different_content(self):
        c1 = TextCell('a', None, '0x0', 'x', 0, 100)
        c2 = TextCell('a', None, '0x0', 'y', 0, 100)
        self.assertNotEqual(c1.hash_simple(), c2.hash_simple())


class TestMitosisEngine(unittest.TestCase):
    def test_creation(self):
        engine = MitosisEngine(target='test')
        self.assertEqual(len(engine.all_cells), 1)
        self.assertIsNone(engine.all_cells[0].parent_id)
    
    def test_assembly_picks_leaves_only(self):
        engine = MitosisEngine(target='test')
        # Manually set up a parent with 2 leaf children
        parent = engine.all_cells[0]
        parent.content = 'parent content (should not appear in final)'
        d1 = TextCell('d1', 'p', parent.hash_simple(), 'leaf1', 1, 100)
        d2 = TextCell('d2', 'p', parent.hash_simple(), 'leaf2', 1, 100)
        engine.all_cells.extend([d1, d2])
        parent.children = ['d1', 'd2']
        engine._assemble()
        self.assertIn('leaf1', engine.work)
        self.assertIn('leaf2', engine.work)
        self.assertNotIn('parent content', engine.work)
    
    def test_find_growth_target(self):
        engine = MitosisEngine(target='test', max_depth=3)
        # Fill genesis
        engine.all_cells[0].content = 'x' * 1000
        target = engine._find_growth_target()
        self.assertEqual(target.cell_id, engine.all_cells[0].cell_id)


if __name__ == '__main__':
    unittest.main(verbosity=2)
