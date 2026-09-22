"""The substrate cell motif as pure mathematical structures."""
from dataclasses import dataclass
from typing import Iterator
import itertools


@dataclass(frozen=True)
class AlgebraicCell:
    """A cell as an element of the join semilattice."""
    id: str
    prev_hash: str
    state: tuple


class SubstrateSemilattice:
    """The substrate as a join semilattice."""
    
    def __init__(self):
        self.cells = {}
        self.genesis = AlgebraicCell('genesis', '0x0000000000000000', ())
        self.cells[self.genesis.id] = self.genesis
    
    def join(self, a: AlgebraicCell, b: AlgebraicCell) -> AlgebraicCell:
        if a == b:
            return a
        if self._leq(a, b):
            return b
        if self._leq(b, a):
            return a
        # Canonical merge: sort components for commutativity
        ids_sorted = sorted([a.id, b.id])
        prev_sorted = sorted([a.prev_hash, b.prev_hash])
        new_id = f'merge({",".join(ids_sorted)})'
        new_prev = prev_sorted[0]  # deterministic
        new_state = tuple(sorted(set(a.state) | set(b.state)))
        return AlgebraicCell(new_id, new_prev, new_state)
    
    def _leq(self, a: AlgebraicCell, b: AlgebraicCell) -> bool:
        if a.id == self.genesis.id:
            return True
        if a.id == b.id:
            return True
        visited = set()
        current = b
        while current.prev_hash != self.genesis.prev_hash and current.id not in visited:
            visited.add(current.id)
            if current.prev_hash == a.id:
                return True
            if current.prev_hash in self.cells:
                current = self.cells[current.prev_hash]
            else:
                break
        return False
    
    def _ancestor_ids(self, cell: AlgebraicCell) -> set:
        ancestors = {cell.id}
        visited = set()
        current = cell
        while current.prev_hash != self.genesis.prev_hash and current.id not in visited:
            visited.add(current.id)
            if current.prev_hash in self.cells:
                current = self.cells[current.prev_hash]
                ancestors.add(current.id)
            else:
                break
        return ancestors
    
    def _ancestor_ids_by_id(self, cell_id: str) -> set:
        if cell_id not in self.cells:
            return {cell_id}
        return self._ancestor_ids(self.cells[cell_id])
    
    def _common_ancestor_id(self, a: AlgebraicCell, b: AlgebraicCell) -> str:
        a_ancestors = self._ancestor_ids(a)
        b_ancestors = self._ancestor_ids(b)
        common = a_ancestors & b_ancestors
        if common:
            return min(common, key=lambda cid: len(self._ancestor_ids_by_id(cid)))
        return self.genesis.prev_hash
    
    def is_lattice(self) -> bool:
        sample = list(itertools.islice(itertools.combinations(self.cells.values(), 2), 10))
        for a, b in sample:
            if self.join(a, b) != self.join(b, a):
                return False
        for cell in list(self.cells.values())[:5]:
            if self.join(cell, self.genesis) != cell:
                return False
        for cell in list(self.cells.values())[:5]:
            if self.join(cell, cell) != cell:
                return False
        return True


def category_theory_view():
    print("The substrate as a category:")
    print("  Objects: AlgebraicCell instances")
    print("  Morphisms: prev_hash links")
    print("  Composition: prev_hash ∘ prev_hash = transitive closure")
    print("  Identity: id_cell = (cell, cell)")
    print("  This is a thin category = poset")


def sheaf_theory_view():
    print("The substrate as a sheaf:")
    print("  U = open set of cells")
    print("  F(U) = witnesses on U")
    print("  Gluing: compatible witness sets glue")


def test_lattice():
    lattice = SubstrateSemilattice()
    cells = [
        AlgebraicCell('a', 'genesis', ('one',)),
        AlgebraicCell('b', 'genesis', ('two',)),
        AlgebraicCell('c', 'a', ('one', 'extra')),
        AlgebraicCell('d', 'b', ('two', 'extra')),
    ]
    for cell in cells:
        lattice.cells[cell.id] = cell
    
    print('Lattice properties:')
    print(f'  a ⊔ b = {lattice.join(cells[0], cells[1]).id}')
    print(f'  a ⊔ c = {lattice.join(cells[0], cells[2]).id}')
    print(f'  c ⊔ d = {lattice.join(cells[2], cells[3]).id}')
    print(f'  a ⊔ a = {lattice.join(cells[0], cells[0]).id}')
    print(f'  a ⊔ ⊥ = {lattice.join(cells[0], lattice.genesis).id}')
    
    # Test commutativity
    a, b = cells[0], cells[1]
    assert lattice.join(a, b) == lattice.join(b, a), "Commutativity failed"
    print('  Commutativity: ✓')
    
    # Test identity
    for cell in cells:
        assert lattice.join(cell, lattice.genesis) == cell
    print('  Identity: ✓')
    
    # Test idempotence
    for cell in cells:
        assert lattice.join(cell, cell) == cell
    print('  Idempotence: ✓')
    
    print(f'  Is proper lattice: {lattice.is_lattice()}')
    
    print()
    category_theory_view()
    print()
    sheaf_theory_view()


if __name__ == '__main__':
    test_lattice()
