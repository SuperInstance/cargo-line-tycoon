"""
Cosine-based canonicity scorer: simpler, more direct than JEPA prediction.
Score = cosine(candidate, nearest canon piece).
This is what JEV does in production.
"""

import numpy as np, json, os, urllib.request

class CosineScorer:
    def __init__(self, npz_path='/workspace/research/superinstance-advisor/data/full_canon_v3.npz'):
        d = np.load(npz_path, allow_pickle=True)
        self.embs = np.array(d['embeddings'], dtype=np.float32)
        self.tags = list(d['tags'])
        norms = np.linalg.norm(self.embs, axis=1, keepdims=True)
        self.embs_norm = self.embs / np.maximum(norms, 1e-12)
        self.embedding_dim = self.embs.shape[1]
        self.loaded = True
        print(f'Loaded {len(self.embs)} canon pieces @ {self.embedding_dim}d')
    
    def embed_text(self, text):
        url = "https://api.cloudflare.com/client/v4/accounts/049ff5e84ecf636b53b162cbb580aae6/ai/run/@cf/baai/bge-large-en-v1.5"
        req = urllib.request.Request(url,
            data=json.dumps({"text": [text[:3000]]}).encode(),
            headers={"Authorization": f"Bearer {os.environ['CLOUDFLARE_TOKEN']}",
                     "Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=30) as resp:
            return np.array(json.load(resp)["result"]["data"][0], dtype=np.float32)
    
    def score(self, candidate_embedding, k=5):
        """Return cosine similarity to top-k canon pieces."""
        c = candidate_embedding / max(np.linalg.norm(candidate_embedding), 1e-12)
        sims = self.embs_norm @ c
        top_k = np.sort(sims)[-k:][::-1]
        return float(top_k.mean())  # mean of top-5 cosines
    
    def nearest(self, candidate_embedding, k=5):
        """Return nearest canon pieces."""
        c = candidate_embedding / max(np.linalg.norm(candidate_embedding), 1e-12)
        sims = self.embs_norm @ c
        top_idx = np.argsort(-sims)[:k]
        return [(self.tags[i], float(sims[i])) for i in top_idx]
    
    def score_text(self, text):
        emb = self.embed_text(text)
        return self.score(emb)

# Calibrate against in-distribution canon
def calibrate():
    scorer = CosineScorer()
    
    # Pick 50 random canon pieces, score them against the OTHER canon pieces
    # (leave-one-out style)
    n_test = 50
    scores = []
    np.random.seed(42)
    indices = np.random.choice(len(scorer.embs), n_test, replace=False)
    
    for i in indices:
        # Use this piece as candidate, score against rest
        emb = scorer.embs[i]
        # Compute cosine to all OTHER canon pieces
        sims = scorer.embs_norm @ (emb / max(np.linalg.norm(emb), 1e-12))
        sims[i] = -1  # exclude self
        top5 = np.sort(sims)[-5:][::-1]
        scores.append(top5.mean())
    
    scores = np.array(scores)
    print('\nIn-distribution scores (canon pieces):')
    print(f'  Mean:   {scores.mean():.4f}')
    print(f'  Median: {np.median(scores):.4f}')
    print(f'  P10:    {np.percentile(scores, 10):.4f}')
    print(f'  P90:    {np.percentile(scores, 90):.4f}')

if __name__ == '__main__':
    calibrate()
    
    scorer = CosineScorer()
    
    test_texts = [
        ("Canon-style", """The substrate is a 4D cell-graph where every cell is irreducible, 
        every observation is a witness, every witness is a prediction. The cell-graph is 
        canonical; every UI is an opener onto it. The algebra has 11 opcodes."""),
        ("Pure non-canon", """The quick brown fox jumps over the lazy dog. Pack my box with 
        five dozen liquor jugs. How vexingly quick daft zebras jump."""),
        ("Borderline", """Software architecture is the high-level structure of a software system. 
        Good architecture makes systems maintainable. The cell-graph pattern organizes state as 
        connected cells rather than as a global database."""),
    ]
    
    print('\n═══ Cosine Scorer Tests ═══')
    for label, text in test_texts:
        s = scorer.score_text(text)
        verdict = 'CANON' if s > 0.75 else 'REVIEW' if s > 0.65 else 'REJECT'
        print(f'\n{label}: score={s:.4f}, verdict={verdict}')
        print(f'  Preview: {text[:120].strip()!r}...')
        # Show nearest
        emb = scorer.embed_text(text)
        nearest = scorer.nearest(emb, k=3)
        print(f'  Nearest canon: {nearest[0][0][:50]} ({nearest[0][1]:.4f})')
        print(f'                  {nearest[1][0][:50]} ({nearest[1][1]:.4f})')

