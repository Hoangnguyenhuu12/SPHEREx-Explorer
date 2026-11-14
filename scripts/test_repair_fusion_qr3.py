"""Select footprint coverage at the observation position, including RA wrap."""
import sys
from pathlib import Path
import astropy.units as u
from astropy.coordinates import SkyCoord

sys.path.insert(0, str(Path(__file__).parent))
from repair_fusion_qr3 import footprint_contains


def test_footprint_wrap_and_exclusion():
    footprint='POLYGON ICRS 359.5 -0.5 0.5 -0.5 0.5 0.5 359.5 0.5 359.5 -0.5'
    assert footprint_contains(footprint,SkyCoord(ra=0*u.deg,dec=0*u.deg))
    assert not footprint_contains(footprint,SkyCoord(ra=2*u.deg,dec=0*u.deg))
