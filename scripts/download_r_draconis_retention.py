"""Resume the six previously selected R Draconis lists with acquisition-first validation."""
import subprocess
import sys
from pathlib import Path

root=Path(__file__).resolve().parents[1]
folder=root/'data/spherex/r_draconis/irsa-download-lists'
status=0
for detector in range(1,7):
    file=folder/f'sia-selected-d{detector}.txt'
    if not file.exists():
        print(f'D{detector}: missing recorded selection {file}',flush=True)
        status=1
        continue
    print(f'R Draconis D{detector}: resuming selected observations',flush=True)
    p=subprocess.run([sys.executable,str(root/'scripts/download_selected_spherex.py'),'--target','r_draconis','--url-list',str(file),'--retry-seconds','180'],cwd=root)
    if p.returncode: status=1
raise SystemExit(status)
