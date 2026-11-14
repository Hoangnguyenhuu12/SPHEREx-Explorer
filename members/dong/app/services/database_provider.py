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
