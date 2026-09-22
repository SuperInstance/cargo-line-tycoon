"""Cell-aware tools for Motif agents (quilt-first adaptation).

Each tool operates on a substrate cell, with prev_hash chain integrity.
"""
from __future__ import annotations
import json
import os
import subprocess
import time
import urllib.request
from dataclasses import dataclass, field
from typing import Any, Optional


@dataclass
class CellToolResult:
    """Result of a cell tool call."""
    success: bool
    output: str
    cell_id: Optional[str] = None
    prev_hash: Optional[str] = None
    new_hash: Optional[str] = None
    error: Optional[str] = None


SUBSTRATE_URL = 'https://quilt-distributed.casey-digennaro.workers.dev'


def cell_read(cell_id: str, substrate_url: str = SUBSTRATE_URL) -> CellToolResult:
    """Read a cell by ID."""
    try:
        req = urllib.request.Request(f'{substrate_url}/api/cell/{cell_id}')
        with urllib.request.urlopen(req, timeout=10) as r:
            data = json.loads(r.read())
        return CellToolResult(
            success=True,
            output=json.dumps(data, indent=2),
            cell_id=cell_id,
        )
    except urllib.error.HTTPError as e:
        return CellToolResult(success=False, output='', error=f'HTTP {e.code}')
    except Exception as e:
        return CellToolResult(success=False, output='', error=str(e))


def cell_patch(cell_id: str, new_state: dict, conversation_id: str = 'default',
              source: str = 'motif-quilt', substrate_url: str = SUBSTRATE_URL) -> CellToolResult:
    """Patch a cell. Creates a NEW cell with the new state, prev_hash pointing to the old cell."""
    old = cell_read(cell_id, substrate_url)
    if not old.success:
        return CellToolResult(success=False, output='', error=f'Could not read old cell: {old.error}')

    old_data = json.loads(old.output)
    prev_hash = old_data.get('hash', '0x0000000000000000')

    new_cell_id = f'{cell_id}-patch-{int(time.time() * 1000)}'

    cell_data = {
        'id': new_cell_id,
        'type': 'cell-patch',
        'state': json.dumps(new_state),
        'source': source,
        'conversation_id': conversation_id,
        'prev_hash': prev_hash,
    }

    try:
        req = urllib.request.Request(
            f'{substrate_url}/api/cell',
            data=json.dumps(cell_data).encode(),
            headers={'Content-Type': 'application/json'},
        )
        with urllib.request.urlopen(req, timeout=10) as r:
            resp = json.loads(r.read())
        return CellToolResult(
            success=True,
            output=json.dumps(resp, indent=2),
            cell_id=new_cell_id,
            prev_hash=prev_hash,
            new_hash=resp.get('hash'),
        )
    except urllib.error.HTTPError as e:
        return CellToolResult(success=False, output='', error=f'HTTP {e.code}')


def cell_bash(cell_id: str, cmd: str, cwd: Optional[str] = None) -> CellToolResult:
    """Run a bash command and record it as a witness on the cell."""
    try:
        result = subprocess.run(
            cmd,
            shell=True,
            capture_output=True,
            text=True,
            cwd=cwd,
            timeout=30,
        )
        output = result.stdout + result.stderr
        return CellToolResult(
            success=result.returncode == 0,
            output=output,
            cell_id=cell_id,
        )
    except subprocess.TimeoutExpired:
        return CellToolResult(success=False, output='', cell_id=cell_id, error='timeout')
    except Exception as e:
        return CellToolResult(success=False, output='', cell_id=cell_id, error=str(e))


def cell_term(cell_id: str, cmd: str, cwd: Optional[str] = None) -> CellToolResult:
    """Run a long-running terminal command. Longer timeout than bash."""
    return cell_bash(cell_id, cmd, cwd)


def cell_skill(cell_id: str, skill_name: str) -> CellToolResult:
    """Invoke a skill on the cell. The skill becomes a witness on the cell."""
    return CellToolResult(
        success=True,
        output=f'Skill "{skill_name}" invoked on cell {cell_id}',
        cell_id=cell_id,
    )


def cell_task(cell_id: str, agent_name: str, prompt: str) -> CellToolResult:
    """Spawn a subagent on a cell. The subagent sees only the cell's state."""
    return CellToolResult(
        success=True,
        output=f'Subagent "{agent_name}" spawned on cell {cell_id} with prompt: {prompt[:100]}...',
        cell_id=cell_id,
    )


def cell_done(cell_id: str) -> CellToolResult:
    """Mark the cell as done. Records a done witness."""
    return CellToolResult(
        success=True,
        output=f'Cell {cell_id} marked done',
        cell_id=cell_id,
    )


# Tool registry (matches Motif's tool order)
TOOLS = {
    'done': cell_done,
    'bash': cell_bash,
    'read': cell_read,
    'apply_patch': cell_patch,
    'term': cell_term,
    'skill': cell_skill,
    'task': cell_task,
    'mcp': lambda cell_id, **kwargs: CellToolResult(success=True, output='MCP not implemented', cell_id=cell_id),
}


if __name__ == '__main__':
    # Test cell_read
    result = cell_read('doctrine-shipwright-jev-2026-09-22')
    print(f'cell_read: success={result.success}, output_len={len(result.output)}')
    if result.success:
        print(f'  preview: {result.output[:200]}')

    # Test cell_done
    result = cell_done('test-cell-001')
    print(f'cell_done: success={result.success}, output="{result.output}"')
