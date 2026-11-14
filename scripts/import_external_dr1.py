"""Import DR1 cutouts from a teammate's package (same pipeline layout) into data/spherex/<target>/.

A FITS file is imported only when: its package manifest lists it as release dr1; its SHA-256
matches that manifest entry; scripts/validate_fits.py reports it valid for the expected
observation and detector; and the observation/detector is not already in our manifest. Files are
copied (sources untouched); our manifest is saved atomically after each target. Nothing in the
package is executed.
"""
import argparse
import hashlib
import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from download_spherex import save_json  # noqa: E402
from validate_fits import validate  # noqa: E402

TARGETS = ['barnard', 'epsilon_indi_b', 'r_draconis', 'rw_aurigae', 'wise0855']


def sha256(path):
    with path.open('rb') as handle:
        return hashlib.file_digest(handle, 'sha256').hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, nargs='+', required=True, help='Package roots to scan')
    parser.add_argument('--targets', nargs='+', choices=TARGETS, default=TARGETS)
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()
    summary = {}
    for target in args.targets:
        ours_path = ROOT / 'data/spherex' / target / 'manifest.json'
        ours = json.loads(ours_path.read_text(encoding='utf8'))
        have = {(d['obs_id'], int(d['detector'])) for d in ours['downloads']}
        stats = {'imported': 0, 'already_present': 0, 'sha_mismatch': 0, 'invalid': 0, 'no_file': 0, 'dest_conflict': 0}
        dest_dir = ROOT / 'data/spherex' / target / 'cutouts'
        # Manifests and FITS may sit in different package folders: index FITS by name per target.
        files = {}
        for source in args.source:
            for fits_path in source.resolve().glob(f'**/spherex/{target}/cutouts/*.fits'):
                files.setdefault(fits_path.name, []).append(fits_path)
        for source in args.source:
            for manifest in sorted(source.resolve().glob(f'**/spherex/{target}/manifest.json')):
                for entry in json.loads(manifest.read_text(encoding='utf8')).get('downloads', []):
                    key = (entry.get('obs_id'), int(entry.get('detector', 0)))
                    if entry.get('release') != 'dr1' or not entry.get('sha256'):
                        continue
                    if key in have:
                        stats['already_present'] += 1
                        continue
                    name = Path(entry['file'].replace('\\', '/')).name
                    matches = [f for f in files.get(name, []) if f.is_file() and not f.is_symlink() and sha256(f) == entry['sha256']]
                    if not matches:
                        stats['no_file' if not files.get(name) else 'sha_mismatch'] += 1
                        continue
                    src = matches[0]
                    check = validate(src, entry.get('target_ra_deg'), entry.get('target_dec_deg'), key[1], key[0])
                    if not check.get('valid'):
                        stats['invalid'] += 1
                        continue
                    dest = dest_dir / name
                    if dest.exists() and sha256(dest) != entry['sha256']:
                        stats['dest_conflict'] += 1
                        continue
                    if not args.dry_run:
                        dest_dir.mkdir(parents=True, exist_ok=True)
                        if not dest.exists():
                            shutil.copy2(src, dest)
                        check['path'] = str(dest.relative_to(ROOT))
                        ours['downloads'].append({**entry, 'file': str(dest.relative_to(ROOT)), 'validation': check,
                                                  'imported_from': str(src.relative_to(ROOT)).replace('\\', '/')})
                    have.add(key)
                    stats['imported'] += 1
        if stats['imported'] and not args.dry_run:
            save_json(ours_path, ours)
        summary[target] = stats
        print(target, stats, flush=True)
    return summary


if __name__ == '__main__':
    main()
