"""
JEPA-style canonicity scorer: given a new observation's embedding,
predict how canonical it is based on the tutor's W matrix.

Score = cosine(new_embedding, predicted_next_state)
Higher score = more in line with current canon trajectory.
"""

import numpy as np, json, os, urllib.request

class CanonicityScorer:
    def __init__(self, W_path='/workspace/research/cargo-line-tycoon/research/jepa_tutor/W.npy'):
        self.W = np.load(W_path)  # 1024x1024
        self.embedding_dim = self.W.shape[0]
        self.canon_loaded = False
        self.context = None
    
    def load_canon_context(self, n_recent=20):
        """Load recent canon embeddings for context."""
        DATA_DIR = '/workspace/research/superinstance-advisor/data'
        d = np.load(f'{DATA_DIR}/full_canon_v3.npz', allow_pickle=True)
        embs = np.array(d['embeddings'], dtype=np.float32)
        norms = np.linalg.norm(embs, axis=1, keepdims=True)
        embs_norm = embs / np.maximum(norms, 1e-12)
        # Mean-pool the n_recent pieces (proxy for "current context")
        self.context = np.mean(embs_norm[-n_recent:], axis=0)
        self.context = self.context / max(np.linalg.norm(self.context), 1e-12)
        self.canon_loaded = True
        return self.context
    
    def embed_text(self, text):
        """Embed text via Cloudflare bge-large-en-v1.5."""
        url = "https://api.cloudflare.com/client/v4/accounts/049ff5e84ecf636b53b162cbb580aae6/ai/run/@cf/baai/bge-large-en-v1.5"
        req = urllib.request.Request(url,
            data=json.dumps({"text": [text[:3000]]}).encode(),
            headers={"Authorization": f"Bearer {os.environ['CLOUDFLARE_TOKEN']}",
                     "Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=30) as resp:
            return np.array(json.load(resp)["result"]["data"][0], dtype=np.float32)
    
    def score(self, candidate_embedding):
        """Score a candidate: how canonical is it?
        
        Returns: cosine_similarity to predicted_next_state
        """
        if not self.canon_loaded:
            self.load_canon_context()
        
        # Predict next state from context
        predicted = self.context @ self.W
        predicted = predicted / max(np.linalg.norm(predicted), 1e-12)
        
        # Normalize candidate
        candidate = candidate_embedding / max(np.linalg.norm(candidate_embedding), 1e-12)
        
        # Cosine similarity
        score = float(np.sum(predicted * candidate))
        return score
    
    def verdict(self, score):
        '''JEV-equivalent verdict for a canonicity score.'''
        if score >= 0.85:
            return 'CANON'
        elif score >= 0.75:
            return 'REVIEW'
        elif score >= 0.65:
            return 'REJECT'
        else:
            return 'REJECT'
    
    def score_text(self, text):
        """End-to-end: text → embed → score."""
        emb = self.embed_text(text)
        return self.score(emb)

# Demo usage
if __name__ == '__main__':
    scorer = CanonicityScorer()
    
    # Test with various texts
    test_texts = [
        "the substrate as witness",  # canonical
        "witness-log prev_hash chain",  # canonical
        "memory poisoning injection",  # canonical
        "conscription cron 5% quorum",  # canonical
        "weather in tokyo tomorrow",  # non-canonical
        "how to bake a cake",  # non-canonical
    ]
    
    print('═' * 60)
    print('  Canonicity Scorer — JEPA-style')
    print('═' * 60)
    print()
    
    scores = []
    for t in test_texts:
        s = scorer.score_text(t)
        scores.append(s)
        verdict = scorer.verdict(s)
        icon = '✓' if verdict == 'CANON' else '·' if verdict == 'REVIEW' else '✗'
        print(f'  {s:.4f}  {icon} {verdict:8}  {t}')
    
    print()
    print(f'Mean score: {np.mean(scores):.4f}')
    print(f'Score range: [{min(scores):.4f}, {max(scores):.4f}]')

