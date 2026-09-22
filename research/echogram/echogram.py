"""
Echogram: turn a single query ping into a time-series of substrate responses.

Each ping is a "ping" of the corpus (a single query).
The substrate responds with a probability distribution over canon cells.
An echogram is the TIME SERIES of responses as the corpus evolves.

At inference speed, each ping produces a snapshot of the canon's "depth sound":
- Which cells are most excited (highest probability)
- How the excitation propagates through related cells (interference)
- Where the "noise" is (low-probability cells) and where the "fish" are (high-probability peaks)

The visualization: an echogram is a 2D heatmap where:
- X-axis = time (or query index)
- Y-axis = canon cell index (sorted by cluster)
- Color = probability / interference strength
- Bright peaks = "fish" (canonical matches)
- Dark areas = "noise" (background canon)
"""

import numpy as np, json, os, urllib.request
from collections import defaultdict

DATA_DIR = '/workspace/research/superinstance-advisor/data'
NPZ = f'{DATA_DIR}/full_canon_v3.npz'

class Echogram:
    def __init__(self):
        d = np.load(NPZ, allow_pickle=True)
        self.embs = np.array(d['embeddings'], dtype=np.float32)
        self.tags = list(d['tags'])
        norms = np.linalg.norm(self.embs, axis=1, keepdims=True)
        self.embs_norm = self.embs / np.maximum(norms, 1e-12)
        self.N, self.D = self.embs.shape
        
        # Cluster lookup (first segment of tag)
        self.clusters = [t.split('.')[0] if '.' in t else 'root' for t in self.tags]
        unique_clusters = sorted(set(self.clusters))
        self.cluster_to_idx = {c: i for i, c in enumerate(unique_clusters)}
        self.cell_cluster_idx = np.array([self.cluster_to_idx[c] for c in self.clusters])
        print(f'Loaded {self.N} pieces in {len(unique_clusters)} clusters')
    
    def embed(self, text: str) -> np.ndarray:
        url = "https://api.cloudflare.com/client/v4/accounts/049ff5e84ecf636b53b162cbb580aae6/ai/run/@cf/baai/bge-large-en-v1.5"
        req = urllib.request.Request(url,
            data=json.dumps({"text": [text[:3000]]}).encode(),
            headers={"Authorization": f"Bearer {os.environ['CLOUDFLARE_TOKEN']}",
                     "Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=30) as resp:
            return np.array(json.load(resp)["result"]["data"][0], dtype=np.float32)
    
    def ping(self, query_emb: np.ndarray) -> np.ndarray:
        """Send a ping, get back a probability distribution over canon."""
        q = query_emb / max(np.linalg.norm(query_emb), 1e-12)
        sims = self.embs_norm @ q
        # Softmax for proper probability distribution
        e = np.exp(sims - sims.max())
        return e / e.sum()
    
    def scan(self, queries: list) -> dict:
        """Send a series of pings, build the echogram."""
        n_q = len(queries)
        responses = np.zeros((n_q, self.N))
        
        for i, q in enumerate(queries):
            emb = self.embed(q)
            responses[i] = self.ping(emb)
        
        # Compute "fish density" per cell: how often does this cell appear in top-k
        top_k = 10
        fish_counts = np.zeros(self.N)
        for i in range(n_q):
            top_idx = np.argsort(-responses[i])[:top_k]
            fish_counts[top_idx] += 1
        
        # Cluster aggregation: sum responses per cluster
        unique_clusters = sorted(set(self.clusters))
        cluster_responses = np.zeros((n_q, len(unique_clusters)))
        for i in range(n_q):
            for j, c in enumerate(unique_clusters):
                mask = np.array([c == cl for cl in self.clusters])
                cluster_responses[i, j] = responses[i][mask].sum()
        
        return {
            'responses': responses,
            'cluster_responses': cluster_responses,
            'clusters': unique_clusters,
            'fish_counts': fish_counts,
            'n_queries': n_q,
        }
    
    def ascii_echogram(self, scan_result: dict, n_clusters_display: int = 20) -> str:
        """Build an ASCII echogram visualization."""
        cluster_resp = scan_result['cluster_responses']
        clusters = scan_result['clusters']
        n_q = cluster_resp.shape[0]
        
        # Limit to top-n most-active clusters
        cluster_totals = cluster_resp.sum(axis=0)
        top_clusters = np.argsort(-cluster_totals)[:n_clusters_display]
        
        out = []
        out.append('═' * 70)
        out.append('  ECHOGRAM — ping → time series of substrate responses')
        out.append('═' * 70)
        out.append('')
        out.append(f'  {n_q} pings × {len(top_clusters)} active clusters')
        out.append('')
        # Header: ping indices
        header = '    Ping     |'
        for q_idx in range(n_q):
            header += f' {q_idx:3d}'
        out.append(header)
        out.append('    ' + '-' * (len(header) - 4))
        
        # Each row = a cluster, each column = a ping
        for c_idx in top_clusters:
            cluster_name = clusters[c_idx][:25]
            row = f'  {cluster_name:25} |'
            for q_idx in range(n_q):
                v = cluster_resp[q_idx, c_idx]
                # Scale to ASCII
                if v > 0.5: char = '#'
                elif v > 0.3: char = '*'
                elif v > 0.15: char = '+'
                elif v > 0.05: char = '.'
                else: char = ' '
                row += f'  {char}'
            out.append(row)
        
        # Footer: which cells are "fish"
        out.append('')
        out.append('  Fish (cells in top-10 across all pings):')
        fish = scan_result['fish_counts']
        top_fish = np.argsort(-fish)[:10]
        for i in top_fish:
            out.append(f'    {self.tags[i][:50]:50} fish_count={int(fish[i]):3d}')
        
        return '\n'.join(out)


if __name__ == '__main__':
    echo = Echogram()
    
    # Send a "scan" — multiple pings across topics
    queries = [
        "the substrate as witness",
        "witness-log prev_hash",
        "memory poisoning defense",
        "ubuntu cellular architecture",
        "conscription cron quorum",
        "polyformal port",
        "JEV oracle gate",
        "the irreducible connection",
        "Cell as irreducible system",
        "the soundboard metaphor",
    ]
    
    print('Sending pings...')
    result = echo.scan(queries)
    print(echo.ascii_echogram(result))
    
    # Save echogram data
    np.savez('/workspace/research/cargo-line-tycoon/research/echogram/echogram.npz',
             responses=result['responses'],
             cluster_responses=result['cluster_responses'],
             fish_counts=result['fish_counts'])
    print(f'\nSaved echogram.npz')
