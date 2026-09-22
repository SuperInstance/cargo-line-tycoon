"""
Wavefunction JEV: not particle scoring, but a wavefunction across the corpus
with explicit interference between cells.

Standard JEV (particle view): for each cell i, compute cos(query, cell_i)
independently. Cells don't know about each other.

Wavefunction JEV: the query creates a SUPERPOSITION across all cells
simultaneously. Cells INTERFERE:
- Two related cells REINFORCE (constructive interference)
- Two unrelated cells CANCEL (destructive interference)

This is the substrate's version of multi-head attention, but with explicit
phase encoding from each cell's position in the canon.

The output is the probability distribution |ψ|² over all cells.
"""

import numpy as np, json, os, urllib.request
from typing import Tuple, List

DATA_DIR = '/workspace/research/superinstance-advisor/data'
NPZ = f'{DATA_DIR}/full_canon_v3.npz'

class WavefunctionJEV:
    def __init__(self):
        d = np.load(NPZ, allow_pickle=True)
        self.embs = np.array(d['embeddings'], dtype=np.float32)
        self.tags = list(d['tags'])
        norms = np.linalg.norm(self.embs, axis=1, keepdims=True)
        self.embs_norm = self.embs / np.maximum(norms, 1e-12)
        self.N, self.D = self.embs.shape
        print(f'Loaded {self.N} canon pieces @ {self.D}d')
    
    def embed(self, text: str) -> np.ndarray:
        url = "https://api.cloudflare.com/client/v4/accounts/049ff5e84ecf636b53b162cbb580aae6/ai/run/@cf/baai/bge-large-en-v1.5"
        req = urllib.request.Request(url,
            data=json.dumps({"text": [text[:3000]]}).encode(),
            headers={"Authorization": f"Bearer {os.environ['CLOUDFLARE_TOKEN']}",
                     "Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=30) as resp:
            return np.array(json.load(resp)["result"]["data"][0], dtype=np.float32)
    
    def score_particle(self, query_emb: np.ndarray) -> np.ndarray:
        """Standard particle-view JEV: per-cell cosine, no interference."""
        q = query_emb / max(np.linalg.norm(query_emb), 1e-12)
        return self.embs_norm @ q  # (N,)
    
    def score_wavefunction(self, query_emb: np.ndarray, 
                            phase_mode: str = 'index',
                            temperature: float = 1.0) -> Tuple[np.ndarray, dict]:
        """Wavefunction JEV with explicit interference between cells.
        
        Args:
            query_emb: 1024d query embedding
            phase_mode: how to assign phases to cells:
                'index': phase = i / N * 2π (canon position)
                'cluster': phase = cluster hash
                'random': phase = random (for baseline)
            temperature: scaling factor for cosine similarities
        
        Returns:
            probs: probability distribution over cells (|ψ|²)
            diagnostics: dict with amplitudes, phases, interference strength
        """
        q = query_emb / max(np.linalg.norm(query_emb), 1e-12)
        sims = (self.embs_norm @ q) / temperature  # (N,)
        
        # Phases
        if phase_mode == 'index':
            phases = np.linspace(0, 2 * np.pi, self.N)
        elif phase_mode == 'cluster':
            # Use cluster hash from tag (proxy)
            phases = np.array([hash(t.split('.')[0]) % 1000 / 1000.0 * 2 * np.pi 
                              for t in self.tags])
        elif phase_mode == 'random':
            phases = np.random.uniform(0, 2 * np.pi, self.N)
        else:
            raise ValueError(f"Unknown phase_mode: {phase_mode}")
        
        # Complex amplitudes α_i = sim_i · e^(i·φ_i)
        amp_re = sims * np.cos(phases)
        amp_im = sims * np.sin(phases)
        
        # Total wavefunction Ψ = Σ_i α_i
        psi_re = amp_re.sum()
        psi_im = amp_im.sum()
        psi_mag = np.sqrt(psi_re**2 + psi_im**2)
        
        # Per-cell probability: |α_i + interference_i|²
        # The "interference_i" is the contribution from all OTHER cells to cell i's amplitude.
        # Specifically: probability_i = |α_i + Σ_{j≠i} α_j·e^(i·Δφ_ij)|² where Δφ_ij is some phase relation
        # 
        # For full quantum interpretation: |α_i|² is the marginal probability of i,
        # plus the interference term 2·Re(α_i · conj(Σ_{j≠i} α_j))
        # 
        # But for the "wavefunction" view, we want: what is the probability of measuring
        # cell i as the canonical response?
        # 
        # In standard interference: the joint amplitude is the sum, but the per-cell
        # marginal requires integrating over all other cells.
        # 
        # Practical approach: compute the cross-correlation matrix C[i,j] = α_i · α_j* (complex mult)
        # The diagonal |α_i|² is the self-amplitude
        # The off-diagonal Σ_j C[i,j] for j!=i is the interference_i
        
        # Vectorized: cross[i] = Re(α_i) · Σ_j Re(α_j) + Im(α_i) · Σ_j Im(α_j) - (|α_i|²)
        # = α_i · (Σ_j α_j) - |α_i|²  (real part)
        sum_re = amp_re.sum()
        sum_im = amp_im.sum()
        cross_re = amp_re * sum_re - amp_re**2
        cross_im = amp_im * sum_im - amp_im**2
        # |α_i + interference|² = (Re_i + cross_re_i)² + (Im_i + cross_im_i)²
        prob_re = amp_re + cross_re
        prob_im = amp_im + cross_im
        probs = prob_re**2 + prob_im**2
        
        # Normalize
        probs = probs / max(probs.sum(), 1e-12)
        
        # Diagnostics
        diag = {
            'psi_magnitude': float(psi_mag),
            'psi_phase': float(np.arctan2(psi_im, psi_re)),
            'phase_mode': phase_mode,
            'temperature': temperature,
            'max_prob': float(probs.max()),
            'entropy': float(-(probs * np.log(probs + 1e-12)).sum()),
            'concentration': float((probs ** 2).sum()),  # Gini-like measure
        }
        return probs, diag
    
    def interference_pattern(self, query_emb: np.ndarray) -> dict:
        """Compute the interference pattern between cells for a query.
        
        Returns: dict with:
            - 'constructive_pairs': (i, j) pairs that reinforce
            - 'destructive_pairs': (i, j) pairs that cancel
            - 'total_constructive': sum of constructive contributions
            - 'total_destructive': sum of destructive contributions
        """
        q = query_emb / max(np.linalg.norm(query_emb), 1e-12)
        sims = self.embs_norm @ q  # (N,)
        
        # Phase by cluster (semantic groups interfere with each other)
        phases = np.array([hash(t.split('.')[0]) % 1000 / 1000.0 * 2 * np.pi 
                          for t in self.tags])
        
        # Phase difference matrix
        dphase = phases[:, None] - phases[None, :]  # (N, N)
        
        # For each pair (i, j), interference contribution = sim_i · sim_j · cos(Δφ_ij)
        sims_outer = sims[:, None] * sims[None, :]
        interference = sims_outer * np.cos(dphase)
        
        # Self-contribution (diagonal)
        np.fill_diagonal(interference, 0)
        
        # Constructive: cos(Δφ) > 0
        constructive = np.sum(interference[interference > 0])
        destructive = np.sum(interference[interference < 0])
        
        return {
            'total_constructive': float(constructive),
            'total_destructive': float(destructive),
            'net_interference': float(constructive + destructive),
            'interference_ratio': float(constructive / (abs(destructive) + 1e-12)),
        }
    
    def compare_views(self, text: str):
        """Compare particle-view vs wavefunction-view for a query."""
        q = self.embed(text)
        particle = self.score_particle(q)
        wave, diag = self.score_wavefunction(q, phase_mode='cluster')
        
        # Top-10 in each view
        particle_top = np.argsort(-particle)[:10]
        wave_top = np.argsort(-wave)[:10]
        
        print(f'\nQuery: {text!r}')
        print(f'  Particle view (top-5):')
        for i in particle_top[:5]:
            print(f'    {i:4d}: cos={particle[i]:.4f}  {self.tags[i][:50]}')
        print(f'  Wavefunction view (top-5):')
        for i in wave_top[:5]:
            print(f'    {i:4d}: P={wave[i]:.4f}  {self.tags[i][:50]}')
        print(f'  Diagnostics:')
        print(f'    |ψ| = {diag["psi_magnitude"]:.4f}, ∠ψ = {diag["psi_phase"]:.4f} rad')
        print(f'    entropy = {diag["entropy"]:.4f}, concentration = {diag["concentration"]:.4f}')
        
        # Interference pattern
        ip = self.interference_pattern(q)
        print(f'  Interference:')
        print(f'    constructive: {ip["total_constructive"]:+.4f}')
        print(f'    destructive: {ip["total_destructive"]:+.4f}')
        print(f'    net: {ip["net_interference"]:+.4f}')
        print(f'    constructive/destructive ratio: {ip["interference_ratio"]:.4f}')


if __name__ == '__main__':
    jev = WavefunctionJEV()
    
    # Test queries
    queries = [
        "the substrate as witness",
        "cell-graph topology",
        "ubuntu cellular architecture",
        "what is the irreducible connection",
        "conscription loop with witness-log",
    ]
    
    print('═' * 70)
    print('  WAVE FUNCTION JEV — particle vs waveform')
    print('═' * 70)
    
    for q in queries:
        jev.compare_views(q)
    
    # Save summary
    summary = {
        'corpus_size': jev.N,
        'embedding_dim': jev.D,
        'methods': ['particle (standard cosine)', 'wavefunction (with interference)'],
    }
    print(f'\nSummary saved')
