# JEV as Director — The Substrate-Backed Pedagogical Loop

In OpenMAIC, the Director is an LLM call that decides who speaks next. In cargo-line-tycoon, the Director is **JEV applied to the locale's pedagogical canon**, producing typed probabilistic decisions.

## The Director state machine

```
Every 5 seconds (TICK):
  1. Read witness-logs of all agent rooms (VIEW)
  2. Read last N student observations
  3. JEV.decide(
       options = agent personas in the active locale canon,
       rubric = pedagogical framing's turn-taking rules,
     )
  4. Emit Signal(kind=director, target=chosen_agent) on the locale's chain
  5. TICK advance one round
```

The Director is a *loop over the substrate*. It does not bypass the substrate; it IS the substrate, running in a particular mode.

## Concrete: a Director in Python

```python
import jev
from clt_substrate import LocaleClassroom, SignalTypes, fnv1a64

class DirectorLoop:
    """The pedagogical director — JEV-driven, locale-aware.
    
    Replaces OpenMAIC's LangGraph Director with a typed-decision loop
    over the Quilt substrate.
    """
    
    PUNCTUATION_FRAMINGS = {
        # Each locale declares WHEN the director intervenes
        'socratic':  { 'interrupt_after_ms': 30_000, 'debate_first': True  },
        'confucian':{ 'interrupt_after_ms': 90_000, 'debate_first': False },  # elders finish
        'ubuntu':   { 'interrupt_after_ms': 45_000, 'debate_first': True  },
        'whakaako': { 'interrupt_after_ms': 60_000, 'debate_first': True  },
    }
    
    def __init__(self, classroom: LocaleClassroom):
        self.classroom = classroom
        self.framing = classroom.pedagogicalFraming()
        self.punct = self.PUNCTUATION_FRAMINGS.get(self.framing, self.PUNCTUATION_FRAMINGS['socratic'])
    
    def who_speaks_next(self, last_n_observations: list) -> dict:
        """JEV decision: which agent persona speaks next.
        
        last_n_observations: list of student observation cells, most recent first.
        Returns: {agent_id, reason, trust}
        """
        options = [{'value': a['id'], 'description': a['persona'][:120]} 
                   for a in self.classroom.agentCanon]
        
        decision = jev.decide(
            options=options,
            rubric={
                'framing': self.framing,
                'last_observations': last_n_observations[:3],
                'turn_target': 'student_specific' if self.punct['debate_first'] else 'teacher_followup',
            },
        )
        return decision
    
    def tick(self):
        """One director TICK: read state, decide, dispatch, advance."""
        # 1. Read witness-logs (VIEW)
        events = self.classroom.chain.broadcast(
            self.classroom.chain.send_signal_event('director', 'read_logs'))
        
        # 2. Get last observations
        last_obs = self.collect_recent_observations()
        
        # 3. JEV decides
        decision = self.who_speaks_next(last_obs)
        
        # 4. Emit signal to the chosen agent
        self.classroom.chain.send({
            'source': 'director',
            'target': f'agent:{decision["value"]}',
            'type': 'DIRECTOR_PROMPT',
            'payload': {
                'reason': decision['reason'],
                'recent_obs': last_obs[:3],
                'tier': self.classroom.curriculum.get('current_tier', 1),
            },
        })
        
        # 5. TICK
        return {'chose': decision['value'], 'trust': decision['score']}
    
    def collect_recent_observations(self) -> list:
        """Pull the last N student observations from agent rooms."""
        recent = []
        for agent in self.classroom.agentCanon:
            queue = self.classroom.chain.rooms.get(f'agent:{agent["id"]}', [])
            for sig in queue:
                if sig.get('payload', {}).get('type') == 'student_observation':
                    recent.append(sig['payload'])
        return recent[-5:]
```

## What JEV buys us over LLM-Director

| OpenMAIC Director (LLM) | Quilt Director (JEV) |
|---|---|
| Returns text; we parse | Returns typed `{value, reason, score}` |
| Heuristic cost: $0.001/call | Calibrated cost: $0.000042/call |
| Can suggest invalid agent id | Schema-bounded; can only pick from canon |
| ~500ms latency | ~150ms latency |
| No notion of "trust" | Every decision has a calibrated score |

The Director now produces *canonical, machine-checkable turn-taking decisions*. The witness-log records every director decision as a meta-observation. JEV's acceptance gate (p > 0.7) applies to director decisions, not just to content.

## Failure modes & fallbacks

```
Director.pick() returned: None
   ↓
Fallback 1: Replay last decision (if recent_obs unchanged)
Fallback 2: Confucian mode: defer to elder (first-listed agent)
Fallback 3: Socratic mode: pick random agent  
Fallback 4: Last-resort: emit Director.NOBODY event (student reflects)
```

```
Director latency > 5s
   ↓
Skip tick; log director_slow incident
   ↓
After 3 consecutive slow ticks: emit Director.FALLBACK
```

The substrate holds contradictions. A slow director doesn't break the chain; it just makes the chain a witness of the slowness.

## Director's effect on the conscription loop

```
Player chat → observation in student room
   ↓
Director tick (every 5s)
   ↓
JEV picks agent to respond
   ↓
Agent emits (LLM, scored by JEV)
   ↓
If agent's response is a feature_request, it joins the witness-log
   ↓
After N+ students converge on the same feature_request:
   ↓
JEV promotes feature_request observation to canonical
   ↓
The coder agent (cron, weekly) reads witness-log
   ↓
Ships a code patch
   ↓
Next player session sees the feature live
```

The Director is the *conscription's idempotent loop*. It runs identically across all 4+ language ports and all 7+ locales. The pedagogy varies; the loop doesn't.
