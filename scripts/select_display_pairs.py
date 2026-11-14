"""Build display-only DR1 pairs for target/detector cells that have no screened pair.

Purpose: let the demo show the same sky region over time for every target and detector, e.g.
Barnard's Star and R Draconis whose target pixels are saturated in every DR1 frame. A display
pair keeps every screening rule (same DR1 release and detector, >= 30 days apart, wavelengths
within half the narrower bandwidth, target inside the cutout) EXCEPT the requirement that the
predicted target pixel is finite and unflagged. Flagged/saturated pixels stay masked (black);
nothing is filled in. Results go to data/processed/<target>_d<N>_display/ with
report.json pair_kind = 'display_only' and must never be presented as measurements.
"""
import argparse
import itertools
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCREENING = ROOT / 'data/reports/comparison_candidates.json'
OUT = ROOT / 'data/reports/display_pair_candidates.json'
MIN_GAP_DAYS = 30
TRIES = 6


def background_quality(local):
    manifest = json.loads((ROOT / 'data/spherex' / local / 'manifest.json').read_text(encoding='utf8'))
    return {(d['obs_id'], int(d['detector'])): d.get('validation', {}).get('finite_unflagged_fraction') or 0.0
            for d in manifest['downloads']}


def candidates(local, images, detector):
    quality = background_quality(local)
    frames = [i for i in images if i['detector'] == detector and i.get('release') == 'dr1' and i.get('inside')
              and i.get('wavelength_um') and i.get('bandwidth_um')]
    pairs = []
    for a, b in itertools.combinations(frames, 2):
        gap = abs(b['mjd'] - a['mjd'])
        tol = 0.5 * min(a['bandwidth_um'], b['bandwidth_um'])
        delta = abs(a['wavelength_um'] - b['wavelength_um'])
        if gap < MIN_GAP_DAYS or delta > tol:
            continue
        early, late = sorted((a, b), key=lambda x: x['mjd'])
        clean = min(quality.get((x['obs_id'], detector), 0.0) for x in (early, late))
        pairs.append({'detector': detector, 'observations': [early['obs_id'], late['obs_id']],
                      'file_paths': [early['file'], late['file']], 'sha256': [early['sha256'], late['sha256']],
                      'mjd': [early['mjd'], late['mjd']], 'time_gap_days': gap,
                      'wavelength_um': [early['wavelength_um'], late['wavelength_um']],
                      'bandwidth_um': [early['bandwidth_um'], late['bandwidth_um']],
                      'wavelength_delta_um': delta, 'tolerance_um': tol,
                      'background_finite_unflagged_fraction_min': clean,
                      'target_flags': [early.get('bad_flags_at_target', []), late.get('bad_flags_at_target', [])],
                      'pair_kind': 'display_only'})
    # Prefer cleaner backgrounds, then longer baselines.
    return sorted(pairs, key=lambda p: (round(p['background_finite_unflagged_fraction_min'], 2), p['time_gap_days']), reverse=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--targets', nargs='+', default=['barnard', 'r_draconis', 'rw_aurigae', 'epsilon_indi_b', 'wise0855'])
    parser.add_argument('--redo', action='store_true', help='Reprocess cells that already have a display pair')
    args = parser.parse_args()
    screening = json.loads(SCREENING.read_text(encoding='utf8'))
    display = {'rules': {**screening['rules'], 'quality': 'NOT REQUIRED (display-only): target pixel may be saturated/flagged and stays masked',
                         'purpose': 'Visual context of the same sky region over time; not a measurement or detection.'},
               'targets': {}}
    summary = {}
    for local in args.targets:
        info = screening['targets'][local]
        display['targets'][local] = {'candidate_pairs': []}
        for detector in range(1, 7):
            if any(p['detector'] == detector for p in info['candidate_pairs']):
                summary[f'{local} D{detector}'] = 'screened pair exists'
                continue
            out = ROOT / 'data/processed' / f'{local}_d{detector}_display'
            if (out / 'report.json').exists() and not args.redo:
                summary[f'{local} D{detector}'] = 'display pair exists'
                continue
            options = candidates(local, info['images'], detector)
            if not options:
                summary[f'{local} D{detector}'] = 'no frame pair meets release/detector/time/wavelength rules'
                continue
            display['targets'][local]['candidate_pairs'] = options[:TRIES]
            OUT.write_text(json.dumps(display, indent=2), encoding='utf8')
            status = 'all candidates failed processing (common coverage < 50%?)'
            for option in options[:TRIES]:
                r = subprocess.run([sys.executable, str(ROOT / 'scripts/process_candidate_pair.py'), '--target', local,
                                    '--detector', str(detector), '--observations', *option['observations'],
                                    '--output', str(out), '--screening', str(OUT)], cwd=ROOT, capture_output=True, text=True)
                if r.returncode == 0:
                    report = json.loads((out / 'report.json').read_text(encoding='utf8'))
                    report.update({'pair_kind': 'display_only', 'status': 'display_only_not_a_measurement',
                                   'display_selection': {k: option[k] for k in ('background_finite_unflagged_fraction_min', 'target_flags', 'time_gap_days', 'wavelength_delta_um', 'tolerance_um')}})
                    report['warnings'] = ['DISPLAY ONLY: predicted target pixels are saturated or flagged in DR1 and are masked; no photometry, position or variability can be derived.'] + report.get('warnings', [])
                    (out / 'report.json').write_text(json.dumps(report, indent=2), encoding='utf8')
                    status = f"display pair {option['observations']} ({option['time_gap_days']:.0f} d, coverage {report['common_coverage_fraction']:.2f})"
                    break
            summary[f'{local} D{detector}'] = status
            print(local, f'D{detector}:', status, flush=True)
    print(json.dumps(summary, indent=1, ensure_ascii=False))


if __name__ == '__main__':
    main()
