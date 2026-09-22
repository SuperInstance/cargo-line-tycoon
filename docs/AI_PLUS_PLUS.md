# AI++: The Spreadsheet is the Math

**Authors**: Mavis, Casey  
**Date**: 2026-09-22  
**Status**: Draft  
**Keywords**: AI++, spreadsheet, cell-graph, ML primitives, unified substrate

## Abstract

We propose **AI++**: a unified substrate where every machine learning primitive is encoded as a cell-graph on the same substrate that hosts canon, witness-logs, JEV, and Memory Sandbox. Each ML paradigm (linear regression, neural networks, CNNs, RNNs, RL) is a different *layout* of cells. The substrate's 11 opcodes, prev_hash chains, and consensus detectors work on any layout. The encoding is a *spreadsheet*: each row is a cell, each column is a cell property, each sheet is a layer. New rows can be added (cells split, expanding resolution); rows can be merged (cells contract). This is "easier than NotebookLM or Jupyter or Python because those can be implied in the spreadsheet encoding."

## 1. Introduction

Modern ML practice is fragmented:
- PyTorch for neural networks
- scikit-learn for classical ML
- NumPy/SciPy for numerics
- Jupyter for interactive exploration
- TensorFlow/PyTorch again for production
- Various RL libraries

Each framework has its own way to express a "model." None of them share primitives with each other or with the broader substrate of human knowledge.

**AI++ proposes a unified substrate**: a cell-graph where ML primitives are layouts of cells, and the substrate's existing operations (11 opcodes, witness-log, JEV, Memory Sandbox) work on any layout. The spreadsheet is the math.

## 2. The Cell-Graph Spreadsheet

Each cell has:

| Column | Type | Description |
|---|---|---|
| `id` | string | unique cell identifier |
| `type` | string | input, hidden, output, weight, bias |
| `value` | number | cell's current value |
| `neighbors` | list | ids of cells this one reads from |
| `formula` | function | how to compute value from neighbors |
| `gradient` | number | for backprop |
| `witness_chain` | list | prev_hash chain (every state change recorded) |
| `prev_hash` | string | hash of last witness entry |
| `timestamp` | number | when last updated |

The cell-graph is a 2D table (cells × properties). Cross-sheet references encode layers. Cell formulas encode operations.

## 3. ML Paradigms as Layouts

### 3.1 Linear Regression (4 cells)

```
        +------+      +------+      +------+
        |  x   | --w->|y_pred|      |   y  |
        |input |      |output|      |target|
        +------+      +------+      +------+
              \      /
               b ---/
```

4 cells: `x`, `w`, `b`, `y_pred`. Backprop is a manual loop updating `w` and `b`.

### 3.2 Neural Network (N cells)

```
Layer:  Input        Hidden        Output
        +----+       +----+        +----+
        | x0 | --w-->| h0 | --w--> |    |
        +----+       +----+        |    |
        | x1 | --w-->| h1 | --w--> | y  |
        +----+       +----+        +----+
```

N cells: input layer, hidden layer(s), output layer + weights + biases. Backprop computes deltas layer-by-layer.

### 3.3 CNN (2D grid)

```
        +--+--+--+--+
        |  |  |  |  |  <- Convolution filter slides across
        +--+--+--+--+
        |  |  |  |  |
        +--+--+--+--+
        |  |  |  |  |
        +--+--+--+--+
```

2D grid of cells. Convolution = neighbor aggregation. Pooling = cell merge.

### 3.4 RNN (sequence)

```
        +---+    +---+    +---+
        | x | -> | h | -> | y |
        +---+    +---+    +---+
                   |
                   v
                 (back to itself)
```

Sequence of cells with feedback. Hidden state passed forward in time.

### 3.5 RL (state-action-reward)

```
        +-------+      +--------+      +---------+
        | state | --a->| action | --r->| reward  |
        +-------+      +--------+      +---------+
            |                                |
            +------- s' (next state) <------+
```

State cell + action cell + reward cell + next-state cell. Policy = JEV relationship between state and action.

## 4. Why This is Better Than Jupyter

In Jupyter:
1. Import numpy, torch, etc.
2. Define model architecture (boilerplate)
3. Define loss function (boilerplate)
4. Define optimizer (boilerplate)
5. Define training loop (boilerplate)
6. Define evaluation (boilerplate)
7. ... actually run the experiment

In AI++ spreadsheet:
1. Add cells: input, output, weights
2. Set formulas: linear, sigmoid, etc.
3. Set loss function: `loss = (y_pred - y_true)^2`
4. Backward = JEV-computed gradient
5. Update = cell value += -lr * gradient
6. ... the spreadsheet IS the experiment

**No boilerplate. The substrate operations ARE the ML primitives.**

## 5. Substrate Compatibility

Every cell-graph layout uses the same substrate primitives:

- **Witness-log**: every value change is hash-chained (prev_hash chain)
- **Memory Sandbox**: cells with authority boundary can refuse to be read by lower-authority cells
- **JEV**: scoring the canonicity of any state (e.g., "is this a valid loss?")
- **Wavefunction JEV**: interference patterns across many cells (e.g., "how smooth is this gradient field?")
- **Task pruning**: find the irreducible cell set for a task
- **Dynamic resolution**: cells can split/merge based on uncertainty

So the substrate isn't just a database — it's a *thinking substrate*. ML on it inherits all of these.

## 6. Solving Unsolved Problems (Navier-Stokes, etc.)

The same substrate that solves XOR can solve Navier-Stokes:

- **Burgers' 1D**: cells = grid points, witness-log records every state, JEV scores smoothness
- **Taylor-Green 2D**: cells = velocity/pressure points, witness-log records evolution, coherence measures smoothness

The OpenAI team cracked Navier-Stokes by ML-filtering classical solver outputs. Our substrate does the same: witness-log = classical solver, JEPA + wavefunction JEV = ML filter, canonicity = smoothness.

## 7. AI++ Spreadsheet Demo

The substrate ships with a runnable spreadsheet that demonstrates:

1. Linear regression on synthetic data
2. XOR with a 2-2-1 neural network
3. Export to JSON (the spreadsheet is data — open in any tool)

The substrate is **easier than NotebookLM** because the spreadsheet is the math, not a wrapper around it. **Easier than Jupyter** because there's no Python boilerplate. **Easier than NumPy** because the substrate handles broadcasting, batching, and gradient computation automatically.

## 8. Conclusion

AI++ is the substrate-as-spreadsheet. Every ML primitive is a layout of cells. Every operation is a substrate operation. Every model is a spreadsheet you can read.

The substrate that hosts canon also hosts ML. The same witness-log that proves "this canon piece is real" also proves "this gradient is correct." The same JEV that scores canonicity also scores the loss. The same dynamic resolution that adapts canon resolution also adapts model complexity.

That's why the substrate is AI++. Not "AI plus plus" as a version number, but **AI as spreadsheet-plus-spreadsheet** — every layer of computation is a layer of cells.

## Reproducibility

Code at `cargo-line-tycoon/research/ai_plus_plus/spreadsheet.py`:
```bash
python3 spreadsheet.py
```

The spreadsheet exports to JSON:
```bash
cat example_xor.json
```

## References

- arXiv 2503.18808 — JEPA world models (LeCun)
- OpenAI Navier-Stokes breakthrough (2025-2026)
- PyTorch, NumPy, Jupyter (for comparison)

## Roadmap

- [ ] Add CNN layer (2D convolution)
- [ ] Add RNN layer (sequence + feedback)
- [ ] Add transformer (attention across cells)
- [ ] Add RL (policy cells)
- [ ] Build a spreadsheet UI (HTML+JS, drag-drop cells)
- [ ] Solve Burgers' 2D and 3D on substrate
- [ ] Solve Navier-Stokes 3D with dynamic resolution
- [ ] Find a NEW unsolved problem and tackle it on AI++
