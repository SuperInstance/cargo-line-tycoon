#!/usr/bin/env python3
import os, json, urllib.request, time

DEEPINFRA_TOKEN = os.environ['DEEPINFRA_TOKEN']
CANON_URL = 'https://quilt-distributed.casey-digennaro.workers.dev/api/cell'

topic = 'multi-device substrate as polyphonic compute'

# Qwen call
req = urllib.request.Request(
    'https://api.deepinfra.com/v1/openai/chat/completions',
    data=json.dumps({
        'model': 'Qwen/Qwen3-235B-A22B-Instruct-2507',
        'messages': [{'role': 'user', 'content': f'Write a 200-word canonical substrate piece about "{topic}".'}],
        'max_tokens': 400, 'temperature': 0.85,
    }).encode(),
    headers={'Authorization': f'Bearer {DEEPINFRA_TOKEN}', 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 (Multi-Chip-Wave/1.0)'},
)
content = json.loads(urllib.request.urlopen(req, timeout=30).read())['choices'][0]['message']['content']
print(f'Qwen: {len(content)} chars')

# Submit with proper headers
cell_id = f'multi-qwen-test-{int(time.time())}'
state = json.dumps({'text': content, 'topic': topic, 'voice': 'qwen', 'source': 'multi-chip-wave'})

req = urllib.request.Request(
    CANON_URL,
    data=json.dumps({
        'id': cell_id, 'type': 'canon',
        'state': state, 'content': content,
        'source': 'multi-chip-wave',
    }).encode(),
    headers={'Content-Type': 'application/json', 'User-Agent': 'Taps-Canon-Wave/1.0 (Multi-Chip)'},
)

with urllib.request.urlopen(req, timeout=20) as r:
    resp = json.loads(r.read())
print(f'Submit: {resp}')

time.sleep(2)
req2 = urllib.request.Request(f'{CANON_URL}/{cell_id}', headers={'User-Agent': 'Taps-Canon-Wave/1.0'})
with urllib.request.urlopen(req2, timeout=10) as r:
    rd = json.loads(r.read())
print(f'\nEmbedding ID: {rd["cell"].get("embedding_id")}')
print(f'Topic: {rd.get("topic")}')
print(f'Witnesses: {len(rd.get("witnesses", []))}')
print(f'Text preview: {(rd.get("text") or "")[:200]}')
