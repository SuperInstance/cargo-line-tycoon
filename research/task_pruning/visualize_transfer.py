import json
import numpy as np

with open('/workspace/research/cargo-line-tycoon/research/task_pruning/cross_task_transfer.json') as f:
    data = json.load(f)

tasks = data['tasks']
print('═' * 60)
print('  TRANSFER HEATMAP (prune-for vs eval-on)')
print('═' * 60)
print()

# ASCII heatmap
print('  ' + ' ' * 14 + 'eval→')
header = '  ' + ' ' * 14
for t in tasks:
    header += f'{t[:6]:>8}'
print(header)
print('  ' + ' ' * 14 + '-' * (8 * len(tasks)))

for prune_task in tasks:
    row = f'  {prune_task:14}'
    for eval_task in tasks:
        v = data['transfer_matrix'][f'{prune_task}_to_{eval_task}']
        if v >= 0.95:
            char = '#'
        elif v >= 0.5:
            char = '*'
        elif v >= 0.2:
            char = '+'
        elif v >= 0.05:
            char = '.'
        else:
            char = ' '
        row += f'    {char}{int(v*100):3d}'
    print(row)

print()
print('Legend: # 95%+, * 50%+, + 20%+, . 5%+, <space> <5%')
print()

# Save as text file too
with open('/workspace/research/cargo-line-tycoon/research/task_pruning/heatmap.txt', 'w') as f:
    f.write('TRANSFER HEATMAP\n\n')
    for prune_task in tasks:
        row = f'  {prune_task:14}'
        for eval_task in tasks:
            v = data['transfer_matrix'][f'{prune_task}_to_{eval_task}']
            row += f'  {v*100:5.1f}'
        f.write(row + '\n')
