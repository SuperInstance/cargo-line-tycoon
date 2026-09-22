"""Run a real friendly competition with multiple agents.

Tests multiple LLM agents on the same canonical task and scores with a judge.
"""
import sys
sys.path.insert(0, '/workspace/research/cargo-line-tycoon/competition')
import json, os, time, urllib.request, urllib.error


def call_jev(state: str, questions: dict) -> dict:
    """Call TypeSafe AI / Jev with a properly formatted SystemOneRequest."""
    req = {
        'model': 'jev-latest',
        'state': state,
        'questions': questions,
    }
    req_json = json.dumps(req)
    http_req = urllib.request.Request(
        'https://api.typesafe.ai/v1/systemone',
        data=req_json.encode(),
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
        resp = json.loads(r.read())
    return resp['choices'][0]['message']['content']


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
        resp = json.loads(r.read())
    return resp['choices'][0]['message']['content']


def run_competition():
    """Real competition: customer support routing."""
    state = (
        "Customer message: 'I ordered a shirt 3 weeks ago, tracking shows it was delivered "
        "but I never received it. I want my money back NOW, this is unacceptable!'"
    )
    
    print("=" * 70)
    print("COMPETITION: customer support routing")
    print(f"State: {state[:80]}...")
    print("=" * 70)
    print()
    
    # Agent 1: JEV (TypeSafe AI) — calibrated decision model
    print("[1/3] JEV (TypeSafe AI / jev-latest)...")
    t0 = time.time()
    try:
        jev_resp = call_jev(state, {
            'dept': {
                'type': 'choice',
                'instructions': 'Which department should handle this customer message?',
                'criteria': {
                    'returns': 'Customer wants to return a product',
                    'billing': 'Customer wants money back',
                    'shipping': 'Customer has questions about delivery/tracking',
                    'escalation': 'Customer is angry and needs a human supervisor',
                },
            },
            'urgent': {
                'type': 'score',
                'instructions': 'How urgent is this on a scale 0-2?',
                'criteria': ['Can wait a week', 'Needs attention today', 'Critical escalation'],
            },
            'refund_requested': {
                'type': 'noul',
                'instructions': 'Is the customer requesting a refund?',
                'criteria': {'false': 'Not requesting', 'true': 'Explicitly requesting refund'},
            },
            'customer_sentiment': {
                'type': 'choice',
                'instructions': 'What is the overall sentiment of the customer?',
                'criteria': {
                    'calm': 'Patient or neutral',
                    'frustrated': 'Somewhat annoyed',
                    'angry': 'Very upset, may churn',
                },
            },
        })
        jev_time = time.time() - t0
        print(f"  ✓ JEV responded in {jev_time:.1f}s")
        print(f"  dept: {jev_resp['answers']['dept']['choice']} (conf {jev_resp['answers']['dept']['confidence']:.2f})")
        print(f"  urgent: {jev_resp['answers']['urgent']['score']} (conf {jev_resp['answers']['urgent']['confidence']:.2f})")
        print(f"  refund_requested: {jev_resp['answers']['refund_requested']['noul']:.2f}")
        print(f"  sentiment: {jev_resp['answers']['customer_sentiment']['choice']}")
    except Exception as e:
        print(f"  ✗ JEV failed: {e}")
        jev_resp = None
    print()
    
    # Agent 2: Qwen (DeepInfra)
    print("[2/3] Qwen (DeepInfra)...")
    qwen_prompt = f"""You are a customer support routing agent. Analyze this customer message and respond with JSON.

Customer message: {state}

Respond with ONLY this JSON shape:
{{
  "dept": "returns|billing|shipping|escalation",
  "urgent": 0-2,
  "refund_requested": true/false,
  "sentiment": "calm|frustrated|angry",
  "reasoning": "one sentence why"
}}"""
    t0 = time.time()
    try:
        qwen_text = call_qwen(qwen_prompt)
        qwen_time = time.time() - t0
        print(f"  ✓ Qwen responded in {qwen_time:.1f}s")
        # Try to parse the JSON
        import re
        m = re.search(r'\{[\s\S]*\}', qwen_text)
        if m:
            qwen_resp = json.loads(m.group())
            print(f"  dept: {qwen_resp.get('dept')}")
            print(f"  urgent: {qwen_resp.get('urgent')}")
            print(f"  refund_requested: {qwen_resp.get('refund_requested')}")
            print(f"  sentiment: {qwen_resp.get('sentiment')}")
            print(f"  reasoning: {qwen_resp.get('reasoning', '')[:100]}")
        else:
            print(f"  ⚠ Could not parse JSON, raw response:")
            print(f"  {qwen_text[:200]}")
            qwen_resp = None
    except Exception as e:
        print(f"  ✗ Qwen failed: {e}")
        qwen_resp = None
    print()
    
    # Agent 3: DeepSeek
    print("[3/3] DeepSeek...")
    deepseek_prompt = qwen_prompt  # same prompt
    t0 = time.time()
    try:
        ds_text = call_deepseek(deepseek_prompt)
        ds_time = time.time() - t0
        print(f"  ✓ DeepSeek responded in {ds_time:.1f}s")
        m = re.search(r'\{[\s\S]*\}', ds_text)
        if m:
            ds_resp = json.loads(m.group())
            print(f"  dept: {ds_resp.get('dept')}")
            print(f"  urgent: {ds_resp.get('urgent')}")
            print(f"  refund_requested: {ds_resp.get('refund_requested')}")
            print(f"  sentiment: {ds_resp.get('sentiment')}")
            print(f"  reasoning: {ds_resp.get('reasoning', '')[:100]}")
        else:
            print(f"  ⚠ Could not parse JSON, raw response:")
            print(f"  {ds_text[:200]}")
            ds_resp = None
    except Exception as e:
        print(f"  ✗ DeepSeek failed: {e}")
        ds_resp = None
    print()
    
    # Comparison summary
    print("=" * 70)
    print("COMPARISON SUMMARY")
    print("=" * 70)
    print(f"{'Field':<22} {'JEV':<20} {'Qwen':<20} {'DeepSeek':<20}")
    print("-" * 70)
    
    fields = ['dept', 'urgent', 'refund_requested', 'sentiment']
    for field in fields:
        jev_val = jev_resp['answers'].get(field, {}).get('choice') if field != 'urgent' and field != 'refund_requested' else jev_resp['answers'].get(field, {}).get('score' if field == 'urgent' else 'noul') if jev_resp else '?'
        qwen_val = qwen_resp.get(field, '?') if qwen_resp else '?'
        ds_val = ds_resp.get(field, '?') if ds_resp else '?'
        jev_str = f"{jev_val:.2f}" if isinstance(jev_val, float) else str(jev_val)[:20]
        print(f"{field:<22} {jev_str:<20} {str(qwen_val)[:20]:<20} {str(ds_val)[:20]:<20}")
    
    print()
    print("Note: JEV returns calibrated probabilities. Qwen/DeepSeek return point estimates.")
    print("This is the CUDACLAW difference: JEV runs in parallel cells, others do single shots.")
    print()
    
    return {
        'jev': jev_resp,
        'qwen': qwen_resp,
        'deepseek': ds_resp,
    }


if __name__ == '__main__':
    results = run_competition()
    
    # Save results
    with open('/workspace/research/cargo-line-tycoon/competition/results.json', 'w') as f:
        # Convert non-JSON-serializable
        def default(o):
            try:
                return o.__dict__
            except:
                return str(o)
        json.dump(results, f, indent=2, default=default)
    print(f"✓ Saved to competition/results.json")
