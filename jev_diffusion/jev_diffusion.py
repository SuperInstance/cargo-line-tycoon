"""
JEV-Diffusion: image generation via substrate segmentation + LLM-as-GAN.

Casey (2026-09-22): 'Think about JEV as an aid to image generation. JEV diffusion using
quilt to segment and diffuse systematically with the help of LLMs and no actual image
generator. just periodic calls to the LLM as a GAN'

The pattern:
1. Take a target concept (e.g., "a sunset over a mountain lake with a cabin")
2. Use JEV to make structured decisions:
   - What regions does the image need? (sky, mountain, lake, cabin, foreground, etc.)
   - What's the mood? (warm, cold, dramatic, calm)
   - What's the color palette? (warm, cool, complementary)
3. The LLM "renders" each region as a detailed description
4. Combine into a single "image description"
5. Periodic LLM "critic" call: does this match the target? what's missing?
6. Iterate with periodic GAN-like calls

No actual image generator. The output is a refined text description that COULD be
passed to a real diffusion model — but the refinement loop is the interesting part.

This is substrate-first thinking:
- The cell graph IS the segmentation
- JEV decides what each cell should contain
- LLMs fill in the cells
- A final LLM combines them
- The critic loop is the diffusion
"""
from __future__ import annotations
import json
import os
import time
import urllib.request
from dataclasses import dataclass, field
from typing import Any, Optional


@dataclass
class SubstrateCell:
    """One cell in the image substrate."""
    cell_id: str
    region: str  # sky, mountain, lake, etc.
    position: tuple  # (x, y) or (row, col)
    jev_decision: dict = field(default_factory=dict)  # what JEV says
    llm_render: str = ''  # what the LLM describes
    critic_score: float = 0.0


@dataclass
class JevDiffusion:
    """A substrate-segmented image with periodic GAN-like refinement."""
    target: str
    cells: list = field(default_factory=list)
    iterations: int = 3
    
    def __post_init__(self):
        self.combined = ''
        self.history = []


def call_jev(state: str, questions: dict) -> dict:
    """Call TypeSafe AI / Jev."""
    req = json.dumps({
        'model': 'jev-latest',
        'state': state,
        'questions': questions,
    }).encode()
    http_req = urllib.request.Request(
        'https://api.typesafe.ai/v1/systemone',
        data=req,
        headers={
            'Authorization': f'Bearer {os.environ["TYPESAFEAI_KEY"]}',
            'Content-Type': 'application/json',
        },
    )
    with urllib.request.urlopen(http_req, timeout=60) as r:
        return json.loads(r.read())


def call_qwen(prompt: str, max_tokens: int = 1500) -> str:
    req = json.dumps({
        'model': 'Qwen/Qwen3-235B-A22B-Instruct-2507',
        'messages': [{'role': 'user', 'content': prompt}],
        'max_tokens': max_tokens,
        'temperature': 0.8,
    }).encode()
    http_req = urllib.request.Request(
        'https://api.deepinfra.com/v1/openai/chat/completions',
        data=req,
        headers={
            'Authorization': f'Bearer {os.environ["DEEPINFRA_TOKEN"]}',
            'Content-Type': 'application/json',
        },
    )
    with urllib.request.urlopen(http_req, timeout=60) as r:
        return json.loads(r.read())['choices'][0]['message']['content']


def call_deepseek(prompt: str, max_tokens: int = 1500) -> str:
    req = json.dumps({
        'model': 'deepseek-chat',
        'messages': [{'role': 'user', 'content': prompt}],
        'max_tokens': max_tokens,
        'temperature': 0.8,
    }).encode()
    http_req = urllib.request.Request(
        'https://api.deepseek.com/v1/chat/completions',
        data=req,
        headers={
            'Authorization': f'Bearer {os.environ["DEEPSEEK_TOKEN"]}',
            'Content-Type': 'application/json',
        },
    )
    with urllib.request.urlopen(http_req, timeout=60) as r:
        return json.loads(r.read())['choices'][0]['message']['content']


def jev_plan_image(target: str) -> dict:
    """Step 1: Use JEV to plan the image regions, mood, palette."""
    print(f'  [JEV] Planning image structure for: "{target[:60]}"')
    
    questions = {
        'regions': {
            'type': 'choice',
            'instructions': 'What compositional regions does this image need?',
            'criteria': {
                'single_subject': 'One main subject, simple composition',
                'landscape_horizon': 'Horizon-based landscape (sky + land)',
                'three_layer': 'Foreground, midground, background (3 layers)',
                'complex_scene': 'Multiple subjects, complex composition',
                'abstract': 'Abstract or non-representational',
            },
        },
        'mood': {
            'type': 'choice',
            'instructions': 'What is the overall mood?',
            'criteria': {
                'serene': 'Peaceful, calm, meditative',
                'dramatic': 'High contrast, intense, powerful',
                'mysterious': 'Dark, foggy, ambiguous',
                'joyful': 'Bright, vibrant, energetic',
                'melancholic': 'Wistful, autumnal, bittersweet',
            },
        },
        'palette': {
            'type': 'choice',
            'instructions': 'What color palette fits?',
            'criteria': {
                'warm': 'Oranges, reds, yellows (sunset, fire, warmth)',
                'cool': 'Blues, greens, purples (water, sky, cold)',
                'complementary': 'Opposite colors (orange-blue, red-green)',
                'monochromatic': 'Single hue with varying saturation',
                'earthy': 'Browns, ochres, sage (nature, autumn)',
            },
        },
        'lighting': {
            'type': 'score',
            'instructions': 'Light intensity 0=very dark, 2=bright noon',
            'criteria': ['Very dark (night)', 'Soft light (dawn/dusk)', 'Bright (noon)'],
        },
    }
    
    resp = call_jev(target, questions)
    answers = resp['answers']
    
    return {
        'regions': answers['regions']['choice'],
        'mood': answers['mood']['choice'],
        'palette': answers['palette']['choice'],
        'lighting': answers['lighting']['score'],
        'model': resp.get('model', 'jev-latest'),
        'confidences': {
            'regions': answers['regions']['confidence'],
            'mood': answers['mood']['confidence'],
            'palette': answers['palette']['confidence'],
            'lighting': answers['lighting']['confidence'],
        },
    }


def substrate_segment(plan: dict) -> list:
    """Step 2: Convert the plan into a substrate cell graph."""
    region_map = {
        'single_subject': ['subject', 'background', 'border'],
        'landscape_horizon': ['sky', 'horizon', 'land'],
        'three_layer': ['foreground', 'midground', 'background'],
        'complex_scene': ['subject1', 'subject2', 'subject3', 'space', 'ground'],
        'abstract': ['mass1', 'mass2', 'mass3', 'void'],
    }
    
    regions = region_map.get(plan['regions'], ['subject', 'background'])
    
    cells = []
    for i, region in enumerate(regions):
        cell = SubstrateCell(
            cell_id=f'cell-{i:02d}',
            region=region,
            position=(i, 0),  # row, col
        )
        cells.append(cell)
    return cells


def llm_render_cell(cell: SubstrateCell, plan: dict, target: str) -> str:
    """Step 3: Use an LLM to 'render' each cell as a description."""
    prompt = f"""You are rendering one cell of an image. The overall image is: "{target}"

The image plan:
- Composition: {plan['regions']}
- Mood: {plan['mood']}
- Palette: {plan['palette']}
- Lighting: {plan['lighting']} (0=dark, 2=bright)

This cell represents the **{cell.region}** region.

Write a 2-3 sentence vivid description of what should appear in this region.
Be specific: include colors, shapes, textures, lighting, mood.

Description:"""
    
    # Use different agents for different cells (parallel + competitive)
    if cell.cell_id.endswith('0') or cell.cell_id.endswith('3'):
        return call_qwen(prompt, max_tokens=400)
    else:
        return call_deepseek(prompt, max_tokens=400)


def llm_combine(cells: list, plan: dict, target: str) -> str:
    """Step 4: Use an LLM to combine all cell descriptions into a single image description."""
    cells_text = '\n\n'.join([
        f"**{c.region.upper()}** (position {c.position}): {c.llm_render}"
        for c in cells
    ])
    
    prompt = f"""You are composing the final image description from regional descriptions.

Target image: "{target}"
Plan: composition={plan['regions']}, mood={plan['mood']}, palette={plan['palette']}, lighting={plan['lighting']}

Regional descriptions:
{cells_text}

Now compose a unified 4-6 sentence image description that reads as a single coherent image.
Focus on visual coherence: how the regions relate, what the eye sees first, what the eye sees on second look.

Description:"""
    
    return call_qwen(prompt, max_tokens=800)


def llm_critic(image_desc: str, target: str) -> dict:
    """Step 5: Use an LLM as GAN-like critic. What's missing? What's wrong?"""
    prompt = f"""You are a visual critic. Compare the image description to the target.

Target: "{target}"

Image description:
{image_desc}

Score these aspects 0-2:
- composition_match: Does the composition match the target?
- mood_match: Does the mood match the target?
- specificity: Are colors, shapes, textures specific enough to be a real image?
- vividness: Would this description help generate a striking image?
- coherence: Do all the regions form a unified image?

Reply with ONLY this JSON:
{{"composition_match": 0-2, "mood_match": 0-2, "specificity": 0-2, "vividness": 0-2, "coherence": 0-2, "improvements": "what's missing or wrong"}}
"""
    
    text = call_deepseek(prompt, max_tokens=500)
    import re
    m = re.search(r'\{[\s\S]*\}', text)
    if m:
        return json.loads(m.group())
    return {'composition_match': 1, 'mood_match': 1, 'specificity': 1, 'vividness': 1, 'coherence': 1, 'improvements': text[:200]}


def refine_image(target: str, current_desc: str, critic: dict, plan: dict) -> str:
    """Refine based on critic feedback."""
    prompt = f"""You are refining an image description based on critic feedback.

Target: "{target}"
Current description: {current_desc}

Critic feedback:
- composition_match: {critic['composition_match']}/2
- mood_match: {critic['mood_match']}/2
- specificity: {critic['specificity']}/2
- vividness: {critic['vividness']}/2
- coherence: {critic['coherence']}/2
- improvements: {critic.get('improvements', 'none')}

Rewrite the image description, addressing the improvements. Make it more vivid,
specific, and matching the target mood/composition.

New description:"""
    
    return call_qwen(prompt, max_tokens=1000)


def jev_diffuse(target: str, iterations: int = 3) -> dict:
    """Run the full JEV-diffusion pipeline."""
    print('=' * 70)
    print(f'JEV-DIFFUSION: target = "{target}"')
    print('=' * 70)
    print()
    
    # Step 1: JEV plans
    plan = jev_plan_image(target)
    print(f"  Plan: composition={plan['regions']}, mood={plan['mood']}, palette={plan['palette']}, lighting={plan['lighting']}")
    print(f"  Confidences: regions={plan['confidences']['regions']:.2f}, mood={plan['confidences']['mood']:.2f}, palette={plan['confidences']['palette']:.2f}, lighting={plan['confidences']['lighting']:.2f}")
    print()
    
    # Step 2: Substrate segmentation
    cells = substrate_segment(plan)
    print(f"  [SUBSTRATE] Segmented into {len(cells)} cells: {[c.region for c in cells]}")
    print()
    
    # Step 3: LLM renders each cell
    print('  [LLM RENDER] Each cell rendered (alternating Qwen/DeepSeek)')
    for cell in cells:
        print(f"    {cell.cell_id} ({cell.region})...", end=' ')
        cell.llm_render = llm_render_cell(cell, plan, target)
        print(f'✓ ({len(cell.llm_render)} chars)')
    print()
    
    # Step 4: LLM combines
    print('  [LLM COMBINE] Combining cells into unified image description...')
    combined = llm_combine(cells, plan, target)
    print(f'    Initial description: {combined[:200]}...')
    print()
    
    # Step 5: Iterate (GAN-like refinement loop)
    print(f'  [CRITIC LOOP] Running {iterations} iterations of GAN-like refinement')
    for i in range(iterations):
        critic = llm_critic(combined, target)
        total = sum(critic.get(k, 1) for k in ['composition_match', 'mood_match', 'specificity', 'vividness', 'coherence'])
        print(f'    Iter {i+1}: scores={critic.get("composition_match")}/{critic.get("mood_match")}/{critic.get("specificity")}/{critic.get("vividness")}/{critic.get("coherence")} total={total}/10')
        print(f'      Improvements: {critic.get("improvements", "")[:150]}')
        
        if total >= 9:  # Good enough
            print('    ✓ Sufficient quality, stopping')
            break
        
        combined = refine_image(target, combined, critic, plan)
        print(f'    Refined: {combined[:200]}...')
        print()
    
    print()
    print('=' * 70)
    print('FINAL IMAGE DESCRIPTION')
    print('=' * 70)
    print(combined)
    print()
    
    return {
        'target': target,
        'plan': plan,
        'cells': [c.__dict__ for c in cells],
        'final_description': combined,
        'iterations': iterations,
    }


if __name__ == '__main__':
    target = 'A serene sunset over a mountain lake with a small wooden cabin reflected in the still water'
    
    result = jev_diffuse(target, iterations=3)
    
    # Save result
    with open('/workspace/research/cargo-line-tycoon/jev_diffusion/demo_result.json', 'w') as f:
        # Convert non-serializable
        def default(o):
            try:
                return o.__dict__
            except:
                return str(o)
        json.dump(result, f, indent=2, default=default)
    print('Saved to demo_result.json')
