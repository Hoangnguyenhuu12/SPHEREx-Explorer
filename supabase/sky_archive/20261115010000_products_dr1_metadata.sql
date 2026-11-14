-- Populate only missing DR1 identity metadata from the existing collection/band.
-- Never overwrite a value that has already been supplied independently.
UPDATE sky_archive.products
SET release = COALESCE(release, 'DR1'),
    detector = COALESCE(detector, substring(band from '(D[1-6])$'))
WHERE collection = 'spherex_dr1'
  AND band ~ '^SPHEREx-D[1-6]$'
  AND (release IS NULL OR detector IS NULL);

UPDATE sky_archive.products
SET release = COALESCE(release, 'QR3'),
    detector = COALESCE(detector, substring(band from '(D[1-6])$'))
WHERE collection = 'spherex_qr3'
  AND band ~ '^SPHEREx-D[1-6]$'
  AND (release IS NULL OR detector IS NULL);
