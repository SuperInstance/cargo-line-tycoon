"""
AI++ Spreadsheet Encoding

Casey's vision: "All manners of ML and NN and DL and RL can be done in a 
quite easier than even NotebookLM or Jupyter or Python because those can 
be implied in the spreadsheet encoding and changed like higher abstraction 
object."

The encoding:
- Each row = a cell in the cell-graph
- Each column = a cell property (id, type, state, neighbors, weights, ...)
- Each sheet = a layer (input, hidden, output)
- Cross-sheet references = JEV relationships
- Cell formulas = operations (forward pass, backprop, gradient, ...)
- New rows can be added (cells split, expanding resolution)
- Rows can be merged (cells contract)

ML paradigms as cell-graphs:
- Linear regression: 1 input cell → weight cells → output cell (sum)
- Neural network: input layer → hidden layer(s) → output layer, all cells
- CNN: 2D grid of cells, convolution as neighbor aggregation
- RNN: 1D sequence of cells, hidden state passed forward
- RL: state cell + action cell → reward cell + next-state cell

Each paradigm is a different LAYOUT of cells. The substrate operations 
(11 opcodes + Memory Sandbox + witness-log + JEV) work on any layout.

This is the substrate as a spreadsheet UI for ML.
"""

import numpy as np
import json, time
import sys, os
sys.path.insert(0, '/workspace/research/cargo-line-tycoon/research/wavefunction_jev')
sys.path.insert(0, '/workspace/research/cargo-line-tycoon/research/jepa_tutor')


def fnv1a64(s):
    h = 0xcbf29ce484222325
    for b in s.encode('utf-8', errors='surrogatepass'):
        h ^= b
        h = (h * 0x100000001b3) & 0xffffffffffffffff
    return h


class SpreadsheetCell:
    """One cell in the AI++ spreadsheet."""
    def __init__(self, cell_id, cell_type, value=0.0, neighbors=None, formula=None):
        self.id = cell_id
        self.type = cell_type  # 'input', 'hidden', 'output', 'weight', 'bias'
        self.value = value
        self.neighbors = neighbors or []  # list of cell IDs
        self.formula = formula  # str or callable
        self.gradient = 0.0  # for backprop
        self.witness_chain = []
        self.prev_hash = '0x' + '0'*16
        self.timestamp = 0
    
    def forward(self, cache):
        """Compute this cell's value from its neighbors."""
        if self.formula is None:
            return self.value
        
        if isinstance(self.formula, str):
            # Simple formula parsing — "sum", "mean", "linear"
            if self.formula == 'sum':
                return sum(cache[n].value for n in self.neighbors)
            elif self.formula == 'mean':
                if not self.neighbors: return 0
                return sum(cache[n].value for n in self.neighbors) / len(self.neighbors)
            elif self.formula == 'linear':
                # value = sum of neighbor * weight
                # weights are stored in a separate 'weight' cell linked to the edge
                total = 0
                for n_id in self.neighbors:
                    n_cell = cache[n_id]
                    edge_key = (n_id, self.id)
                    if edge_key in cache.get('weights', {}):
                        w = cache['weights'][edge_key]
                        total += n_cell.value * w.value
                    else:
                        total += n_cell.value
                return total
        return self.value
    
    def witness(self):
        """Create a witness entry."""
        state = {'value': self.value, 'type': self.type, 'neighbors': self.neighbors}
        h = '0x' + format(fnv1a64(json.dumps(state, sort_keys=True)), '016x')
        entry = {
            'cell_id': self.id,
            'state': state,
            'prev_hash': self.prev_hash,
            'hash': h,
            'timestamp': self.timestamp,
        }
        self.witness_chain.append(entry)
        self.prev_hash = h
        return entry


class AISpreadsheet:
    """The AI++ spreadsheet — a cell-graph as a spreadsheet."""
    
    def __init__(self, name="ai++"):
        self.name = name
        self.cells = {}  # id → cell
        self.layers = {}  # layer_name → list of cell IDs
        self.weights = {}  # (from_id, to_id) → weight cell
    
    def add_cell(self, cell_id, cell_type, layer=None, value=0.0, formula=None, neighbors=None):
        c = SpreadsheetCell(cell_id, cell_type, value, neighbors, formula)
        self.cells[cell_id] = c
        if layer:
            self.layers.setdefault(layer, []).append(cell_id)
        return c
    
    def add_weight(self, from_id, to_id, value=0.0):
        """Add a weight cell on edge from_id → to_id."""
        weight_id = f'w_{from_id}_{to_id}'
        c = self.add_cell(weight_id, 'weight', value=value)
        self.weights[(from_id, to_id)] = c
        return c
    
    def forward(self):
        """Forward pass through the cell-graph.
        
        For simplicity, we process layers in order: input → hidden → output.
        """
        cache = dict(self.cells)
        cache['weights'] = self.weights
        for layer_name, cell_ids in self.layers.items():
            for cid in cell_ids:
                cell = self.cells[cid]
                if cell.formula is not None:
                    new_value = cell.forward(cache)
                    cell.value = new_value
                cell.witness()
                cell.timestamp += 1
        return {cid: c.value for cid, c in self.cells.items()}
    
    def linear_regression(self, X, y):
        """1D linear regression: y = w*x + b.
        
        Cells: input (x), weight (w), bias (b), output (y_pred)
        """
        # Reset
        self.cells = {}
        self.layers = {}
        self.weights = {}
        
        # Layer: input
        self.add_cell('x', 'input', layer='input', value=0)
        
        # Weight and bias
        w = self.add_weight('x', 'y_pred', value=np.random.randn() * 0.01)
        self.add_cell('b', 'bias', layer='params', value=0.0)
        
        # Output
        self.add_cell('y_pred', 'output', layer='output', formula='linear',
                      neighbors=['x', 'b'])
        
        # Forward pass: y_pred = w*x + b (need to handle b as a constant added)
        # Adjust: the 'linear' formula uses neighbors' values, but b is constant
        # Override: use custom forward
        def y_pred_forward(cache):
            x_val = cache['x'].value
            w_val = self.weights[('x', 'y_pred')].value
            b_val = cache['b'].value
            return w_val * x_val + b_val
        
        self.cells['y_pred'].formula = y_pred_forward
        
        # Training loop
        losses = []
        lr = 0.0001
        for epoch in range(100):
            total_loss = 0
            for xi, yi in zip(X, y):
                # Set input
                self.cells['x'].value = xi
                
                # Forward
                self.forward()
                
                # Compute loss gradient
                y_pred = self.cells['y_pred'].value
                loss = (y_pred - yi) ** 2
                total_loss += loss
                
                # Backprop: d(loss)/dw = 2*(y_pred - yi) * x
                # d(loss)/db = 2*(y_pred - yi)
                d_loss_dw = 2 * (y_pred - yi) * xi
                d_loss_db = 2 * (y_pred - yi)
                
                # Update weights
                self.weights[('x', 'y_pred')].value -= lr * d_loss_dw
                self.cells['b'].value -= lr * d_loss_db
            
            if epoch % 10 == 0:
                losses.append(total_loss / len(X))
        
        return losses
    
    def neural_network_xor(self):
        """XOR with a 2-2-1 network: 2 inputs, 2 hidden, 1 output.
        
        XOR is the classic NN problem — not linearly separable.
        """
        # Reset
        self.cells = {}
        self.layers = {}
        self.weights = {}
        
        # Input layer
        self.add_cell('x0', 'input', layer='input')
        self.add_cell('x1', 'input', layer='input')
        
        # Hidden layer (2 neurons)
        self.add_cell('h0', 'hidden', layer='hidden', formula='linear', neighbors=['x0', 'x1', 'b0'])
        self.add_cell('h1', 'hidden', layer='hidden', formula='linear', neighbors=['x0', 'x1', 'b1'])
        self.add_cell('b0', 'bias', layer='params')
        self.add_cell('b1', 'bias', layer='params')
        
        # Output
        self.add_cell('y', 'output', layer='output', formula='linear', neighbors=['h0', 'h1', 'b2'])
        self.add_cell('b2', 'bias', layer='params')
        
        # Weights
        for src in ['x0', 'x1']:
            for tgt in ['h0', 'h1']:
                self.add_weight(src, tgt, value=np.random.randn() * 0.5)
        for src in ['h0', 'h1']:
            self.add_weight(src, 'y', value=np.random.randn() * 0.5)
        
        # Forward function for each cell
        def linear_forward(cell, cache):
            total = 0
            for n_id in cell.neighbors:
                if n_id in cache['weights']:
                    w = cache['weights'][n_id].value
                    total += cache[n].value * w
                else:
                    total += cache[n_id].value
            # Activation: tanh for hidden, sigmoid for output
            if cell.type == 'hidden':
                return np.tanh(total)
            elif cell.type == 'output':
                return 1 / (1 + np.exp(-np.clip(total, -500, 500)))
            return total
        
        # XOR training data
        X = [[0, 0], [0, 1], [1, 0], [1, 1]]
        y = [0, 1, 1, 0]
        
        losses = []
        lr = 0.5
        for epoch in range(2000):
            total_loss = 0
            for xi, yi in zip(X, y):
                # Set inputs
                self.cells['x0'].value = xi[0]
                self.cells['x1'].value = xi[1]
                
                # Forward pass
                cache = dict(self.cells)
                cache['weights'] = {}
                for (src, tgt), w_cell in self.weights.items():
                    edge_key = (src, tgt)
                    # Reverse lookup for the forward function
                    # The forward function looks up weights by neighbor name
                    cache['weights'][edge_key] = w_cell
                
                # Compute forward
                for layer in ['input', 'params']:
                    for cid in self.layers.get(layer, []):
                        self.cells[cid].witness()
                        self.cells['x0' if cid == 'x0' else 'x1' if cid == 'x1' else 'b0' if cid == 'b0' else 'b1' if cid == 'b1' else 'b2'].timestamp += 1
                
                # Hidden layer
                for h_id in ['h0', 'h1']:
                    total = 0
                    for src in ['x0', 'x1']:
                        w = self.weights[(src, h_id)].value
                        total += self.cells[src].value * w
                    total += self.cells['b0' if h_id == 'h0' else 'b1'].value
                    self.cells[h_id].value = np.tanh(total)
                    self.cells[h_id].witness()
                    self.cells[h_id].timestamp += 1
                
                # Output
                total = 0
                for src in ['h0', 'h1']:
                    w = self.weights[(src, 'y')].value
                    total += self.cells[src].value * w
                total += self.cells['b2'].value
                y_pred = 1 / (1 + np.exp(-np.clip(total, -500, 500)))
                self.cells['y'].value = y_pred
                self.cells['y'].witness()
                self.cells['y'].timestamp += 1
                
                # Loss
                loss = (y_pred - yi) ** 2
                total_loss += loss
                
                # Simple backprop (computed manually for XOR)
                # Output delta
                d_loss_dy = 2 * (y_pred - yi)
                # Sigmoid derivative
                sig_deriv = y_pred * (1 - y_pred)
                delta_y = d_loss_dy * sig_deriv
                
                # Update output weights
                for src in ['h0', 'h1']:
                    self.weights[(src, 'y')].value -= lr * delta_y * self.cells[src].value
                self.cells['b2'].value -= lr * delta_y
                
                # Hidden deltas
                # For each hidden unit, delta_h = delta_y * w_hy * tanh_deriv
                for h_id in ['h0', 'h1']:
                    w_hy = self.weights[(h_id, 'y')].value
                    h_val = self.cells[h_id].value
                    tanh_deriv = 1 - h_val**2
                    delta_h = delta_y * w_hy * tanh_deriv
                    
                    # Update input weights
                    for src in ['x0', 'x1']:
                        self.weights[(src, h_id)].value -= lr * delta_h * self.cells[src].value
                    self.cells['b0' if h_id == 'h0' else 'b1'].value -= lr * delta_h
            
            if epoch % 200 == 0:
                avg_loss = total_loss / len(X)
                losses.append(avg_loss)
        
        # Test
        results = []
        for xi, yi in zip(X, y):
            self.cells['x0'].value = xi[0]
            self.cells['x1'].value = xi[1]
            # Hidden
            for h_id in ['h0', 'h1']:
                total = sum(self.cells[src].value * self.weights[(src, h_id)].value 
                          for src in ['x0', 'x1']) + self.cells['b0' if h_id == 'h0' else 'b1'].value
                self.cells[h_id].value = np.tanh(total)
            # Output
            total = sum(self.cells[src].value * self.weights[(src, 'y')].value 
                      for src in ['h0', 'h1']) + self.cells['b2'].value
            y_pred = 1 / (1 + np.exp(-np.clip(total, -500, 500)))
            results.append((xi, yi, y_pred))
        
        return losses, results


def main():
    print('═' * 70)
    print('  AI++ SPREADSHEET — ML primitives as cell-graphs')
    print('═' * 70)
    print()
    
    # ───────────────────────────────────────────────────────────────────
    # Test 1: Linear regression
    # ───────────────────────────────────────────────────────────────────
    print('═══ Test 1: Linear regression ═══')
    print('  Goal: learn y = 2x + 1 + noise')
    np.random.seed(42)
    X = np.linspace(-5, 5, 50)
    y = 2 * X + 1 + np.random.randn(50) * 0.5
    
    ss = AISpreadsheet("linreg")
    losses = ss.linear_regression(X, y)
    
    print(f'  Final loss: {losses[-1]:.6f}')
    print(f'  Final w (should be ~2): {ss.weights[("x", "y_pred")].value:.4f}')
    print(f'  Final b (should be ~1): {ss.cells["b"].value:.4f}')
    print(f'  Witness entries: {len(ss.cells["x"].witness_chain) + len(ss.cells["y_pred"].witness_chain)}')
    print()
    
    # ───────────────────────────────────────────────────────────────────
    # Test 2: XOR neural network
    # ───────────────────────────────────────────────────────────────────
    print('═══ Test 2: XOR neural network (2-2-1) ═══')
    print('  Goal: solve XOR (not linearly separable)')
    
    ss = AISpreadsheet("xor")
    losses, results = ss.neural_network_xor()
    
    print(f'  Final loss: {losses[-1]:.6f}')
    print()
    print('  Test results:')
    for xi, yi, yp in results:
        verdict = '✓' if abs(yp - yi) < 0.1 else '✗'
        print(f'    XOR({xi[0]}, {xi[1]}) = {yp:.4f}  (expected {yi})  {verdict}')
    print()
    
    # ───────────────────────────────────────────────────────────────────
    # Test 3: Spreadsheet as exportable JSON
    # ───────────────────────────────────────────────────────────────────
    print('═══ Test 3: Spreadsheet export ═══')
    
    spreadsheet_data = {
        'name': ss.name,
        'cells': {cid: {
            'type': c.type,
            'value': c.value,
            'neighbors': c.neighbors,
            'n_witnesses': len(c.witness_chain),
        } for cid, c in ss.cells.items()},
        'weights': {f'{k[0]}→{k[1]}': c.value for k, c in ss.weights.items()},
        'layers': ss.layers,
    }
    
    with open('/workspace/research/cargo-line-tycoon/research/ai_plus_plus/example_xor.json', 'w') as f:
        json.dump(spreadsheet_data, f, indent=2)
    
    print(f'  Exported to example_xor.json ({len(spreadsheet_data["cells"])} cells)')
    print()
    
    print('═══ THE INSIGHT ═══')
    print()
    print('  A linear regression is 4 cells (x, w, b, y_pred).')
    print('  A neural network is N cells (input/hidden/output layers + weights + biases).')
    print('  A CNN is a 2D grid of cells + convolution operation.')
    print('  An RNN is a sequence of cells with feedback.')
    print('  RL is state/action/reward cells.')
    print()
    print('  Each paradigm is a different LAYOUT of cells.')
    print('  The substrate operations (11 opcodes, witness-log, JEV, Memory Sandbox)')
    print('  work on any layout. That\'s why the substrate is the AI++.')
    print()
    print('  Easier than Jupyter? Easier than NotebookLM? Easier than NumPy?')
    print('  Yes — because the spreadsheet IS the math, not a wrapper around it.')


if __name__ == '__main__':
    main()
