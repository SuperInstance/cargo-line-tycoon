#!/usr/bin/env python3
"""Quick canon wave: ZAI + Qwen only (Kimi too slow for batch)."""
import os, json, urllib.request, concurrent.futures as cf, time

ZAI_TOKEN = os.environ['ZAI_TOKEN']
DEEPINFRA_TOKEN = os.environ['DEEPINFRA_TOKEN']
CANON_URL = 'https://quilt-distributed.casey-digennaro.workers.dev/api/cell'

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

def call_zai(topic):
    req = urllib.request.Request(
        'https://api.z.ai/api/paas/v4/chat/completions',
        data=json.dumps({
            'model': 'glm-4.5',
            'messages': [{'role': 'user', 'content': f'Write a 200-word canonical substrate piece about "{topic}". Use substrate terms naturally. Be specific and quotable.'}],
            'max_tokens': 400, 'temperature': 0.85,
        }).encode(),
        headers={'Authorization': f'Bearer {ZAI_TOKEN}', 'Content-Type': 'application/json'},
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.loads(r.read())['choices'][0]['message']['content']
    except Exception as e:
        return None

def call_qwen(topic):
    req = urllib.request.Request(
        'https://api.deepinfra.com/v1/openai/chat/completions',
        data=json.dumps({
            'model': 'Qwen/Qwen3-235B-A22B-Instruct-2507',
            'messages': [{'role': 'user', 'content': f'Write a 200-word canonical substrate piece about "{topic}". Use substrate terms naturally. Be specific and quotable.'}],
            'max_tokens': 400, 'temperature': 0.85,
        }).encode(),
        headers={'Authorization': f'Bearer {DEEPINFRA_TOKEN}', 'Content-Type': 'application/json'},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read())['choices'][0]['message']['content']
    except Exception as e:
        return None

def submit(cell_id, text, topic, voice):
    state = json.dumps({'text': text, 'topic': topic, 'voice': voice, 'source': 'multi-chip-wave'})
    req = urllib.request.Request(
        CANON_URL,
        data=json.dumps({'id': cell_id, 'type': 'canon', 'state': state, 'source': 'multi-chip-wave'}).encode(),
        headers={'Content-Type': 'application/json'},
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.loads(r.read())
    except Exception as e:
        return {'error': str(e)}

print(f'=== Quick Multi-Chip Canon Wave ({len(TOPICS)} topics × 2 voices) ===')

# Run all (topic, voice) pairs in parallel - up to 5 at a time
jobs = []
for t in TOPICS:
    jobs.append(('zai', t))
    jobs.append(('qwen', t))

def job(args):
    voice, topic = args
    if voice == 'zai':
        content = call_zai(topic)
    else:
        content = call_qwen(topic)
    if not content:
        return (voice, topic, None, None)
    cell_id = f'multi-{voice}-{int(time.time()*1000) % 10**8}'
    resp = submit(cell_id, content, topic, voice)
    return (voice, topic, content[:100], resp.get('ok'))

with cf.ThreadPoolExecutor(max_workers=4) as ex:
    results = list(ex.map(job, jobs))

success = sum(1 for r in results if r[3])
print(f'✓ {success}/{len(results)} cells submitted to canon')

for voice, topic, content, ok in results:
    status = '✓' if ok else '✗'
    print(f'  {status} {voice:5s} {topic[:40]:40s} {(content or "(no content)")[:60]}')
