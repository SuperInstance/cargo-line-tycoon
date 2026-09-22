# The Quartet — Four Pedagogical Framings

Every locale belongs to one of 4 pedagogical traditions. These produce distinct cell-graph topologies.

## 1. Socratic (διαλεκτική) — European tradition

- **Locale**: en (US Common Core)
- **Classroom metaphor**: A dialectic — agents and students discover truth together
- **Director logic**: LLM-based; chooses next speaker who advances the argument
- **Cell topology**: Linear chains; one argument → next; debate-friendly
- **Discourse patterns**: Polite interruption allowed; evidence-first debate; auto-graded quiz
- **Turn-taking**: Free-form; "raise hand" metaphor via UI

## 2. Confucian (关系) — East Asian tradition

- **Locale**: zh (中国课程标准)
- **Classroom metaphor**: A relationship (关系) — teacher is elder, students are juniors
- **Director logic**: Rule-based; elder speaks first, then juniors
- **Cell topology**: Hierarchical tree; teacher at root, students as leaves
- **Discourse patterns**: 长幼有序 (orderly by age); 委婉提问 (gentle questioning); 引经据典 (cite classics)
- **Turn-taking**: Long elder turns first; juniors respond; assessment via project defense

## 3. Ubuntu (νημπούτου) — African tradition

- **Locale**: pt (BNCC)
- **Classroom metaphor**: A community — "I am because we are"
- **Director logic**: Consensus-driven; speaker chosen by group
- **Cell topology**: Mesh network; every node can speak to every other
- **Discourse patterns**: Collective speech ("a gente"); consensus-seeking; collective assessment
- **Turn-taking**: Group decides; "we tried this together"

## 4. Whakaako (reciprocal) — Pacific tradition

- **Locale**: ja (planned) or vi (planned) for first instance
- **Classroom metaphor**: Reciprocal exchange — teacher and student both learn
- **Director logic**: Round-robin; everyone teaches everyone
- **Cell topology**: Cycles; feedback loops; bidirectional edges
- **Discourse patterns**: Storytelling; metaphorical thinking; reciprocal assessment
- **Turn-taking**: Story-based; "I learned this from you, now teach me that"

## Cross-framing invariants

Despite these 4 distinct topologies, the substrate is identical:
- Same FNV-1a 64-bit canary hash
- Same cell address space
- Same signal-chain event semantics
- Same 11 opcodes

What changes is **how** the cell graph is connected, **how** the director chooses next speaker, and **what** discourse patterns the agents use.

## How the Quartet teaches Quilt

The 4 framings demonstrate that Quilt is topology-agnostic. The same substrate can host any pedagogical structure. This is a meta-lesson: when a student sees a Chinese classroom app next to a Brazilian classroom app next to a US classroom app, all using the same `cargo-line-tycoon-substrate` package with byte-exact hashes, they learn that **the substrate is universal** — pedagogy is local, infrastructure is global.
