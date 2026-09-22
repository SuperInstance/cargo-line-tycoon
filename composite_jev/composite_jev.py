"""
CompositeJEV: Cross-pollination of composite-headspace + JEV substrate.

Maps:
- composite-headspace's two parallel shells → JEV (deep, calibrated) + Qwen/DeepSeek (fast)
- Frequency bands → agent specialties
- Symmetry-Dissonance loop → judge agent scoring
- T-minus cueing → parallel agent dispatch with phase offsets
- a-box emission → substrate cell records
- Headspace = JEV session + free-form LLM responses, fused

This is the "friendly competition" framework from Casey's 2026-09-22 request.
"""
from __future__ import annotations
import asyncio
import json
import os
import time
import urllib.request
from dataclasses import dataclass, field
from typing import Any, Optional


@dataclass
class Shell:
    """A cognitive agent shell. Mirrors composite-headspace's ShellAgent."""
    id: str
    name: str
    frequency: str  # sub-bass|bass|mid|treble|ultrasonic
    timbre: str  # model family
    env_key: str
    endpoint: str
    model: str
    latency_ms: int = 0
    
    @property
    def is_jev(self) -> bool:
        return 'typesafe' in self.endpoint or 'systemone' in self.endpoint


@dataclass
class ABox:
    """a-box emission from a shell. The result + context."""
    shell_id: str
    timestamp_ms: int
    result: Any
    confidence: float = 0.0  # JEV-style calibrated
    reasoning: str = ''  # free-form
    latency_ms: float = 0.0


# Standard shell presets (mirror composite-headspace's TIMBRE_PRESETS)
SHELLS = {
    'jev-deep': Shell(
        id='shell-jev', name='JEV (sub-bass deep architect)',
        frequency='sub-bass',
        timbre='calibrated-decision-model',
        env_key='TYPESAFEAI_KEY',
        endpoint='https://api.typesafe.ai/v1/systemone',
        model='jev-latest',
        latency_ms=3000,
    ),
    'qwen-fast': Shell(
        id='shell-qwen', name='Qwen (treble pattern matcher)',
        frequency='treble',
        timbre='fast-pattern-matcher',
        env_key='DEEPINFRA_TOKEN',
        endpoint='https://api.deepinfra.com/v1/openai/chat/completions',
        model='Qwen/Qwen3-235B-A22B-Instruct-2507',
        latency_ms=200,
    ),
    'deepseek-mid': Shell(
        id='shell-deepseek', name='DeepSeek (mid balanced)',
        frequency='mid',
        timbre='balanced-critic',
        env_key='DEEPSEEK_TOKEN',
        endpoint='https://api.deepseek.com/v1/chat/completions',
        model='deepseek-chat',
        latency_ms=600,
    ),
    'kimi-reasoning': Shell(
        id='shell-kimi', name='Kimi (bass slow reasoner)',
        frequency='bass',
        timbre='slow-reasoning',
        env_key='DEEPINFRA_TOKEN',
        endpoint='https://api.deepinfra.com/v1/openai/chat/completions',
        model='moonshotai/Kimi-K2.6',
        latency_ms=1500,
    ),
}


def call_jev(shell: Shell, state: str, questions: dict) -> tuple[ABox, float]:
    """Call JEV. Returns (a-box, latency_seconds)."""
    t0 = time.time()
    req = json.dumps({
        'model': shell.model,
        'state': state,
        'questions': questions,
    }).encode()
    http_req = urllib.request.Request(
        shell.endpoint,
        data=req,
        headers={
            'Authorization': f'Bearer {os.environ[shell.env_key]}',
            'Content-Type': 'application/json',
        },
    )
    with urllib.request.urlopen(http_req, timeout=60) as r:
        resp = json.loads(r.read())
    elapsed = time.time() - t0
    
    # Convert JEV response to a-box
    answers = resp.get('answers', {})
    confidences = []
    for q_id, ans in answers.items():
        if 'confidence' in ans:
            confidences.append(ans['confidence'])
        elif 'noul' in ans:
            confidences.append(max(ans['noul'], 1 - ans['noul']))
        elif 'probabilities' in ans:
            probs = list(ans['probabilities'].values())
            confidences.append(max(probs))
    
    avg_conf = sum(confidences) / len(confidences) if confidences else 0.0
    
    return ABox(
        shell_id=shell.id,
        timestamp_ms=int(time.time() * 1000),
        result=answers,
        confidence=avg_conf,
        reasoning=f"JEV model {resp.get('model', shell.model)}",
        latency_ms=elapsed * 1000,
    ), elapsed


def call_llm(shell: Shell, prompt: str, max_tokens: int = 2000) -> tuple[ABox, float]:
    """Call a free-form LLM. Returns (a-box, latency_seconds)."""
    t0 = time.time()
    req = json.dumps({
        'model': shell.model,
        'messages': [{'role': 'user', 'content': prompt}],
        'max_tokens': max_tokens,
        'temperature': 0.7,
    }).encode()
    http_req = urllib.request.Request(
        shell.endpoint,
        data=req,
        headers={
            'Authorization': f'Bearer {os.environ[shell.env_key]}',
            'Content-Type': 'application/json',
        },
    )
    with urllib.request.urlopen(http_req, timeout=60) as r:
        resp = json.loads(r.read())
    elapsed = time.time() - t0
    
    content = resp['choices'][0]['message']['content']
    
    return ABox(
        shell_id=shell.id,
        timestamp_ms=int(time.time() * 1000),
        result={'text': content},
        confidence=0.0,  # LLM doesn't return confidence
        reasoning=content[:300],
        latency_ms=elapsed * 1000,
    ), elapsed


@dataclass
class SymmetryReport:
    """Result of the symmetry analysis between two a-boxes."""
    shell_a: str
    shell_b: str
    agreement_score: float  # 0-1
    dissonance: list  # points of disagreement
    synthesis: str  # the fused insight
    preferred_shell: str  # which one to trust more
    substrate_cell_id: Optional[str] = None


def symmetry_detect(box_a: ABox, box_b: ABox, task: str) -> SymmetryReport:
    """Detect agreement/dissonance between two shells."""
    # Simple heuristic — count shared keywords / values
    text_a = json.dumps(box_a.result, default=str).lower()
    text_b = json.dumps(box_b.result, default=str).lower()
    
    words_a = set(text_a.split())
    words_b = set(text_b.split())
    
    if not words_a or not words_b:
        agreement = 0.0
    else:
        intersection = words_a & words_b
        union = words_a | words_b
        agreement = len(intersection) / len(union) if union else 0.0
    
    # Preferred shell = higher confidence
    if box_a.confidence > box_b.confidence:
        preferred = box_a.shell_id
    elif box_b.confidence > box_a.confidence:
        preferred = box_b.shell_id
    else:
        preferred = 'tie'
    
    # Simple synthesis
    synthesis = (
        f"Agreement: {agreement:.2f}. "
        f"Shell A ({box_a.shell_id}) confidence: {box_a.confidence:.2f}. "
        f"Shell B ({box_b.shell_id}) confidence: {box_b.confidence:.2f}. "
        f"Preferred: {preferred}."
    )
    
    return SymmetryReport(
        shell_a=box_a.shell_id,
        shell_b=box_b.shell_id,
        agreement_score=agreement,
        dissonance=[],  # could be enriched
        synthesis=synthesis,
        preferred_shell=preferred,
    )


@dataclass
class CompositeJEV:
    """Cross-pollination: composite-headspace architecture + JEV substrate."""
    shell_a: Shell
    shell_b: Shell
    phase_delta: float = 0.3  # seconds offset
    on_abox: Optional[Any] = None
    
    def __post_init__(self):
        self.aboxes = []
        self.start_time = None
    
    async def run_async(self, task: dict) -> SymmetryReport:
        """Run the composite headspace on a task.
        
        task = {
            'prompt': str,  # the question
            'jev_questions': dict,  # questions for JEV (calibrated)
            'freeform_prompt': str,  # prompt for the free-form LLM
        }
        """
        self.start_time = time.time()
        
        # Cue both shells with t-minus (parallel)
        box_a, t_a = await self._cue_shell(self.shell_a, task)
        box_b, t_b = await self._cue_shell(self.shell_b, task)
        
        self.aboxes.extend([box_a, box_b])
        if self.on_abox:
            self.on_abox(box_a)
            self.on_abox(box_b)
        
        # Run symmetry detection
        report = symmetry_detect(box_a, box_b, task.get('prompt', ''))
        
        # TODO: post to substrate worker
        # cell_id = post_to_substrate({...})
        # report.substrate_cell_id = cell_id
        
        return report
    
    async def _cue_shell(self, shell: Shell, task: dict) -> tuple[ABox, float]:
        """Cue a shell. JEV shells get calibrated questions, others get freeform."""
        loop = asyncio.get_event_loop()
        if shell.is_jev:
            return await loop.run_in_executor(
                None,
                call_jev,
                shell,
                task.get('prompt', ''),
                task.get('jev_questions', {}),
            )
        else:
            return await loop.run_in_executor(
                None,
                call_llm,
                shell,
                task.get('freeform_prompt', task.get('prompt', '')),
                2000,
            )


def demo():
    """Demo: composite JEV on a real task."""
    print('=' * 70)
    print('COMPOSITE-JEV: composite-headspace × JEV substrate')
    print('=' * 70)
    print()
    
    # Define shells
    jev = SHELLS['jev-deep']
    qwen = SHELLS['qwen-fast']
    
    print(f'Shell A: {jev.name} (t-minus 0)')
    print(f'Shell B: {qwen.name} (t-minus 0)')
    print()
    
    # Define task
    task = {
        'prompt': (
            'A customer message: "I ordered a shirt 3 weeks ago, tracking shows '
            'it was delivered but I never received it. I want my money back NOW!"'
        ),
        'jev_questions': {
            'dept': {
                'type': 'choice',
                'instructions': 'Which department should handle this?',
                'criteria': {
                    'returns': 'Customer wants to return a product',
                    'billing': 'Customer wants money back',
                    'shipping': 'Customer has questions about delivery',
                    'escalation': 'Customer is angry and needs a human supervisor',
                },
            },
            'urgent': {
                'type': 'score',
                'instructions': 'How urgent is this on a scale 0-2?',
                'criteria': ['Can wait a week', 'Needs attention today', 'Critical escalation'],
            },
            'sentiment': {
                'type': 'choice',
                'instructions': 'What is the customer sentiment?',
                'criteria': {
                    'calm': 'Patient or neutral',
                    'frustrated': 'Somewhat annoyed',
                    'angry': 'Very upset, may churn',
                },
            },
        },
        'freeform_prompt': (
            'You are a customer support routing agent. Analyze this message and '
            'respond with ONLY this JSON:\n'
            '{"dept": "returns|billing|shipping|escalation", '
            '"urgent": 0-2, '
            '"sentiment": "calm|frustrated|angry", '
            '"reasoning": "one sentence why"}\n\n'
            'Message: "I ordered a shirt 3 weeks ago, tracking shows it was delivered '
            'but I never received it. I want my money back NOW!"'
        ),
    }
    
    print(f'Task: {task["prompt"][:80]}...')
    print()
    
    # Run composite
    composite = CompositeJEV(shell_a=jev, shell_b=qwen)
    
    async def main():
        report = await composite.run_async(task)
        
        print()
        print('=' * 70)
        print('SYMMETRY REPORT')
        print('=' * 70)
        print(f'Shell A: {report.shell_a}')
        print(f'Shell B: {report.shell_b}')
        print(f'Agreement score: {report.agreement_score:.3f}')
        print(f'Preferred shell: {report.preferred_shell}')
        print(f'Synthesis: {report.synthesis}')
        print()
        print('Shell A (JEV) result:')
        print(json.dumps(composite.aboxes[0].result, indent=2)[:500])
        print()
        print('Shell B (Qwen) result:')
        result_b = composite.aboxes[1].result
        if isinstance(result_b, dict) and 'text' in result_b:
            print(result_b['text'][:500])
        else:
            print(json.dumps(result_b, indent=2)[:500])
        
        return report
    
    return asyncio.run(main())


if __name__ == '__main__':
    demo()
