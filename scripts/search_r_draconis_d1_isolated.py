"""Resume R Draconis D1 without writing the shared comparison report."""
import itertools
import json
import re
import subprocess
import sys
import uuid
from urllib.parse import parse_qs, urlsplit

from download_spherex import ROOT, save_json
from screen_comparison_candidates import pair_metrics, screening


def main():
    target = 'r_draconis'
    folder = ROOT / 'data/spherex' / target
    output = ROOT / 'data/reports/r_draconis_d1_isolated.json'
    while True:
        label = 'r1' + uuid.uuid4().hex[:12]
        proc = subprocess.run([sys.executable, str(ROOT/'scripts/acquire_comparison_extras.py'),
                               '--targets', target, '--detector', '1', '--batch', label,
                               '--defer-503'], cwd=ROOT)
        selection = folder / 'irsa-download-lists' / f'sia-comparison-extra-d1-{label}.txt'
        if not selection.is_file():
            raise RuntimeError('Selection failed before the URL list was saved')
        if not selection.read_text(encoding='utf8').strip():
            print('R Draconis D1: no remaining untried eligible cached SIA rows', flush=True)
            break
        if proc.returncode:
            report = json.loads((folder/'selection_report.json').read_text(encoding='utf8'))
            urls = selection.read_text(encoding='utf8').splitlines()
            matches = [re.search(r'level2_(.+?)D([1-6])_spx_', parse_qs(urlsplit(url).query)['path'][0]) for url in urls]
            if not matches or any(m is None or report['files'].get(f'{m.group(1)}_D{m.group(2)}', {}).get('status') not in {'downloaded', 'already_downloaded', 'deferred_503'} for m in matches):
                raise RuntimeError('Non-503 acquisition failure; inspect selection report')
        manifest = json.loads((folder/'manifest.json').read_text(encoding='utf8'))
        images = [screening(entry, target) for entry in manifest['downloads'] if entry['detector'] == 1]
        pairs = []
        for a, b in itertools.combinations(images, 2):
            metrics = pair_metrics(a, b)
            if metrics:
                gap, delta, tolerance = metrics
                pairs.append({'detector': 1, 'observations': [a['obs_id'], b['obs_id']],
                              'file_paths': [a['file'], b['file']], 'sha256': [a['sha256'], b['sha256']],
                              'mjd': [a['mjd'], b['mjd']], 'time_gap_days': gap,
                              'wavelength_um': [a['wavelength_um'], b['wavelength_um']],
                              'bandwidth_um': [a['bandwidth_um'], b['bandwidth_um']],
                              'wavelength_delta_um': delta, 'tolerance_um': tolerance})
        rules = {'release': 'same DR1', 'detector': 'same detector', 'time_gap_days_min': 30,
                 'spectral_rule': 'abs(lambda1-lambda2) <= 0.5 * min(bandwidth1, bandwidth2)',
                 'quality': 'finite target pixel and no quality flags except SOURCE/FULLSAMPLE',
                 'limitations': 'Preliminary engineering screening only; not science validation.'}
        save_json(output, {'rules': rules, 'targets': {target: {'images': images, 'candidate_pairs': pairs}}})
        print(f'{target} D1: {len(images)} images, {sum(x["usable_for_candidate"] for x in images)} eligible, {len(pairs)} pairs', flush=True)
        for pair in pairs:
            obs = sorted(pair['observations'])
            dest = ROOT/'data/processed'/f'{target}_d1_pairs'/'__'.join(obs)
            if (dest/'report.json').exists() or (dest/'processing_failure.json').exists():
                continue
            result = subprocess.run([sys.executable, str(ROOT/'scripts/process_candidate_pair.py'),
                                     '--target', target, '--detector', '1', '--observations', *obs,
                                     '--output', str(dest), '--screening', str(output)],
                                    cwd=ROOT, capture_output=True, text=True)
            print(result.stdout + result.stderr, flush=True)
            if result.returncode:
                dest.mkdir(parents=True, exist_ok=True)
                save_json(dest/'processing_failure.json', {'observations': obs, 'error': result.stderr[-4000:]})


if __name__ == '__main__':
    main()
