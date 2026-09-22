"""
Task pruning: find the minimal JEV that solves a specific task.

The hypothesis (Casey's insight): as JEV is pruned for a task, its weights
converge to LOOK LIKE the actual task-specific code. The pruned JEV
becomes the irreducible representation of the task.

Method:
1. Define a task T (e.g., "match port to query")
2. Generate a labeled dataset: (query, expected_port)
3. Start with the full canon (JEV with all cells)
4. Iteratively prune cells with lowest importance
5. After each prune, evaluate accuracy
6. The minimal cell set where accuracy = full-set accuracy = the irreducible core
"""

import numpy as np, json, os, urllib.request
from typing import List, Tuple

DATA_DIR = '/workspace/research/superinstance-advisor/data'
NPZ = f'{DATA_DIR}/full_canon_v3.npz'

class PrunedJEV:
    def __init__(self):
        d = np.load(NPZ, allow_pickle=True)
        self.embs = np.array(d['embeddings'], dtype=np.float32)
        self.tags = list(d['tags'])
        norms = np.linalg.norm(self.embs, axis=1, keepdims=True)
        self.embs_norm = self.embs / np.maximum(norms, 1e-12)
        self.N, self.D = self.embs.shape
        # Active set: which cells are currently in JEV
        self.active = np.ones(self.N, dtype=bool)
        self.accuracy_history = []
        self.size_history = []
        print(f'Loaded {self.N} canon pieces @ {self.D}d')
    
    def embed(self, text: str) -> np.ndarray:
        url = "https://api.cloudflare.com/client/v4/accounts/049ff5e84ecf636b53b162cbb580aae6/ai/run/@cf/baai/bge-large-en-v1.5"
        req = urllib.request.Request(url,
            data=json.dumps({"text": [text[:3000]]}).encode(),
            headers={"Authorization": f"Bearer {os.environ['CLOUDFLARE_TOKEN']}",
                     "Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=30) as resp:
            return np.array(json.load(resp)["result"]["data"][0], dtype=np.float32)
    
    def score(self, query_emb: np.ndarray) -> np.ndarray:
        """Score query against active cells only."""
        q = query_emb / max(np.linalg.norm(query_emb), 1e-12)
        sims = self.embs_norm @ q
        # Mask out inactive cells
        sims[~self.active] = -np.inf
        return sims
    
    def cell_importance(self, queries: List[str], queries_emb: List[np.ndarray]) -> np.ndarray:
        """Compute per-cell importance: how often does cell appear in top-k across queries."""
        k = 10
        importance = np.zeros(self.N)
        for q_emb in queries_emb:
            sims = self.score(q_emb)
            top_k_idx = np.argsort(-sims)[:k]
            importance[top_k_idx] += 1
        return importance
    
    def prune_step(self, queries_emb: List[np.ndarray], prune_fraction: float = 0.05):
        """Remove the bottom-prune_fraction of cells by importance."""
        imp = self.cell_importance([], queries_emb)
        # Only consider active cells
        active_imp = imp[self.active]
        if len(active_imp) == 0:
            return 0
        
        # Threshold: bottom 5% by importance
        threshold = np.percentile(active_imp, prune_fraction * 100)
        # Cells to remove: active cells with importance <= threshold AND importance > 0
        # (Keep cells that have non-zero importance but remove the truly unused ones)
        to_remove = self.active & (imp <= threshold) & (imp == 0)
        self.active[to_remove] = False
        
        return int(to_remove.sum())
    
    def prune_to_accuracy(self, queries_emb: List[np.ndarray], labels: List[int], 
                          evaluate_fn, min_accuracy: float = 0.95,
                          max_iterations: int = 50) -> dict:
        """Iteratively prune until accuracy drops below threshold.
        
        Args:
            queries_emb: list of query embeddings
            labels: list of expected top-1 cell index for each query
            evaluate_fn: function that takes (queries_emb, labels, pruned_jev) → accuracy
            min_accuracy: stop when accuracy drops below this
            max_iterations: maximum prune iterations
        
        Returns:
            dict with 'active_indices', 'accuracy', 'compression_ratio'
        """
        # Initial accuracy (full canon)
        initial_acc = evaluate_fn(queries_emb, labels, self)
        print(f'\nInitial accuracy: {initial_acc:.4f} ({self.active.sum()} cells active)')
        
        accuracies = [initial_acc]
        sizes = [int(self.active.sum())]
        
        for i in range(max_iterations):
            removed = self.prune_step(queries_emb, prune_fraction=0.10)
            if removed == 0:
                print(f'  Iter {i+1}: no cells removable, stopping')
                break
            
            acc = evaluate_fn(queries_emb, labels, self)
            accuracies.append(acc)
            sizes.append(int(self.active.sum()))
            
            if i % 5 == 0 or acc < min_accuracy:
                print(f'  Iter {i+1}: removed {removed}, accuracy={acc:.4f}, size={self.active.sum()}')
            
            if acc < min_accuracy:
                print(f'  Stopping: accuracy {acc:.4f} below threshold {min_accuracy}')
                break
        
        final_acc = accuracies[-1]
        compression = self.N / max(sizes[-1], 1)
        
        return {
            'initial_accuracy': initial_acc,
            'final_accuracy': final_acc,
            'compression_ratio': compression,
            'active_count': int(self.active.sum()),
            'active_indices': np.where(self.active)[0].tolist(),
            'accuracies': accuracies,
            'sizes': sizes,
        }


# ════════════════════════════════════════════════════════════════════
# TASK 1: Find canonical piece closest to a query
# ════════════════════════════════════════════════════════════════════

def task_port_matcher(pruned_jev, n_test: int = 30):
    """Task: for each query, find the top-1 canon piece.
    
    Label = the index of the canon piece with highest cosine to the query.
    (This is what JEV does anyway.)
    """
    queries = [
        "the substrate as witness", "witness-log", "prev_hash chain",
        "cell-graph topology", "memory poisoning", "ubuntu",
        "conscription cron", "polyformal port", "JEV oracle",
        "irreducible connection", "11 opcodes", "the soundboard",
        "aluminum and copper", "ship captain's log", "tariff",
        "witness", "witness-log", "cell", "opcode", "BIND",
        "LINK", "EFFECT", "VIEW", "TICK", "ATTEST",
        "DELEGATE", "CONTEST", "MERGER", "REVOKE", "WITHDRAW",
    ]
    
    # Embed queries
    query_embs = [pruned_jev.embed(q) for q in queries[:n_test]]
    
    # "Labels" — for evaluation, use the full-canon top-1 as ground truth
    full_top1 = []
    for q_emb in query_embs:
        sims = pruned_jev.embs_norm @ (q_emb / max(np.linalg.norm(q_emb), 1e-12))
        full_top1.append(int(np.argmax(sims)))
    
    # Evaluation: how often does pruned_jev's top-1 match the full-canon top-1?
    def evaluate(queries_emb, labels, pj: PrunedJEV) -> float:
        correct = 0
        for q_emb, expected_top1 in zip(queries_emb, labels):
            sims = pj.score(q_emb)
            top1 = int(np.argmax(sims))
            if top1 == expected_top1:
                correct += 1
        return correct / len(queries_emb)
    
    # Prune
    result = pruned_jev.prune_to_accuracy(query_embs, full_top1, evaluate, 
                                           min_accuracy=0.95, max_iterations=30)
    
    print(f'\n═══ TASK: Port Matcher ═══')
    print(f'  Initial accuracy: {result["initial_accuracy"]:.4f}')
    print(f'  Final accuracy:   {result["final_accuracy"]:.4f}')
    print(f'  Active cells:     {result["active_count"]} / {pruned_jev.N}')
    print(f'  Compression:      {result["compression_ratio"]:.2f}×')
    
    # The irreducible set
    if result['active_indices']:
        print(f'\n  IRREDUCIBLE CORE (first 10 cells):')
        for idx in result['active_indices'][:10]:
            print(f'    {idx:4d}: {pruned_jev.tags[idx][:55]}')
    
    return result


# ════════════════════════════════════════════════════════════════════
# TASK 2: Cluster classifier — does the query belong to cluster X?
# ════════════════════════════════════════════════════════════════════

def task_cluster_classifier(pruned_jev, n_test: int = 30):
    """Task: given a query, predict which cluster it belongs to."""
    queries = [
        "witness-log", "witness-log", "prev_hash", "memory poisoning",
        "ubuntu", "conscription", "polyformal", "JEV", "11 opcodes",
        "ATTEST", "CONTEST", "WITHDRAW", "BIND", "LINK",
        "EFFECT", "VIEW", "TICK", "DELEGATE", "MERGER", "REVOKE",
        "whakaako", "socratic", "confucian", "pedagogical",
        "the substrate as witness", "cell-graph topology",
        "conscription cron quorum", "irreducible connection",
        "the soundboard metaphor", "aluminum and copper",
    ]
    
    query_embs = [pruned_jev.embed(q) for q in queries[:n_test]]
    
    # Ground truth: top cluster
    def get_cluster_for_query(q_emb):
        sims = pruned_jev.embs_norm @ (q_emb / max(np.linalg.norm(q_emb), 1e-12))
        top_idx = int(np.argmax(sims))
        return pruned_jev.tags[top_idx].split('.')[0]
    
    full_labels = [get_cluster_for_query(q) for q in query_embs]
    
    def evaluate(queries_emb, labels, pj: PrunedJEV) -> float:
        correct = 0
        for q_emb, expected_cluster in zip(queries_emb, labels):
            sims = pj.score(q_emb)
            if np.all(sims == -np.inf):
                continue
            top_idx = int(np.argmax(sims))
            predicted_cluster = pj.tags[top_idx].split('.')[0]
            if predicted_cluster == expected_cluster:
                correct += 1
        return correct / len(queries_emb)
    
    # Reset active
    pruned_jev.active = np.ones(pruned_jev.N, dtype=bool)
    
    result = pruned_jev.prune_to_accuracy(query_embs, full_labels, evaluate,
                                           min_accuracy=0.95, max_iterations=30)
    
    print(f'\n═══ TASK: Cluster Classifier ═══')
    print(f'  Initial accuracy: {result["initial_accuracy"]:.4f}')
    print(f'  Final accuracy:   {result["final_accuracy"]:.4f}')
    print(f'  Active cells:     {result["active_count"]} / {pruned_jev.N}')
    print(f'  Compression:      {result["compression_ratio"]:.2f}×')
    
    return result


if __name__ == '__main__':
    print('═' * 70)
    print('  TASK PRUNING — minimal JEV = irreducible code')
    print('═' * 70)
    
    # Task 1: Port matcher
    jev1 = PrunedJEV()
    result1 = task_port_matcher(jev1)
    
    # Task 2: Cluster classifier
    jev2 = PrunedJEV()
    result2 = task_cluster_classifier(jev2)
    
    # Save
    summary = {
        'task_port_matcher': {
            'initial_accuracy': result1['initial_accuracy'],
            'final_accuracy': result1['final_accuracy'],
            'active_count': result1['active_count'],
            'compression_ratio': result1['compression_ratio'],
            'irreducible_first10': [jev1.tags[i] for i in result1['active_indices'][:10]],
        },
        'task_cluster_classifier': {
            'initial_accuracy': result2['initial_accuracy'],
            'final_accuracy': result2['final_accuracy'],
            'active_count': result2['active_count'],
            'compression_ratio': result2['compression_ratio'],
        },
    }
    
    with open('/workspace/research/cargo-line-tycoon/research/task_pruning/results.json', 'w') as f:
        json.dump(summary, f, indent=2)
    print(f'\nResults saved')
