"""Summarize usable pixels near predicted positions; not a photometric fit."""
import json
import sys
from pathlib import Path
from importlib import import_module

import numpy as np
from astropy.io import fits

from download_spherex import ROOT, save_json

sys.path.insert(0, str(ROOT))
imaging = import_module('members.huu-hoang.tan_pipeline')


def main():
    source = json.loads((ROOT / 'data/reports/comparison_candidates.json').read_text(encoding='utf8'))
    output = {'scope': 'Pixel counts around predicted position; not source detection or evidence of valid photometry.', 'targets': {}}
    for target in ('barnard', 'r_draconis'):
        results = []
        for item in source['targets'][target]['images']:
            if not item.get('inside') or not item.get('predicted_pixel_xy'):
                continue
            path = ROOT / Path(item['file'])
            with fits.open(path, memmap=False) as hdus:
                pixels = hdus['IMAGE'].data
                flags = hdus['FLAGS'].data
                planes = imaging.flag_planes(hdus['FLAGS'].header)
                if not planes:
                    continue
                bits = sum(1 << n for n in set(v for k, v in planes.items() if k not in {'MP_SOURCE', 'MP_FULLSAMPLE'}))
                yy, xx = np.indices(pixels.shape)
                x, y = item['predicted_pixel_xy']
                radius = np.hypot(xx-x, yy-y)
                clean = np.isfinite(pixels) & ((flags & bits) == 0)
                apertures = {}
                for limit in (2.5, 5.0):
                    aperture = radius <= limit
                    apertures[str(limit)] = {'total': int(aperture.sum()), 'clean': int((clean & aperture).sum())}
                results.append({'obs_id': item['obs_id'], 'detector': item['detector'], 'target_flags': item.get('bad_flags_at_target', []), 'apertures': apertures})
        output['targets'][target] = results
        print(target, 'images', len(results), 'with clean pixels within 2.5px', sum(r['apertures']['2.5']['clean'] > 0 for r in results), flush=True)
    save_json(ROOT / 'data/reports/saturated_neighborhoods.json', output)


if __name__ == '__main__':
    main()
