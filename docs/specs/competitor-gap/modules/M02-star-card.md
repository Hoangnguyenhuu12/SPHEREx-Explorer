# M02 · Thẻ thông tin sao

**Ưu tiên** P0 · **Phụ trách** Khôi (API), Thạch (UI) · **Chuẩn tham chiếu**: NODIXHI `star_info.py`

## Mục tiêu
Bấm vào bất kỳ sao Gaia nào (trên bản đồ Aladin hoặc trong khung blink) để thấy nó là gì.

## Nguồn dữ liệu (thứ tự ưu tiên)
1. **Gaia DR3** `gaiadr3.gaia_source` + `astrophysical_parameters` (teff_gspphot, radius_flame, mass_flame, lum_flame, age_flame) qua TAP ESA.
   Khoảng cách: Bailer-Jones (`external.gaiaedr3_distance`).
2. **SIMBAD TAP** (CDS, dự phòng Harvard): tên thường gọi, `otype`, loại phổ, số bài báo.
3. **NASA Exoplanet Archive TAP**: hành tinh đã xác nhận (`gaia_id`).
4. **Chòm sao**: M01.

## Luồng
```text
click marker (đã có: AladinMap.tsx, star-selection.ts nearestStar)
  → useStarCard(gaiaId)  (TanStack Query, staleTime 1 ngày)
  → GET /api/star?gaia_id=
      → song song 3 TAP, timeout mỗi nguồn 8 s, cache diskcache 30 ngày
      → gộp, tính distance_ly, abs_g, màu theo teff
```

## Quy tắc hiển thị
- Trường nào thiếu thì ghi "không có dữ liệu", không đoán.
- Ghi nguồn ở chân thẻ.
- Màu viền theo nhiệt độ (bảng màu vật đen, tương tự NODIXHI).

## Rủi ro
SIMBAD CDS có lúc sập (chính NODIXHI ghi nhận) → bắt buộc có mirror Harvard.
