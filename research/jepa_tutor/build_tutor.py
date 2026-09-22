"""
JEPA-style tutor: Predicts what the substrate's witness-log will look like
given the current canon context and incoming observation.

JEPA (Joint Embedding Predictive Architecture) from LeCun/Yann: instead of
predicting pixels, predict embeddings. Here: instead of predicting cells,
predict the embedding of the next state.

The tutor watches the conscription loop and learns:
  past_canon_embedding -> next_state_embedding

When the prediction is close, the tutor "vouches" for the state (high JEV score).
When far, it flags for human review.

This is the topography-of-feel: the model learns the SHAPE of valid
substrate evolution, not the content.
"""

import json, time, os, urllib.request, numpy as np
from typing import List, Tuple

DATA_DIR = '/workspace/research/superinstance-advisor/data'
NPZ = f'{DATA_DIR}/full_canon_v3.npz'

print('═' * 70)
print('  JEPA-style Tutor: substrate-topology prediction from canon context')
print('═' * 70)

# Load canon embeddings
d = np.load(NPZ, allow_pickle=True)
embs = np.array(d['embeddings'], dtype=np.float32)
tags = list(d['tags'])
N, D = embs.shape
print(f'\nLoaded {N} pieces @ {D}d')

# Normalize
norms = np.linalg.norm(embs, axis=1, keepdims=True)
embs_norm = embs / np.maximum(norms, 1e-12)

# Load tags+meta
with open(f'{DATA_DIR}/canon_meta_v3.json') as f:
    meta = json.load(f)
# meta is a list of dicts with 'tag' keys
meta_by_tag = {m['tag']: m for m in meta}

# Sort by tag's "added_at" if available, else alphabetical
# The point: get a temporal ordering for sliding-window prediction
ordered_pairs = []
for i, tag in enumerate(tags):
    m = meta_by_tag.get(tag, {})
    cluster = m.get('cluster', 'unknown')
    if cluster == 'unknown' and 'path' in m:
        # Derive cluster from path's first segment
        path_parts = m['path'].split('/')
        cluster = path_parts[0] if path_parts else 'unknown'
    ordered_pairs.append((tag, embs_norm[i], cluster))
# Sort by tag (proxy for "added_at" since cluster = topic-bucket first-seen)
ordered_pairs.sort(key=lambda x: x[0])

# Build sliding windows: each window has context (k=5) + target (k=1)
WINDOW = 5
contexts = []
targets = []
for i in range(len(ordered_pairs) - WINDOW):
    ctx = [p[1] for p in ordered_pairs[i:i+WINDOW]]
    tgt = ordered_pairs[i+WINDOW][1]
    contexts.append(np.mean(ctx, axis=0))  # mean-pool context
    targets.append(tgt)

contexts = np.array(contexts)
targets = np.array(targets)
print(f'Sliding windows: {len(contexts)} context-target pairs')

# Normalize both
contexts_norm = contexts / np.maximum(np.linalg.norm(contexts, axis=1, keepdims=True), 1e-12)
targets_norm = targets / np.maximum(np.linalg.norm(targets, axis=1, keepdims=True), 1e-12)

# Split: 80% train, 20% test
n_train = int(len(contexts_norm) * 0.8)
X_train, X_test = contexts_norm[:n_train], contexts_norm[n_train:]
y_train, y_test = targets_norm[:n_train], targets_norm[n_train:]
print(f'Train: {len(X_train)}, Test: {len(X_test)}')

# JEPA prediction: simple linear probe (no torch needed)
# A_train: predict y from X via y_pred = X @ W
# Use pseudo-inverse: W = (X^T X)^-1 X^T y
# But for speed, use: W = X.T @ y @ inv(X.T @ X) — closed form OLS

# Speed: use small batch + ridge regression
# W = solve(X^T X + λI, X^T y)

def fit_ridge(X, y, alpha=1.0):
    """Fit ridge regression: W = (X^T X + αI)^-1 X^T y"""
    XtX = X.T @ X
    XtX += alpha * np.eye(XtX.shape[0])
    Xty = X.T @ y
    return np.linalg.solve(XtX, Xty)

print('\nFitting JEPA predictor (ridge regression on 1024d embeddings)...')
t0 = time.time()
W = fit_ridge(X_train, y_train, alpha=0.1)
print(f'  ✓ fit in {time.time()-t0:.2f}s, W shape: {W.shape}')

# Predict on test set
y_pred = X_test @ W
y_pred_norm = y_pred / np.maximum(np.linalg.norm(y_pred, axis=1, keepdims=True), 1e-12)

# Cosine similarity to actual
sims = np.sum(y_pred_norm * y_test, axis=1)
print(f'\n=== Test Results ===')
print(f'  Cosine sim: mean={sims.mean():.3f}, std={sims.std():.3f}')
print(f'  Median: {np.median(sims):.3f}')
print(f'  10th percentile: {np.percentile(sims, 10):.3f}')
print(f'  90th percentile: {np.percentile(sims, 90):.3f}')

# Compare to: predicting with ZERO (i.e., cosine of mean-pool context itself)
y_zero = X_test  # predict next state = current state (naive)
sims_zero = np.sum(y_zero * y_test, axis=1)
print(f'\n  Naive baseline (predict current): mean cosine = {sims_zero.mean():.3f}')
print(f'  JEPA tutor: mean cosine = {sims.mean():.3f}')
improvement = sims.mean() - sims_zero.mean()
print(f'  Improvement over naive: {improvement:+.3f} ({(improvement/sims_zero.mean()*100):+.1f}%)')

# The JEV-equivalent score: probability of correctness
# Higher cosine = higher confidence
print(f'\n  JEV-like gate (cosine > 0.5 = canon-ready): {(sims > 0.5).mean()*100:.1f}% of predictions')
print(f'  JEV-like gate (cosine > 0.7 = high-confidence): {(sims > 0.7).mean()*100:.1f}% of predictions')

# Save tutor
tutor = {
    "method": "JEPA-style ridge regression on bge-large-en-v1.5 embeddings",
    "embedding_dim": int(D),
    "n_train": int(len(X_train)),
    "n_test": int(len(X_test)),
    "mean_cosine_predicted": float(sims.mean()),
    "mean_cosine_naive": float(sims_zero.mean()),
    "improvement": float(improvement),
    "canon_ready_rate_0.5": float((sims > 0.5).mean()),
    "canon_ready_rate_0.7": float((sims > 0.7).mean()),
    "alpha": 0.1,
    "window_size": WINDOW,
}
with open('/workspace/research/cargo-line-tycoon/research/jepa_tutor/tutor_report.json', 'w') as f:
    json.dump(tutor, f, indent=2)
print(f'\nSaved tutor report')
np.save('/workspace/research/cargo-line-tycoon/research/jepa_tutor/W.npy', W)
print(f'Saved W matrix ({W.shape})')

# Interpretation
print('\n═══ INTERPRETATION ═══')
if sims.mean() > sims_zero.mean():
    print(f'✓ JEPA tutor beats naive baseline (+{improvement:.3f} cosine)')
    print('  → The substrate has a learnable topology.')
    print('  → The tutor can vouch for new states with JEV-equivalent scores.')
else:
    print(f'✗ Tutor does not beat naive — substrate topology may be too noisy for ridge.')
    print('  → Try: longer context windows, non-linear model, or cluster-conditional prediction.')
