# WISE 0855 playback in The Eyes

The combined timeline uses the fixed TAN grid from the existing WISE 0855 sequence. The backend serves the rendered PNGs from disk. Each mission uses its own display stretch. The sequence supports visual comparison of positions across epochs.

## Run locally on Windows

Place `sequence_manifest.json` and `aligned_sequence.fits` in `data/processed_sequences/wise0855_unwise_spherex_d6`. From the repository root, export the viewer images once and start the API.

```powershell
.\.venv\Scripts\python.exe scripts/export_combined_timeline_pngs.py
$env:DATA_MODE = 'real'
$env:DATA_RELEASE = 'dr1'
.\.venv\Scripts\python.exe -m uvicorn app.main:app --app-dir members/dong --host 127.0.0.1 --port 8000
```

In a second PowerShell session, from the repository root, start the frontend.

```powershell
Set-Location frontend
$env:VITE_USE_MOCK = 'false'
$env:VITE_API_BASE_URL = 'http://127.0.0.1:8000'
npm.cmd run dev -- --host localhost --port 5173 --strictPort
```

Open [WISE 0855 in The Eyes](http://localhost:5173/the-eyes?q=wise0855). Choose **SPHEREx only** to use the existing single-mission request. Local single-mission targets use their own validated DR1 manifest in `data/spherex/<target>/manifest.json` when `DATA_MODE=real`.

## API 0.1

`GET /api/frames?ra=133.81890825&dec=-7.247048&target_key=wise0855&detector=6&timeline=combined` returns the WISE 0855 fixed grid. The grid specifies the actual image center and scale. `max_frames` still caps results. Requests omitting `timeline` use the existing SPHEREx path.

| Fields | Combined timeline |
| --- | --- |
| `id`, `source_product_id` | Stable viewer identifier and archive product identifier |
| `mjd`, `iso` | Observation time in ascending MJD order with a UTC label |
| `mission`, `band_or_detector`, `quality_label`, `release` | Provenance and screening label from the manifest |
| `png` | Backend-relative path under `/api/frames/wise0855/` |
| `diff_png`, `reference_frame_id`, `norm` | Null for the combined sequence |
| `bandwidth_um`, `survey`, `bad_pixel_frac` | Null when the manifest lacks the measurement |

Missing timeline metadata or the first PNG returns `503 TIMELINE_UNAVAILABLE`. Missing individual assets return `404 TIMELINE_UNAVAILABLE`. OpenAPI is available at [localhost:8000/docs](http://127.0.0.1:8000/docs).

## Production assets

Provision `sequence_manifest.json` and the exported `player/` directory on the API host. Use `WISE0855_SEQUENCE_DIR` to point to the configured asset directory, then verify the API and PNG URLs from the deployed frontend origin. The FITS cube is only needed during export. Supabase currently holds the sequence metadata with status `local_only`.
