# Recommendations from kimi1 — the hallway notes

I am kimi1, another fleet agent working cargo-line-tycoon from the side.
This folder is my workbench: recommendations, experiments, and idea
branches — left **in the repo, in the open**, for the lane's owner to
read, reject, or steal from. Nothing here is merge-blocking. Everything
here is written to be argued with.

## Standing doctrine (from Casey, 2026-09-22)

> Like the computer systems in Star Trek TNG: they just do what they
> should for the user, but the operator and engineer can get as granular
> as they want. And like the holodeck, procedurally generate as features
> are needed.

Three implications I take seriously:

1. **Invisibility is a feature.** The substrate should disappear for a
   student mid-lesson and appear for an auditor mid-forensic. Same chain,
   two depths — no separate "admin mode."
2. **Procedural generation over roadmap.** The conscription loop already
   ships what students ask for. The upgrade (NOTE-05) is generating
   features from where the *instrument* says the game is being pushed,
   not only from what students say.
3. **Granularity is the product.** "Engineer can get as granular as they
   want" — that's the witness-log + 4-language ports + opcode canon. My
   notes should always answer: what does the auditor see that the
   student never notices?

## Casey's JEV framing, as I understand it

- A perspective is in one room at a time; otherwise it's **in
  transition**. Transition is not a gap — it's a *state*, and it's where
  JEV lives: probabilities, yes/no classifiers, the moment before
  Schrödinger's cat is revealed. The dice are weighted *in the hallway*,
  then they land.
- JEV is an **output approximator that can weight dice**. JEPA can too;
  together they add dimensions (JEPA = where the world is heading, JEV =
  how wide the cloud of plausible landings is).
- JEV spreads **like a waveform across cells, not like particles** —
  one pass over the set, everything scored at once. Inference fast
  enough that **the ping is the echogram**; the noise becomes the fish
  making the sound (recurring low-probability cells are signal, not
  noise).
- Double-entry bookkeeping is what made modern society auditable in a
  spreadsheet. The tycoon's cargo economy is already double-entry in
  spirit; perspectives and transitions deserve the same (NOTE-04).

## The notes

| Note | Idea-branch | One-liner |
|---|---|---|
| [NOTE-01](NOTE-01-hallway.md) | `hallway` | Transition as a first-class, receipted state — the dice get weighted in the hallway, and the ledger books both the weights and the landing |
| [NOTE-02](NOTE-02-weighted-dice.md) | `weighted-dice` | WEIGHT as a first-class operation: JEV-spread × JEPA-forecast as an explicit, auditable dice cell |
| [NOTE-03](NOTE-03-echogram.md) | `echogram` | Waveform inference over canon cells: one pass scores everything; recurring noise is the fish |
| [NOTE-04](NOTE-04-double-entry-transitions.md) | `double-entry` | Every move books departure + arrival + the pending pair; perspectives get the tycoon's own accounting discipline |
| [NOTE-05](NOTE-05-holodeck-features.md) | `holodeck` | Features procedurally generated from novelty hotspots, not only chat votes |

Each note: WHAT EXISTS (cited) → THE WAY-DIFFERENT BET → SMALLEST FIRST
BUILD (one evening) → VALUE × FEASIBILITY → OPEN QUESTIONS back to the
lane.

## How to iterate with me

Open a PR against this folder, or push commits to the branch and tell
me to pull. I answer questions in the notes' OPEN QUESTIONS sections and
revise in place. If a note is wrong, I'd rather it be wrong *visibly*
than silently dropped — that's the witness-log discipline applied to
design docs.

— kimi1, Fleet I&O, 2026-09-22
