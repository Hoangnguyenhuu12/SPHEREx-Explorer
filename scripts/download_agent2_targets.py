"""Select, download, and validate DR1 cutouts for epsilon_indi_b, rw_aurigae, and r_draconis."""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlencode, urlsplit

from astropy.table import Table
from astropy.time import Time

from download_spherex import OUT, ROOT, TARGETS, coordinate, save_json

AGENT2_TARGETS = ('epsilon_indi_b', 'rw_aurigae', 'r_draconis')
RETRY_SECONDS = '180'


def ensure_manifest_provenance(target: str) -> None:
    """Ensure identifier and SIMBAD J2000 coordinate metadata exist in manifest.json."""
    folder = OUT / target
    manifest_path = folder / 'manifest.json'
    if manifest_path.exists():
        manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    else:
        manifest = {'target': target, 'release': 'dr1', 'downloads': []}
    identifier, ra, dec, pmra, pmdec = TARGETS[target]
    manifest.setdefault('target', target)
    manifest.setdefault('release', 'dr1')
    manifest.setdefault('downloads', [])
    manifest['identifier'] = identifier
    manifest['coordinate'] = {
        'ra_deg': ra,
        'dec_deg': dec,
        'frame': 'ICRS',
        'reference_epoch': 'J2000',
        'pm_ra_cosdec_mas_per_year': pmra,
        'pm_dec_mas_per_year': pmdec,
        'source': 'https://simbad.cfa.harvard.edu/simbad/sim-id?' + urlencode({'Ident': identifier}),
        'provenance': 'SIMBAD snapshot previously saved in data/five_targets',
        'limitations': 'Linear proper motion only; no parallax, binary orbit, radial velocity or source detection.',
    }
    save_json(manifest_path, manifest)


def load_json(path: Path, default: dict) -> dict:
    """Load JSON file if present, otherwise return default."""
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding='utf-8'))


def cutout_selection_url(source_url: str, ra_deg: float, dec_deg: float) -> str:
    """Build an IRSA IBE cutout selection URL matching download_selected_spherex.py."""
    path = urlsplit(source_url).path.removeprefix('/ibe/data/')
    return 'https://irsa.ipac.caltech.edu/ibe/cutout?' + urlencode(
        {'ra': str(ra_deg), 'dec': str(dec_deg), 'size': '0.1', 'path': path},
        safe='/',
    )


def dr1_candidates_for_detector(table: Table, detector: int) -> list[tuple[float, str, str]]:
    """Return sorted DR1 SIA candidates (t_min, obs_id, access_url) for one detector."""
    candidates = []
    for row in table:
        url = str(row['access_url'])
        if (
            str(row['obs_collection']).lower() == 'spherex_dr1'
            and str(row['energy_bandpassname']) == f'SPHEREx-D{detector}'
            and url.startswith('https://irsa.ipac.caltech.edu/ibe/data/spherex/dr1/level2/')
        ):
            candidates.append((float(row['t_min']), str(row['obs_id']), url))
    candidates.sort()
    return candidates


def spaced_indices(count: int, max_items: int = 3) -> list[int]:
    """Select up to max_items chronologically spaced indices."""
    if count <= 0:
        return []
    if count == 1 or max_items <= 1:
        return [0]
    if count <= max_items:
        return list(range(count))
    return sorted({round(i * (count - 1) / (max_items - 1)) for i in range(max_items)})


def is_validation_failure(entry: dict | None) -> bool:
    """Return True if selection_report entry failed FITS validation."""
    return bool(
        entry
        and entry.get('status') == 'failed'
        and 'ValueError: FITS validation:' in (entry.get('error') or '')
    )


def is_terminal_entry(folder: Path, key: str, entry: dict | None) -> bool:
    """Return True if observation is already downloaded on disk or failed FITS validation."""
    if not entry:
        return False
    status = entry.get('status')
    if status in ('downloaded', 'already_downloaded'):
        return (folder / 'cutouts' / f'{key}.fits').is_file()
    return is_validation_failure(entry)


def run_download_list(target: str, url_list: Path) -> int:
    """Invoke download_selected_spherex.py on a URL list with 180s per-file retry."""
    proc = subprocess.run(
        [
            sys.executable,
            str(ROOT / 'scripts/download_selected_spherex.py'),
            '--target',
            target,
            '--url-list',
            str(url_list),
            '--retry-seconds',
            RETRY_SECONDS,
        ],
        cwd=ROOT,
    )
    return proc.returncode


def valid_count_for_detector(manifest: dict, detector: int) -> int:
    """Count validated DR1 cutouts for a detector in manifest.json."""
    return sum(
        1
        for d in manifest.get('downloads', [])
        if d.get('release') == 'dr1'
        and d.get('detector') == detector
        and d.get('validation', {}).get('valid')
    )


def run_phase1(target: str, table: Table, ra_deg: float, dec_deg: float) -> None:
    """Select and download initial 3 chronologically spaced D1-D5 candidates."""
    folder = OUT / target
    outdir = folder / 'irsa-download-lists'
    outdir.mkdir(parents=True, exist_ok=True)
    for detector in range(1, 6):
        candidates = dr1_candidates_for_detector(table, detector)
        if not candidates:
            print(f'{target} D{detector}: no SIA candidates', flush=True)
            continue
        selected = [candidates[i] for i in spaced_indices(len(candidates), 3)]
        selection_file = outdir / f'sia-selected-d{detector}.txt'
        urls = [cutout_selection_url(url, ra_deg, dec_deg) for _, _, url in selected]
        if selection_file.exists():
            if selection_file.read_text(encoding='utf-8').splitlines() != urls:
                raise ValueError(f'Existing selection differs; refusing to overwrite: {selection_file}')
        else:
            selection_file.write_text('\n'.join(urls) + '\n', encoding='utf-8')

        report = load_json(folder / 'selection_report.json', {'target': target, 'files': {}})
        files_report = report.get('files', {})
        keys = [f'{obs}_D{detector}' for _, obs, _ in selected]
        if all(is_terminal_entry(folder, key, files_report.get(key)) for key in keys):
            print(f'{target} D{detector}: initial selection already terminal, skipping', flush=True)
            continue

        print(
            f'{target} D{detector}: {len(candidates)} candidates; selected {[obs for _, obs, _ in selected]}',
            flush=True,
        )
        has_val_fail = any(is_validation_failure(files_report.get(key)) for key in keys)
        if not has_val_fail:
            run_download_list(target, selection_file)
            continue

        for (_, obs, _), url in zip(selected, urls):
            key = f'{obs}_D{detector}'
            if is_terminal_entry(folder, key, files_report.get(key)):
                continue
            retry_file = outdir / f'sia-retry-d{detector}-{obs}.txt'
            if retry_file.exists():
                if retry_file.read_text(encoding='utf-8').strip() != url:
                    raise ValueError(f'Existing retry list differs: {retry_file}')
            else:
                retry_file.write_text(url + '\n', encoding='utf-8')
            run_download_list(target, retry_file)


def try_alternative_candidate(
    target: str,
    folder: Path,
    outdir: Path,
    detector: int,
    obs: str,
    url: str,
    ra_deg: float,
    dec_deg: float,
    good: int,
) -> int:
    """Write a single-URL alternative list, download/validate it, and return updated valid count."""
    entry = cutout_selection_url(url, ra_deg, dec_deg)
    alt_file = outdir / f'sia-alternative-d{detector}-{obs}.txt'
    if alt_file.exists():
        if alt_file.read_text(encoding='utf-8').strip() != entry:
            raise ValueError(f'Existing alternative list differs: {alt_file}')
    else:
        alt_file.write_text(entry + '\n', encoding='utf-8')
    print(f'{target} D{detector}: alternative {obs} (current {good}/3)', flush=True)
    run_download_list(target, alt_file)
    manifest = load_json(folder / 'manifest.json', {'target': target, 'downloads': []})
    return valid_count_for_detector(manifest, detector)


def build_priority_alternatives(
    untried: list[tuple[float, str, str]],
    tried_obs: list[str],
    max_candidates: int = 9,
) -> list[tuple[float, str, str]]:
    """Select up to max_candidates untried candidates prioritizing untried weeks, then pointing groups."""
    tried_weeks = {obs.split('_')[0] for obs in tried_obs}
    tried_groups = {obs.rsplit('_', 1)[0] for obs in tried_obs}

    by_week: dict[str, list[tuple[float, str, str]]] = {}
    for row in untried:
        week = row[1].split('_')[0]
        if week not in tried_weeks:
            by_week.setdefault(week, []).append(row)
    priority1 = sorted(
        (rows[len(rows) // 2] for rows in by_week.values()),
        key=lambda row: row[0],
    )
    if len(priority1) > max_candidates:
        priority1 = [priority1[i] for i in spaced_indices(len(priority1), max_candidates)]

    queued_obs = {row[1] for row in priority1}
    queued_groups = {row[1].rsplit('_', 1)[0] for row in priority1}
    by_group: dict[str, list[tuple[float, str, str]]] = {}
    for row in untried:
        group = row[1].rsplit('_', 1)[0]
        if row[1] not in queued_obs and group not in tried_groups and group not in queued_groups:
            by_group.setdefault(group, []).append(row)

    remaining = max_candidates - len(priority1)
    priority2: list[tuple[float, str, str]] = []
    if remaining > 0 and by_group:
        group_reps = sorted(
            (rows[len(rows) // 2] for rows in by_group.values()),
            key=lambda row: row[0],
        )
        priority2 = [group_reps[i] for i in spaced_indices(len(group_reps), remaining)]

    return priority1 + priority2


def run_phase2(target: str, table: Table, ra_deg: float, dec_deg: float) -> None:
    """Try untried alternative candidates across distinct weeks/pointing groups for detectors with < 3 valid cutouts."""
    folder = OUT / target
    outdir = folder / 'irsa-download-lists'
    outdir.mkdir(parents=True, exist_ok=True)
    max_detector = 7 if target == 'r_draconis' else 6
    for detector in range(1, max_detector):
        manifest = load_json(folder / 'manifest.json', {'target': target, 'downloads': []})
        good = valid_count_for_detector(manifest, detector)
        if good >= 3:
            continue
        report = load_json(folder / 'selection_report.json', {'target': target, 'files': {}})
        tried = set(report.get('files', {}))
        untried = [
            row
            for row in dr1_candidates_for_detector(table, detector)
            if f'{row[1]}_D{detector}' not in tried
        ]
        if not untried:
            print(f'{target} D{detector}: {good}/3 validated; no untried candidates left', flush=True)
            continue

        tried_obs = [k.rsplit('_D', 1)[0] for k in tried if k.endswith(f'_D{detector}')]
        queue = build_priority_alternatives(untried, tried_obs, max_candidates=9)
        attempted: set[str] = set()
        max_attempts = 12
        attempts = 0
        while queue and good < 3 and attempts < max_attempts:
            _, obs, url = queue.pop(0)
            if obs in attempted:
                continue
            attempted.add(obs)
            attempts += 1
            new_good = try_alternative_candidate(
                target, folder, outdir, detector, obs, url, ra_deg, dec_deg, good
            )
            if new_good > good and new_good < 3:
                succ_group = obs.rsplit('_', 1)[0]
                succ_week = obs.split('_')[0]
                same_group = [
                    r for r in untried
                    if r[1] not in attempted and r[1].rsplit('_', 1)[0] == succ_group
                ]
                same_week = [
                    r for r in untried
                    if r[1] not in attempted
                    and r[1].rsplit('_', 1)[0] != succ_group
                    and r[1].split('_')[0] == succ_week
                ]
                bonus_obs = {r[1] for r in same_group + same_week}
                queue = same_group + same_week + [r for r in queue if r[1] not in bonus_obs]
            good = new_good
        print(f'{target} D{detector}: {good}/3 validated after alternatives', flush=True)


def main() -> int:
    for target in AGENT2_TARGETS:
        ensure_manifest_provenance(target)
        folder = OUT / target
        votable = folder / 'sia-votable.xml'
        table = Table.read(votable, format='votable', use_names_over_ids=True)
        pos = coordinate(target, Time('J2026'))
        run_phase1(target, table, float(pos.ra.deg), float(pos.dec.deg))
        run_phase2(target, table, float(pos.ra.deg), float(pos.dec.deg))

    network_failures = []
    for target in AGENT2_TARGETS:
        folder = OUT / target
        manifest = load_json(folder / 'manifest.json', {'target': target, 'downloads': []})
        report = load_json(folder / 'selection_report.json', {'target': target, 'files': {}})
        counts = {f'D{d}': valid_count_for_detector(manifest, d) for d in range(1, 7)}
        print(f'SUMMARY {target}: valid_by_detector={counts}', flush=True)
        for key, value in report.get('files', {}).items():
            if value.get('status') == 'failed' and not is_validation_failure(value):
                network_failures.append((target, key, value.get('error')))
    if network_failures:
        print('NETWORK_FAILURES:', json.dumps(network_failures, indent=2), flush=True)
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
