"""Run bounded sequential DR1 batches for one target, deferring HTTP 503."""
import argparse
import json
import subprocess
import sys
import uuid
import re
from urllib.parse import parse_qs, urlsplit

from download_spherex import ROOT, save_json


def run(script, *args):
    return subprocess.run([sys.executable, str(ROOT / 'scripts' / script), *map(str, args)], cwd=ROOT).returncode


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--target', required=True, choices=['barnard', 'wise0855', 'epsilon_indi_b', 'rw_aurigae', 'r_draconis'])
    parser.add_argument('--detectors', type=int, nargs='+', default=[1, 2, 3, 4, 5, 6], choices=range(1, 7))
    parser.add_argument('--source', choices=['sia', 'tap'], default='sia')
    args = parser.parse_args()
    if args.source == 'tap' and args.target not in {'barnard', 'r_draconis'}:
        parser.error('TAP selector currently supports barnard and r_draconis')
    for detector in args.detectors:
        batch = 'seq' + uuid.uuid4().hex[:12]
        folder = ROOT / 'data/spherex' / args.target / 'irsa-download-lists'
        if args.source == 'sia':
            result = run('acquire_comparison_extras.py', '--targets', args.target, '--detector', detector, '--batch', batch, '--defer-503')
            selection = folder / f'sia-comparison-extra-d{detector}-{batch}.txt'
        else:
            selection = folder / f'tap-extra-d{detector}-{batch}.txt'
            if run('select_tap_extras.py', '--target', args.target, '--detector', detector, '--batch', batch):
                raise RuntimeError('TAP selection failed')
            result = run('download_selected_spherex.py', '--target', args.target, '--url-list', selection, '--defer-503') if selection.read_text(encoding='utf8').strip() else 0
        if not selection.exists():
            raise RuntimeError('Selection failed before it could be saved')
        if not selection.read_text(encoding='utf8').strip():
            print(f'{args.target} D{detector}: no untried cached SIA candidates covering the predicted position', flush=True)
            continue
        if result:
            report = json.loads((ROOT / 'data/spherex' / args.target / 'selection_report.json').read_text(encoding='utf8'))
            paths = [parse_qs(urlsplit(url).query)['path'][0] for url in selection.read_text(encoding='utf8').splitlines() if url]
            keys = [re.search(r'level2_(.+?)D([1-6])_spx_', path) for path in paths]
            if any(m is None for m in keys) or not keys or any(report['files'].get(f'{m.group(1)}_D{m.group(2)}', {}).get('status') not in {'downloaded', 'already_downloaded', 'deferred_503'} for m in keys):
                raise RuntimeError('Download failed; inspect selection report')
        if run('screen_comparison_candidates.py'):
            raise RuntimeError('Screening failed')
        screening = json.loads((ROOT / 'data/reports/comparison_candidates.json').read_text(encoding='utf8'))
        pairs = [p for p in screening['targets'][args.target]['candidate_pairs'] if p['detector'] == detector]
        output = ROOT / 'data/processed' / f'{args.target}_d{detector}_comparison' / 'report.json'
        for pair in pairs:
            observations = sorted(pair['observations'])
            primary = json.loads(output.read_text(encoding='utf8')) if output.exists() else {}
            primary_obs = {x['obs_id'] for x in primary.get('inputs', [])}
            if set(observations) == primary_obs:
                continue
            extra = ROOT / 'data/processed' / f'{args.target}_d{detector}_pairs' / '__'.join(observations)
            if (extra / 'report.json').exists() or (extra / 'processing_failure.json').exists():
                continue
            destination = extra if output.exists() else output.parent
            result = subprocess.run([sys.executable, str(ROOT / 'scripts/process_candidate_pair.py'),
                                     '--target', args.target, '--detector', str(detector),
                                     '--observations', *observations, '--output', str(destination)],
                                    cwd=ROOT, capture_output=True, text=True)
            print(result.stdout + result.stderr, flush=True)
            if result.returncode:
                extra.mkdir(parents=True, exist_ok=True)
                save_json(extra / 'processing_failure.json', {'observations': observations, 'status': 'processing_failed', 'error': result.stderr[-4000:]})
        print(f'{args.target} D{detector}: {len(pairs)} screened pairs', flush=True)
    if run('check_comparison_readiness.py'):
        raise RuntimeError('Readiness check failed')


if __name__ == '__main__':
    main()
