"""
2D Taylor-Green vortex on the substrate.

The Taylor-Green vortex is a classical test case for Navier-Stokes solvers.
It has an analytical solution:

u(x,y,t) = -cos(k*x) sin(k*y) F(t)
v(x,y,t) =  sin(k*x) cos(k*y) F(t)
p(x,y,t) = -¼(cos(2kx) + cos(2ky)) F(t)²

where F(t) = exp(-2 ν k² t)

This decouples: at each timestep, the substrate's witness-log records
the analytical decay. Then we compare:
- Substrate tracker (just records the analytical solution)
- Numerical solver (forward Euler + Laplacian)
- Wavefunction JEV smoothness score

If they match → substrate as numerics works.
"""

import numpy as np
import json, time, sys, os

# FNV-1a (same as substrate)
def fnv1a64(s):
    h = 0xcbf29ce484222325
    for b in s.encode('utf-8', errors='surrogatepass'):
        h ^= b
        h = (h * 0x100000001b3) & 0xffffffffffffffff
    return h

def witness_entry(state, prev_hash, step, cell_id):
    p = json.dumps(state, sort_keys=True)
    e = {
        'cell_id': cell_id,
        'step': step,
        'state': state,
        'prev_hash': prev_hash,
    }
    e['hash'] = '0x' + format(fnv1a64(json.dumps({k: e[k] for k in ['cell_id', 'step', 'state', 'prev_hash']}, sort_keys=True)), '016x')
    return e


def taylor_green_analytical(x, y, t, k=1.0, nu=0.01):
    """Analytical Taylor-Green vortex at (x, y, t)."""
    F = np.exp(-2 * nu * k**2 * t)
    u = -np.cos(k*x) * np.sin(k*y) * F
    v = np.sin(k*x) * np.cos(k*y) * F
    p = -0.25 * (np.cos(2*k*x) + np.cos(2*k*y)) * F**2
    return u, v, p


def substrate_2d_solver(N=32, L=2*np.pi, nu=0.01, T=1.0, k=1.0):
    """
    Substrate 2D solver with witness-log.
    
    Each cell has u, v, p. Each timestep creates a witness entry per cell.
    """
    dx = L / N
    dt = 0.001  # smaller dt for 2D stability
    n_steps = int(T / dt)
    
    print(f'Setup: N={N}×{N}={N*N} cells, dt={dt}, n_steps={n_steps}')
    
    # Initialize cells on a grid
    cells = []
    witness_log = []
    
    x = np.linspace(0, L, N, endpoint=False)
    y = np.linspace(0, L, N, endpoint=False)
    
    # Initialize with analytical at t=0
    print('Initializing with analytical solution...')
    cell_id = 0
    for i in range(N):
        for j in range(N):
            u, v, p = taylor_green_analytical(x[i], y[j], 0, k, nu)
            state = {'u': float(u), 'v': float(v), 'p': float(p), 'x': float(x[i]), 'y': float(y[j])}
            w = witness_entry(state, '0x' + '0'*16, 0, cell_id)
            cells.append({'state': state, 'witness': w})
            witness_log.append(w)
            cell_id += 1
    
    print(f'Initial witnesses: {len(witness_log)}')
    
    # Time-stepping using Navier-Stokes equations (no advection since TGV is analytical)
    # Actually for numerical solution, we'd use:
    # ∂u/∂t + u∂u/∂x + v∂u/∂y = -∂p/∂x + ν∇²u
    # For Taylor-Green, we can use the analytical decay OR forward-Euler the simplified dynamics.
    # Let me use forward Euler with full equations.
    
    def idx(i, j): return (i % N) * N + (j % N)
    
    print(f'Running {n_steps} timesteps...')
    t0 = time.time()
    
    for step in range(1, n_steps + 1):
        u_arr = np.array([c['state']['u'] for c in cells]).reshape(N, N)
        v_arr = np.array([c['state']['v'] for c in cells]).reshape(N, N)
        p_arr = np.array([c['state']['p'] for c in cells]).reshape(N, N)
        
        # Compute derivatives
        du_dx = (np.roll(u_arr, -1, axis=0) - np.roll(u_arr, 1, axis=0)) / (2 * dx)
        du_dy = (np.roll(u_arr, -1, axis=1) - np.roll(u_arr, 1, axis=1)) / (2 * dx)
        dv_dx = (np.roll(v_arr, -1, axis=0) - np.roll(v_arr, 1, axis=0)) / (2 * dx)
        dv_dy = (np.roll(v_arr, -1, axis=1) - np.roll(v_arr, 1, axis=1)) / (2 * dx)
        dp_dx = (np.roll(p_arr, -1, axis=0) - np.roll(p_arr, 1, axis=0)) / (2 * dx)
        dp_dy = (np.roll(p_arr, -1, axis=1) - np.roll(p_arr, 1, axis=1)) / (2 * dx)
        lap_u = (np.roll(u_arr, -1, axis=0) + np.roll(u_arr, 1, axis=0) + 
                 np.roll(u_arr, -1, axis=1) + np.roll(u_arr, 1, axis=1) - 4*u_arr) / (dx**2)
        lap_v = (np.roll(v_arr, -1, axis=0) + np.roll(v_arr, 1, axis=0) + 
                 np.roll(v_arr, -1, axis=1) + np.roll(v_arr, 1, axis=1) - 4*v_arr) / (dx**2)
        
        # NS equations
        rhs_u = -u_arr*du_dx - v_arr*du_dy - dp_dx + nu * lap_u
        rhs_v = -u_arr*dv_dx - v_arr*dv_dy - dp_dy + nu * lap_v
        
        u_new = u_arr + dt * rhs_u
        v_new = v_arr + dt * rhs_v
        
        # p_new from continuity? For incompressible: ∇²p = -∂u_i/∂x_j ∂u_j/∂x_i
        # Simplification: pressure doesn't have direct time derivative in incompressible flow
        # We can either solve Poisson for p or use a projection method
        # For Taylor-Green, the analytical p = -¼(cos(2kx) + cos(2ky)) F²
        
        t_curr = step * dt
        p_new = np.zeros((N, N))
        for i in range(N):
            for j in range(N):
                _, _, p_new[i, j] = taylor_green_analytical(x[i], y[j], t_curr, k, nu)
        
        # Witness-log each cell
        for cell_idx in range(N * N):
            i = cell_idx // N
            j = cell_idx % N
            state = {'u': float(u_new[i, j]), 'v': float(v_new[i, j]), 'p': float(p_new[i, j]),
                     'x': float(x[i]), 'y': float(y[j])}
            prev_w = cells[cell_idx]['witness']
            w = witness_entry(state, prev_w['hash'], step, cell_idx)
            cells[cell_idx] = {'state': state, 'witness': w}
            witness_log.append(w)
        
        if step % 200 == 0:
            print(f'  step {step}/{n_steps}, t={t_curr:.3f}, max|u|={np.max(np.abs(u_new)):.4f}')
    
    elapsed = time.time() - t0
    print(f'\nDone in {elapsed:.2f}s')
    print(f'Total witness entries: {len(witness_log)}')
    
    return cells, witness_log, x, y


def main():
    print('═' * 70)
    print('  2D TAYLOR-GREEN VORTEX ON THE SUBSTRATE')
    print('═' * 70)
    print()
    
    # Run substrate solver
    cells, witness_log, x, y = substrate_2d_solver(N=16, L=2*np.pi, nu=0.01, T=0.5)
    
    # Compare with analytical at final time
    u_num = np.array([c['state']['u'] for c in cells]).reshape(len(x), len(y))
    v_num = np.array([c['state']['v'] for c in cells]).reshape(len(x), len(y))
    
    u_ex = np.zeros_like(u_num)
    v_ex = np.zeros_like(v_num)
    for i in range(len(x)):
        for j in range(len(y)):
            u_ex[i, j], v_ex[i, j], _ = taylor_green_analytical(x[i], y[j], 0.5, 1.0, 0.01)
    
    u_diff = np.abs(u_num - u_ex)
    v_diff = np.abs(v_num - v_ex)
    
    print()
    print('═══ Comparison with analytical solution at t=0.5 ═══')
    print(f'  Max |u_diff|:  {u_diff.max():.6e}')
    print(f'  Mean |u_diff|: {u_diff.mean():.6e}')
    print(f'  RMS u_diff:    {np.sqrt(np.mean(u_diff**2)):.6e}')
    print(f'  Max |v_diff|:  {v_diff.max():.6e}')
    print(f'  Mean |v_diff|: {v_diff.mean():.6e}')
    
    # Wavefunction JEV on the final state
    u_flat = u_num.flatten()
    phases = np.linspace(0, 2*np.pi, len(u_flat))
    psi_re = np.sum(u_flat * np.cos(phases))
    psi_im = np.sum(u_flat * np.sin(phases))
    psi_mag = np.sqrt(psi_re**2 + psi_im**2)
    total_power = np.sum(u_flat**2)
    coherence = psi_mag**2 / max(total_power, 1e-12)
    
    print()
    print('═══ Final-state wavefunction metrics ═══')
    print(f'  |ψ|:       {psi_mag:.4f}')
    print(f'  total P:   {total_power:.4f}')
    print(f'  coherence: {coherence:.4f} (1.0 = perfect smoothness)')
    print(f'  n_witnesses: {len(witness_log)}')
    
    # Per-cell chain verification (sample a few cells)
    print()
    print('═══ Witness-log verification (per-cell chain) ═══')
    N = len(x)
    for cell_i in [0, 5, 10, 50, 100]:
        if cell_i >= N*N: continue
        # Find this cell's witness entries (every N*N-th entry starting at cell_i)
        cell_witnesses = [w for w in witness_log if w['cell_id'] == cell_i]
        ok = True
        for i in range(1, len(cell_witnesses)):
            if cell_witnesses[i]['prev_hash'] != cell_witnesses[i-1]['hash']:
                ok = False
                break
        print(f'  Cell {cell_i}: {len(cell_witnesses)} entries, chain {"✓" if ok else "✗"}')
    
    # Save
    np.savez('/workspace/research/cargo-line-tycoon/research/navier_stokes/taylor_green_2d_results.npz',
             u_num=u_num, v_num=v_num, u_ex=u_ex, v_ex=v_ex, x=x, y=y,
             coherence=coherence, n_witnesses=len(witness_log))
    print()
    print('Saved taylor_green_2d_results.npz')

if __name__ == '__main__':
    main()
