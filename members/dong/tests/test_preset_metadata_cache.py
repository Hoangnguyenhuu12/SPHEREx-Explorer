from app.services import database_provider


def test_metadata_reuses_rows_and_refreshes_on_version_or_expiry(monkeypatch):
    clock = [0.0]
    reads = []

    def get(table, params=None):
        reads.append((table, params))
        return [{"updated_at": len(reads)}]

    database_provider._cached_metadata.cache_clear()
    monkeypatch.setattr(database_provider, "monotonic", lambda: clock[0])
    monkeypatch.setattr(database_provider, "_get", get)

    sequence_id = "rdra:unwise_w2_to_spherex_d6"
    try:
        seq = database_provider.combined_timeline_sequence(sequence_id)
        first = database_provider.combined_timeline_frames(sequence_id, version=seq["updated_at"])
        assert database_provider.combined_timeline_sequence(sequence_id) == seq
        assert database_provider.combined_timeline_frames(sequence_id, version=seq["updated_at"]) == first
        assert len(reads) == 2
        assert reads[1][1]["select"] != "*"

        assert database_provider.combined_timeline_frames(sequence_id, version=99) != first
        assert len(reads) == 3
        clock[0] = 31
        assert database_provider.combined_timeline_sequence(sequence_id) != seq
        assert len(reads) == 4
    finally:
        database_provider._cached_metadata.cache_clear()


def test_dr1_metadata_is_scoped_to_target_detector_and_project(monkeypatch):
    reads = []

    def get(table, params=None):
        reads.append((table, params))
        return []

    database_provider._cached_metadata.cache_clear()
    monkeypatch.setattr(database_provider, "_get", get)
    monkeypatch.setattr(database_provider, "monotonic", lambda: 10.0)

    try:
        database_provider.dr1_frames("barnard", 6)
        database_provider.dr1_frames("barnard", 6)
        database_provider.dr1_frames("barnard", 2)
        database_provider.dr1_sequences("barnard", 6)
        database_provider.dr1_sequences("barnard", 6)
        assert len(reads) == 3
        monkeypatch.setenv("SUPABASE_URL", "https://new-project.example.org")
        database_provider.dr1_frames("barnard", 6)
        assert len(reads) == 4
    finally:
        database_provider._cached_metadata.cache_clear()


def test_cached_metadata_rows_are_isolated_between_callers(monkeypatch):
    reads = []

    def get(table, params=None):
        reads.append(table)
        return [{"frame_id": "a", "provenance": {"file": "a.fits"}}]

    database_provider._cached_metadata.cache_clear()
    monkeypatch.setattr(database_provider, "_get", get)
    monkeypatch.setattr(database_provider, "monotonic", lambda: 10.0)

    try:
        first = database_provider.dr1_frames("barnard", 6)
        first[0]["provenance"]["file"] = "changed.fits"
        first.append({"frame_id": "b"})
        second = database_provider.dr1_frames("barnard", 6)
        assert reads == ["dr1_frames"]
        assert second == [{"frame_id": "a", "provenance": {"file": "a.fits"}}]
    finally:
        database_provider._cached_metadata.cache_clear()
