"""One sequential DR1 D6 pass: acquire, screen, process, then advance target."""
import itertools
import json
import subprocess
import sys
from collections import Counter
from datetime import datetime, timezone

from download_spherex import ROOT, save_json
from screen_comparison_candidates import TARGETS, screening, pair_metrics


def run(script, *args):
    return subprocess.run([sys.executable, str(ROOT / 'scripts' / script), *map(str, args)], cwd=ROOT).returncode


def main():
    report_dir = ROOT / 'data/reports'
    report_dir.mkdir(parents=True, exist_ok=True)
    summary = {'started_utc': datetime.now(timezone.utc).isoformat(), 'release': 'dr1', 'detector': 6,
               'scope': 'One target-ordered pass; stop each target after a processed pair or exhaustion of its saved live SIA query. Not an exhaustive archive survey.', 'targets': {}}
    screen_path = report_dir / 'comparison_candidates.json'
    screen = json.loads(screen_path.read_text()) if screen_path.exists() else {'rules': {
        'release': 'same DR1', 'detector': 'same detector', 'time_gap_days_min': 30,
        'spectral_rule': 'abs(lambda1-lambda2) <= 0.5 * min(bandwidth1, bandwidth2)',
        'quality': 'finite target pixel and no quality flags except SOURCE/FULLSAMPLE',
        'limitations': 'Engineering diagnostic only; no scientific detection or independent alignment validation.'}, 'targets': {}}
    for target in TARGETS:
        folder = ROOT / 'data/spherex' / target
        manifest_path = folder / 'manifest.json'
        before = len(json.loads(manifest_path.read_text())['downloads']) if manifest_path.exists() else 0
        state = {'status': 'running', 'initial_files': before, 'batches': 0, 'processing_failures': []}
        summary['targets'][target] = state
        save_json(report_dir / 'd6_round.json', summary)
        print('START', target, flush=True)
        if not (folder / 'sia-votable.xml').exists():
            run('download_sia_spherex.py', target)
        if not manifest_path.exists() or not (folder / 'sia-votable.xml').exists():
            state['status'] = 'query_failed'
            save_json(report_dir / 'd6_round.json', summary)
            continue
        tried_pairs = set()
        while True:
            manifest = json.loads(manifest_path.read_text())
            images = []
            for entry in manifest['downloads']:
                if entry['detector'] != 6 or entry.get('release') != 'dr1':
                    continue
                try:
                    images.append(screening(entry, target))
                except Exception as exc:
                    images.append({'obs_id': entry['obs_id'], 'detector': 6, 'release': 'dr1',
                                   'usable_for_candidate': False, 'reasons': [str(exc)]})
            pairs = []
            for a, b in itertools.combinations(images, 2):
                metrics = pair_metrics(a, b)
                if metrics:
                    gap, delta, tolerance = metrics
                    pairs.append({'detector': 6, 'observations': [a['obs_id'], b['obs_id']],
                                  'file_paths': [a['file'], b['file']], 'sha256': [a['sha256'], b['sha256']],
                                  'mjd': [a['mjd'], b['mjd']], 'time_gap_days': gap,
                                  'wavelength_um': [a['wavelength_um'], b['wavelength_um']],
                                  'bandwidth_um': [a['bandwidth_um'], b['bandwidth_um']],
                                  'wavelength_delta_um': delta, 'tolerance_um': tolerance})
            screen['targets'][target] = {'images': images, 'candidate_pairs': pairs}
            save_json(screen_path, screen)
            state.update(downloaded_files=len(images), new_files=len(manifest['downloads'])-before,
                         eligible_images=sum(i['usable_for_candidate'] for i in images), screened_pairs=len(pairs),
                         reasons=dict(Counter(r for i in images for r in i.get('reasons', []))),
                         bad_flags=dict(Counter(f for i in images for f in i.get('bad_flags_at_target', []))))
            selection_report = folder / 'selection_report.json'
            state['download_errors'] = {k: v for k, v in json.loads(selection_report.read_text()).get('files', {}).items()
                                        if v['status'] not in ('downloaded', 'already_downloaded')} if selection_report.exists() else {}
            print('SCREEN', target, state['downloaded_files'], 'files', state['eligible_images'], 'eligible', len(pairs), 'pairs', flush=True)
            for pair in sorted(pairs, key=lambda p: -p['time_gap_days']):
                key = tuple(sorted(pair['observations']))
                if key in tried_pairs:
                    continue
                tried_pairs.add(key)
                if run('process_candidate_pair.py', '--target', target, '--detector', 6, '--observations', *pair['observations']) == 0:
                    state['status'] = 'processed_pair'
                    state['product'] = f'data/processed/{target}_d6_comparison/report.json'
                    break
                state['processing_failures'].append(list(key))
            save_json(report_dir / 'd6_round.json', summary)
            if state['status'] == 'processed_pair':
                break
            state['batches'] += 1
            batch = 'roundD6' + str(state['batches'])
            run('acquire_comparison_extras.py', '--targets', target, '--detector', 6, '--batch', batch)
            selection = folder / f'irsa-download-lists/sia-comparison-extra-d6-{batch}.txt'
            if not selection.exists():
                state['status'] = 'selection_failed'
                break
            if not selection.read_text().strip():
                state['status'] = 'queried_candidates_exhausted'
                break
        save_json(report_dir / 'd6_round.json', summary)
        print('FINISH', target, state['status'], flush=True)
    summary['finished_utc'] = datetime.now(timezone.utc).isoformat()
    save_json(report_dir / 'd6_round.json', summary)


if __name__ == '__main__':
    main()
