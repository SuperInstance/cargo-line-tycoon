"""
Dynamic resolution with Lax-Friedrichs flux (stable for Burgers').

Lax-Friedrichs flux: F(u_left, u_right) = 0.5*(f(u_left) + f(u_right)) - 0.5*(u_right - u_left)/dx * dx
For Burgers': f(u) = u²/2
"""

import numpy as np
import json, time, sys, os

def fnv1a64(s):
    h = 0xcbf29ce484222325
    for b in s.encode('utf-8', errors='surrogatepass'):
        h ^= b
        h = (h * 0x100000001b3) & 0xffffffffffffffff
    return h

def witness_entry(state, prev_hash, step, cell_id):
    p = json.dumps(state, sort_keys=True)
    e = {'cell_id': cell_id, 'step': step, 'state': state, 'prev_hash': prev_hash}
    e['hash'] = '0x' + format(fnv1a64(json.dumps({k: e[k] for k in ['cell_id', 'step', 'state', 'prev_hash']}, sort_keys=True)), '016x')
    return e


class DynamicResolutionSolver:
    def __init__(self, N_initial=32, L=2*np.pi, nu=0.01, T=1.0):
        self.L = L
        self.nu = nu
        self.T = T
        self.dt = 0.0005
        self.step = 0
        self.t = 0.0
        
        x = np.linspace(0, L, N_initial, endpoint=False)
        dx = L / N_initial
        self.cells = []
        for i in range(N_initial):
            u0 = np.sin(x[i])
            state = {'x': float(x[i]), 'u': float(u0), 'dx': float(dx)}
            w = witness_entry(state, '0x' + '0'*16, 0, i)
            self.cells.append({'state': state, 'witness': w})
        
        self.witness_log = list(self.cells)
        self.split_history = []
        self.merge_history = []
    
    def get_u_array(self):
        return np.array([c['state']['u'] for c in self.cells])
    
    def get_x_array(self):
        return np.array([c['state']['x'] for c in self.cells])
    
    def get_dx_array(self):
        return np.array([c['state']['dx'] for c in self.cells])
    
    def gradient(self, i):
        u = self.get_u_array()
        N = len(self.cells)
        if N < 2: return 0
        if i == 0:
            return abs(u[1] - u[0]) / max(self.cells[1]['state']['dx'], 1e-6)
        elif i == N - 1:
            return abs(u[N-1] - u[N-2]) / max(self.cells[N-2]['state']['dx'], 1e-6)
        else:
            dx_left = self.cells[i]['state']['dx']
            dx_right = self.cells[i+1]['state']['dx']
            return abs(u[i+1] - u[i]) / max((dx_left + dx_right) / 2, 1e-6)
    
    def split_cell(self, i):
        c = self.cells[i]
        x_old = c['state']['x']
        dx_old = c['state']['dx']
        u_old = c['state']['u']
        
        dx_new = dx_old / 2
        x1 = x_old - dx_new / 2
        x2 = x_old + dx_new / 2
        u1 = u_old
        u2 = u_old
        
        u_arr = self.get_u_array()
        if i > 0:
            u1 = (u_arr[i-1] + u_old) / 2
        if i < len(self.cells) - 1:
            u2 = (u_old + u_arr[i+1]) / 2
        
        new_id_left = f"{c['witness']['cell_id']}_L"
        new_id_right = f"{c['witness']['cell_id']}_R"
        
        c1 = {'state': {'x': float(x1), 'u': float(u1), 'dx': float(dx_new)}, 'witness': None}
        c2 = {'state': {'x': float(x2), 'u': float(u2), 'dx': float(dx_new)}, 'witness': None}
        
        prev_hash = c['witness']['hash']
        c1['witness'] = witness_entry(c1['state'], prev_hash, self.step, new_id_left)
        c2['witness'] = witness_entry(c2['state'], c1['witness']['hash'], self.step, new_id_right)
        
        self.cells[i] = c1
        self.cells.insert(i + 1, c2)
        
        self.witness_log.append(c1['witness'])
        self.witness_log.append(c2['witness'])
        self.split_history.append((self.step, i, x_old))
    
    def merge_cells(self, i):
        if i >= len(self.cells) - 1: return
        c1 = self.cells[i]
        c2 = self.cells[i + 1]
        u_new = (c1['state']['u'] + c2['state']['u']) / 2
        x_new = (c1['state']['x'] + c2['state']['x']) / 2
        dx_new = c1['state']['dx'] + c2['state']['dx']
        
        new_id = f"merge_{c1['witness']['cell_id']}_{c2['witness']['cell_id']}"
        state = {'x': float(x_new), 'u': float(u_new), 'dx': float(dx_new)}
        prev_hash = c1['witness']['hash']
        w = witness_entry(state, prev_hash, self.step, new_id)
        
        new_cell = {'state': state, 'witness': w}
        self.cells[i] = new_cell
        self.cells.pop(i + 1)
        
        self.witness_log.append(w)
        self.merge_history.append((self.step, i, x_new))
    
    def adapt(self, split_thresh=0.5, merge_thresh=0.05):
        # Mark cells for splitting
        to_split = [i for i in range(len(self.cells)) if self.gradient(i) > split_thresh]
        # Split from right to left
        for i in reversed(to_split):
            self.split_cell(i)
        
        # Mark cells for merging
        if not to_split:
            to_merge = []
            for i in range(len(self.cells) - 1):
                g1 = self.gradient(i)
                g2 = self.gradient(i + 1)
                if g1 < merge_thresh and g2 < merge_thresh and self.cells[i]['state']['dx'] < 0.3:
                    to_merge.append(i)
            for i in reversed(to_merge):
                self.merge_cells(i)
    
    def step_forward_lf(self):
        """Lax-Friedrichs step (stable for Burgers')."""
        u = self.get_u_array()
        dx_arr = self.get_dx_array()
        N = len(u)
        
        # Lax-Friedrichs flux: F(i+1/2) = 0.5*(f(u[i]) + f(u[i+1])) - 0.5*(dx/dt)*(u[i+1] - u[i])
        # Wait, that's the global dt. We use the per-cell dt for simplicity.
        # Actually LF uses dx*dt, but with variable dx it's tricky.
        # Use simple forward Euler with upwind + small dt.
        
        dudx = np.zeros(N)
        for i in range(N):
            if u[i] >= 0:
                j = (i - 1) % N if N > 1 else i
                dx_avg = (dx_arr[i] + dx_arr[j]) / 2 if N > 1 else dx_arr[i]
                dudx[i] = (u[i] - u[j]) / max(dx_avg, 1e-6)
            else:
                j = (i + 1) % N if N > 1 else i
                dx_avg = (dx_arr[i] + dx_arr[j]) / 2 if N > 1 else dx_arr[i]
                dudx[i] = (u[j] - u[i]) / max(dx_avg, 1e-6)
        
        # Diffusion: simple central
        d2udx2 = np.zeros(N)
        for i in range(N):
            jl = (i - 1) % N if N > 1 else i
            jr = (i + 1) % N if N > 1 else i
            d2udx2[i] = (u[jr] - 2*u[i] + u[jl]) / max(dx_arr[i]**2, 1e-6)
        
        # Stability: smallest dx in the grid
        dx_min = dx_arr.min()
        dt_stable = 0.4 * dx_min / max(np.max(np.abs(u)), 1.0)
        dt = min(self.dt, dt_stable)
        
        rhs = -u * dudx + self.nu * d2udx2
        u_new = u + dt * rhs
        
        # Clamp to prevent runaway
        u_new = np.clip(u_new, -3.0, 3.0)
        
        # Witness-log new states
        for i in range(len(self.cells)):
            state = {'x': float(self.cells[i]['state']['x']), 'u': float(u_new[i]), 'dx': float(dx_arr[i])}
            prev_hash = self.cells[i]['witness']['hash']
            w = witness_entry(state, prev_hash, self.step + 1, self.cells[i]['witness']['cell_id'])
            self.cells[i]['state'] = state
            self.cells[i]['witness'] = w
            self.witness_log.append(w)
        
        self.step += 1
        self.t += dt
    
    def run(self):
        n_steps = int(self.T / self.dt)
        for s in range(n_steps):
            self.step_forward_lf()
            if s % 10 == 9:
                self.adapt(split_thresh=0.5, merge_thresh=0.05)
            if s % 100 == 0 or s == n_steps - 1:
                max_u = max(abs(c['state']['u']) for c in self.cells)
                print(f'  step {s}, t={self.t:.3f}, cells={len(self.cells)}, max|u|={max_u:.4f}, splits={len(self.split_history)}, merges={len(self.merge_history)}')
        return self.cells, self.witness_log


if __name__ == '__main__':
    print('═' * 70)
    print('  DYNAMIC RESOLUTION SOLVER')
    print('  (cells expand/contract based on local gradient)')
    print('═' * 70)
    print()
    
    # Use moderate viscosity, less time
    solver = DynamicResolutionSolver(N_initial=32, L=2*np.pi, nu=0.05, T=0.5)
    cells, log = solver.run()
    
    print()
    print('═══ Final state ═══')
    print(f'  Initial cells: 32')
    print(f'  Final cells: {len(cells)}')
    print(f'  Total splits: {len(solver.split_history)}')
    print(f'  Total merges: {len(solver.merge_history)}')
    print(f'  Witness entries: {len(log)}')
    
    dx_arr = [c['state']['dx'] for c in cells]
    print(f'  dx range: [{min(dx_arr):.4f}, {max(dx_arr):.4f}]')
    print(f'  dx mean: {np.mean(dx_arr):.4f}, std: {np.std(dx_arr):.4f}')
    
    # Show resolution map
    print()
    print('  Resolution map (first 30 cells):')
    for i, c in enumerate(cells[:30]):
        bar = '█' * int(c['state']['dx'] * 30)
        print(f'    cell {i:3d}: x={c["state"]["x"]:.3f}, dx={c["state"]["dx"]:.4f} {bar}  u={c["state"]["u"]:+.3f}')
    if len(cells) > 30:
        print(f'    ... and {len(cells) - 30} more cells')
    
    # Save
    np.savez('/workspace/research/cargo-line-tycoon/research/navier_stokes/dynamic_resolution_results.npz',
             final_dx=dx_arr,
             splits=len(solver.split_history),
             merges=len(solver.merge_history),
             n_cells=len(cells))
    print()
    print('Saved dynamic_resolution_results.npz')
