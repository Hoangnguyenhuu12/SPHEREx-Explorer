"""Small Supabase REST adapter for the sky_archive schema."""

import os

import requests


class DatabaseError(RuntimeError):
    pass


def enabled():
    return os.getenv("DATA_MODE") == "database"


def _get(table, params=None):
    base = os.getenv("SUPABASE_URL", "").rstrip("/")
    key = os.getenv("SUPABASE_ANON_KEY", "")
    schema = os.getenv("SUPABASE_SCHEMA", "sky_archive")
    if not base or not key:
        raise DatabaseError("SUPABASE_URL and SUPABASE_ANON_KEY are required")
    try:
        response = requests.get(
            f"{base}/rest/v1/{table}",
            params=params or {"select": "*"},
            headers={"apikey": key, "Authorization": f"Bearer {key}", "Accept-Profile": schema},
            timeout=15,
        )
        response.raise_for_status()
        payload = response.json()
    except (requests.RequestException, ValueError) as exc:
        raise DatabaseError(f"Supabase query failed for {table}") from exc
    if not isinstance(payload, list):
        raise DatabaseError(f"Supabase returned an invalid response for {table}")
    return payload


_PAGE_SIZE = 1000


def _get_paginated(table, params=None, page_size=_PAGE_SIZE):
    rows = []
    offset = 0
    base_params = dict(params or {"select": "*"})
    while True:
        page = _get(table, {**base_params, "limit": str(page_size), "offset": str(offset)})
        rows.extend(page)
        if len(page) < page_size:
            return rows
        offset += page_size


def health():
    _get("targets", {"select": "target_key", "limit": "1"})
    return True


def targets():
    rows = _get("targets")
    result = {}
    for row in rows:
        key = row.get("target_key") or row.get("id")
        if not key:
            continue
        result[str(key)] = row
    return result


def find_target(name):
    normalized = name.strip().casefold()
    for row in targets().values():
        values = [row.get("target_key"), row.get("name"), row.get("simbad_id")]
        if normalized in {str(value).casefold() for value in values if value is not None}:
            return row
    return None


def products_for_target(target_key):
    links = _get("target_products", {"select": "product_id", "target_key": f"eq.{target_key}"})
    ids = [row.get("product_id") for row in links if row.get("product_id")]
    if not ids:
        return []
    # Batch the in.(...) filter: hundreds of IVO ids exceed the URL length Supabase accepts
    # (about 30 KB fails). Ids contain ? / , so each one is double-quoted per PostgREST rules.
    rows = []
    for start in range(0, len(ids), _IN_BATCH):
        chunk = ids[start : start + _IN_BATCH]
        quoted = ",".join('"' + i.replace("\\", "\\\\").replace('"', '\\"') + '"' for i in chunk)
        rows.extend(_get("products", {"select": "*", "product_id": f"in.({quoted})"}))
    return sorted(rows, key=lambda r: (r.get("mjd_start") is None, r.get("mjd_start") or 0))


_IN_BATCH = 100


def hips_layers(layer_id=None):
    params = {"select": "*", "order": "layer_id.asc"}
    if layer_id:
        params["layer_id"] = f"eq.{layer_id}"
    return _get("hips_layers", params)


def gaia_for_target(target_key):
    links = _get_paginated(
        "target_gaia_dr3",
        {
            "select": (
                "source_id,"
                "gaia_dr3(source_id,ra_deg,dec_deg,g_mag,parallax_mas,pmra_mas_yr,pmdec_mas_yr,ref_epoch_jyear)"
            ),
            "target_key": f"eq.{target_key}",
            "order": "source_id.asc",
        },
    )
    by_id = {}
    for row in links:
        star = row.get("gaia_dr3")
        if not isinstance(star, dict):
            continue
        sid = star.get("source_id") or row.get("source_id")
        if sid is None:
            continue
        sid_str = str(sid)
        if sid_str in by_id:
            continue
        by_id[sid_str] = {
            "source_id": sid_str,
            "ra": star.get("ra_deg"),
            "dec": star.get("dec_deg"),
            "g_mag": star.get("g_mag"),
            "pmra_mas_yr": star.get("pmra_mas_yr"),
            "pmdec_mas_yr": star.get("pmdec_mas_yr"),
            "ref_epoch_jyear": star.get("ref_epoch_jyear") or 2016.0,
        }
    return sorted(
        by_id.values(),
        key=lambda r: (r["g_mag"] is None, r["g_mag"] if r["g_mag"] is not None else 0.0, r["source_id"]),
    )


def combined_timeline_sequence(sequence_id):
    rows = _get(
        "combined_timeline_sequences",
        {"select": "*", "sequence_id": f"eq.{sequence_id}", "limit": "1"},
    )
    return rows[0] if rows else None


def combined_timeline_frames(sequence_id):
    return _get_paginated(
        "combined_timeline_frames",
        {"select": "*", "sequence_id": f"eq.{sequence_id}", "order": "frame_index.asc"},
    )


def gaia_frame_overlays(sequence_id, frame_index=None, in_frame_only=False):
    params = {
        "select": (
            "sequence_id,frame_index,source_id,observed_mjd,"
            "catalog_ra_deg,catalog_dec_deg,propagated_ra_deg,propagated_dec_deg,"
            "pixel_x,pixel_y_png,in_frame,has_proper_motion,motion_status,g_mag"
        ),
        "sequence_id": f"eq.{sequence_id}",
        "order": "frame_index.asc,source_id.asc",
    }
    if frame_index is not None:
        params["frame_index"] = f"eq.{frame_index}"
    if in_frame_only:
        params["in_frame"] = "eq.true"
    rows = _get_paginated("gaia_frame_overlays", params)
    for row in rows:
        if row.get("source_id") is not None:
            row["source_id"] = str(row["source_id"])
    return rows
