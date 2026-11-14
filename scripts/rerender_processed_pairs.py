"""Re-render every processed DR1 pair (comparison.png, blink.gif, aligned FITS, report.json)
from exactly the inputs recorded in its report.json, e.g. after a display-style change.

Each pair is rebuilt through scripts/process_candidate_pair.py with a one-pair screening file,
so the shared screening report is not needed and inputs cannot drift (SHA-256 is re-checked).
Keys added after processing (pair_kind, display_selection, status, warnings) are preserved.
"""
import json
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
KEEP = ('pair_kind', 'display_selection', 'status', 'warnings')


def main():
    ok = failed = 0
    for rep in sorted((ROOT / 'data/processed').glob('**/report.json')):
        old = json.loads(rep.read_text(encoding='utf8'))
        if old.get('release') != 'dr1' or len(old.get('inputs', [])) != 2:
            continue
        inp = old['inputs']
        pair = {'detector': old['detector'], 'observations': [i['obs_id'] for i in inp],
                'file_paths': [i['file'] for i in inp], 'sha256': [i['sha256'] for i in inp],
                'mjd': [i['mjd'] for i in inp], 'time_gap_days': abs(inp[1]['mjd'] - inp[0]['mjd'])}
        screening = {'rules': old.get('screening_rules', {}), 'targets': {old['target']: {'candidate_pairs': [pair]}}}
        with tempfile.NamedTemporaryFile('w', suffix='.json', delete=False, encoding='utf8') as tmp:
            json.dump(screening, tmp)
        r = subprocess.run([sys.executable, str(ROOT / 'scripts/process_candidate_pair.py'), '--target', old['target'],
                            '--detector', str(old['detector']), '--observations', *pair['observations'],
                            '--output', str(rep.parent), '--screening', tmp.name], cwd=ROOT, capture_output=True, text=True)
        Path(tmp.name).unlink(missing_ok=True)
        if r.returncode:
            failed += 1
            print('FAIL', rep.parent, r.stderr.strip().splitlines()[-1:], flush=True)
            continue
        new = json.loads(rep.read_text(encoding='utf8'))
        if old.get('pair_kind') == 'display_only':
            new.update({k: old[k] for k in KEEP if k in old})
        new['screening_rules'] = old.get('screening_rules', new.get('screening_rules'))
        rep.write_text(json.dumps(new, indent=2), encoding='utf8')
        ok += 1
    print(f'{ok} re-rendered, {failed} failed', flush=True)
    return 1 if failed else 0


if __name__ == '__main__':
    raise SystemExit(main())
