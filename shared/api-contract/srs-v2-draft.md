# API contract for SRS v2 — draft for FE/BE review

This proposal extends the synchronous API 0.1 used by `app.main`. Use [openapi-srs-v2-draft.yaml](openapi-srs-v2-draft.yaml) to review the proposed types. [openapi.yaml](openapi.yaml) remains the contract of the running API. New response fields are optional during migration. The proposed `GET /api/targets` and additions need backend implementation before FE relies on them.

| FE decision | Proposed contract |
| --- | --- |
| Q1 · request model | E3 returns 200 with the frame sequence or a structured error. One FE adapter, no polling. |
| Q2 · origins | Dev FE `http://localhost:5173`, API `http://127.0.0.1:8000`. Confirm production and preview origins at deployment. Use `VITE_API_BASE_URL`; allow the actual FE origin on JSON, PNG and errors, without credentials. An iframe uses the embedded page's origin. |
| Q3 · data labels | Keep `mode: fixture \| live` consistent with Health. `data_kind: observational \| illustrative` describes the values themselves. Fixtures may contain real FITS-derived observations or synthetic samples. Live requests return an error or empty science points as appropriate when observations are unavailable. Synthetic samples must be labeled illustrative. Demo mode remains a team decision. |
| Q4 · cutout and view | Keep E3 `size` default 0.1°, range 0.02–0.3°, and `max_frames` default 60/max 200 as request bounds. FE may request a fixed 0.1667° cutout and zoom locally. Actual output size comes from `grid.width` and `height`; selected count can be below the upper bound. Health limits describe accepted inputs. |
| Q5 · invalid pixels | Preserve current PNG behavior in the initial rollout. Proposed P1 is RGBA with transparent missing coverage and an explicit saturation mask/legend; avoid turning saturated pixels into valid white measurements. FE must not interpret black as a quality flag. |
| Q6 · IDs | Frame IDs are opaque, scoped to published images, and may expire or become unavailable after restart. Use `sequence_id` for an ordered rendered sequence. On `FRAME_NOT_FOUND`, reload E3 once and then show the error. |
| Q7 · coordinates | Use ICRS degrees and report the actual catalog epoch per record. Presets use the J2000 coordinates supplied in `shared/targets.json`. A catalog epoch is separate from the UTC observation time. Propagation uses the science pipeline. |

## Endpoint changes

- **E1 Health** adds `limits` for accepted cutout and frame request bounds. `irsa_reachable: null` means reachability is unknown.
- **Targets** reads the five presets from `shared/targets.json`. Map `epsilon-indi-b → epsindib`, `rw-aur → rwaur`, and `r-dra → rdra`. Keep canonical API keys. `pmra` is μRA·cos(Dec), and both proper motions are in mas/yr. Optional aliases, constellation, distance and recommended detectors need verified data. FE owns editorial text.
- **E2 Resolve** adds aliases and constellation where known. External SIMBAD resolution is proposed for live mode, with a nullable `target_key` for a match outside the presets. A successful search without a match returns `UNKNOWN_TARGET`; connectivity failures use the existing upstream codes.
- **E3 Frames** keeps UTC `mjd` and `iso`, ordered by time. Exposure frames give the actual exposure bounds, `n_exposures: 1`, and a source `product_id` when known. Visit frames report the min/max of contributing observations, the actual count, and `product_ids` when available. For illustrative samples use `frame_kind: synthetic` and null or absent observational provenance. Do not infer bounds from the display timestamp. Return a valid single frame with `FEW_FRAMES`; an empty usable sequence returns `NO_FRAMES` (404), with collection and region when known. Keep the closed `warnings` string array; `warning_details` optionally maps codes to affected frame IDs.
- **Grid/WCS** uses TAN with FITS `crpix`, `crval` and `cd`. To convert a zero-based PNG pixel center `(x,y)` to FITS pixel coordinates, use `(x+1,height-y)` before applying WCS. `grid.size_deg` is the requested cutout width. Placement must use the actual WCS and dimensions. SRS proposes placement on the sky map and FE design places playback in the popup; the same metadata supports both.
- **E4/E5 PNG** keeps relative URLs, PNG response, CORS and public caching. E5 uses the first chronological frame as reference and gray 128 for zero. Proposed `diff_norm.vmin/vmax` are the signed clipping bounds before mapping to grayscale, in the input image units. FE requests difference images when needed and uses backend output directly.
- **E6 Photometry** plots separate detector series against MJD and distinguishes light curves from wavelength plots. Add `unit: mJy`, aperture and optional per-point flag reasons. Invalid flux is null with `detected: false`; do not infer variability amplitude from flagged or mixed-band points.
- **E7 Astrometry** distinguishes measured and predicted coordinates. Continue using the existing nullable fit schema, including proper motion, uncertainties, count and baseline. `motion_detectable: null` means unevaluated, and false requires a science-backed criterion. Display pixel coordinates from an identified matching sequence/grid only. E6/E7 observation IDs are not guaranteed to match rendered E3 frame IDs.

Keep the existing error body and warning enum. The FE watchdog of 125 seconds is a client default, not a latency guarantee. Cancel or ignore stale responses when the target changes. Public CORS, deploy origins, quality-mask semantics, science criteria and five-target live examples still need validation before sign-off.

Gaia rendering stays in FE/Aladin for this scope. Backend Gaia propagation, quality-flag overlays, click-to-spectrum and false-color RGB are deferred pending science and product review. Follow the SRS review flow before promoting this file to the active contract and regenerating FE types and samples.

## Separate forum contract

The forum is specified independently in [openapi-forum-v1.yaml](openapi-forum-v1.yaml)
and [forum-v1.md](forum-v1.md), aligned with the supplied business analysis.
It does not modify the science endpoints in this SRS draft.
