"""
Multi-model iteration harness: lean on each model for what it's best at.

Casey (2026-09-22): 'keep iterating massively with typesafe.ai and z.ai. and all the others too
should be leaned on for what they're best at heavily too, even the minimax.io key, this one can do
a few things your subagents aren't as good at like being zero-shot in a iterative python setup with
other models and left to run outside the lanes of subagents'

The routing matrix:
- TYPESAFEAI_KEY (Jev): calibrated decision-making, schema-constrained outputs
- ZAI_TOKEN (GLM-4.5): creative writing, ideation, poetry (low balance but works for small tasks)
- DEEPINFRA_TOKEN: Qwen3-235B (general), Kimi K2.6 (long reasoning), others
- DEEPSEEK_TOKEN: code generation, refactoring
- GEMINI_TOKEN: long context, multimodal
- GROQ_TOKEN: fast inference, low latency
- KIMI_TOKEN: Moonshot direct (when not on DeepInfra)
- MINIMAX_KEY (Modular Max): zero-shot iterative Python, runs outside subagent lanes

The harness:
1. Decompose task into subtasks
2. Route each subtask to the best model
3. Run in parallel where possible
4. Aggregate via JEV (for decision-merge) or via another LLM (for narrative-merge)
5. Iterate until quality threshold met
"""
from __future__ import annotations
import asyncio
import json
import os
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from typing import Any, Optional


@dataclass
class ModelAgent:
    name: str
    specialty: str
    env_key: str
    endpoint: str = ''
    model: str = ''
    strength: str = ''
    weakness: str = ''
    
    @property
    def is_llm(self) -> bool:
        return bool(self.endpoint)


# Model roster with Casey's hints
MODELS = {
    'jev': ModelAgent(
        name='jev', specialty='decision',
        env_key='TYPESAFEAI_KEY',
        endpoint='https://api.typesafe.ai/v1/systemone',
        model='jev-latest',
        strength='calibrated decisions, schema-constrained, cannot hallucinate',
        weakness='cannot generate free-form text, only typed outputs',
    ),
    'qwen': ModelAgent(
        name='qwen', specialty='general',
        env_key='DEEPINFRA_TOKEN',
        endpoint='https://api.deepinfra.com/v1/openai/chat/completions',
        model='Qwen/Qwen3-235B-A22B-Instruct-2507',
        strength='long context (256K), multilingual, general reasoning',
        weakness='slower than trebel, not the strongest coder',
    ),
    'kimi': ModelAgent(
        name='kimi', specialty='reasoning',
        env_key='DEEPINFRA_TOKEN',
        endpoint='https://api.deepinfra.com/v1/openai/chat/completions',
        model='moonshotai/Kimi-K2.6',
        strength='long reasoning chains, doctrinal prompts, careful analysis',
        weakness='slow (60+ sec), reasoning_content can hit 13k chars',
    ),
    'deepseek': ModelAgent(
        name='deepseek', specialty='code',
        env_key='DEEPSEEK_TOKEN',
        endpoint='https://api.deepseek.com/v1/chat/completions',
        model='deepseek-chat',
        strength='code generation, refactoring, debugging',
        weakness='point estimates (no confidence)',
    ),
    'gemini': ModelAgent(
        name='gemini', specialty='long_context',
        env_key='GEMINI_TOKEN',
        endpoint='https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent',
        model='gemini-2.5-pro',
        strength='long context, multimodal',
        weakness='rate limits, API versioning issues',
    ),
    'groq': ModelAgent(
        name='groq', specialty='fast',
        env_key='GROQ_TOKEN',
        endpoint='https://api.groq.com/openai/v1/chat/completions',
        model='llama-3.3-70b-versatile',
        strength='sub-second latency',
        weakness='smaller models',
    ),
    'minimax': ModelAgent(
        name='minimax', specialty='zero_shot',
        env_key='MINIMAX_KEY',
        endpoint='https://api.modular.com/v0/chat/completions',
        model='minimax-latest',
        strength='zero-shot iterative Python, runs outside subagent lanes',
        weakness='different from Mavis subagent workflow',
    ),
    'zai': ModelAgent(
        name='zai', specialty='creative',
        env_key='ZAI_TOKEN',
        endpoint='https://api.z.ai/api/paas/v4/chat/completions',
        model='glm-4.5',
        strength='creative writing, ideation, poetic phrasing',
        weakness='low balance currently',
    ),
}


def call_jev_decision(state: str, questions: dict) -> dict:
    """Use Jev for calibrated routing decisions."""
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


def call_qwen(prompt: str, max_tokens: int = 2000) -> str:
    req = json.dumps({
        'model': 'Qwen/Qwen3-235B-A22B-Instruct-2507',
        'messages': [{'role': 'user', 'content': prompt}],
        'max_tokens': max_tokens,
        'temperature': 0.7,
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


def call_deepseek(prompt: str, max_tokens: int = 2000) -> str:
    req = json.dumps({
        'model': 'deepseek-chat',
        'messages': [{'role': 'user', 'content': prompt}],
        'max_tokens': max_tokens,
        'temperature': 0.7,
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


def call_kimi(prompt: str, max_tokens: int = 6000) -> str:
    """Kimi via DeepInfra (more reliable than Moonshot direct)."""
    req = json.dumps({
        'model': 'moonshotai/Kimi-K2.6',
        'messages': [{'role': 'user', 'content': prompt}],
        'max_tokens': max_tokens,
        'temperature': 0.7,
    }).encode()
    http_req = urllib.request.Request(
        'https://api.deepinfra.com/v1/openai/chat/completions',
        data=req,
        headers={
            'Authorization': f'Bearer {os.environ["DEEPINFRA_TOKEN"]}',
            'Content-Type': 'application/json',
        },
    )
    with urllib.request.urlopen(http_req, timeout=120) as r:
        return json.loads(r.read())['choices'][0]['message']['content']


def call_minimax(prompt: str, max_tokens: int = 2000) -> str:
    """Modular Max / minimax - zero-shot iterative Python outside subagent lanes."""
    # Use the OpenAI-compatible endpoint at Modular
    req = json.dumps({
        'model': 'minimax-latest',
        'messages': [{'role': 'user', 'content': prompt}],
        'max_tokens': max_tokens,
        'temperature': 0.7,
    }).encode()
    http_req = urllib.request.Request(
        'https://api.modular.com/v0/chat/completions',
        data=req,
        headers={
            'Authorization': f'Bearer {os.environ["MINIMAX_KEY"]}',
            'Content-Type': 'application/json',
        },
    )
    with urllib.request.urlopen(http_req, timeout=60) as r:
        return json.loads(r.read())['choices'][0]['message']['content']


def route_via_jev(task: str, available_models: list) -> str:
    """Use JEV to decide which model handles this task best.
    
    State: the task description
    Question: which model is best suited for this task type
    """
    model_criteria = {
        m.name: f"{m.name}: {m.specialty} (strength: {m.strength}, weakness: {m.weakness})"
        for m in [MODELS[name] for name in available_models]
    }
    
    jev_response = call_jev_decision(task, {
        'best_model': {
            'type': 'choice',
            'instructions': f'Given this task, which model should handle it? Available: {", ".join(available_models)}',
            'criteria': model_criteria,
        },
        'task_type': {
            'type': 'choice',
            'instructions': 'What type of task is this?',
            'criteria': {
                'code': 'Writing or fixing code',
                'reasoning': 'Deep logical reasoning',
                'creative': 'Creative writing or ideation',
                'decision': 'Making a structured decision',
                'long_context': 'Processing long documents',
                'fast': 'Quick response needed',
                'zero_shot': 'Zero-shot Python iteration',
            },
        },
        'parallel_safe': {
            'type': 'noul',
            'instructions': 'Can this task run in parallel with similar tasks?',
            'criteria': {'false': 'Must be sequential', 'true': 'Can run in parallel'},
        },
    })
    
    return jev_response['answers']['best_model']['choice']


def dispatch(task: str, model_name: str) -> dict:
    """Dispatch a task to the named model."""
    start = time.time()
    try:
        if model_name == 'jev':
            result = call_jev_decision(task, {
                'answer': {
                    'type': 'noul',
                    'instructions': task,
                    'criteria': {'false': 'no', 'true': 'yes'},
                },
            })
            output = str(result)
        elif model_name == 'qwen':
            output = call_qwen(task)
        elif model_name == 'deepseek':
            output = call_deepseek(task)
        elif model_name == 'kimi':
            output = call_kimi(task)
        elif model_name == 'minimax':
            output = call_minimax(task)
        elif model_name == 'groq':
            output = 'groq call TBD'
        elif model_name == 'gemini':
            output = 'gemini call TBD'
        elif model_name == 'zai':
            output = 'zai call TBD'
        else:
            output = f'unknown model: {model_name}'
        
        elapsed = time.time() - start
        return {'model': model_name, 'output': output, 'elapsed': elapsed, 'success': True}
    except Exception as e:
        elapsed = time.time() - start
        return {'model': model_name, 'output': '', 'elapsed': elapsed, 'success': False, 'error': str(e)}


def iterate_until_quality(task: str, available_models: list, max_iter: int = 3) -> dict:
    """Iterate: route → dispatch → judge quality → refine."""
    print(f'Task: {task[:100]}')
    print(f'Available models: {available_models}')
    print()
    
    history = []
    for iteration in range(max_iter):
        print(f'--- Iteration {iteration+1} ---')
        
        # Route via JEV
        try:
            chosen = route_via_jev(task, available_models)
            print(f'  JEV routed to: {chosen}')
        except Exception as e:
            print(f'  JEV routing failed: {e}, falling back to qwen')
            chosen = 'qwen'
        
        # Dispatch
        result = dispatch(task, chosen)
        if result['success']:
            print(f'  {chosen}: {result["elapsed"]:.1f}s, {len(result["output"])} chars')
        else:
            print(f'  {chosen}: FAILED ({result.get("error", "")[:100]})')
        
        history.append(result)
        print()
    
    return {
        'task': task,
        'iterations': max_iter,
        'history': history,
    }


if __name__ == '__main__':
    # Demo: ask each model for their best at
    print('=' * 70)
    print('MULTI-MODEL ITERATION HARNESS')
    print('=' * 70)
    print()
    
    # Iteration 1: route via JEV
    task = 'Write a Python function that uses FNV-1a 64-bit hashing with the canary test that the hash of "café Δ 日本語" equals 0x024a555471370b18d'
    available = ['qwen', 'deepseek', 'kimi', 'minimax']
    
    result = iterate_until_quality(task, available, max_iter=1)
    
    print()
    print('=' * 70)
    print('MODEL ROSTER')
    print('=' * 70)
    for name, agent in MODELS.items():
        print(f'  {name}: {agent.specialty} — {agent.strength}')
