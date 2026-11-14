"""Guard the preliminary screening against incompatible images."""
from screen_comparison_candidates import pair_metrics


def test_screen_rejects_different_band_detector_time_or_flags():
    a={'release':'dr1','detector':6,'usable_for_candidate':True,'mjd':60000,'wavelength_um':4.9,'bandwidth_um':0.04}
    b={**a,'mjd':60040,'wavelength_um':4.91}
    assert pair_metrics(a,b) is not None
    assert pair_metrics(a,{**b,'detector':3}) is None
    assert pair_metrics(a,{**b,'mjd':60029}) is None
    assert pair_metrics(a,{**b,'wavelength_um':4.95}) is None
    assert pair_metrics(a,{**b,'usable_for_candidate':False}) is None
    assert pair_metrics(a,{**b,'release':'qr3'}) is None
    assert pair_metrics(a,{**b,'wavelength_um':float('nan')}) is None
