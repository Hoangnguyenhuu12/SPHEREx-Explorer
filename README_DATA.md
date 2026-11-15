# SPHEREx data acquisition

This application uses IRSA DR1 Level-2 spectral images. The acquisition pipeline supports SIA and an experimental TAP path, stores cutouts and validates FITS. It does not manufacture missing data or assert a source was detected. Scientific FITS files and everything under `data/spherex/` are intentionally ignored by Git.

## Phân biệt dữ liệu và môi trường

Repo dùng cấu trúc giống GitHub, không còn thư mục `new/` hay `old/`. Code nằm ở thư mục gốc. Mọi dữ liệu ảnh nằm trong `data/`; thư mục này bị Git bỏ qua và phải chia sẻ riêng. Ba loại dữ liệu được tách thành thư mục riêng, không trộn với nhau:

| Loại | Vị trí | Nguồn và thời gian | Dùng khi |
| --- | --- | --- | --- |
| **Dữ liệu hôm nay** (DR1) | `data/spherex/`, `data/processed/`, `data/reports/` | Cutout **thật** SPHEREx DR1 tải từ IRSA ngày 14/11/2026; có release, URL, thời điểm, detector, SHA-256 và báo cáo kiểm tra | `DATA_MODE=real` (luồng chính của MVP) |
| Dữ liệu hôm nay (QR3 của Khôi) | `data/imports/full_harvest_fusion/` (bản nhập đã kiểm toán), `data/imports/full_harvest_fusion_original/` (gói gốc, trùng từng byte), `data/fusion_repairs/qr3/` | QR3/AllWISE/Gaia, nhập ngày 14/11/2026 | Chỉ khi đặt `DATA_RELEASE=qr3`; không trộn với DR1 |
| **Dữ liệu hôm trước** (QR2) | `data/archive_qr2_2026-11-06_den_13/` | Ảnh **thật** QR2 và sản phẩm xử lý ngày 6–13/11: `five_targets/`, `target_observations/`, `observation_products/`, `wise0855_*`, `reproject_wise0855/`, `tasks_def/`, `fixtures/manifest.json`, `logs/` | Chỉ để tham khảo/lưu trữ; ứng dụng không tự đọc |
| **Dữ liệu giả** | `api_samples/` (Git), `frontend/src/shared/api/mock/` (Git) | Mẫu tổng hợp cho giao diện và schema; README ghi rõ là synthetic | `DATA_MODE=fixture` hoặc `VITE_USE_MOCK=true` |

Ngoài ra `data/tools/` chứa Node.js portable (công cụ, không phải dữ liệu), còn `data/tmp/pytest/` là thư mục tạm của pytest và có thể xóa.

`valid` trong báo cáo DR1 chỉ xác nhận các kiểm tra kỹ thuật đã chạy, không xác nhận phát hiện nguồn hay kết quả khoa học. Các bài test có thể tự tạo dữ liệu tổng hợp trong thư mục tạm.

Muốn xem lại bộ QR2 cũ trong chế độ fixture, đặt `DATA_MODE=fixture` và `DATA_DIR=data/archive_qr2_2026-11-06_den_13`. Lưu ý: chế độ này có thể ghi lại `fixtures/manifest.json` trong thư mục lưu trữ, nên nên sao lưu trước. Các script trong `members/huu-hoang/` ghi kết quả mới vào `data/<tên>/`, không ghi vào thư mục lưu trữ.

- `DATA_MODE=fixture` là chế độ dữ liệu fixture của backend; `VITE_USE_MOCK=true` là frontend dùng phản hồi mock. Cần kiểm tra cấu hình đang chạy và nguồn dữ liệu thực tế khi demo. Xem [frontend/README.md](frontend/README.md).

Ảnh demo cũ và fixture không tham gia luồng dữ liệu thực tế. Chúng được giữ trên đĩa để không xóa ngoài ý muốn và chỉ có thể được dùng lại khi chủ động chọn chế độ thử nghiệm.

Gói QR3/AllWISE do thành viên nhóm cung cấp được nhập riêng tại `data/imports/full_harvest_fusion/` (gói gốc: `data/imports/full_harvest_fusion_original/`); chưa tự động đưa vào API. Đọc [FUSION_IMPORT_REVIEW.md](FUSION_IMPORT_REVIEW.md) về độ phủ, provenance và các điểm chưa kiểm chứng trước khi dùng.

Các mẫu QR3 D6 đã truy vấn lại theo vị trí dự đoán tại epoch cho Barnard và Epsilon Indi B nằm riêng ở `data/fusion_repairs/qr3/`. Backend mặc định chọn DR1; đặt `DATA_RELEASE=qr3` trước khi khởi động để thử riêng mẫu QR3. Hai release không được trộn trong một request. Chi tiết, giới hạn WISE 0855, cờ R Draconis và ảnh hiệu chưa được xác minh: [FUSION_REPAIR_REPORT.md](FUSION_REPAIR_REPORT.md).

## Chạy hệ thống với ảnh DR1 mới

Backend hỗ trợ `DATA_MODE=real`: chỉ đọc các file đã kiểm tra và có SHA-256 trong `data/spherex/<mục tiêu>/manifest.json`. Nếu thiếu mục tiêu hoặc detector thì trả `NO_FRAMES`, không dùng ảnh cũ hay ảnh mẫu. `/api/health` trả `mode: local` để phân biệt dữ liệu DR1 cục bộ với mock và truy vấn IRSA trực tiếp. Chế độ này hiện hỗ trợ ảnh/blink; API photometry và astrometry trả lỗi 503 cho đến khi được kiểm định trên bộ DR1.

Khi một mục tiêu và detector đã có cặp qua sàng lọc và đã xử lý (`data/processed/<mục tiêu>_d<N>_comparison/report.json`), `/api/frames` chỉ trả đúng hai ảnh của cặp đó, khớp theo SHA-256. Có 4 cặp: WISE 0855 D3 và D6, Epsilon Indi B D6, RW Aurigae D1. Trên giao diện, chọn đúng detector đó để blink cặp ảnh cùng bước sóng. Nếu báo cáo cũ hoặc thiếu file đầu vào thì backend bỏ qua và trả mọi ảnh hợp lệ như trước. Mục tiêu chưa có cặp (Barnard, R Draconis) vẫn trả mọi ảnh hợp lệ kèm cảnh báo như `MIXED_WAVELENGTH`. Đặt `REAL_SELECTION=all` để luôn xem mọi ảnh hợp lệ. Cặp ảnh chỉ là minh họa kỹ thuật, không phải bằng chứng chuyển động hay biến quang.

Trên máy này `.env` đã được đặt `DATA_MODE=real`, `VITE_USE_MOCK=false` và `VITE_API_BASE_URL=http://127.0.0.1:8000`. Khởi động lại cả backend và frontend để nhận cấu hình:

```powershell
# Cửa sổ 1, tại thư mục new
$env:DATA_MODE='real'
.venv/Scripts/python.exe -m uvicorn app.main:app --app-dir members/dong --host 127.0.0.1 --port 8000
# Cửa sổ 2
cd frontend
npm run dev
```

Hoặc chạy `npm run dev:be` tại thư mục `new` để launcher đọc `.env`. Frontend cần Node.js/npm và các package đã cài. Danh sách detector hiện có được ghi trong manifest từng mục tiêu; R Draconis đã có ảnh nhưng các pixel mục tiêu có cảnh báo. Ảnh khác bước sóng có thể hiện cảnh báo `MIXED_WAVELENGTH`; không diễn giải khác biệt độ sáng như biến quang chỉ dựa trên blink.

## Status on 14 November 2026

The Barnard D6 TAP pilot timed out, so the scripted TAP query has not been verified end to end. The SIA fallback succeeded for all five targets. The initial selection of 90 DR1 FITS is downloaded, plus 21 additional cutouts to seek comparable pairs: **111 files**. All manifest SHA-256 hashes matched on 14/11/2026. FITS integrity and observation identity determine acquisition validity; a non-finite target pixel or incomplete coverage is recorded as a warning and does not discard the file. These checks do not establish source detection or scientific usability. See `data/reports/comparison_candidates.json` and each `manifest.json`, `selection_report.json` and `validation_report.json`; earlier rejected attempts are recorded as historical.

## Setup and execution

Python 3.12 and the project's existing pinned requirements are required. On Windows PowerShell:

```powershell
py -3.12 -m venv .venv  # chỉ tạo nếu workspace chưa có môi trường
.venv/Scripts/python.exe -m pip install -r requirements.txt
# First prove the complete pipeline, up to three Barnard D6 files.
.venv/Scripts/python.exe scripts/download_spherex.py --target barnard --detector 6 --limit 3
# After the pilot succeeds, run each other target, at most three each.
.venv/Scripts/python.exe scripts/download_spherex.py --target wise0855
.venv/Scripts/python.exe scripts/download_spherex.py --target epsilon_indi_b
.venv/Scripts/python.exe scripts/download_spherex.py --target rw_aurigae
.venv/Scripts/python.exe scripts/download_spherex.py --target r_draconis
# A target can be expanded only after at least one validated pilot cutout.
.venv/Scripts/python.exe scripts/download_spherex.py --target barnard --detector 6 --limit 10
# Standalone validator, coordinates in ICRS degrees at the observation epoch.
.venv/Scripts/python.exe scripts/validate_fits.py path/to/cutout.fits --ra 269.44 --dec 4.76 --detector 6
```

`--target all`, `--size` (degrees, default 0.1), `--timeout` (seconds), `--retries` and `--limit` are configurable. Query/downloads are serial; retries use backoff. The limit is the maximum number of **candidates attempted per target per invocation**, not a guarantee of valid images. Candidates are spaced across the sorted observation times; a failed candidate is reported, not silently substituted. Increasing the limit is guarded by a previously validated file. Valid existing files with matching URL and hash are reused; mismatched or invalid files are not overwritten. Downloads use temporary `.part` files.

For the five-target initial dataset, the Windows SIA workflow below caches each query, selects up to three chronological D6 candidates per target, and uses `curl.exe` to retry each selected file for up to 180 seconds. Existing files with matching manifest SHA-256 are skipped. Progress and failures are saved after each attempt in `selection_report.json`; run the same command again to retry failed entries without redownloading successful ones.

```powershell
.venv/Scripts/python.exe scripts/download_sia_spherex.py wise0855 epsilon_indi_b rw_aurigae r_draconis
# Resume the three Barnard observations selected in Data Explorer:
.venv/Scripts/python.exe scripts/download_selected_spherex.py --target barnard --url-list data/spherex/barnard/irsa-download-lists/SpectralImages-urllist.txt
```

The SIA query is a small cone at the linearly propagated J2026 position; counts describe matching catalogue rows, not every possible observation along a moving target's track. To refresh an outdated cached query, move the existing `sia-votable.xml` aside first, retaining its provenance.

The outputs for each target are `observations.csv`, `manifest.json`, `validation_report.json`, and `cutouts/`. Counts describe SIA DR1 rows covering the approximate J2026 position, separately by detector; they are not counts of confirmed target detections. Cutouts selected through the SIA workflow are centered on the J2026 estimate, and coverage is checked against the propagated position for each observation time. An uncovered target or non-finite target pixel produces a warning; corrupt files and identity mismatches are errors. `finite_unflagged_fraction` is a conservative diagnostic, not a scientifically selected quality mask; flags have multiple meanings. A covered, finite pixel is not a detection.

## Coordinate and science limits

Coordinates and proper motions are SIMBAD J2000 ICRS snapshots previously retrieved by this workspace's `members/huu-hoang/five_targets.py`; each manifest records the object identifier, numbers and SIMBAD source. WISE 0855 uses its own SIMBAD identifier, not an assumed Gaia match. Linear propagation does not model parallax, radial velocity or binary motion, and could miss source positions or observations near a footprint edge. The J2026 cone-point query is not a complete moving-source footprint search. Recheck identifiers and astrometry before science use, especially Epsilon Indi B and WISE 0855.

IRSA's current documentation says DR1 contains reprocessed QR2 Level-2 spectral images; QR3 is also available and calibrated to be used with DR1, while QR2 no longer appears in search and has a limited direct-download window. The pipeline deliberately restricts its URI to DR1 and records the image's pipeline version; it does not mix releases. Detector is not wavelength: SPHEREx's LVF wavelength varies across each detector. Compare the same detector **and compatible wavelengths/bandpasses**, time sampling and calibration. Apparent brightness differences can be spectral rather than temporal. A source may be saturated, flagged, blended or outside usable coverage even if the geometric check passes.

References: [IRSA DR1](https://irsa.ipac.caltech.edu/data/SPHEREx/docs/overview_dr1.html), [QR release status](https://irsa.ipac.caltech.edu/data/SPHEREx/docs/overview_qr.html), [IRSA cutout TAP example](https://caltech-ipac.github.io/irsa-tutorials/spherex-cutouts/), [IRSA PSF tutorial](https://caltech-ipac.github.io/irsa-tutorials/spherex-psf/), [IRSA cutout service](https://irsa.ipac.caltech.edu/data/SPHEREx/docs/cutout_tool.html). Cite the correct DR1 DOI and acknowledgement from IRSA for published products.
