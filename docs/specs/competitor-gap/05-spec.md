# 05 · Spec chức năng và API

Quy ước: JSON, tọa độ ICRS độ thập phân, thời gian MJD (UTC), góc tính bằng arcsec trừ khi ghi khác.
Lỗi dùng chung `{ "error": { "code": "UPPER_SNAKE", "message": "...", "details": {} } }` như API hiện tại.

## 1. Chòm sao (M01)

| Endpoint | Mô tả |
| --- | --- |
| `GET /api/constellation?ra=&dec=` | `{ "abbr": "Oph", "name": "Ophiuchus", "name_vi": "Xà Phu" }` |
| tĩnh `/data/constellations.lines.json` | GeoJSON MultiLineString (d3-celestial) |
| tĩnh `/data/constellations.names.json` | `[{ "abbr", "name", "name_vi", "ra", "dec", "rank" }]` |

FR-1.1 Bật/tắt lớp "Constellations" trên Aladin; mặc định **bật** ở FOV > 20°, ẩn ở FOV < 2°.
FR-1.2 Readout dưới con trỏ hiện tọa độ và chòm sao, tính phía client bằng bảng Roman (không gọi API mỗi lần rê chuột).
FR-1.3 Tên chòm sao theo ngôn ngữ hiện tại.

## 2. API view jobs

Xem [ADR-004](03-decisions.md#adr-004).

```http
POST /api/views
{ "ra": 269.4462, "dec": 4.7681, "fov_arcmin": 8, "detector": 6 }        # hoặc { "name": "Barnard's Star" }
→ 202 { "job_id": "v_2f9c…", "key": "269.446_4.768_8_6", "status": "queued", "queue_position": 2 }

GET /api/views/{job_id}
→ 200 {
  "status": "searching|fetching|ready|failed",
  "progress": { "found": 358, "done": 120 },
  "target": { "ra": ..., "dec": ..., "name": "Barnard's Star", "resolved_by": "SIMBAD" },
  "frames": [ { "id", "mjd", "detector", "wavelength_um", "png", "flags": [] } ],   # các khung đã xong
  "queue_position": 0
}
```

FR-2.1 Gọi lại với cùng `key` sẽ trả về cùng job (idempotent).
FR-2.2 `frames` tăng dần; client vẽ ngay những khung đã có.
FR-2.3 Giới hạn: FOV ≤ 30′, tối đa 400 exposure một view, mỗi IP tối đa 3 job đồng thời.
FR-2.4 Tên được resolve bằng SIMBAD/Sesame, cache 30 ngày.

## 3. Thẻ sao (M02)

```http
GET /api/star?gaia_id=4472832130942575872
→ 200 {
  "ids": { "gaia": "...", "simbad": "* bet Ori", "common": "Rigel" },
  "constellation": { "abbr": "Ori", "name": "Orion", "name_vi": "Lạp Hộ" },
  "astrometry": { "ra", "dec", "pmra", "pmdec", "parallax", "distance_pc", "distance_ly" },
  "physical": { "teff_k", "radius_rsun", "mass_msun", "lum_lsun", "age_gyr", "spectral_type", "otype" },
  "photometry": { "g", "bp_rp", "abs_g" },
  "planets": [ { "name", "year", "method", "period_d", "mass_mjup" } ],
  "sources": [ "Gaia DR3", "SIMBAD", "NASA Exoplanet Archive" ],
  "missing": [ "mass_msun" ]
}
```

FR-3.1 Nguồn nào lỗi thì trường của nó nằm trong `missing`; thẻ vẫn hiển thị phần còn lại.
FR-3.2 Cache phía server 30 ngày theo `gaia_id`.
FR-3.3 p95 ≤ 2 s khi có cache; ≤ 6 s khi chưa có.

## 4. Tìm vật thể chuyển động (M05)

```http
POST /api/movers/search { "ra", "dec", "fov_arcmin": 22 }   → 202 { "job_id" }
GET  /api/movers/search/{job_id}
→ { "status", "tracks": [Track], "stats": { "detections", "tracks", "chance_tracks", "unnamed_dropped", "params": {...} } }
GET  /api/movers?status=candidate|matched   → nhật ký
```

```json
Track = {
  "id": "MN-60894-A1B2", "mjd0": 60894.31, "ra0": 248.34, "dec0": -16.98,
  "v_east": -98.2, "v_north": 12.4, "a_east": 0, "a_north": 0,
  "n_times": 15, "n_visits": 2, "coverage": 0.86,
  "name": "3I/ATLAS", "match_sep_arcsec": 3.4, "status": "matched",
  "evidence_png": "...", "gif": "...", "view_url": "/the-eyes?ra=...&dec=...&mover=MN-..."
}
```

## 5. Discovery posts (M09)

- Bảng `discoveries(id, track_id, post_id, status, created_by, created_at)`; `discovery_votes(discovery_id, user_id, vote ∈ {real, artefact, unsure})`.
- `POST /api/forum/discoveries { track_id }` tạo bài forum gắn với track (nội dung sinh từ template, có GIF và link view).
- Chuyển trạng thái: `candidate → community_checked` khi đạt ≥ 5 phiếu và ≥ 70 % "real"; `→ catalogue_matched` (tự động khi SkyBoT khớp); `→ rejected` (admin).

## 6. Chia sẻ và xuất dữ liệu (M10)

| Endpoint | Kết quả |
| --- | --- |
| `GET /api/movie.gif?ra=&dec=&fov=&detector=&group=visit` | GIF ≤ 2 MB |
| `GET /api/frame.png?...&i=-1` | Một khung |
| `GET /api/export.csv?...` | Danh sách exposure, MJD, bước sóng, flux tại tâm ngắm |
| `/the-eyes?ra=&dec=&fov=&det=&mode=compare&a=&b=&lang=` | Mọi trạng thái view nằm trong URL |

## 7. Yêu cầu phi chức năng

| Mã | Yêu cầu |
| --- | --- |
| NFR-1 | View mới p50 ≤ 15 s, p95 ≤ 45 s; view đã cache ≤ 2 s |
| NFR-2 | Lần mở đầu trong giờ demo ≤ 15 s (không có cold start) |
| NFR-3 | Trên màn 375 px không có cuộn ngang; vùng chạm ≥ 40 px |
| NFR-4 | Mọi kết quả khoa học ghi rõ nguồn, phương pháp và giới hạn |
| NFR-5 | Rate limit theo IP; không lộ key; CORS chỉ cho domain của dự án |
