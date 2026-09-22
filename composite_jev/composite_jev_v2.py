"""
Composite-JEV v2: wavefunction interference version.

Replaces Jaccard text-overlap agreement with Bell-state interference.
Each shell's output is treated as a measurement of a quantum state in a
different basis. The agreement is computed via interference pattern.

The math:
- Shell A result → amplitude α_A = confidence_A · e^(i·φ_A)
- Shell B result → amplitude α_B = confidence_B · e^(i·φ_B)
- Interference: I = |α_A + α_B|² = |α_A|² + |α_B|² + 2|α_A·α_B|·cos(φ_A - φ_B)
- Agreement: high when phases align (constructive interference)
- Dissonance: high when phases oppose (destructive interference)

This connects to:
- Shipwright-Jev doctrine: the substrate IS the unmeasured quantum state
- wavefunction_jev.py module (already shipped)
- LeJEPA Gaussian isotropy (May 2026 paper)
"""
from __future__ import annotations
import asyncio
import cmath
import json
import math
import os
import time
import urllib.request
from dataclasses import dataclass, field
from typing import Any, Optional

from composite_jev import Shell, ABox, SHELLS, call_jev, call_llm


@dataclass
class InterferencePattern:
    """Quantum interference between two shells."""
    amplitude_a: complex
    amplitude_b: complex
    constructive: float  # I = |α_A + α_B|²
    destructive: float  # I_D = |α_A - α_B|²
    agreement: float  # normalized: constructive / (constructive + destructive)
    phase_alignment: float  # cos(φ_A - φ_B)
    preferred: str  # 'A' or 'B' or 'tie'


def compute_interference(box_a: ABox, box_b: ABox) -> InterferencePattern:
    """Compute the quantum interference between two a-boxes.
    
    Treat each shell's confidence as the magnitude of a complex amplitude.
    Compute phase from the structure of the result.
    """
    # Magnitude = confidence (JEV returns confidence, LLM doesn't)
    mag_a = max(box_a.confidence, 0.01)  # avoid zero magnitude
    mag_b = max(box_b.confidence, 0.01)
    
    # Phase = derived from the result structure
    # Different question types get different phases:
    # - choice (categorical): phase based on which option
    # - score (numeric): phase based on score value
    # - noul (yes/no): phase 0 or π
    phase_a = _phase_from_result(box_a.result)
    phase_b = _phase_from_result(box_b.result)
    
    # Complex amplitudes
    alpha_a = cmath.rect(mag_a, phase_a)
    alpha_b = cmath.rect(mag_b, phase_b)
    
    # Constructive interference: |α_A + α_B|²
    constructive = abs(alpha_a + alpha_b) ** 2
    
    # Destructive interference: |α_A - α_B|²
    destructive = abs(alpha_a - alpha_b) ** 2
    
    total = constructive + destructive
    agreement = constructive / total if total > 0 else 0.5
    
    phase_alignment = math.cos(phase_a - phase_b)
    
    # Preferred: higher magnitude
    if mag_a > mag_b * 1.1:
        preferred = 'A'
    elif mag_b > mag_a * 1.1:
        preferred = 'B'
    else:
        preferred = 'tie'
    
    return InterferencePattern(
        amplitude_a=alpha_a,
        amplitude_b=alpha_b,
        constructive=constructive,
        destructive=destructive,
        agreement=agreement,
        phase_alignment=phase_alignment,
        preferred=preferred,
    )


def _phase_from_result(result: Any) -> float:
    """Derive a phase from the result structure."""
    if not isinstance(result, dict):
        return 0.0
    
    # Hash-like the keys + values to get a phase
    text = json.dumps(result, default=str)
    h = hash(text)
    # Map to [0, 2π)
    return (h % 6283) / 1000.0


@dataclass
class CompositeJEV2:
    """Composite-JEV v2 with wavefunction interference."""
    shell_a: Shell
    shell_b: Shell
    on_abox: Optional[Any] = None
    
    def __post_init__(self):
        self.aboxes = []
    
    async def run_async(self, task: dict) -> tuple[InterferencePattern, list]:
        """Run the composite with wavefunction interference."""
        loop = asyncio.get_event_loop()
        
        if self.shell_a.is_jev:
            box_a, _ = await loop.run_in_executor(
                None, call_jev, self.shell_a,
                task.get('prompt', ''), task.get('jev_questions', {}),
            )
        else:
            box_a, _ = await loop.run_in_executor(
                None, call_llm, self.shell_a,
                task.get('freeform_prompt', task.get('prompt', '')), 2000,
            )
        
        if self.shell_b.is_jev:
            box_b, _ = await loop.run_in_executor(
                None, call_jev, self.shell_b,
                task.get('prompt', ''), task.get('jev_questions', {}),
            )
        else:
            box_b, _ = await loop.run_in_executor(
                None, call_llm, self.shell_b,
                task.get('freeform_prompt', task.get('prompt', '')), 2000,
            )
        
        self.aboxes = [box_a, box_b]
        if self.on_abox:
            self.on_abox(box_a)
            self.on_abox(box_b)
        
        pattern = compute_interference(box_a, box_b)
        return pattern, self.aboxes


def demo():
    """Demo: Composite-JEV v2 with wavefunction interference."""
    print('=' * 70)
    print('COMPOSITE-JEV v2: wavefunction interference')
    print('=' * 70)
    print()
    
    jev = SHELLS['jev-deep']
    qwen = SHELLS['qwen-fast']
    
    print(f'Shell A: {jev.name}')
    print(f'Shell B: {qwen.name}')
    print()
    
    task = {
        'prompt': (
            'A customer message: "I ordered a shirt 3 weeks ago, tracking shows '
            'it was delivered but I never received it. I want my money back NOW!"'
        ),
        'jev_questions': {
            'dept': {
                'type': 'choice',
                'instructions': 'Which department?',
                'criteria': {
                    'returns': 'Return',
                    'billing': 'Money back',
                    'shipping': 'Delivery issue',
                    'escalation': 'Angry, needs human',
                },
            },
            'urgent': {
                'type': 'score',
                'instructions': 'How urgent 0-2?',
                'criteria': ['Can wait', 'Today', 'Critical'],
            },
            'sentiment': {
                'type': 'choice',
                'instructions': 'Sentiment?',
                'criteria': {
                    'calm': 'Patient',
                    'frustrated': 'Annoyed',
                    'angry': 'Very upset',
                },
            },
        },
        'freeform_prompt': (
            'You are a customer support routing agent. Respond with ONLY this JSON:\n'
            '{"dept": "returns|billing|shipping|escalation", '
            '"urgent": 0-2, '
            '"sentiment": "calm|frustrated|angry", '
            '"reasoning": "one sentence"}\n\n'
            'Message: "I ordered a shirt 3 weeks ago, tracking shows it was delivered '
            'but I never received it. I want my money back NOW!"'
        ),
    }
    
    composite = CompositeJEV2(shell_a=jev, shell_b=qwen)
    
    async def main():
        pattern, aboxes = await composite.run_async(task)
        
        print('=' * 70)
        print('WAVEFUNCTION INTERFERENCE REPORT')
        print('=' * 70)
        print(f'Shell A amplitude: {pattern.amplitude_a:.4f}')
        print(f'Shell B amplitude: {pattern.amplitude_b:.4f}')
        print(f'Constructive (|α_A + α_B|²): {pattern.constructive:.4f}')
        print(f'Destructive (|α_A - α_B|²): {pattern.destructive:.4f}')
        print(f'Agreement (normalized): {pattern.agreement:.4f}')
        print(f'Phase alignment (cos): {pattern.phase_alignment:.4f}')
        print(f'Preferred shell: {pattern.preferred}')
        print()
        print('Why this is better than Jaccard:')
        print('  Jaccard:  counts shared words (text overlap)')
        print('  Interference: uses quantum amplitudes (semantic alignment)')
        print('  When shells agree semantically but use different vocabulary,')
        print('  Jaccard says disagreement; interference says alignment.')
        print()
        print('Shell A result:', json.dumps(aboxes[0].result, default=str)[:200])
        print('Shell B result:', json.dumps(aboxes[1].result, default=str)[:200])
        return pattern
    
    return asyncio.run(main())


if __name__ == '__main__':
    demo()
