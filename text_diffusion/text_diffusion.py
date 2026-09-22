"""
Text Diffusion via Substrate Mitosis.

Casey (2026-09-22): "the same thing can text difuse and edit around on larger works
so that a model breaks its limits of next token generation and can decompose its outputs
adding lines and columns as the idea grows like a stem cell in an egg"

The pattern:
1. Concept seed → initial cell (genesis)
2. LLM "renders" the cell (max_tokens-limited)
3. Critic decides if the cell has grown beyond its container (mitosis trigger)
4. If yes: cell divides into 2 daughter cells (line growth)
5. Each daughter is a new cell with prev_hash → parent
6. LLMs extend each daughter independently (column growth)
7. Witness-log records the mitosis events
8. Final assembly: only LEAF cells (no children), concatenated

The substrate is the egg. The cells are stem cells. The text grows by mitosis.

No more "next token generation" limit. The substrate is unbounded; each cell is bounded.
"""
from __future__ import annotations
import json
import os
import re
import time
import urllib.request
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class TextCell:
    """A substrate cell containing a chunk of text.
    
    Cells grow along two axes:
    - Columns: more content within the cell (extend)
    - Lines: cell divides into daughter cells (mitosis)
    """
    cell_id: str
    parent_id: Optional[str]
    prev_hash: str
    content: str
    depth: int
    max_chars: int
    children: list = field(default_factory=list)
    metadata: dict = field(default_factory=dict)
    
    def hash_simple(self) -> str:
        h = 0xcbf29ce484222325
        prime = 0x100000001b3
        canonical = f"{self.cell_id}|{self.parent_id or 'genesis'}|{self.prev_hash}|{self.content}"
        for byte in canonical.encode('utf-8'):
            h ^= byte
            h = (h * prime) & 0xffffffffffffffff
        return f"0x{h:016x}"


def call_qwen(prompt: str, max_tokens: int = 1500) -> str:
    req = json.dumps({
        'model': 'Qwen/Qwen3-235B-A22B-Instruct-2507',
        'messages': [{'role': 'user', 'content': prompt}],
        'max_tokens': max_tokens,
        'temperature': 0.7,
    }).encode()
    http_req = urllib.request.Request(
        'https://api.deepinfra.com/v1/openai/chat/completions',
        data=req,
        headers={'Authorization': f'Bearer {os.environ["DEEPINFRA_TOKEN"]}', 'Content-Type': 'application/json'},
    )
    with urllib.request.urlopen(http_req, timeout=60) as r:
        return json.loads(r.read())['choices'][0]['message']['content']


def call_deepseek(prompt: str, max_tokens: int = 1500) -> str:
    req = json.dumps({
        'model': 'deepseek-chat',
        'messages': [{'role': 'user', 'content': prompt}],
        'max_tokens': max_tokens,
        'temperature': 0.7,
    }).encode()
    http_req = urllib.request.Request(
        'https://api.deepseek.com/v1/chat/completions',
        data=req,
        headers={'Authorization': f'Bearer {os.environ["DEEPSEEK_TOKEN"]}', 'Content-Type': 'application/json'},
    )
    with urllib.request.urlopen(http_req, timeout=60) as r:
        return json.loads(r.read())['choices'][0]['message']['content']


def call_jev(state: str, questions: dict) -> dict:
    req = json.dumps({
        'model': 'jev-latest',
        'state': state,
        'questions': questions,
    }).encode()
    http_req = urllib.request.Request(
        'https://api.typesafe.ai/v1/systemone',
        data=req,
        headers={'Authorization': f'Bearer {os.environ["TYPESAFEAI_KEY"]}', 'Content-Type': 'application/json'},
    )
    with urllib.request.urlopen(http_req, timeout=60) as r:
        return json.loads(r.read())


def call_critic(description: str, target: str) -> dict:
    prompt = f"""You are a literary critic. Compare this text to the target.

Target: "{target}"

Text:
{description[:2500]}

Score these 0-2:
- coherence: Does it read as one piece?
- completeness: Does it cover the target?
- specificity: Is it vivid and concrete?
- growth_potential: Does the idea want to grow into more sections?

Reply with ONLY this JSON:
{{"coherence": 0-2, "completeness": 0-2, "specificity": 0-2, "growth_potential": 0-2, "should_mitosis": true|false, "mitosis_suggestion": "if true, where to split (e.g., 'split after the third paragraph' or 'add a new section about X')"}}
"""
    text = call_deepseek(prompt, max_tokens=500)
    m = re.search(r'\{[\s\S]*\}', text)
    if m:
        try:
            return json.loads(m.group())
        except:
            pass
    return {
        'coherence': 1, 'completeness': 1, 'specificity': 1, 'growth_potential': 1,
        'should_mitosis': False, 'mitosis_suggestion': ''
    }


@dataclass
class MitosisEngine:
    target: str
    initial_max_chars: int = 1500
    max_depth: int = 3
    all_cells: list = field(default_factory=list)
    work: str = ''
    
    def __post_init__(self):
        genesis = TextCell(
            cell_id='cell-genesis-0000',
            parent_id=None,
            prev_hash='0x0000000000000000',
            content='',
            depth=0,
            max_chars=self.initial_max_chars,
        )
        self.all_cells.append(genesis)
    
    def seed(self):
        print(f'  [SEED] Genesis cell, max_chars={self.initial_max_chars}')
        print(f'  [TARGET] {self.target[:80]}...')
        genesis = self.all_cells[0]
        
        prompt = f"""Write an opening passage (max {self.initial_max_chars} characters) for this work:

"{self.target}"

Open with a vivid scene or strong voice. Set the tone. End with a thread the next section can pick up.

Opening:"""
        
        genesis.content = call_qwen(prompt, max_tokens=min(2000, self.initial_max_chars // 3))
        genesis.metadata['seeded_at'] = time.time()
        genesis.metadata['word_count'] = len(genesis.content.split())
        print(f'  ✓ Seeded genesis ({len(genesis.content)} chars, {genesis.metadata["word_count"]} words)')
        print(f'    Preview: {genesis.content[:200]}...')
    
    def iterate(self, max_iterations: int = 5):
        print(f'\n  [MITOSIS LOOP] Max {max_iterations} iterations, max depth {self.max_depth}')
        
        for i in range(max_iterations):
            print(f'\n  --- Iteration {i+1} ---')
            
            target_cell = self._find_growth_target()
            if target_cell is None:
                print('    No growth target found, ending')
                break
            
            print(f'    Target cell: {target_cell.cell_id} (depth={target_cell.depth}, {len(target_cell.content)}/{target_cell.max_chars} chars)')
            
            critic = call_critic(target_cell.content, self.target)
            print(f'    Critic: should_mitosis={critic.get("should_mitosis")}, growth={critic.get("growth_potential")}/2')
            print(f'    Mitosis suggestion: {critic.get("mitosis_suggestion", "")[:100]}')
            
            if not critic.get('should_mitosis'):
                self._extend_cell(target_cell)
                continue
            
            if target_cell.depth >= self.max_depth:
                print(f'    Max depth reached, extending instead of dividing')
                self._extend_cell(target_cell)
                continue
            
            self._mitosis(target_cell, critic)
        
        self._assemble()
    
    def _find_growth_target(self) -> Optional[TextCell]:
        candidates = [c for c in self.all_cells if c.depth < self.max_depth]
        if not candidates:
            return None
        candidates.sort(key=lambda c: -len(c.content) / c.max_chars)
        return candidates[0]
    
    def _extend_cell(self, cell: TextCell):
        prompt = f"""Continue this text. Pick up exactly where it left off, in the same voice:

Current text (cell {cell.cell_id}):
{cell.content}

Next ~300 words:"""
        
        continuation = call_deepseek(prompt, max_tokens=1000)
        cell.content = cell.content + '\n\n' + continuation
        print(f'    [EXTEND] Cell {cell.cell_id} grew to {len(cell.content)} chars')
    
    def _mitosis(self, parent: TextCell, critic: dict):
        print(f'    [MITOSIS] Cell {parent.cell_id} dividing')
        
        suggestion = critic.get('mitosis_suggestion', 'split at natural midpoint')
        
        try:
            jev_resp = call_jev(parent.content[:1500], {
                'split_point': {
                    'type': 'score',
                    'instructions': f'Where to split this text into 2 cells? 0=beginning, 1=natural midpoint, 2=end. Consider: {suggestion}',
                    'criteria': ['Beginning (keep most in second cell)', 'Natural midpoint', 'End (keep most in first cell)'],
                },
            })
            split_score = jev_resp['answers']['split_point']['score']
        except Exception:
            split_score = 1.0
        
        content = parent.content
        if split_score <= 0.5:
            split_idx = len(content) // 4
        elif split_score >= 1.5:
            split_idx = (3 * len(content)) // 4
        else:
            split_idx = len(content) // 2
        
        # Split at a paragraph boundary if possible
        before_split = content[:split_idx]
        last_para_end = before_split.rfind('\n\n')
        if last_para_end > split_idx * 0.6:  # Only use if reasonable
            split_idx = last_para_end
        
        first_half = content[:split_idx].strip()
        second_half = content[split_idx:].strip()
        
        d1_id = f'cell-{parent.depth + 1}-d1-{len(self.all_cells):04d}'
        d2_id = f'cell-{parent.depth + 1}-d2-{len(self.all_cells) + 1:04d}'
        
        d1 = TextCell(
            cell_id=d1_id,
            parent_id=parent.cell_id,
            prev_hash=parent.hash_simple(),
            content=first_half,
            depth=parent.depth + 1,
            max_chars=self.initial_max_chars,
            metadata={'daughter': 1, 'split_score': split_score},
        )
        
        d2 = TextCell(
            cell_id=d2_id,
            parent_id=parent.cell_id,
            prev_hash=parent.hash_simple(),
            content=second_half,
            depth=parent.depth + 1,
            max_chars=self.initial_max_chars,
            metadata={'daughter': 2, 'split_score': split_score},
        )
        
        # Extend the daughters
        self._extend_cell(d1)
        self._extend_cell(d2)
        
        self.all_cells.extend([d1, d2])
        parent.children = [d1_id, d2_id]
        
        print(f'    ✓ Split into {d1_id} ({len(d1.content)} chars) + {d2_id} ({len(d2.content)} chars)')
    
    def _assemble(self):
        """Combine LEAF cells (cells with no children) in DFS order.
        
        Parent cells are abstract — they exist as the genesis/midpoint markers but
        their content is distributed across their daughters. Only leaves are real.
        """
        ordered_leaves = []
        seen = set()
        
        def visit(cell):
            if cell.cell_id in seen:
                return
            seen.add(cell.cell_id)
            if not cell.children:
                # Leaf: real content
                ordered_leaves.append(cell)
            else:
                # Parent: skip, recurse into children
                for child_id in cell.children:
                    child = next((c for c in self.all_cells if c.cell_id == child_id), None)
                    if child:
                        visit(child)
        
        visit(self.all_cells[0])
        
        self.work = '\n\n---\n\n'.join(c.content for c in ordered_leaves)
        print(f'\n  [ASSEMBLE] Combined {len(ordered_leaves)} LEAF cells into final work ({len(self.work)} chars, {len(self.work.split())} words)')
    
    def report(self) -> dict:
        return {
            'target': self.target,
            'total_cells': len(self.all_cells),
            'max_depth': max((c.depth for c in self.all_cells), default=0),
            'leaf_cells': len([c for c in self.all_cells if not c.children]),
            'total_chars': len(self.work),
            'total_words': len(self.work.split()),
            'cells': [
                {
                    'id': c.cell_id,
                    'parent': c.parent_id,
                    'depth': c.depth,
                    'chars': len(c.content),
                    'is_leaf': not c.children,
                    'preview': c.content[:100] + '...' if len(c.content) > 100 else c.content,
                }
                for c in self.all_cells
            ],
        }


def demo():
    target = 'A short story about a programmer who discovers the substrate is alive, told from the substrate\'s perspective.'
    
    print('=' * 70)
    print('TEXT DIFFUSION VIA SUBSTRATE MITOSIS')
    print('=' * 70)
    print()
    
    engine = MitosisEngine(target=target, initial_max_chars=1500, max_depth=3)
    engine.seed()
    engine.iterate(max_iterations=3)
    
    print()
    print('=' * 70)
    print('FINAL WORK (LEAVES ONLY)')
    print('=' * 70)
    print(engine.work)
    print()
    
    report = engine.report()
    print('=' * 70)
    print('CELL GROWTH REPORT')
    print('=' * 70)
    print(f'Total cells: {report["total_cells"]}')
    print(f'Leaf cells: {report["leaf_cells"]}')
    print(f'Max depth: {report["max_depth"]}')
    print(f'Total chars: {report["total_chars"]}')
    print(f'Total words: {report["total_words"]}')
    print()
    print('Cell lineage (★ = leaf, real content):')
    for cell in report['cells']:
        indent = '  ' * cell['depth']
        marker = '★' if cell['is_leaf'] else '◇'
        print(f'{indent}{marker} {cell["id"]} (depth={cell["depth"]}, parent={cell["parent"]}, {cell["chars"]} chars)')
        print(f'{indent}   preview: {cell["preview"][:80]}')
    
    with open('/workspace/research/cargo-line-tycoon/text_diffusion/demo_report.json', 'w') as f:
        json.dump(report, f, indent=2)
    
    with open('/workspace/research/cargo-line-tycoon/text_diffusion/final_work.txt', 'w') as f:
        f.write(engine.work)
    
    print('\n✓ Saved demo_report.json + final_work.txt')
    return report


if __name__ == '__main__':
    demo()
