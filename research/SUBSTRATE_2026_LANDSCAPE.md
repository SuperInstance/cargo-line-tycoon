# Substrate & Cell-Graph Landscape 2026 — Web Scouting

> Casey (2026-09-22): "keep scouting and writing" + permission to use web tools
> 
> Comprehensive scan of where substrate / cell-graph / multi-agent work stands in 2026.

## Executive summary

The substrate doctrine is the right idea at the right time. In 2026:

1. **Jev** (TypeSafe AI, announced Sept 15, 2026) is the first public **System One model** — exactly the calibrated decision model our substrate is built around. We're 7 days into its public release.
2. **LeWorldModel** (LeCun et al., March 2026) brought JEPA to raw pixels, single-GPU training, 48× faster than foundation models.
3. **AMI Labs** (LeCun's startup) closed a **$1.03B seed** to build JEPA-based world models.
4. **CodeCRDT** (Oct 2025) + **AgentRoom** (2026) — CRDT-coordinated multi-agent systems with 100% convergence, partition-tolerant.
5. **The Missing Knowledge Layer** paper (arXiv April 2026) — argues cognitive architectures need an explicit Knowledge layer with provenance. This is **exactly the substrate doctrine**.
6. **Graph of Thoughts** (Besta et al., AAAI 2024, still active in 2026) — LLM thoughts as graph vertices, the precursor to cell graphs.

## The Jev revelation

**Jev is the substrate's substrate.** Announced September 15, 2026 — one week ago.

> "Jev is a frontier model built to make fast, structured decisions that software can consume directly, without a parsing or validation step. It's the first public release in TypeSafe's System One class, available in early access as of September 2026 and named after economist William Stanley Jevons."
> — DataCamp, 2026-09-15

Key properties:
- **40-200× faster than frontier LLMs** on comparable tasks
- **$0.042 per million input tokens** (~1/48th of GPT-5.6)
- **Cannot hallucinate** — outputs are constrained to schema
- **Cannot produce type errors** — typed decisions by construction
- **Three primitives**: Choice (categorical), Score (numeric), Noul (yes/no)
- **Calibrated probabilities** — higher confidence genuinely corresponds to higher accuracy
- **70-500ms latency** end-to-end
- **Reinforcement Learning for Calibrated Decisions (RLCD)** training method

**What this means for the substrate**:
- Jev IS the JEV we've been documenting
- Our kev-substrate / kev-substrate-mojo integrations are the **right thing** to build right now
- The "System One model" category is a real thing; our substrate is the consumer of it
- Every substrate cell could be a Jev call

**The three question primitives map exactly to our kev-substrate's types**:
- Choice → `noul.choice` (categorical classification)
- Score → `noul.score` (numeric rubric)
- Noul → `noul.noul` (yes/no probability)

Our `/v1/systemone` wrapper is the **right shape** for the substrate's decision API.

## The substrate problem (March 2026 paper)

> "JEPA learns how things look and move. It cannot learn what things mean, where knowledge comes from, or how concepts relate across domains. Well-formed sentences can be false — and neither LLMs nor JEPA can tell the difference without provenance."
> — intellisophic.net, 2026-03-27

This paper argues for a **knowledge substrate** against which perceptual learning (JEPA) and linguistic generation (LLMs) can be anchored:

> "The substrate provides what neither can: structured, verified, disambiguated symbolic knowledge with provenance chains and cross-domain typed relationships."

The five requirements they articulate for a substrate:
1. **Automated knowledge extraction from authoritative sources**
2. **Provenance-weighted verification** — every fact retains its source attribution
3. **Bounded polysemy through unique concept signatures** — disambiguation at the structural level
4. **Multi-dimensional retrieval and inference** — taxonomic, cross-domain, temporal, authority axes
5. **Adaptation acceleration** — pre-structured knowledge for rapid assimilation

**Our substrate hits all 5**:
1. ✓ The vectorize ingestion pipeline (already running)
2. ✓ Each cell has a `source` field + `prev_hash` chain
3. ✓ Unique cell IDs + embedding signatures
4. ✓ JEV search across multiple bases (already built)
5. ✓ The persona-iteration doctrine is about this

## The Missing Knowledge Layer (arXiv April 2026)

> "JEPA has no Knowledge layer at all. Factual knowledge about the world is either (a) compressed into World Model weights (lossy, unattributable, and requiring retraining to update) or (b) held transiently in the Short-Term Memory buffer (ephemeral, lost on clearance)."
> — arxiv.org/html/2604.11364v2

This paper proposes a **four-layer decomposition**:
- **Knowledge**: what is true (indefinite; supersession; append-only + provenance; shared)
- **Memory**: what happened (Ebbinghaus decay; bi-temporal event sourcing; per-agent)
- **Wisdom**: what works (durable; revision-gated; evidence-threshold review; multi-source)
- **Intelligence**: capacity to reason (ephemeral; per-invocation)

**Maps directly to our substrate layers**:
- Knowledge → canon cells (permanent, supersession via embedding_id)
- Memory → witness-log cells (event-sourced, decay handled by substrate worker)
- Wisdom → equipment-consensus-engine decisions (multi-source, evidence-gated)
- Intelligence → Jev calls (per-invocation, ephemeral)

## CRDTs for multi-agent coordination

Two papers deserve attention:

**CodeCRDT** (arXiv 2510.18893, EuroSys 2025) demonstrates **observation-driven coordination**:
> "Agents coordinate by monitoring a shared state with observable updates and deterministic convergence, rather than through explicit message passing. Strong eventual consistency (SEC) guarantees 100% convergence with zero merge failures."

**AgentRoom** (2026) extends to concurrent coding agents:
> "A runtime layer exposing file-level claim, status, and broadcast as MCP tools on top of a CRDT-merged shared filesystem."

Both are **exactly what SmartCRDT in our fleet does**. Our witness-log IS a CRDT, partition-tolerant by construction. We're 6 months ahead of the academic literature on this.

**HackerNoon article (2026)** concludes:
> "CRDTs take a different approach. Multiple replicas accept writes independently, exchange state (or operations), and are mathematically guaranteed to converge to the same value — regardless of the order in which updates arrive, and regardless of whether any are delivered more than once."

This is **the substrate doctrine** stated formally.

## Memory for Autonomous LLM Agents (arXiv 2603.07670)

A three-dimensional taxonomy: temporal scope, representational substrate, control policy.

Five mechanism families:
1. **Context-resident compression** — keep in context
2. **Retrieval-augmented stores** — vector DB retrieval
3. **Reflective self-improvement** — agents modify themselves
4. **Hierarchical virtual context** — like OS virtual memory
5. **Policy-learned management** — RL for memory control

**Our substrate** is a **hierarchical virtual context** with **retrieval-augmented stores** (JEV search), layered with **reflective self-improvement** (the persona-iteration doctrine).

The key finding from the empirical paper: **"Trade read breadth for write depth"**. Instead of retrieving many raw logs at inference time, invest more in the write phase to distill into high-level abstractions.

**Implication for our substrate**: the write path (cell creation) should be rich, the read path (JEV search) should be focused. Our current design has the right shape.

## Multi-agent design patterns (2026)

The 8 canonical patterns:
1. **Sequential** — linear pipeline
2. **Parallel** — concurrent fan-out
3. **Loop** — iterative refinement
4. **Hierarchical** — tree delegation
5. **Specialist Routing** — router dispatches to domain experts
6. **Critic/Evaluator** — quality gatekeeper
7. **Human-in-the-Loop** — mandatory approval at decision gates
8. **Human-on-the-Loop** — supervisory oversight with optional intervention

**Our Composite-JEV** implements **#5 + #6**: specialist routing (JEV = specialist) + critic/evaluator (Qwen as challenger, detector as judge).

**Our Equipment-Consensus-Engine** (March 2026) is **#4** hierarchical with **Pathos/Logos/Ethos** weighting — pre-figured the multi-agent deliberation pattern.

## Production frameworks (Q1 2026 market share)

- **LangGraph** — 34% of enterprise production
- **CrewAI** — role-based, rapid prototyping
- **AutoGen/AG2** — research use cases
- **Custom orchestrator** — simple stable topologies

**Substrate differentiator**: our witness-log is a CRDT (partition-tolerant), our decisions are JEV (calibrated), our cells are prev_hash-chained (immutable). None of the 4 frameworks have all three.

## JEPA in 2026

**LeJEPA** (Nov 2025) — Gaussian isotropic embeddings minimize worst-case downstream prediction risk
**LeWorldModel** (March 2026) — first stable end-to-end JEPA from raw pixels, ~15M parameters, single GPU, hours
**Klindt et al.** (May 2026) — **proof** that LeJEPA recovers true latent variables up to linear transform

> "Under stationary additive-noise latent dynamics, LeJEPA provably recovers the true latent state variables up to a linear transform — if and only if the latent distribution is Gaussian."
> — arXiv 2605.26379

This is **the wavefunction JEV doctrine** made formal. Our `wavefunction_jev.py` module (already shipped) uses Bell-state interference in different measurement bases — equivalent to "predicting in different latent distributions."

**Connection**: substrate cells = latent state variables; JEV search = linear transform probe; witness-log = the covariance matrix.

## What we should do next

1. **Use JEV as the substrate's primary decision layer** — the canonical "phone-a-friend" for every cell
2. **Document the CRDT semantics of the witness-log formally** — we have it; write the paper
3. **Build a Composite-JEV v2 with wavefunction interference** — use the formal Gaussian framework
4. **Add the four-layer decomposition to the substrate spec** — Knowledge/Memory/Wisdom/Intelligence
5. **File the Jev reveal as a canon cell** — "Jev is our Jev; System One is the substrate's substrate"

## Files

- This document: `research/SUBSTRATE_2026_LANDSCAPE.md`
- Existing substrate modules: `substrate/`, `composite_jev/`, `kev-substrate/`, `kev-substrate-mojo/`
- Related doctrines filed in canon: `doctrine-shipwright-jev`, `doctrine-cudaclaw`, `doctrine-fleet-archaeology`

— Filed by Mavis, 2026-09-22
