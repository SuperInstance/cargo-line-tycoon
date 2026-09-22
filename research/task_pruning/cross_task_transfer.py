"""
Cross-task transfer: does pruning for task A help or hurt on task B?

Hypothesis (Casey's insight): as JEV is pruned for a task, the weights
converge to LOOK LIKE the actual task-specific code. Different tasks
should produce DIFFERENT irreducible cores. But some tasks may share
core structure (e.g., both "port matching" and "cluster classification"
need to know canon content).

The test:
1. Prune JEV for task A (port matching)
2. Evaluate accuracy on task A (should be ~100%)
3. Evaluate accuracy on task B (cluster classification)
4. Compare to baseline (full canon)
5. Measure transfer: how much of task B's irreducible core overlaps with task A's?
"""

import numpy as np, json, os, urllib.request

DATA_DIR = '/workspace/research/superinstance-advisor/data'
NPZ = f'{DATA_DIR}/full_canon_v3.npz'

class PruningJEV:
    def __init__(self):
        d = np.load(NPZ, allow_pickle=True)
        self.embs = np.array(d['embeddings'], dtype=np.float32)
        self.tags = list(d['tags'])
        norms = np.linalg.norm(self.embs, axis=1, keepdims=True)
        self.embs_norm = self.embs / np.maximum(norms, 1e-12)
        self.N, self.D = self.embs.shape
        self.full_active = np.ones(self.N, dtype=bool)
        print(f'Loaded {self.N} canon pieces @ {self.D}d')
    
    def embed(self, text):
        url = "https://api.cloudflare.com/client/v4/accounts/049ff5e84ecf636b53b162cbb580aae6/ai/run/@cf/baai/bge-large-en-v1.5"
        req = urllib.request.Request(url,
            data=json.dumps({"text": [text[:3000]]}).encode(),
            headers={"Authorization": f"Bearer {os.environ['CLOUDFLARE_TOKEN']}",
                     "Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=30) as resp:
            return np.array(json.load(resp)["result"]["data"][0], dtype=np.float32)
    
    def score(self, query_emb, active):
        q = query_emb / max(np.linalg.norm(query_emb), 1e-12)
        sims = self.embs_norm @ q
        sims[~active] = -np.inf
        return sims
    
    def prune_to_core(self, queries, queries_emb, top_k_threshold=10):
        """Prune to cells that appear in top-k across queries.
        
        Returns: active mask
        """
        # Cell importance = count of times it appears in top-k
        importance = np.zeros(self.N)
        for q_emb in queries_emb:
            sims = self.embs_norm @ (q_emb / max(np.linalg.norm(q_emb), 1e-12))
            top_k = np.argsort(-sims)[:top_k_threshold]
            importance[top_k] += 1
        
        # Active = cells that EVER appear in top-k
        active = importance > 0
        return active, importance
    
    def evaluate(self, queries_emb, labels, active):
        """Evaluate accuracy on a labeled task."""
        correct = 0
        for q_emb, expected in zip(queries_emb, labels):
            sims = self.score(q_emb, active)
            if np.all(sims == -np.inf):
                continue
            top1 = int(np.argmax(sims))
            if top1 == expected:
                correct += 1
        return correct / len(queries_emb)


if __name__ == '__main__':
    print('═' * 70)
    print('  CROSS-TASK TRANSFER — does pruned JEV transfer?')
    print('═' * 70)
    print()
    
    jev = PruningJEV()
    
    # Define 4 tasks
    TASKS = {
        'port_matching': {
            'queries': [
                "port of Boston", "the harbor at New York", "Halifax shipping",
                "Miami port authority", "New Orleans", "the Houston port",
                "shanghai harbor", "hongkong docks", "qingdao",
                "tianjin port", "Santos harbor", "Buenos Aires port",
                "Rio de Janeiro", "Yokohama port", "Kobe harbor",
                "Nagasaki", "Osaka port", "Tokyo harbor",
            ],
        },
        'witness_search': {
            'queries': [
                "witness-log entry", "prev_hash chain", "memory poisoning",
                "ATTEST opcode", "CONTEST opcode", "WITHDRAW",
                "the witness as prediction", "checksum chain",
                "three forms of evidence", "witness chain integrity",
            ],
        },
        'polyformal_search': {
            'queries': [
                "TypeScript port", "Rust implementation", "Python substrate",
                "C99 algebraic proof", "polyformal port",
                "byte-exact canary", "FNV-1a 64-bit",
                "cross-language reproducibility",
            ],
        },
        'philosophy_search': {
            'queries': [
                "ubuntu cellular architecture", "whakaako reciprocal exchange",
                "socratic dialectic", "confucian relationship",
                "irreducible connection", "witness-log as prediction",
                "the cell as a being", "I am because we are",
            ],
        },
    }
    
    # Embed all queries
    print('Embedding queries...')
    task_embs = {}
    for task_name, task_data in TASKS.items():
        task_embs[task_name] = [jev.embed(q) for q in task_data['queries']]
        print(f'  {task_name}: {len(task_embs[task_name])} queries embedded')
    print()
    
    # Prune and evaluate each task
    pruned_cores = {}
    print('Pruning each task to its irreducible core...')
    for task_name in TASKS:
        active, importance = jev.prune_to_core(TASKS[task_name]['queries'], task_embs[task_name])
        pruned_cores[task_name] = active
        n_active = active.sum()
        print(f'  {task_name}: {n_active} cells in core ({100*n_active/jev.N:.1f}% of canon)')
    print()
    
    # Cross-task transfer: prune for A, evaluate on B
    print('═══ Cross-task transfer matrix ═══')
    print()
    
    # Header
    print(f'{"Prune for":16} | ', end='')
    for task in TASKS: print(f'{task[:12]:14}', end='')
    print()
    print('-' * 90)
    
    transfer_matrix = {}
    for prune_task in TASKS:
        print(f'{prune_task:16} | ', end='')
        for eval_task in TASKS:
            active = pruned_cores[prune_task]
            # Get ground truth for eval_task
            sims_full = []
            for q_emb in task_embs[eval_task]:
                sim = jev.embs_norm @ (q_emb / max(np.linalg.norm(q_emb), 1e-12))
                sims_full.append(int(np.argmax(sim)))
            
            acc = jev.evaluate(task_embs[eval_task], sims_full, active)
            transfer_matrix[(prune_task, eval_task)] = acc
            print(f'{acc*100:6.1f}%        ', end='')
        print()
    print()
    
    # Analysis
    print('═══ Transfer analysis ═══')
    print()
    for prune_task in TASKS:
        own_acc = transfer_matrix[(prune_task, prune_task)]
        others = [transfer_matrix[(prune_task, t)] for t in TASKS if t != prune_task]
        mean_transfer = np.mean(others) if others else 0
        print(f'  {prune_task}: own={own_acc*100:.1f}%, transfer-mean={mean_transfer*100:.1f}%')
    
    # Best transfer pair
    print()
    print('Best transfer pairs (highest transfer):')
    pairs = [(transfer_matrix[(a, b)], a, b) for a in TASKS for b in TASKS if a != b]
    pairs.sort(reverse=True)
    for acc, a, b in pairs[:5]:
        print(f'  {a} → {b}: {acc*100:.1f}%')
    
    print()
    print('Worst transfer pairs (most task-specific):')
    pairs.sort()
    for acc, a, b in pairs[:5]:
        print(f'  {a} → {b}: {acc*100:.1f}%')
    
    # Save
    output = {
        'tasks': list(TASKS.keys()),
        'core_sizes': {t: int(pruned_cores[t].sum()) for t in TASKS},
        'transfer_matrix': {f'{a}_to_{b}': float(transfer_matrix[(a, b)]) 
                            for a in TASKS for b in TASKS},
    }
    with open('/workspace/research/cargo-line-tycoon/research/task_pruning/cross_task_transfer.json', 'w') as f:
        json.dump(output, f, indent=2)
    print(f'\nSaved cross_task_transfer.json')
