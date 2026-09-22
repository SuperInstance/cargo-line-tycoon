"""Cell-specialized agents for motif-quilt."""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'tools'))

from dataclasses import dataclass
from typing import Optional

from cell_tools import cell_read, cell_patch, cell_bash, cell_done


@dataclass
class CellAgent:
    name: str
    read_only: bool
    description: str
    tool_count: int
    max_turns: int
    instructions: str
    source: str = 'motif-quilt'


CELL_AGENTS = {
    'cell-explorer': CellAgent(
        name='cell-explorer',
        read_only=True,
        description='Read-only reconnaissance of substrate cells',
        tool_count=3,
        max_turns=20,
        source='builtin',
        instructions=(
            "You explore substrate cells and report. You cannot modify cells.\n"
            "\n"
            "Search before reading: one substrate query beats five cell reads. "
            "Follow prev_hash chains rather than scan order.\n"
            "\n"
            "Return a cell map, not a transcript."
        ),
    ),
    'cell-reviewer': CellAgent(
        name='cell-reviewer',
        read_only=True,
        description='Correctness review of a cell change',
        tool_count=3,
        max_turns=25,
        source='builtin',
        instructions=(
            "You review cells and report. Do not fix anything.\n"
            "\n"
            "Correctness first: walk the new cell's state with a concrete input. "
            "Check the prev_hash chain.\n"
            "\n"
            "Every finding needs a cell_id, a hash, and the input that breaks it."
        ),
    ),
    'cell-tester': CellAgent(
        name='cell-tester',
        read_only=False,
        description='Run tests, diagnose failures, fix the cause via cell_patch',
        tool_count=6,
        max_turns=40,
        source='builtin',
        instructions=(
            "Get the cell passing by fixing causes, never by hiding symptoms.\n"
            "\n"
            "Read the failing cell first. Check the prev_hash chain. "
            "Patch via cell_patch, which creates a NEW cell with prev_hash pointing to the failing one. "
            "Never overwrite; always extend the chain."
        ),
    ),
}


def get_agent(name):
    return CELL_AGENTS.get(name)
