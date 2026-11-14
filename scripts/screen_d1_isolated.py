"""Screen one target's DR1 D1 data without writing the shared comparison report."""
import argparse
import itertools
import json
import subprocess
import sys

from download_spherex import ROOT, save_json
from screen_comparison_candidates import pair_metrics, screening


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--target', required=True, choices=['barnard', 'wise0855', 'epsilon_indi_b', 'rw_aurigae', 'r_draconis'])
    args = parser.parse_args()
    target = args.target
    manifest = json.loads((ROOT/'data/spherex'/target/'manifest.json').read_text(encoding='utf8'))
    images = [screening(entry, target) for entry in manifest['downloads'] if entry['detector'] == 1]
    pairs = []
    for a, b in itertools.combinations(images, 2):
        metrics = pair_metrics(a, b)
        if not metrics:
            continue
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
    report = ROOT/'data/reports'/f'{target}_d1_round2.json'
    save_json(report, {'rules': rules, 'targets': {target: {'images': images, 'candidate_pairs': pairs}}})
    primary = ROOT/'data/processed'/f'{target}_d1_comparison'/'report.json'
    for pair in pairs:
        obs = sorted(pair['observations'])
        existing = json.loads(primary.read_text(encoding='utf8')) if primary.exists() else {}
        if set(obs) == {x['obs_id'] for x in existing.get('inputs', [])}:
            continue
        extra = ROOT/'data/processed'/f'{target}_d1_pairs'/'__'.join(obs)
        if (extra/'report.json').exists() or (extra/'processing_failure.json').exists():
            continue
        dest = extra if primary.exists() else primary.parent
        result = subprocess.run([sys.executable, str(ROOT/'scripts/process_candidate_pair.py'),
                                 '--target', target, '--detector', '1', '--observations', *obs,
                                 '--output', str(dest), '--screening', str(report)],
                                cwd=ROOT, capture_output=True, text=True)
        print(result.stdout + result.stderr, flush=True)
        if result.returncode:
            extra.mkdir(parents=True, exist_ok=True)
            save_json(extra/'processing_failure.json', {'observations': obs, 'error': result.stderr[-4000:]})
    print(f'{target} D1: {len(images)} images, {sum(x["usable_for_candidate"] for x in images)} eligible, {len(pairs)} candidate pairs', flush=True)


if __name__ == '__main__':
    main()
