"""Check current IRSA MSKN/MSKM flag headers as well as source pixel handling."""
from importlib import import_module

import numpy as np
from astropy.io import fits
from astropy.wcs import WCS

imaging = import_module('members.huu-hoang.tan_pipeline')


def test_current_irsa_flags_mask_overflow_but_keep_source(tmp_path):
    wcs=WCS(naxis=2);wcs.wcs.ctype=['RA---TAN','DEC--TAN'];wcs.wcs.crval=[10,20];wcs.wcs.crpix=[2,2];wcs.wcs.cdelt=[-0.001,0.001]
    header=wcs.to_header();header.update({'OBSID':'case','DETECTOR':6,'DATE-OBS':'2026-01-01','BUNIT':'MJy/sr','WCSAXESW':2,'CTYPE1W':'LINEAR','CTYPE2W':'LINEAR','CRPIX1W':1.,'CRPIX2W':1.,'CRVAL1W':4.8,'CRVAL2W':.037,'CDELT1W':.001,'CDELT2W':.00001})
    pixels=np.ones((3,3),dtype='float32');flags=np.zeros((3,3),dtype='int32');flags[1,1]=(1<<21);flags[1,2]=(1<<21)|(1<<1)
    flag_hdu=fits.ImageHDU(flags,name='FLAGS');flag_hdu.header['MSKN0001']='OVERFLOW';flag_hdu.header['MSKM0001']=2;flag_hdu.header['MSKN0021']='SOURCE';flag_hdu.header['MSKM0021']=1<<21
    path=tmp_path/'case.fits';fits.HDUList([fits.PrimaryHDU(),fits.ImageHDU(pixels,header=header,name='IMAGE'),flag_hdu]).writeto(path)
    image,_,info=imaging.load_cutout(path,10,20)
    assert np.isfinite(image[1,1])
    assert np.isnan(image[1,2])
    assert info['flag_counts']['MP_OVERFLOW']==1
    assert info['bad_pixel_frac']==1/9
