# 07 · Guide

## 1. Chạy hai repo đối thủ để nghiên cứu

> Đây là mã của bên thứ ba. Hãy chạy trong **môi trường cô lập** (Docker, WSL hoặc VM), không chạy ngay trong thư mục dự án,
> và không đưa token hay `.env` của mình vào đó.

### 1.1 Vanilla Sphere (sphere-blink)

```bash
docker run --rm -it -p 8000:8000 -v "$PWD/sphere-blink:/app" -w /app python:3.12-slim bash
pip install -r requirements.txt
SPHEREX_AUTO_MEASURE=0 SPHEREX_WARM_CATALOGS=0 uvicorn sphereblink.main:app --host 0.0.0.0 --port 8000 --workers 1
# Trình duyệt: http://localhost:8000/sky?target=barnard  ·  http://localhost:8000/docs (API explorer)
# Test: pip install pytest pyyaml && SPHEREX_AUTO_MEASURE=0 python -m pytest -q
```

Nên xem: `/sky?target=barnard&ui=adv` (Advanced), nút **Discoveries**, `/api/movers`, `/api/measured`,
và `/sky?ra=248.34&dec=-16.98&levels=3&ui=adv` (field 7×7 có 3I/ATLAS). Đọc thêm `docs/moving-objects.md`, `docs/shift-and-stack.md`, `docs/performance.md`.

### 1.2 NODIXHI

```bash
docker run --rm -it -p 8001:8000 -v "$PWD/NODIXHI:/app" -w /app/viewer python:3.12-slim python serve.py --no-browser
# http://localhost:8001  (welcome, 3D sky)  ·  http://localhost:8001/index.html (viewer)
# Test: node tools/test_astro.mjs && node tools/test_constellations.mjs && node tools/test_hz.mjs
```

Nên xem: Sky guide → Constellations → Orion, nút "From the side"; trong viewer bấm `G` rồi rê vào một sao để xem thẻ;
Advanced → Shift and add → "Use PX-1 motion"; Synthetic Object A/B.

### 1.3 Ghi chép khi so sánh

Dùng bảng trong [index.md](index.md#ma-trận-khoảng-cách-một-trang). Với mỗi ô, ghi URL hoặc ảnh chụp làm bằng chứng vào `docs/evidence/`.

## 2. Kịch bản demo 90 giây (sau P2)

1. Landing → "By team MINIONS" → bấm "Watch a brown dwarf move" (khoảng 5 s, đã làm nóng).
2. Play → so A/B năm 2010 với 2025: WISE 0855 dịch đi khoảng 2′.
3. Bấm vào một sao Gaia → thẻ sao (tên, chòm sao, khoảng cách).
4. Thu nhỏ → hiện lớp chòm sao → bấm vào Ophiuchus → mở field 3I/ATLAS.
5. Bấm **Find movers** → track của 3I/ATLAS, ghi "Checked against JPL: 3.4″", "0 tracks by chance".
6. Bấm "Discuss in forum" → bài discovery với các phiếu bình chọn.
7. Kết thúc bằng Story/3D orbit.

## 3. Hướng dẫn phát triển module mới

### Backend (`members/dong/app`)

```text
services/
  constellations.py      M01  get_constellation + tên VI
  star_card.py           M02  gộp Gaia/SIMBAD/Exoplanet, cache diskcache 30 ngày
  range_cutouts.py       M03  RangeCutoutProvider
  view_jobs.py           M03  hàng đợi + trạng thái (Postgres/Redis)
  movers/
    detect.py            M05  median, mặt nạ, nguồn 5σ
    link.py              M05  bỏ phiếu vận tốc
    confirm.py           M05  xác nhận pixel
    chance.py            M05  xáo trộn thời gian
    names.py             M05  SkyBoT
    stack.py             M06
  measure/psf.py         M07
api: constellation_api.py, star_api.py, views_api.py, movers_api.py
```

Quy tắc: module tính toán không import FastAPI; mỗi kết quả trả kèm `params` và `stats`; mọi gọi ra ngoài có timeout, retry và cache.

### Frontend (`frontend/src/features`)

```text
constellations/   ConstellationLayer.tsx, useConstellation.ts, data/ (lazy)
star-card/        StarCard.tsx, useStarCard.ts
view-jobs/        useViewJob.ts (polling), ProgressiveMovie.tsx
movers/           MoversPanel.tsx, TrackOverlay.tsx
i18n/             vi.json, en.json, useT.ts
```

### Quy trình

Mỗi module có một PR riêng, gồm spec (link tới file trong `modules/`), test và ảnh chụp. Chỉ merge khi CI xanh và người phụ trách khoa học (Nguyên) đã duyệt các module SCI.
