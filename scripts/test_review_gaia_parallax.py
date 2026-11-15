import astropy.units as u
import numpy as np

from scripts.review_gaia_parallax import geocentric_shift


def test_geocentric_parallax_direction_and_sign():
    direction = np.array([[1., 0., 0.], [1., 0., 0.], [1., 0., 0.]])
    result = geocentric_shift(direction, [1000., -1000., 0.], np.array([0., 1., 0.]))
    assert np.allclose(result[:, 0], 1, atol=1e-10)
    assert np.isclose(result[0, 1], -u.arcsec.to(u.rad), rtol=1e-8)
    assert np.isclose(result[1, 1], u.arcsec.to(u.rad), rtol=1e-8)
    assert result[2, 1] == 0


def test_no_shift_for_observer_along_line_of_sight():
    direction = np.array([[1., 0., 0.]])
    assert np.array_equal(geocentric_shift(direction, [1000.], np.array([1., 0., 0.])), direction)
