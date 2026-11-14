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
