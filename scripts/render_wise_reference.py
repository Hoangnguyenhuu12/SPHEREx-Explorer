"""Render the locally supplied RW Aur AllWISE coadds for visual context."""
from pathlib import Path
import hashlib

import numpy as np
from astropy.io import fits
from astropy.coordinates import SkyCoord
from astropy.wcs import WCS
import astropy.units as u
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'data/imports/full_harvest_fusion/data/harvest/rwaur/wise'
DEST = ROOT / 'frontend/public/wise-reference'


def main():
    DEST.mkdir(parents=True, exist_ok=True)
    position = SkyCoord(76.95652603458333 * u.deg, 30.401438173888888 * u.deg)
    for band in (1, 2):
        source = SOURCE / f'rwaur_wise_W{band}.fits'
        with fits.open(source) as hdus:
            header = hdus[0].header
            data = np.asarray(hdus[0].data, dtype=float)
            x, y = WCS(header).world_to_pixel(position)
            if header.get('BAND') != band or not (0 <= x < data.shape[1] and 0 <= y < data.shape[0]):
                raise ValueError(f'Invalid band or target outside {source}')
            finite = np.isfinite(data)
            if not finite.any():
                raise ValueError(f'No finite pixels in {source}')
            low, high = np.percentile(data[finite], [1, 99.8])
            if not high > low:
                raise ValueError(f'Invalid stretch in {source}')
            scaled = np.zeros(data.shape, dtype=np.uint8)
            scaled[finite] = (255 * np.arcsinh(10 * np.clip((data[finite] - low) / (high - low), 0, 1)) / np.arcsinh(10)).astype(np.uint8)
            Image.fromarray(np.flipud(scaled)).save(DEST / f'rwaur-w{band}.png')
            print(f'W{band}: SHA256 {hashlib.sha256(source.read_bytes()).hexdigest()}, target pixel ({x:.2f}, {y:.2f}), dates {header.get("DATEOBS1")} to {header.get("DATEOBS2")}')


if __name__ == '__main__':
    main()
