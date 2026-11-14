"""Build same-wavelength DR1 frame sequences (2-6 epochs) per target and detector for the blink demo.

Additive to the 2-frame pairs in data/processed/ (left untouched). For each target/detector:
- pool = frames that passed screening; if fewer than two, frames with the target inside the
  cutout (display-only: target pixel saturated/flagged and kept masked);
- frames taken within EPOCH_DAYS of each other count as one epoch (best background kept);
- the largest set of epochs whose wavelengths at the target agree within half the narrowest
  bandwidth (the pair screening rule) is selected, spanning >= 30 days;
- frames are reprojected to one TAN grid and added while the per-pixel common valid and
  spectrally consistent area stays >= 50%.
Outputs go to data/processed_sequences/<target>_d<N>/ (never data/processed/).
"""
import argparse
import hashlib
import json
import sys
from importlib import import_module
from pathlib import Path

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
from astropy.io import fits  # noqa: E402
from astropy.time import Time  # noqa: E402
from astropy.wcs import WCS  # noqa: E402
from PIL import Image, ImageDraw  # noqa: E402
from reproject import reproject_interp  # noqa: E402

from download_spherex import ROOT, coordinate, save_json  # noqa: E402

sys.path.insert(0, str(ROOT))
from shared.image_processing import MISSING_RGB, diff_png, frame_png  # noqa: E402

imaging = import_module('members.huu-hoang.tan_pipeline')
OUT_ROOT = ROOT / 'data/processed_sequences'
EPOCH_DAYS = 2.0
MIN_SPAN_DAYS = 30
MAX_FRAMES = 6
MIN_COVERAGE = 0.5
TARGETS = ['barnard', 'epsilon_indi_b', 'r_draconis', 'rw_aurigae', 'wise0855']


def quality(local):
    manifest = json.loads((ROOT / 'data/spherex' / local / 'manifest.json').read_text(encoding='utf8'))
    return {(d['obs_id'], int(d['detector'])): d.get('validation', {}).get('finite_unflagged_fraction') or 0.0
            for d in manifest['downloads']}


def epochs(frames, q, det):
    """Merge frames within EPOCH_DAYS into one epoch, keeping the cleanest background."""
    out = []
    for f in sorted(frames, key=lambda i: i['mjd']):
        if out and f['mjd'] - out[-1][0]['mjd'] < EPOCH_DAYS:
            out[-1].append(f)
        else:
            out.append([f])
    return [max(group, key=lambda i: q.get((i['obs_id'], det), 0.0)) for group in out]


def windows(frames):
    """All maximal same-wavelength windows, largest (then longest span) first."""
    fr = sorted(frames, key=lambda i: i['wavelength_um'])
    found = []
    for a in range(len(fr)):
        b = a
        while b + 1 < len(fr) and fr[b + 1]['wavelength_um'] - fr[a]['wavelength_um'] <= 0.5 * min(i['bandwidth_um'] for i in fr[a:b + 2]):
            b += 1
        w = fr[a:b + 1]
        span = max(i['mjd'] for i in w) - min(i['mjd'] for i in w)
        if len(w) >= 2 and span >= MIN_SPAN_DAYS:
            found.append((len(w), span, w))
    return [w for _, _, w in sorted(found, key=lambda x: (x[0], x[1]), reverse=True)]


def load(local, det, frames):
    mjds = [f['mjd'] for f in frames]
    center = coordinate(local, Time((min(mjds) + max(mjds)) / 2, format='mjd', scale='utc'))
    grid, shape = imaging.tan_grid(float(center.ra.deg), float(center.dec.deg), 0.08, scale=6.15)
    yy, xx = np.indices(shape)
    sky = grid.pixel_to_world(xx, yy)
    loaded = []
    for f in frames:
        path = ROOT / f['file'].replace('\\', '/')
        with path.open('rb') as h:
            if hashlib.file_digest(h, 'sha256').hexdigest() != f['sha256']:
                raise ValueError('Input checksum mismatch ' + f['obs_id'])
        pos = coordinate(local, Time(f['mjd'], format='mjd', scale='utc'))
        image, native, meta = imaging.load_cutout(path, float(pos.ra.deg), float(pos.dec.deg))
        if meta['obs_id'] != f['obs_id'] or meta['detector'] != det or meta['bunit'].replace(' ', '') != 'MJy/sr':
            raise ValueError('Unexpected source identity or units ' + f['obs_id'])
        data, foot = reproject_interp((image, native), grid, shape_out=shape, order='bilinear')
        data = np.where((foot > 0) & np.isfinite(data), data, np.nan)
        nx, ny = native.world_to_pixel(sky)
        with fits.open(path, memmap=False) as hdul:
            spectral = hdul['IMAGE'].header.copy()
            for key in list(spectral):
                if key.startswith(('A_', 'B_', 'AP_', 'BP_')):
                    del spectral[key]
            wave, width = WCS(spectral, fobj=hdul, key='W').pixel_to_world_values(nx, ny)
        x, y = grid.world_to_pixel(pos)
        loaded.append({'frame': f, 'data': data, 'wave': np.asarray(wave, float), 'width': np.asarray(width, float),
                       'xy': [float(x), float(y)], 'meta': meta})
    return grid, shape, loaded


def common_mask(items):
    data = np.isfinite(np.stack([i['data'] for i in items])).all(axis=0)
    waves = np.stack([i['wave'] for i in items])
    widths = np.stack([i['width'] for i in items])
    ok = np.isfinite(waves).all(axis=0) & np.isfinite(widths).all(axis=0) & (widths.min(axis=0) > 0)
    spread = np.nanmax(waves, axis=0) - np.nanmin(waves, axis=0)
    return data & ok & (spread <= 0.5 * widths.min(axis=0))


def choose(items, q, det):
    """Exhaustive search: the most frames whose per-pixel common area stays >= MIN_COVERAGE and
    that span >= MIN_SPAN_DAYS; ties broken by coverage, then background quality."""
    import itertools
    best = None
    for size in range(min(MAX_FRAMES, len(items)), 1, -1):
        for subset in itertools.combinations(items, size):
            mjds = sorted(i['frame']['mjd'] for i in subset)
            if mjds[-1] - mjds[0] < MIN_SPAN_DAYS or min(b - a for a, b in zip(mjds, mjds[1:])) < EPOCH_DAYS:
                continue  # one frame per epoch, overall span >= MIN_SPAN_DAYS
            cov = float(common_mask(list(subset)).mean())
            if cov < MIN_COVERAGE:
                continue
            score = (cov, sum(q.get((i['frame']['obs_id'], det), 0.0) for i in subset))
            if best is None or score > best[0]:
                best = (score, subset)
        if best:
            return sorted(best[1], key=lambda i: i['frame']['mjd'])
    return None


def render(out, local, det, kind, grid, shape, chosen):
    common = common_mask(chosen)
    stack = [np.where(common, i['data'], np.nan) for i in chosen]
    values = np.concatenate([s[common] for s in stack])
    lo, hi = map(float, np.percentile(values, [2, 99.5]))
    diffs = [s - stack[0] for s in stack]
    limit = float(np.percentile(np.abs(np.concatenate([d[common] for d in diffs[1:]])), 99)) or 1.0
    out.mkdir(parents=True, exist_ok=True)
    files = []
    for n, (s, d) in enumerate(zip(stack, diffs), start=1):
        (out / f'frame_{n:02d}.png').write_bytes(frame_png(s, lo, hi))
        (out / f'diff_{n:02d}_minus_01.png').write_bytes(diff_png(d, limit))
        files += [f'frame_{n:02d}.png', f'diff_{n:02d}_minus_01.png']
    hdr = grid.to_header()
    hdr['BUNIT'] = 'MJy/sr'
    hdr['COMMENT'] = 'Diagnostic only; no PSF matching or source detection.'
    fits.HDUList([fits.PrimaryHDU(), fits.ImageHDU(np.stack(stack).astype('float32'), header=hdr, name='FRAMES'),
                  fits.ImageHDU(common.astype('uint8'), header=grid.to_header(), name='COMMON')]
                 ).writeto(out / 'aligned_sequence.fits', overwrite=True, checksum=True)
    # Blink GIF: same scale, black mask, date label and predicted-position crosshair.
    frames = []
    for i, s in zip(chosen, stack):
        scaled = np.where(common, np.clip((s - lo) / (hi - lo), 0, 1), 0)
        rgb = np.repeat(np.uint8(np.nan_to_num(scaled) * 255)[::-1, :, None], 3, axis=2)
        rgb[~common[::-1]] = MISSING_RGB
        img = Image.fromarray(rgb).resize((470, 470), resample=Image.Resampling.NEAREST)
        draw = ImageDraw.Draw(img)
        draw.rectangle((0, 0, 470, 28), fill='black')
        draw.text((6, 6), f"{i['frame']['iso_utc'][:10]} UTC  {i['meta']['wave_um']:.3f} um  D{det}", fill='white')
        px = (i['xy'][0] + .5) * 470 / shape[1]
        py = (shape[0] - .5 - i['xy'][1]) * 470 / shape[0]
        draw.line((px - 8, py, px + 8, py), fill='cyan', width=2)
        draw.line((px, py - 8, px, py + 8), fill='cyan', width=2)
        frames.append(img)
    frames[0].save(out / 'blink.gif', save_all=True, append_images=frames[1:], duration=900, loop=0)
    # Filmstrip for slides/reports.
    cmap = plt.get_cmap('gray').copy()
    cmap.set_bad('#000000')
    fig, axes = plt.subplots(1, len(chosen), figsize=(2.6 * len(chosen), 3.1), layout='constrained')
    for ax, i, s in zip(np.atleast_1d(axes), chosen, stack):
        ax.imshow(np.ma.masked_invalid(s), origin='lower', cmap=cmap, vmin=lo, vmax=hi)
        ax.scatter(*i['xy'], marker='+', c='deepskyblue', s=90, linewidths=1.3)
        ax.set_title(f"{i['frame']['iso_utc'][:10]}\n{i['meta']['wave_um']:.4f} µm", fontsize=9)
        ax.set_xticks([])
        ax.set_yticks([])
    note = 'display only: target pixels saturated/flagged (black)' if kind == 'display_only' else 'screened frames'
    fig.suptitle(f'{local} D{det} · DR1 · same-wavelength sequence ({note}) · black = no data\n'
                 'Not a confirmed detection; no PSF matching', fontsize=9)
    fig.savefig(out / 'filmstrip.png', dpi=130)
    plt.close(fig)
    files += ['blink.gif', 'filmstrip.png', 'aligned_sequence.fits']
    return {'norm': {'vmin': lo, 'vmax': hi, 'stretch': 'asinh', 'diff_limit': limit, 'diff_reference': 'frame_01',
                     'png_orientation': 'row0_top_is_max_y', 'missing_rgb': list(MISSING_RGB)},
            'common_coverage_fraction': float(common.mean()), 'common_valid_pixels': int(common.sum()),
            'grid_shape_yx': list(shape), 'outputs': files}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--targets', nargs='+', choices=TARGETS, default=TARGETS)
    parser.add_argument('--detectors', nargs='+', type=int, choices=range(1, 7), default=list(range(1, 7)))
    args = parser.parse_args()
    screening = json.loads((ROOT / 'data/reports/comparison_candidates.json').read_text(encoding='utf8'))
    summary = {}
    for local in args.targets:
        q = quality(local)
        images = screening['targets'][local]['images']
        for det in args.detectors:
            base = [i for i in images if i['detector'] == det and i.get('release') == 'dr1' and i.get('inside')
                    and i.get('wavelength_um') and i.get('bandwidth_um')]
            usable = [i for i in base if i['usable_for_candidate']]
            result = None
            for kind, pool in (('screened', usable), ('display_only', base)):
                for window in windows(pool)[:3]:
                    grid, shape, items = load(local, det, window)
                    # Frames covering < MIN_COVERAGE of the grid can never be in a valid set.
                    items = [i for i in items if np.isfinite(i['data']).mean() >= MIN_COVERAGE]
                    items = sorted(items, key=lambda i: np.isfinite(i['data']).mean(), reverse=True)[:12]
                    chosen = choose(items, q, det)
                    if chosen and (not result or len(chosen) > len(result[3])):
                        result = (kind, grid, shape, chosen)
                if result:
                    break
            label = f'{local} D{det}'
            if not result:
                summary[label] = 'no same-wavelength sequence (>= 2 epochs, >= 30 days, >= 50% common area)'
                print(label, summary[label], flush=True)
                continue
            kind, grid, shape, chosen = result
            out = OUT_ROOT / f'{local}_d{det}'
            info = render(out, local, det, kind, grid, shape, chosen)
            report = {'target': local, 'detector': det, 'release': 'dr1', 'kind': kind,
                      'status': 'display_only_not_a_measurement' if kind == 'display_only' else 'preliminary_engineering_diagnostic',
                      'rules': {'same_wavelength': 'max-min wavelength <= 0.5 * narrowest bandwidth (per pixel in common area)',
                                'epoch_merge_days': EPOCH_DAYS, 'min_span_days': MIN_SPAN_DAYS, 'min_common_coverage': MIN_COVERAGE,
                                'max_frames': MAX_FRAMES},
                      'inputs': [{'obs_id': i['frame']['obs_id'], 'mjd': i['frame']['mjd'], 'iso_utc': i['frame']['iso_utc'],
                                  'file': i['frame']['file'], 'sha256': i['frame']['sha256'], 'wavelength_um': i['meta']['wave_um'],
                                  'bandwidth_um': i['meta']['bandwidth_um'], 'predicted_pixel_xy_origin_lower': i['xy'],
                                  'usable_for_candidate': i['frame']['usable_for_candidate']} for i in chosen],
                      'pixel_scale_arcsec': 6.15, **info,
                      'warnings': (['DISPLAY ONLY: predicted target pixels are saturated or flagged in DR1 and are masked; '
                                    'no photometry, position or variability can be derived.'] if kind == 'display_only' else [])
                      + ['No PSF matching, background matching or independent astrometric registration.',
                         'Do not interpret the blink or differences as proof of motion or variability.']}
            save_json(out / 'report.json', report)
            span = chosen[-1]['frame']['mjd'] - chosen[0]['frame']['mjd']
            summary[label] = f'{kind}: {len(chosen)} frames over {span:.0f} d, coverage {info["common_coverage_fraction"]:.2f}'
            print(label, summary[label], flush=True)
    OUT_ROOT.mkdir(parents=True, exist_ok=True)
    save_json(OUT_ROOT / 'summary.json', summary)


if __name__ == '__main__':
    main()
