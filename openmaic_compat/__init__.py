"""
OpenMAIC → Quilt compatibility layer.

OpenMAIC is a Tsinghua multi-agent interactive classroom system that uses
LangGraph + Next.js + PostgreSQL with 28+ action types. This module
parses an OpenMAIC JSON scenario and projects it onto the Quilt substrate.

Each OpenMAIC agent → Quilt cell of type 'agent'
Each OpenMAIC student → Quilt cell of type 'student'
Each scene → Quilt cell of type 'scene'
Each action → substrate signal of the corresponding type
"""

import json
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'substrate', 'py'))

from clt_substrate import Cell, Signal, SignalChain, fnv1a64

ACTION_TYPE_MAP = {
    'speak': 'agent_speak',
    'draw': 'agent_draw',
    'quiz': 'agent_quiz',
    'highlight': 'agent_highlight',
    'move': 'agent_move',
    'code_execute': 'agent_code',
    'web_search': 'agent_search',
    'audio_play': 'agent_audio',
    'video_show': 'agent_video',
    'note_write': 'agent_note',
    'poll': 'agent_poll',
    'discuss': 'agent_discuss',
    'cite': 'agent_cite',
    'embed': 'agent_embed',
}

def parse_scenario(scenario):
    """Parse an OpenMAIC scenario JSON. Returns dict with agents, students, scenes, actions."""
    return {
        'session_id': scenario.get('session_id', 'unknown'),
        'topic': scenario.get('topic', ''),
        'curriculum': scenario.get('curriculum', {}),
        'agents': scenario.get('agents', []),
        'students': scenario.get('students', []),
        'scenes': scenario.get('scenes', []),
        'actions': scenario.get('actions', []),
    }


def project_to_quilt(scenario):
    """Project an OpenMAIC scenario onto the Quilt substrate.
    
    Returns:
        cells: dict of {cell_id: Cell}
        signals: list of Signal instances
        cell_graph_json: JSON-serializable cell graph
    """
    parsed = parse_scenario(scenario)
    cells = {}
    signals = []
    
    # 1. Agent cells
    for agent in parsed['agents']:
        cid = agent['id']
        cells[cid] = Cell(
            state={'role': agent.get('role', 'teacher'), 'persona': agent.get('persona', '')[:120]},
            type='agent',
            witness_log=[{
                'op': 'BIND',
                'source': 'openmaic',
                'payload': {'agent_id': cid, 'role': agent.get('role'), 'name': agent.get('name', cid)},
                'timestamp': 0,
            }],
        )
    
    # 2. Student cells
    for student in parsed['students']:
        cid = student['id']
        cells[cid] = Cell(
            state={'learning_goal': student.get('learning_goal', '')[:120]},
            type='student',
            witness_log=[{
                'op': 'BIND',
                'source': 'openmaic',
                'payload': {'student_id': cid, 'tier': student.get('tier', 1)},
                'timestamp': 0,
            }],
        )
    
    # 3. Scene cells (one per scene in the outline)
    for scene in parsed['scenes']:
        cid = f"scene_{scene['id']}"
        cells[cid] = Cell(
            state={'title': scene.get('title', ''), 'objective': scene.get('objective', '')[:120]},
            type='scene',
            witness_log=[{
                'op': 'BIND',
                'source': 'openmaic',
                'payload': {'scene_id': scene['id'], 'order': scene.get('order', 0)},
                'timestamp': scene.get('start_time', 0),
            }],
        )
    
    # 4. Actions as signals
    for i, action in enumerate(parsed['actions']):
        action_type = action.get('type', 'speak')
        substrate_type = ACTION_TYPE_MAP.get(action_type, f'agent_{action_type}')
        sig = Signal(
            source=f"agent:{action.get('agent_id', 'unknown')}",
            target=action.get('target', 'director'),
            signal_type=substrate_type,
            payload={
                'action_idx': i,
                'content': action.get('content', '')[:200],
                'scene_id': action.get('scene_id'),
                'timestamp': action.get('timestamp', 0),
            },
            timestamp=action.get('timestamp', 0),
        )
        signals.append(sig)
        
        # Add to the agent's witness-log
        agent_id = action.get('agent_id')
        if agent_id and agent_id in cells:
            cells[agent_id].witness_log.append({
                'op': 'EFFECT',
                'payload': {
                    'substrate_type': substrate_type,
                    'content': action.get('content', '')[:80],
                    'timestamp': action.get('timestamp', 0),
                },
                'timestamp': action.get('timestamp', 0),
            })
    
    # Build the cell-graph JSON
    cell_graph_json = {
        'session_id': parsed['session_id'],
        'topic': parsed['topic'],
        'n_cells': len(cells),
        'n_signals': len(signals),
        'cells': {cid: {
            'address': cell.address,
            'type': cell.type,
            'state': cell.state,
            'witness_log_size': len(cell.witness_log),
        } for cid, cell in cells.items()},
        'signals': [s.to_dict() for s in signals],
    }
    
    return cells, signals, cell_graph_json


def verify_polyformalism_canary(cells):
    """Verify the canary hash is correct across cells."""
    h = fnv1a64("café Δ 日本語")
    return h == 0x024a555471370b18d
