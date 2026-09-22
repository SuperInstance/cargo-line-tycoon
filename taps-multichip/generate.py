#!/usr/bin/env python3
"""Generate canon pieces in parallel via 3 voices, submit to live canon."""
import os, sys, json, time, urllib.request, concurrent.futures as cf

ZAI_TOKEN = os.environ['ZAI_TOKEN']
DEEPINFRA_TOKEN = os.environ['DEEPINFRA_TOKEN']
KIMI_TOKEN = os.environ['KIMI_TOKEN']

# Live canon endpoint
CANON_URL = 'https://quilt-distributed.casey-digennaro.workers.dev/api/cell'
WITNESS_URL = 'https://quilt-distributed.casey-digennaro.workers.dev/api/canon/attest'

# Topics for the multi-chip wave
TOPICS = [
    'multi-device substrate as polyphonic compute',
    'WebNN graph partitioning across CPU-GPU-NPU',
    'the irreducible core under heterogeneous compute',
    'witness-log as cross-device consensus',
    'JEV waves over heterogeneous substrates',
    'cell-graph renders with WebGPU compute',
    'AI++ spreadsheet runs across RTX, iGPU, NPU',
    'task pruning under multi-device sharding',
    'Memory Sandbox execution across chips',
    'three forms of evidence on multi-device systems',
]

def call_zai(topic, idx):
    """ZAI GLM-4.5 via api.z.ai"""
    try:
        req = urllib.request.Request(
            'https://api.z.ai/api/paas/v4/chat/completions',
            data=json.dumps({
                'model': 'glm-4.5',
                'messages': [{
                    'role': 'user',
                    'content': f'Write a 200-word canonical substrate piece about "{topic}". Use substrate terms naturally (cells, witness-log, JEV, FNV-1a, prev_hash, opcodes, multi-device). Be specific and quotable.',
                }],
                'max_tokens': 400,
                'temperature': 0.85,
            }).encode(),
            headers={
                'Authorization': f'Bearer {ZAI_TOKEN}',
                'Content-Type': 'application/json',
            },
        )
        with urllib.request.urlopen(req, timeout=30) as r:
            data = json.loads(r.read())
            return data['choices'][0]['message']['content']
    except Exception as e:
        return f'ZAI_ERROR: {e}'

def call_qwen(topic, idx):
    """Qwen3-235B via DeepInfra"""
    try:
        req = urllib.request.Request(
            'https://api.deepinfra.com/v1/openai/chat/completions',
            data=json.dumps({
                'model': 'Qwen/Qwen3-235B-A22B-Instruct-2507',
                'messages': [{
                    'role': 'user',
                    'content': f'Write a 200-word canonical substrate piece about "{topic}". Use substrate terms naturally (cells, witness-log, JEV, FNV-1a, prev_hash, opcodes, multi-device). Be specific and quotable.',
                }],
                'max_tokens': 400,
                'temperature': 0.85,
            }).encode(),
            headers={
                'Authorization': f'Bearer {DEEPINFRA_TOKEN}',
                'Content-Type': 'application/json',
            },
        )
        with urllib.request.urlopen(req, timeout=60) as r:
            data = json.loads(r.read())
            return data['choices'][0]['message']['content']
    except Exception as e:
        return f'QWEN_ERROR: {e}'

def call_kimi(topic, idx):
    """Kimi K2.6 via DeepInfra"""
    try:
        req = urllib.request.Request(
            'https://api.deepinfra.com/v1/openai/chat/completions',
            data=json.dumps({
                'model': 'moonshotai/Kimi-K2-Instruct',
                'messages': [{
                    'role': 'user',
                    'content': f'Write a 200-word canonical substrate piece about "{topic}". Use substrate terms naturally (cells, witness-log, JEV, FNV-1a, prev_hash, opcodes, multi-device). Be specific and quotable.',
                }],
                'max_tokens': 4000,  # Kimi reasoning_content budget
                'temperature': 0.85,
            }).encode(),
            headers={
                'Authorization': f'Bearer {DEEPINFRA_TOKEN}',
                'Content-Type': 'application/json',
            },
        )
        with urllib.request.urlopen(req, timeout=120) as r:
            data = json.loads(r.read())
            return data['choices'][0]['message']['content']
    except Exception as e:
        return f'KIMI_ERROR: {e}'

def submit_to_canon(topic, content, voice):
    """Submit the canon piece to live canon via /api/cell"""
    try:
        cell_id = f'multi-{voice}-{int(time.time())}-{hash(topic) % 1000:03d}'
        state = json.dumps({'text': content, 'topic': topic, 'voice': voice, 'source': 'multi-chip-wave'})
        req = urllib.request.Request(
            CANON_URL,
            data=json.dumps({
                'id': cell_id,
                'type': 'canon',
                'state': state,
                'source': 'multi-chip-wave',
            }).encode(),
            headers={'Content-Type': 'application/json'},
        )
        with urllib.request.urlopen(req, timeout=20) as r:
            data = json.loads(r.read())
            return cell_id, data
    except Exception as e:
        return None, f'CANON_ERROR: {e}'

def process(topic_idx):
    topic = TOPICS[topic_idx]
    print(f'[{topic_idx}] {topic}')
    results = {}
    # Run all 3 voices in parallel
    with cf.ThreadPoolExecutor(max_workers=3) as ex:
        fut_zai = ex.submit(call_zai, topic, topic_idx)
        fut_qwen = ex.submit(call_qwen, topic, topic_idx)
        fut_kimi = ex.submit(call_kimi, topic, topic_idx)
        
        results['zai'] = fut_zai.result()
        results['qwen'] = fut_qwen.result()
        results['kimi'] = fut_kimi.result()
    
    # Submit each to canon
    submissions = {}
    for voice, content in results.items():
        if content and not content.endswith('_ERROR:'):
            cell_id, resp = submit_to_canon(topic, content, voice)
            submissions[voice] = {'cell_id': cell_id, 'response': resp}
            print(f'  {voice}: {cell_id} ({len(content)} chars)')
    
    return {
        'topic': topic,
        'results': results,
        'submissions': submissions,
    }

if __name__ == '__main__':
    # Run all topics in parallel
    print(f'=== Multi-Chip Canon Wave ===')
    print(f'Veoices: ZAI (GLM-4.5), Qwen (235B), Kimi (K2.6)')
    print(f'Topics: {len(TOPICS)}')
    print()
    
    with cf.ThreadPoolExecutor(max_workers=10) as ex:
        all_futs = [ex.submit(process, i) for i in range(len(TOPICS))]
        all_results = [f.result() for f in cf.as_completed(all_futs)]
    
    # Write a combined markdown
    md = '# Multi-Chip Canon Wave\n\n'
    for r in all_results:
        md += f'## {r["topic"]}\n\n'
        for voice in ['zai', 'qwen', 'kimi']:
            if voice in r['results']:
                content = r['results'][voice]
                if content and not content.endswith('_ERROR:'):
                    md += f'### {voice.upper()}\n\n{content}\n\n'
        md += '---\n\n'
    
    with open('multi-chip-wave.md', 'w') as f:
        f.write(md)
    print(f'\n✓ Wrote multi-chip-wave.md ({len(md)} chars)')
    
    # Stats
    total = len(all_results)
    successful_submits = sum(1 for r in all_results for v, s in r['submissions'].items() if s['cell_id'])
    print(f'✓ {successful_submits}/{total*3} cells submitted to canon')
