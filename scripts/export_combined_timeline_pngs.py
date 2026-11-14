"""Export viewer PNGs from the existing aligned cube without contacting an archive."""

import argparse
import json
from pathlib import Path

from astropy.io import fits
from astropy.visualization import AsinhStretch
import numpy as np
from PIL import Image


DEFAULT_SEQUENCE = (Path(__file__).resolve().parents[1] / 'data' / 'processed_sequences'
                    / 'wise0855_unwise_spherex_d6')


def export(sequence):
    manifest = json.loads((sequence / 'sequence_manifest.json').read_text(encoding='utf-8'))
    frames = manifest['frames']
    grid = manifest['grid_wcs']
    if sorted(frame['frame_index'] for frame in frames) != list(range(1, len(frames) + 1)):
        raise ValueError('Manifest frame indexes do not match the aligned cube')
    with fits.open(sequence / 'aligned_sequence.fits', memmap=False) as hdus:
        cube = hdus[0].data
        header = hdus[0].header
        if cube.shape != (len(frames), grid['height'], grid['width']) or any(
            header[key] != grid[key] for key in ('CTYPE1', 'CTYPE2', 'RADESYS')
        ) or any(not np.isclose(header[key], grid[key], rtol=0, atol=1e-10) for key in (
            'CRPIX1', 'CRPIX2', 'CRVAL1', 'CRVAL2', 'CDELT1', 'CDELT2',
        )):
            raise ValueError('Aligned cube does not match manifest grid')

    by_mission = {}
    for frame in frames:
        by_mission.setdefault(frame['mission'], []).append(cube[frame['frame_index'] - 1])
    limits = {}
    for mission, planes in by_mission.items():
        values = np.concatenate([plane[np.isfinite(plane)] for plane in planes])
        vmin, vmax = np.percentile(values, [5.0, 99.5])
        if not vmin < vmax:
            raise ValueError(f'No usable intensity range for {mission}')
        limits[mission] = (vmin, vmax)

    output = sequence / 'player'
    output.mkdir(exist_ok=True)
    stretch = AsinhStretch(a=0.15)
    for frame in frames:
        plane = np.flipud(cube[frame['frame_index'] - 1])
        vmin, vmax = limits[frame['mission']]
        scaled = np.where(np.isfinite(plane), (plane - vmin) / (vmax - vmin), 0)
        png = Image.fromarray(np.rint(stretch(scaled) * 255).astype(np.uint8))
        name = Path(frame['png']).name
        if not name.endswith('.png'):
            raise ValueError('Expected a PNG filename in the manifest')
        destination = output / name
        temporary = destination.with_suffix('.tmp')
        png.save(temporary, format='PNG')
        temporary.replace(destination)
    return len(frames)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sequence-dir', type=Path, default=DEFAULT_SEQUENCE)
    args = parser.parse_args()
    print(f'Exported {export(args.sequence_dir)} aligned viewer PNGs.')
