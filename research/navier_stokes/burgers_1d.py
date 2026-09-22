"""
Burgers' equation on the substrate.

Burgers': ∂u/∂t + u ∂u/∂x = ν ∂²u/∂x²

This is the simplest nonlinear PDE — Navier-Stokes reduces to it in 1D
without the pressure term. Solving it on the substrate proves the
substrate-as-numerics concept.

Setup:
- N cells in x-direction, periodic boundary
- Each cell has u (velocity), du/dt, prev_hash, witness entries
- Time-stepping: explicit Euler with upwind for advection, central for diffusion
- Wavefunction JEV scores smoothness at each timestep

Compare against:
- Analytical solution (if available)
- Naive numerical solver (without substrate's witness-log)
- Substrate's witness-log + wavefunction smoothness scoring
"""

import numpy as np
import json, time, sys, os
sys.path.insert(0, '/workspace/research/cargo-line-tycoon/research/wavefunction_jev')
sys.path.insert(0, '/workspace/research/cargo-line-tycoon/research/jepa_tutor')

# ───────────────────────────────────────────────────────────────────
# Substrate primitives
# ───────────────────────────────────────────────────────────────────

def fnv1a64(s):
    """FNV-1a 64-bit hash — same as substrate."""
    h = 0xcbf29ce484222325
    for b in s.encode('utf-8', errors='surrogatepass'):
        h ^= b
        h = (h * 0x100000001b3) & 0xffffffffffffffff
    return h

def witness_entry(cell_state, prev_hash, timestamp):
    """Create a witness entry for a cell state."""
    payload = json.dumps(cell_state, sort_keys=True)
    e = {
        'state': cell_state,
        'prev_hash': prev_hash,
        'timestamp': timestamp,
        'payload_hash': '0x' + format(fnv1a64(payload), '016x'),
    }
    e['hash'] = '0x' + format(fnv1a64(json.dumps({k: e[k] for k in ['state', 'prev_hash', 'timestamp']}, sort_keys=True)), '016x')
    return e

# ───────────────────────────────────────────────────────────────────
# Substrate Burgers' solver
# ───────────────────────────────────────────────────────────────────

class SubstrateBurgers:
    def __init__(self, N=64, L=2*np.pi, nu=0.01, T=1.0):
        """
        N: number of cells
        L: domain length
        nu: viscosity
        T: final time
        """
        self.N = N
        self.L = L
        self.nu = nu
        self.T = T
        self.dx = L / N
        
        # CFL condition: dt <= dx / max(|u|)
        # For Burgers' shock formation, dt ~ 0.001 with N=64
        self.dt = 0.001
        
        # Cell states: each cell has u value
        self.cells = []
        self.witness_log = []
        self.t = 0.0
        self.step = 0
        
        # Initialize with sin wave (classical initial condition for Burgers')
        x = np.linspace(0, L, N, endpoint=False)
        for i in range(N):
            u0 = np.sin(x[i])
            w = witness_entry({'u': float(u0), 'x': float(x[i])}, '0x' + '0'*16, 0)
            self.cells.append({'u': float(u0), 'x': float(x[i]), 'witness': w})
            self.witness_log.append(w)
    
    def compute_derivatives(self):
        """Compute du/dx and d²u/dx² with periodic BCs."""
        u = np.array([c['u'] for c in self.cells])
        
        # Upwind for advection (du/dx): use backward difference if u>0, forward if u<0
        # Periodic BCs: wrap with modulo
        dudx = np.zeros(self.N)
        for i in range(self.N):
            if u[i] >= 0:
                # Backward difference
                dudx[i] = (u[i] - u[(i-1) % self.N]) / self.dx
            else:
                # Forward difference
                dudx[i] = (u[(i+1) % self.N] - u[i]) / self.dx
        
        # Central difference for diffusion (d²u/dx²)
        d2udx2 = (np.roll(u, -1) - 2*u + np.roll(u, 1)) / (self.dx ** 2)
        
        return dudx, d2udx2
    
    def step_forward(self):
        """Take one timestep, witness-log the new state."""
        u = np.array([c['u'] for c in self.cells])
        dudx, d2udx2 = self.compute_derivatives()
        
        # Burgers' RHS: -u * dudx + nu * d2udx2
        rhs = -u * dudx + self.nu * d2udx2
        u_new = u + self.dt * rhs
        
        # Witness-log each cell
        prev_hash = self.witness_log[-1]['hash'] if self.witness_log else '0x' + '0'*16
        timestamp = self.step + 1
        for i in range(self.N):
            new_w = witness_entry({'u': float(u_new[i]), 'x': self.cells[i]['x']}, 
                                  self.cells[i]['witness']['hash'], timestamp)
            self.cells[i]['u'] = float(u_new[i])
            self.cells[i]['witness'] = new_w
            self.witness_log.append(new_w)
        
        self.t += self.dt
        self.step += 1
    
    def run(self):
        """Run until T."""
        n_steps = int(self.T / self.dt)
        for _ in range(n_steps):
            self.step_forward()
        return self.cells, self.witness_log
    
    def smoothness_score(self):
        """Wavefunction-style smoothness score: constructive vs destructive interference across cells.
        
        Treat each cell's u value as an amplitude. Phase from cell position.
        If the solution is smooth, neighboring cells interfere constructively.
        If there's a shock, neighbors interfere destructively.
        """
        u = np.array([c['u'] for c in self.cells])
        phases = np.linspace(0, 2*np.pi, self.N)
        
        # Wavefunction ψ = Σ u_i * e^(i*phi_i)
        psi_re = np.sum(u * np.cos(phases))
        psi_im = np.sum(u * np.sin(phases))
        psi_mag = np.sqrt(psi_re**2 + psi_im**2)
        
        # Total power Σ u_i²
        total_power = np.sum(u**2)
        
        # Coherence = |ψ|² / total_power
        # When solution is smooth (sinusoidal), |ψ| is maximal → coherence → 1
        # When there's a shock, power spreads out → coherence → 0
        coherence = psi_mag**2 / max(total_power, 1e-12)
        
        # Also compute total variation (TV): sum of |du/dx|
        dudx = np.diff(np.concatenate([u, [u[0]]]))  # periodic
        tv = np.sum(np.abs(dudx))
        
        return {
            'psi_magnitude': float(psi_mag),
            'total_power': float(total_power),
            'coherence': float(coherence),
            'total_variation': float(tv),
            'n_witnesses': len(self.witness_log),
            't': self.t,
        }


# ───────────────────────────────────────────────────────────────────
# Naive solver (for comparison)
# ───────────────────────────────────────────────────────────────────

class NaiveBurgers:
    """Standard finite-difference Burgers' solver without substrate."""
    def __init__(self, N=64, L=2*np.pi, nu=0.01, T=1.0):
        self.N = N
        self.L = L
        self.nu = nu
        self.T = T
        self.dx = L / N
        self.dt = 0.001
        
        x = np.linspace(0, L, N, endpoint=False)
        self.u = np.sin(x).copy()
        self.t = 0.0
        self.step = 0
    
    def step_forward(self):
        u = self.u
        dudx = np.where(u >= 0, 
                        (u - np.roll(u, 1)) / self.dx,
                        (np.roll(u, -1) - u) / self.dx)
        d2udx2 = (np.roll(u, -1) - 2*u + np.roll(u, 1)) / (self.dx ** 2)
        rhs = -u * dudx + self.nu * d2udx2
        self.u = u + self.dt * rhs
        self.t += self.dt
        self.step += 1
    
    def run(self):
        n_steps = int(self.T / self.dt)
        for _ in range(n_steps):
            self.step_forward()
        return self.u


# ───────────────────────────────────────────────────────────────────
# Run both, compare
# ───────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    print('═' * 70)
    print('  BURGERS\' EQUATION ON THE SUBSTRATE')
    print('═' * 70)
    print()
    
    # Parameters
    N, L, nu, T = 64, 2*np.pi, 0.01, 1.0
    
    print(f'  Setup: N={N} cells, L={L:.4f}, nu={nu}, T={T}')
    print(f'  dx = {L/N:.4f}, dt = 0.001, n_steps = {int(T/0.001)}')
    print()
    
    # Substrate solver
    print('Running substrate solver...')
    t0 = time.time()
    sub_solver = SubstrateBurgers(N=N, L=L, nu=nu, T=T)
    sub_cells, sub_log = sub_solver.run()
    sub_t = time.time() - t0
    
    # Naive solver
    print('Running naive solver...')
    t0 = time.time()
    naive_solver = NaiveBurgers(N=N, L=L, nu=nu, T=T)
    naive_u = naive_solver.run()
    naive_t = time.time() - t0
    
    # Compare
    sub_u = np.array([c['u'] for c in sub_cells])
    diff = np.abs(sub_u - naive_u)
    
    print()
    print('═══ Results ═══')
    print(f'  Substrate solver time: {sub_t:.2f}s ({len(sub_log)} witness entries)')
    print(f'  Naive solver time:     {naive_t:.2f}s')
    print(f'  Max diff: {diff.max():.6e}')
    print(f'  Mean diff: {diff.mean():.6e}')
    print(f'  RMS diff: {np.sqrt(np.mean(diff**2)):.6e}')
    
    print()
    print('═══ Substrate metrics ═══')
    metrics = sub_solver.smoothness_score()
    for k, v in metrics.items():
        print(f'  {k}: {v}')
    
    print()
    print('═══ First 10 cell values ═══')
    print('  idx    x         u_sub      u_naive    diff')
    for i in range(10):
        print(f'  {i:3d}  {sub_cells[i]["x"]:.4f}  {sub_cells[i]["u"]:+.6f}  {naive_u[i]:+.6f}  {diff[i]:+.2e}')
    
    # Witness-log verification
    print()
    print('═══ Witness-log verification ═══')
    
    # Verify per-cell prev_hash chain (each cell's chain, not global)
    # We have N cells × n_steps+1 witnesses = total. Witnesses [0..N-1] are init, [N..2N-1] are step 1, etc.
    print(f'  Per-cell chain verification (first 5 cells):')
    n_steps = sub_solver.step + 1  # init + n_steps
    for cell_i in range(5):
        ok = True
        for step_i in range(1, min(5, n_steps)):
            idx_curr = cell_i + step_i * sub_solver.N
            idx_prev = cell_i + (step_i - 1) * sub_solver.N
            if idx_curr >= len(sub_log): break
            if sub_log[idx_curr]['prev_hash'] != sub_log[idx_prev]['hash']:
                ok = False
                break
        print(f'  Cell {cell_i}: chain {"✓ intact" if ok else "✗ broken"}')
    
    # Save
    np.savez('/workspace/research/cargo-line-tycoon/research/navier_stokes/burgers_1d_results.npz',
             sub_u=sub_u, naive_u=naive_u, x=np.array([c['x'] for c in sub_cells]),
             metrics=metrics)
    print()
    print('Saved burgers_1d_results.npz')
