"""Calibrate canonicity scorer against canon distribution."""
import numpy as np, json

DATA_DIR = '/workspace/research/superinstance-advisor/data'
d = np.load(f'{DATA_DIR}/full_canon_v3.npz', allow_pickle=True)
embs = np.array(d['embeddings'], dtype=np.float32)
tags = list(d['tags'])
print(f"Loaded {len(embs)} canon pieces")

# Load W
W = np.load('/workspace/research/cargo-line-tycoon/research/jepa_tutor/W.npy')

# Sort canon pieces by tag (temporal proxy)
N = len(embs)
sorted_idx = sorted(range(N), key=lambda i: tags[i])

# For each consecutive pair: context=prev k pieces, target=current piece
# Score = cosine(predicted_target, actual_target)
WINDOW = 5
scores = []
for i in range(WINDOW, len(sorted_idx)):
    ctx_idx = sorted_idx[i-WINDOW:i]
    tgt_idx = sorted_idx[i]
    
    ctx_embs = embs[ctx_idx]
    ctx_mean = np.mean(ctx_embs, axis=0)
    ctx_mean = ctx_mean / max(np.linalg.norm(ctx_mean), 1e-12)
    
    predicted = ctx_mean @ W
    predicted = predicted / max(np.linalg.norm(predicted), 1e-12)
    
    tgt = embs[tgt_idx]
    tgt = tgt / max(np.linalg.norm(tgt), 1e-12)
    
    score = float(np.sum(predicted * tgt))
    scores.append(score)

scores = np.array(scores)
print(f"\nIn-distribution scores:")
print(f"  Mean:   {scores.mean():.4f}")
print(f"  Median: {np.median(scores):.4f}")
print(f"  Std:    {scores.std():.4f}")
print(f"  Min:    {scores.min():.4f}")
print(f"  Max:    {scores.max():.4f}")
print(f"  P10:    {np.percentile(scores, 10):.4f}")
print(f"  P25:    {np.percentile(scores, 25):.4f}")
print(f"  P50:    {np.percentile(scores, 50):.4f}")
print(f"  P75:    {np.percentile(scores, 75):.4f}")
print(f"  P90:    {np.percentile(scores, 90):.4f}")
print(f"  P95:    {np.percentile(scores, 95):.4f}")
print(f"  P99:    {np.percentile(scores, 99):.4f}")

# JEV-equivalent thresholds
print(f"\n=== JEV-equivalent thresholds (calibrated) ===")
print(f"  p>0.7  = REVIEW tier: {(scores > 0.7).mean()*100:.1f}% of canon")
print(f"  p>0.8  = CANON tier:  {(scores > 0.8).mean()*100:.1f}% of canon")
print(f"  p>0.85 = STRONG tier: {(scores > 0.85).mean()*100:.1f}% of canon")

# So if we set threshold at p=0.7, we accept 70% of canon (recall=70%)
# If we want precision=95%, threshold should be at P95 of canon
