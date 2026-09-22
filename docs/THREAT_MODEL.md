
# Threat model — what the substrate DOES and DOES NOT defend

Derived from extensive stress-testing (Sept 22, 2026) against the
memory-poisoning frontier (arXiv 2605.08442).

## What the substrate defends

1. **Hash integrity** — FNV-1a 64-bit provides 2^64 collision space. Forged prev_hashes produce different chains (test 01_fnv1a64_fuzz, all 29 cases byte-exact across TS/Rust/Python).
2. **Signal source non-spoofing** — source/target are routing references, not payload claims (test 03_memory_poisoning #8).
3. **Type coercion** — TS/Rust/Python fnv1a64 now accept Buffer/bytes/str consistently without coercion bugs (test 01_fnv1a64_fuzz).
4. **Crash resistance** — cyclic payloads, unpaired surrogates, empty/null payloads no longer crash the substrate (test 02_signal_chain_stress #6).
5. **Append-only** — witness-log grows; no in-place mutation means a poisoning attack that depends on rewriting history will fail.

## What the substrate DOES NOT defend (consumer responsibility)

1. **Prompt injection via payload.text** — the substrate stores whatever the caller puts in. If an LLM agent uses `obs.payload.text` as its system prompt, it is vulnerable. Solution: agents MUST consume `obs.op`, `obs.timestamp`, `obs.source` (envelope only). NEVER `obs.payload.text` directly. (test 04_agent_prompt_injection)
2. **Quorum-bypass / sybil attacks** — the substrate accepts 10 observations from 10 different observer_ids even if they're all the same user. JEV (consensus layer) must detect sybil via trust graph, not the substrate.
3. **Conflict resolution** — the substrate preserves BOTH sides of a conflict. JEV must pick the winner.
4. **Time-of-check vs time-of-use** — observation `timestamp` is whatever the caller says. JEV must verify wall-clock provenance.

## The candor-WAL pattern

A consumer that wants memory-poisoning resistance must:

```
1. Write observation BEFORE executing any action (WAL)
2. Apply the substrate's hash chain for integrity (A)
3. Use JEV with p>0.7 to promote canon (L = light review)
```

The substrate provides (1) the storage, (2) the hash, (3) the API for JEV to call. 
The CONSENSUS layer must wire all three together.

## Memory-poisoning test results

See tests/stress/03_memory_poisoning.js (all 8 tests pass on TS port v0.1.1+).

| Attack vector | Substrate defense | Required consumer defense |
|---|---|---|
| Forged prev_hash | Hash mismatch is detectable | Verify chain on read |
| Replay attacks | Timestamps are caller-controlled | Use trusted time oracle |
| Quorum-bypass | Substrate accepts all sybils | Use trust graph in JEV |
| Prompt injection | Substrate is dumb storage | Sandbox the agent prompt |
| Hash collision (2^32) | 64-bit FNV-1a | Re-randomize observer_ids periodically |
| Conflict injection | Substrate preserves both | Run JEV consensus |
| Race conditions | Single-threaded Node | Use explicit commits |
| Source spoofing | Routing is by reference | Trust room registration |

## Bottom line

The substrate is a **typed, hash-chained, append-only storage primitive**.
It is the floor, not the ceiling. The actual candor-WAL is the **JEV substrate-with-promotion pipeline** that builds consensus on top.

For cargo-line-tycoon's conscription loop to be memory-poisoning-resistant, JEV must:
- Reject observations from observer_ids with insufficient trust
- Enforce temporal ordering beyond what the caller claims
- Run consensus on conflicting feature_requests before promoting
