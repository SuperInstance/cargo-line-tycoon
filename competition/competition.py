"""Multi-agent friendly competition framework.

Casey (2026-09-22): 'have agents work in friendly competition for the best quality code,
documentation, playtesting and further research and novel ideas to experiment and test'

The competition IS the substrate:
- Every task becomes a substrate cell
- Every submission becomes a canon entry
- Every result is peer-judged or scorer-judged
- Every agent's work is preserved (no-deletion doctrine)

Available agents (13 currently configured):
- LLM agents: deepseek, qwen, kimi (via DeepInfra), zai (when balance available)
- Infrastructure: github, notion, cloudflare, npmjs, crates, pypi, elevenlabs
- Substrate: kev (TYPESAFEAI), modular (when Discord access)
"""
from __future__ import annotations
import json
import os
import time
import urllib.request
import urllib.error
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class Agent:
    name: str
    specialty: str
    env_key: str
    endpoint: str = ''
    model: str = ''
    role: str = ''  # for non-LLM agents
    strengths: str = ''
    status: str = 'unknown'
    cost: str = ''
    
    def is_llm(self) -> bool:
        return bool(self.endpoint)


@dataclass
class CompetitionTask:
    task_id: str
    title: str
    description: str
    task_type: str  # 'code', 'docs', 'playtest', 'research', 'idea'
    rubric: dict = field(default_factory=dict)  # scoring criteria
    required_agents: list = field(default_factory=list)  # which agents to compete
    substrate_cell_id: Optional[str] = None
    
    def to_dict(self) -> dict:
        return {
            'task_id': self.task_id,
            'title': self.title,
            'description': self.description,
            'task_type': self.task_type,
            'rubric': self.rubric,
            'required_agents': self.required_agents,
        }


@dataclass
class Submission:
    task_id: str
    agent_name: str
    content: str
    score: Optional[float] = None
    feedback: str = ''
    latency_ms: float = 0
    cost_usd: float = 0
    substrate_cell_id: Optional[str] = None
    
    def to_dict(self) -> dict:
        return {
            'task_id': self.task_id,
            'agent': self.agent_name,
            'score': self.score,
            'feedback': self.feedback,
            'latency_ms': self.latency_ms,
            'content_preview': self.content[:200] + '...' if len(self.content) > 200 else self.content,
        }


# Agent roster (matches /tmp/agent_roster.py)
AGENTS = {
    'deepseek': Agent(
        name='deepseek', specialty='code', env_key='DEEPSEEK_TOKEN',
        endpoint='https://api.deepseek.com/v1/chat/completions',
        model='deepseek-chat',
        strengths='code generation, refactoring, debugging',
        cost='$0.14/M in, $0.28/M out',
    ),
    'qwen': Agent(
        name='qwen', specialty='general', env_key='DEEPINFRA_TOKEN',
        endpoint='https://api.deepinfra.com/v1/openai/chat/completions',
        model='Qwen/Qwen3-235B-A22B-Instruct-2507',
        strengths='general reasoning, long context, multilingual',
        cost='$0.20/M in',
    ),
    'kimi': Agent(
        name='kimi', specialty='reasoning', env_key='DEEPINFRA_TOKEN',
        endpoint='https://api.deepinfra.com/v1/openai/chat/completions',
        model='moonshotai/Kimi-K2.6',
        strengths='long reasoning, doctrinal prompts',
        cost='$0.50/M in',
    ),
    'zai': Agent(
        name='zai', specialty='creative', env_key='ZAI_TOKEN',
        endpoint='https://api.z.ai/api/paas/v4/chat/completions',
        model='glm-4.5',
        strengths='creative writing, ideation, poetic phrasing',
        cost='$0.20/M in',
        status='low_balance',
    ),
    'github': Agent(
        name='github', specialty='git_ops', env_key='GITHUB_TOKEN',
        role='create repos, PRs, issues, releases',
    ),
    'notion': Agent(
        name='notion', specialty='docs', env_key='NOTION_TOKEN',
        role='long-form docs, structured wikis',
    ),
    'cloudflare': Agent(
        name='cloudflare', specialty='infra', env_key='CLOUDFLARE_TOKEN',
        role='Workers, Pages, Vectorize, R2, Durable Objects',
    ),
    'npmjs': Agent(
        name='npmjs', specialty='publish_js', env_key='NPMJS_TOKEN',
        role='publish npm packages',
    ),
    'crates': Agent(
        name='crates', specialty='publish_rs', env_key='CRATES_TOKEN',
        role='publish Rust crates',
    ),
    'pypi': Agent(
        name='pypi', specialty='publish_py', env_key='PYPI_TOKEN',
        role='publish Python packages',
    ),
    'elevenlabs': Agent(
        name='elevenlabs', specialty='tts', env_key='ELEVENLABS_TOKEN',
        role='text-to-speech narration',
    ),
    'kev': Agent(
        name='kev', specialty='substrate', env_key='TYPESAFEAI_KEY',
        role='substrate interweave, decision model',
    ),
    'modular': Agent(
        name='modular', specialty='gpu_native', env_key='MINIMAX_KEY',
        role='Mojo compile, GPU kernels, vendor-universal',
    ),
}


def call_llm(agent: Agent, prompt: str, max_tokens: int = 2000, temperature: float = 0.7) -> tuple[str, float]:
    """Call an LLM agent. Returns (content, latency_seconds)."""
    if not agent.is_llm():
        raise ValueError(f"{agent.name} is not an LLM agent")
    
    key = os.environ[agent.env_key]
    if not key:
        raise ValueError(f"env var {agent.env_key} is empty")
    
    if agent.name == 'gemini':
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{agent.model}:generateContent?key={key}"
        data = {"contents": [{"parts": [{"text": prompt}]}], "generationConfig": {"maxOutputTokens": max_tokens}}
        req = urllib.request.Request(
            url, data=json.dumps(data).encode(),
            headers={"Content-Type": "application/json"},
        )
    else:
        url = agent.endpoint
        data = {"model": agent.model, "messages": [{"role": "user", "content": prompt}], "max_tokens": max_tokens, "temperature": temperature}
        req = urllib.request.Request(
            url, data=json.dumps(data).encode(),
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        )
    
    t0 = time.time()
    with urllib.request.urlopen(req, timeout=60) as r:
        resp = json.loads(r.read())
    t1 = time.time()
    
    if 'choices' in resp:
        msg = resp['choices'][0].get('message', {})
        return msg.get('content', ''), t1 - t0
    elif 'candidates' in resp:
        parts = resp['candidates'][0].get('content', {}).get('parts', [])
        return parts[0].get('text', '') if parts else '', t1 - t0
    else:
        raise ValueError(f"Unexpected response shape: {resp}")


def run_competition(task: CompetitionTask, agent_names: list[str], judges: list[str] = None) -> list[Submission]:
    """Run a friendly competition. Multiple agents solve the same task.
    
    Args:
        task: The competition task
        agent_names: Which agents to run
        judges: Which agents judge the submissions (defaults to all)
    
    Returns:
        List of submissions, sorted by score (descending)
    """
    submissions = []
    for name in agent_names:
        agent = AGENTS[name]
        if not agent.is_llm():
            continue
        # Each agent gets a competition-style prompt
        prompt = f"""You are competing in a friendly competition. Your task:

TASK: {task.title}
TYPE: {task.task_type}

DESCRIPTION:
{task.description}

RUBRIC (how you'll be scored):
{json.dumps(task.rubric, indent=2)}

Submit your best work. Be original, be precise, be useful.
Make your submission complete — partial work won't win.

Submit your response as a complete, well-formed answer to the task."""
        
        try:
            content, latency = call_llm(agent, prompt, max_tokens=4000)
            submissions.append(Submission(
                task_id=task.task_id,
                agent_name=name,
                content=content,
                latency_ms=latency * 1000,
            ))
            print(f"  ✓ {name}: {latency:.1f}s, {len(content)} chars")
        except Exception as e:
            print(f"  ✗ {name}: {type(e).__name__}: {e}")
            submissions.append(Submission(
                task_id=task.task_id,
                agent_name=name,
                content='',
                feedback=f'ERROR: {e}',
            ))
    
    # Score each submission (using first available judge agent, default = qwen)
    judge_name = (judges or ['qwen'])[0]
    judge = AGENTS[judge_name]
    
    for s in submissions:
        if not s.content:
            s.score = 0
            s.feedback = 'empty submission'
            continue
        try:
            judge_prompt = f"""You are a judge in a friendly competition. Score this submission.

TASK: {task.title}
RUBRIC: {json.dumps(task.rubric)}

SUBMISSION BY {s.agent_name}:
---
{s.content[:6000]}
---

Give a score from 0.0 to 1.0 and a brief rationale. Reply in JSON:
{{"score": 0.X, "rationale": "..."}}"""
            score_text, _ = call_llm(judge, judge_prompt, max_tokens=500, temperature=0.2)
            # Extract JSON
            import re
            m = re.search(r'\{[^}]*\}', score_text)
            if m:
                score_data = json.loads(m.group())
                s.score = float(score_data.get('score', 0.5))
                s.feedback = score_data.get('rationale', '')[:200]
        except Exception as e:
            s.score = 0.5
            s.feedback = f'judge error: {e}'
    
    submissions.sort(key=lambda s: -(s.score or 0))
    return submissions


if __name__ == "__main__":
    # Demo: friendly competition between DeepSeek + Qwen + Kimi
    task = CompetitionTask(
        task_id='demo-1',
        title='Best one-line description of the substrate',
        description=(
            'The substrate is a 4D cell graph where each cell is the irreducible unit. '
            'Three views of the same graph (TOP/FONT/SIDE). 11-opcode algebra. '
            'Write the single most evocative sentence describing what the substrate is.'
        ),
        task_type='idea',
        rubric={
            'evocativeness': 'Does it capture the essence?',
            'precision': 'Is it accurate, not vague?',
            'memorability': 'Would someone remember it tomorrow?',
        },
    )
    
    print(f"Competition: {task.title}")
    print(f"  Type: {task.task_type}")
    print(f"  Agents: deepseek, qwen, kimi\nn")
    
    submissions = run_competition(task, ['deepseek', 'qwen', 'kimi'])
    
    print(f"\nResults:")
    for i, s in enumerate(submissions, 1):
        print(f"\n  #{i} {s.agent_name} (score: {s.score:.2f})")
        print(f"    Latency: {s.latency_ms:.0f}ms")
        print(f"    Feedback: {s.feedback[:100]}")
        print(f"    Submission: {s.content[:150]}{'...' if len(s.content) > 150 else ''}")
