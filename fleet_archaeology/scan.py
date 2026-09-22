"""Fleet archaeology — scan the SuperInstance fleet for nuggets that pre-figured today's work.

Casey (2026-09-22): 'Think about some of our older projects but they could certainly be
integrated and cross-pollinated and improved with some of our later tech. but also, there are
many of the older projects like composite-headspace and forks like open-webui gno that had
some nuggets of inspiration that just like we are seeing now, can sometimes be real insight
in later lights even if they didn't know it'

Doctrine: scan the fleet, find pre-cursors, integrate them with current substrate.
"""
from __future__ import annotations
import json
import os
import time
import urllib.request
from dataclasses import dataclass, field


@dataclass
class Nugget:
    """A pre-cursor repo that pre-figured a substrate concept."""
    name: str
    description: str
    created_at: str
    pushed_at: str
    language: str
    stars: int
    topics: list = field(default_factory=list)
    pre_figures: list = field(default_factory=list)
    status: str = 'unknown'


# Known pre-figurations (mapping older projects to today's substrate concepts)
PRE_FIGURES = {
    'cudaclaw': [
        'GPU-resident persistent kernels',
        'warp-level agent dispatch',
        'sub-microsecond host-device comm',
        'unified-memory command queues',
        'fleet-scale agent simulation',
    ],
    'Mycelium': [
        'behavior-as-seed',
        'one-prompt-one-seed exact action',
        'no-code agent capture',
    ],
    'bordercollie': [
        'herding 10000 local CUDA agents',
        'agent memories + skills',
        'fleet coordination',
    ],
    'composite-headspace': [
        'dual-shell parallel cognitive reasoning',
        'symmetry-dissonance loop',
        't-minus cueing protocol',
        'DAW metaphor for thought',
        'frequency bands (bass/treble)',
        'shell competition/collaboration/convergence',
        'a-box emission',
    ],
    'tminus-dispatcher': [
        'temporal heartbeat',
        'countdown cues (positive/zero/negative)',
        'cognitive beat = 500ms',
        'phase groups',
        'agent state machine',
    ],
    'cocapn': [
        'repo-first agent',
        'tiles = atomic knowledge units',
        'rooms = self-training collections',
        'flywheel = every exchange improves next',
        'JSONL-as-database',
        'agent grows inside repo using repo as muscle-memory',
    ],
    'SmartCRDT': [
        'CRDTs as substrate state',
        'convergence without captain',
        'vector search via ChromaDB',
        'observability of divergence/convergence',
        'partition-tolerant by construction',
    ],
    'hierarchical-memory': [
        '6-tier memory hierarchy',
        'consolidation',
        'vector search',
        'identity persistence',
    ],
    'project-JEPA': [
        'Joint Embedding Predictive Architecture',
        'JEV as wavefunction',
    ],
    'flux-runtime': [
        'deterministic bytecode ISA',
        'assembler/compiler/VM',
        'agentic logic',
    ],
    'flux': [
        'Fluid Language Universal eXecution',
        'high-performance Rust runtime',
        'bytecode for agent logic',
    ],
    'constraint-theory-core': [
        'geometric constraint theory',
        'Eisenstein lattices',
        'deadband funnels',
    ],
    'higher-abstraction-vocabularies': [
        '2000+ terms across 252 domains',
        'structured vocabulary engine',
        'precision ideation',
    ],
    'oracle1-index': [
        'searchable index of repos',
        '32 categories',
        'fork map',
        'integration graph',
    ],
    'SuperInstance-papers': [
        'logic deconstructed to spread-sheet tiles',
        'tile intelligence in real-time',
    ],
    'AI-Writings': [
        'creative writing + philosophical exploration',
        'exocortex project',
        'canon publications',
    ],
    'Equipment-Consensus-Engine': [
        'multi-agent deliberation',
        'Pathos/Logos/Ethos weighting',
    ],
    'Equipment-Memory-Hierarchy': [
        '4-tier cognitive memory',
        'Working/Episodic/Semantic/Procedural',
    ],
    'Equipment-Teacher-Student': [
        'distillation triggers',
        'deadband range thresholds',
        'teacher-student architecture',
    ],
    'Equipment-Escalation-Router': [
        'Bot->Brain->Human routing',
        '40x cost reduction',
        'intelligent LLM routing',
    ],
    'Equipment-Self-Improvement': [
        'self-modifying equipment',
        'distillation of what agents need',
    ],
    'git-agent': [
        'repo-native agent',
        'shell IS the agent',
    ],
    'Baton': [
        'automate agents training successors',
        'infinite context',
    ],
    'Claude_Baton': [
        'generational context handoff',
        'seamless auditable infinite-context',
    ],
    'flux-os': [
        'pure C agent-first OS',
        'kernel-up autonomous computing',
    ],
    'quicunnel': [
        'high-performance QUIC tunnel',
        'mTLS authentication',
    ],
    'webgpu-profiler': [
        'GPU profiler for WebGPU',
        'real-time GPU monitoring',
    ],
    'agent-grid': [
        'grid-based interface for AI agents',
    ],
    'SwarmOrchestration': [
        'multi-agent system management',
    ],
    'agent-coordinator': [
        'multi-agent coordination framework',
        'task distribution',
    ],
    'Equipment-Swarm-Coordinator': [
        'origin-centric networks',
        'asymmetrical knowledge',
    ],
    'spreader-tool': [
        'intelligence tiling for PLATO rooms',
        'frozen context windows',
        'seed locking',
        'deadband detection',
    ],
}


def scan_fleet(github_token: str = None) -> list:
    """Scan the SuperInstance fleet for nuggets."""
    if github_token is None:
        github_token = os.environ.get('GITHUB_TOKEN', '')
    if not github_token:
        raise ValueError('GITHUB_TOKEN required')

    nuggets = []
    page = 1
    while True:
        url = f"https://api.github.com/user/repos?per_page=100&sort=created&direction=asc&affiliation=owner&page={page}"
        req = urllib.request.Request(url, headers={'Authorization': f'token {github_token}'})
        try:
            with urllib.request.urlopen(req, timeout=20) as r:
                repos = json.loads(r.read())
        except urllib.error.HTTPError as e:
            if e.code == 403:
                time.sleep(2)
                continue
            break
        except Exception:
            break
        if not repos or not isinstance(repos, list):
            break

        for r in repos:
            name = r.get('name', '')
            if name not in PRE_FIGURES:
                continue
            if r.get('fork') and name not in ('gno', 'open-webui'):
                continue

            pushed = r.get('pushed_at', '') or ''
            status = 'unknown'
            if pushed:
                try:
                    from datetime import datetime
                    last = datetime.fromisoformat(pushed.replace('Z', '+00:00'))
                    age_days = (datetime.now(last.tzinfo) - last).days
                    if age_days < 30:
                        status = 'active'
                    elif age_days < 180:
                        status = 'recent'
                    elif age_days < 365:
                        status = 'dormant'
                    else:
                        status = 'archived'
                except Exception:
                    pass

            n = Nugget(
                name=name,
                description=(r.get('description') or '')[:200],
                created_at=(r.get('created_at') or '')[:10],
                pushed_at=pushed[:10],
                language=r.get('language') or '?',
                stars=r.get('stargazers_count') or 0,
                topics=r.get('topics') or [],
                pre_figures=PRE_FIGURES[name],
                status=status,
            )
            nuggets.append(n)
        page += 1
        if page > 10:
            break

    return nuggets


def format_nuggets(nuggets: list) -> str:
    """Format the fleet archaeology report."""
    lines = ['=' * 78, 'FLEET ARCHAEOLOGY — Pre-cursor Nuggets', '=' * 78, '']
    by_status = {}
    for n in nuggets:
        by_status.setdefault(n.status, []).append(n)

    for status in ['active', 'recent', 'dormant', 'archived', 'unknown']:
        group = by_status.get(status, [])
        if not group:
            continue
        lines.append(f'## {status.upper()} ({len(group)} repos)')
        lines.append('')
        for n in sorted(group, key=lambda x: -x.stars):
            lines.append(f'### {n.name} ⭐{n.stars} ({n.language})')
            lines.append(f'  Created: {n.created_at}, Pushed: {n.pushed_at}')
            lines.append(f'  Description: {n.description}')
            lines.append(f'  Pre-figures:')
            for pf in n.pre_figures:
                lines.append(f'    - {pf}')
            lines.append('')

    candidates = sorted([n for n in nuggets if n.status in ('dormant', 'archived')],
                       key=lambda x: -len(x.pre_figures))
    if candidates:
        lines.append('## REVIVAL CANDIDATES (dormant/archived with most pre-figurations)')
        lines.append('')
        for n in candidates[:10]:
            lines.append(f'  {n.name} ⭐{n.stars} ({n.language}) -- {len(n.pre_figures)} pre-figurations')

    return '\n'.join(lines)


if __name__ == '__main__':
    nuggets = scan_fleet()
    print(format_nuggets(nuggets))
    with open('/workspace/research/cargo-line-tycoon/fleet_archaeology/fleet_nuggets.json', 'w') as f:
        json.dump([n.__dict__ for n in nuggets], f, indent=2)
    print(f'\nSaved {len(nuggets)} nuggets to fleet_nuggets.json')
