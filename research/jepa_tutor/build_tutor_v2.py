"""
JEPA tutor v2: Test with different window sizes and predict DIFFERENCE not absolute.
"""
import json, time, os, numpy as np

DATA_DIR = '/workspace/research/superinstance-advisor/data'
NPZ = f'{DATA_DIR}/full_canon_v3.npz'

d = np.load(NPZ, allow_pickle=True)
embs = np.array(d['embeddings'], dtype=np.float32)
tags = list(d['tags'])
N, D = embs.shape
print(f'Loaded {N} pieces @ {D}d')

with open(f'{DATA_DIR}/canon_meta_v3.json') as f:
    meta = json.load(f)
meta_by_tag = {m['tag']: m for m in meta}

# Sort by tag (proxy for temporal)
ordered_pairs = []
for i, tag in enumerate(tags):
    m = meta_by_tag.get(tag, {})
    path = m.get('path', tag)
    cluster = path.split('/')[0] if '/' in path else 'unknown'
    ordered_pairs.append((tag, embs[i], cluster))

ordered_pairs.sort(key=lambda x: x[0])

# Test multiple windows
print('\nTesting different window sizes...')
print('  Window | Cosine (mean) | Naive baseline | Improvement')
print('  ' + '-' * 60)

for WINDOW in [1, 3, 5, 10, 20]:
    contexts = []
    targets = []
    for i in range(len(ordered_pairs) - WINDOW):
        ctx = np.mean([p[1] for p in ordered_pairs[i:i+WINDOW]], axis=0)
        tgt = ordered_pairs[i+WINDOW][1]
        contexts.append(ctx)
        targets.append(tgt)
    
    contexts = np.array(contexts)
    targets = np.array(targets)
    contexts_norm = contexts / np.maximum(np.linalg.norm(contexts, axis=1, keepdims=True), 1e-12)
    targets_norm = targets / np.maximum(np.linalg.norm(targets, axis=1, keepdims=True), 1e-12)
    
    n_train = int(len(contexts_norm) * 0.8)
    X_train, X_test = contexts_norm[:n_train], contexts_norm[n_train:]
    y_train, y_test = targets_norm[:n_train], targets_norm[n_train:]
    
    # Ridge regression
    XtX = X_train.T @ X_train + 0.1 * np.eye(D)
    W = np.linalg.solve(XtX, X_train.T @ y_train)
    
    y_pred = X_test @ W
    y_pred_norm = y_pred / np.maximum(np.linalg.norm(y_pred, axis=1, keepdims=True), 1e-12)
    
    sims = np.sum(y_pred_norm * y_test, axis=1)
    sims_naive = np.sum(X_test * y_test, axis=1)
    
    print(f'  {WINDOW:5}  | {sims.mean():.4f}         | {sims_naive.mean():.4f}          | {sims.mean()-sims_naive.mean():+.4f}')

# KEY: test "predict the cluster" — does the tutor know the topic of the next piece?
print('\n=== Cluster prediction (tutor knows next topic?) ===')
print('  Window | Cluster match rate')
print('  ' + '-' * 40)

for WINDOW in [1, 3, 5, 10, 20]:
    contexts = []
    target_clusters = []
    for i in range(len(ordered_pairs) - WINDOW):
        ctx_clusters = [p[2] for p in ordered_pairs[i:i+WINDOW]]
        # Most common cluster in context
        from collections import Counter
        ctx_cluster = Counter(ctx_clusters).most_common(1)[0][0]
        target_cluster = ordered_pairs[i+WINDOW][2]
        contexts.append(ctx_cluster)
        target_clusters.append(target_cluster)
    
    n_train = int(len(contexts) * 0.8)
    c_train = contexts[:n_train]
    c_test = contexts[n_train:]
    t_train = target_clusters[n_train:]
    
    # Naive: predict most common cluster overall
    overall = Counter(target_clusters).most_common(1)[0][0]
    naive_rate = sum(1 for t in target_clusters if t == overall) / len(target_clusters)
    
    # Predict with context (use majority of context)
    correct = 0
    for c, t in zip(contexts, target_clusters):
        if c == t:
            correct += 1
    pred_rate = correct / len(target_clusters)
    
    print(f'  {WINDOW:5}  | {pred_rate:.4f} (naive: {naive_rate:.4f})')

