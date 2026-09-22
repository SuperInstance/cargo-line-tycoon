"""Fix the assembly: only include leaf cells (no children)."""
# Leaves = cells where len(children) == 0
# Then concat in DFS order from genesis
