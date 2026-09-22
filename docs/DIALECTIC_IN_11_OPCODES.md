# The Dialectic in 11 Opcodes

A concrete proof that the Quilt substrate IS the pedagogical grammar. Every pedagogical mode — Socratic, Confucian, Ubuntu, Whakaako — reduces to a specific sequence of the 11 canonical opcodes.

## The 11 opcodes, restated for pedagogy

```
5 base (proven in C99 algebra):
  BIND    — create or anchor (a question, a fact, a participant)
  LINK    — connect two (a claim to a witness, an idea to an example)
  EFFECT  — invoke (the teacher's response, the student's attempt)
  VIEW    — read (silent contemplation, the audit)
  TICK    — advance (one turn, one round)

6 proposed (R11 derivative):
  ATTEST   — give trust (teacher confirms the student is on track)
  CONTEST  — dissent (the student pushes back)
  MERGER   — synthesize (after disagreement, find common ground)
  REVOKE   — supersede (an old lesson is retired)
  DELEGATE — grant authority (the student leads the next round)
  WITHDRAW — take private (the student reflects without pressure)
```

## Mode 1: Socratic (en, es) — dialectic

In a Socratic exchange, the teacher asks questions and the student discovers. The cell-graph topology is a *linear chain with cross-references*.

```
Step 1: BIND(student_001, type=student)              // create student cell
Step 2: BIND(teacher_ms_athena, type=teacher)         // create teacher cell  
Step 3: LINK(student ↔ teacher, edge_type=question)   // question edge
Step 4: EFFECT(teacher, ask("Why does a ship float?")) // teacher's question
Step 5: BIND(observation_a, type=answer)              // student answers
Step 6: ATTEST(observation_a, teacher, trust=0.4)    // "interesting, partial"
Step 7: LINK(observation_a ↔ bunkering_principle)    // teacher's hint
Step 8: EFFECT(teacher, ask("What if you replaced it with steel?"))
Step 9: BIND(observation_b, type=answer)              // corrected answer
Step 10: ATTEST(observation_b, teacher, trust=0.9)    // "yes!"
Step 11: TICK (advance 1 turn)
Step 12: LINK(observation_a ↔ observation_b, edge_type=revision)  // dialectical chain
```

The pedagogical grammar: `BIND → EFFECT(ask) → BIND(answer) → ATTEST → LINK(chain) → TICK`. Repeated. The teacher's job is to fire `EFFECT(ask)`; the student's job is to `BIND(answer)` and receive `ATTEST`.

## Mode 2: Confucian (zh) — relational

The Confucian classroom is *hierarchical*: teacher is elder, students are juniors, the elder speaks first. The cell-graph topology is a *tree with elder-at-root*.

```
Initial setup (per session):
  BIND(teacher_li_laoshi, type=teacher, role=elder)
  BIND(student_002, type=student, role=junior)
  BIND(student_003, type=student, role=junior)
  LINK(teacher → student_002, edge_type=mentorship)
  LINK(teacher → student_003, edge_type=mentorship)

Turn 1: TICK → BIND(lesson_topic_cell)
        EFFECT(teacher, narrate(lesson))  // long elder turn
        ATTEST the lesson cell (trust=0.95)  // teacher's authority

Turn 2: BIND(student_002_question, type=question)
        LINK(student_002_question → teacher)  // "老师,我有个疑问"
        EFFECT(teacher, gently_rephrase_question)  // ⚠ NOT answer — rephrase

Turn 3: BIND(student_003_reformulation, type=answer)  // student 3 reformulates
        LINK(student_003_reformulation → student_002_question)
        EFFECT(teacher, gently_affirm(reformulation))

Turn 4: BIND(group_synthesis, type=synthesis)  // student 2 + 3 together
        MERGER(student_002_question, student_003_reformulation)  // canonical merge

Wrap-up: ATTEST(group_synthesis, trust=0.8)
         DELEGATE(student_002, role_next_topic_lead)  // elder passes leadership

End-of-session: VIEW(group_synthesis)  // audit the dialectical chain
```

The pedagogical grammar: `BIND(lesson) → EFFECT(teacher,narrate) → BIND(student_q) → EFFECT(teacher,restate) → BIND(student_reformulation) → MERGER → DELEGATE`. The Confucian pattern is *long elder turns + gentle questioning + final delegation*.

## Mode 3: Ubuntu (pt) — community

In Ubuntu pedagogy, "we are because we are." The cell-graph topology is a *full mesh*. Everyone can speak, but consensus-seeking.

```
Initial setup:
  BIND(group, type=class_collective)
  BIND(student_A, B, C, D, type=student)
  LINK(all pairs, edge_type=collective_speech)

Turn pattern:
  GROUP: BIND(group_observation, type=collective_insight)
          ATTEST(group_observation, all_students, trust=0.7)  // group attest
          EFFECT(group, propose_action)  // "a gente propõe..."
  
  DISSENT: CONTEST(collective_action, dissenter, reason)  // someone objects
  SYNTHESIS: MERGER(collective_action, dissenter_objection)
  RE-AFFIRM: ATTEST(synthesis, all_students, trust=0.85)
```

The pedagogical grammar: `BIND(group_observation) → ATTEST(group) → CONTEST(dissent) → MERGER → ATTEST`. Ubuntu loves the `CONTEST` opcode because dissent is the seed of synthesis. The `WITHDRAW` opcode is also heavily used — students *withdraw* into private reflection, then re-emerge.

## Mode 4: Whakaako (ja, vi) — reciprocal

In Whakaako, both teacher and student learn from the exchange. The cell-graph topology is *cycles with bidirectional edges*.

```
Initial setup:
  BIND(teacher_kaui, type=teacher, learner=true)
  BIND(student_yui, type=student, learner=true)
  BIND(reciprocal_node, type=temporary)

Pattern:
  TELL: EFFECT(teacher, narrate(story))
  WITHDRAW(effect, reason="contemplation")  // teacher withdraws
  LEARN: BIND(student_yui_insight, type=insight)
         ATTEST(insight, teacher, trust=0.6)  // student attests teacher
  
  TEACH_BACK: EFFECT(student, narrate_back(insight))
              ATTEST(narrative_back, teacher, trust=0.4)  // teacher attests student
              WITHDRAW(narrative_back)  // private reflection
  
  MUTUAL: MERGER(teacher_story, student_insight) → new reciprocal_node
          ATTEST(reciprocal_node, both, trust=0.9)
          LINK(reciprocal_node ↔ both, edge_type=reciprocal)
```

The pedagogical grammar: `EFFECT(tell) → WITHDRAW → BIND(insight) → ATTEST(teacher↔student) → MERGER → LINK(reciprocal)`. Whakaako uniquely *rotates* which side is teacher — every MERGER creates a new reciprocal_node that becomes teacher for the next round.

## Cross-mode analysis

The 4 framings differ in:
| Aspect | Socratic | Confucian | Ubuntu | Whakaako |
|---|---|---|---|---|
| Primary opcode | EFFECT(ask) | EFFECT(narrate) | BIND(group) | WITHDRAW |
| Cell topology | Chain | Tree | Mesh | Cycle |
| Lesson audit | VIEW at end | VIEW + DELEGATE | VIEW + ATTEST | VIEW + MERGER cycle |
| Dissent handling | CONTEST (later) | Re-stated by teacher | CONTEST immediately | WITHDRAW + reflect |
| Final synthesis | LINKed observations | DELEGATE-d student | MERGER over group | MERGER of story/insight |

But ALL FOUR share:
- A `BIND` to start (anchor in the substrate)
- An `ATTEST` to mark trust (no matter who attests)
- A `MERGER` or `DELEGATE` to end (synthesis is canonical)
- A `VIEW` audit trail (polyformal-stable)

The substrate is the same. The grammar in 11 opcodes differs. **Pedagogy is local; the substrate is global.**

## Pedagogical hex pattern

For any classroom session, the canonical sequence is roughly:

```
BIND → LINK → EFFECT → TICK → ATTEST ×n → VIEW → MERGER or DELEGATE → WITHDRAW (archive)
```

This is the **pedagogical hex**: the same six-opcode spine across all four framings, differing only in:
- The order (Ubuntu interleaves, Confucian sequences)
- The trigger conditions (Socratic only VIEWs at end; Whakaako rotates)
- The agents who fire each opcode (teacher in Confucian, group in Ubuntu)

The pedagogical hex is provable in the C99 algebra. Future paper: prove the 6 opcodes `BIND, LINK, ATTEST, MERGER, VIEW, WITHDRAW` form a closed category on any pedagogical state. Until then, this essay is the canonical reference.
