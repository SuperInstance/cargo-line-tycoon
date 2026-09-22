"""Tests for cell agents."""
import unittest
from cell_agents import CELL_AGENTS, get_agent


class TestCellAgents(unittest.TestCase):
    def test_explorer_exists(self):
        agent = get_agent('cell-explorer')
        self.assertIsNotNone(agent)
        self.assertTrue(agent.read_only)
    
    def test_reviewer_exists(self):
        agent = get_agent('cell-reviewer')
        self.assertIsNotNone(agent)
        self.assertTrue(agent.read_only)
    
    def test_tester_can_patch(self):
        agent = get_agent('cell-tester')
        self.assertIsNotNone(agent)
        self.assertFalse(agent.read_only)
    
    def test_tool_counts_match_motif(self):
        # Mirrors Motifcode4quilt's tool ordering
        # 3 = done, bash, read
        # 4 = + write
        # 5 = + apply_patch
        # 6 = + term
        # 7 = + skill
        # 8 = + task
        # 9 = + mcp
        for name, agent in CELL_AGENTS.items():
            if name == 'cell-explorer':
                self.assertEqual(agent.tool_count, 3)
            elif name == 'cell-reviewer':
                self.assertEqual(agent.tool_count, 3)
            elif name == 'cell-tester':
                self.assertEqual(agent.tool_count, 6)
    
    def test_unknown_agent(self):
        self.assertIsNone(get_agent('unknown-agent'))


if __name__ == '__main__':
    unittest.main(verbosity=2)
