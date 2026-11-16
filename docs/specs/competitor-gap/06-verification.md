# 06 · Verification

Mỗi tiêu chí phải **đo được** và có **nguồn đối chiếu độc lập**, giống cách Vanilla kiểm chứng mọi kết quả.

## 1. Benchmark khoa học

| ID | Kiểm tra | Đối chiếu với | Đạt khi |
| --- | --- | --- | --- |
| SCI-1 | PM của Barnard's Star | Gaia DR3: 10,36″/năm, PA 356° | Sai lệch ≤ 0,5″/năm, PA ≤ 5° |
| SCI-2 | PM của Eps Indi B | Gaia DR3 (+3982, −2467 mas/năm) | Mỗi thành phần ≤ 150 mas/năm |
| SCI-3 | Tiểu hành tinh tìm lại được trên field 248.34 −16.98 | JPL/SkyBoT | ≥ 1 track khớp tên trong 10″ |
| SCI-4 | Báo động giả | Chạy lại với thời gian xáo trộn (10 lần) | Trung bình `chance_tracks` ≤ 0,2 |
| SCI-5 | Shift-and-stack trên Pluto | Ephemeris JPL | ≥ 20σ, vị trí ≤ 1 pixel |
| SCI-6 | Đường cong ánh sáng R Dra | Kết quả công bố (mờ khoảng ×2 từ 06/2025 đến 06/2026) | Đúng xu hướng, sai số ghi rõ |
| SCI-7 | Chòm sao của 20 tọa độ | `astropy get_constellation` | 20/20 |
| SCI-8 | Thẻ sao của 10 sao nổi tiếng | SIMBAD trực tiếp | Tên, loại phổ, khoảng cách khớp |

## 2. Hiệu năng

| ID | Kịch bản | Đạt khi |
| --- | --- | --- |
| PERF-1 | 10 tọa độ ngẫu nhiên, FOV 8′, D6, khi chưa có cache | p50 ≤ 15 s, p95 ≤ 45 s |
| PERF-2 | Mở lại các view trên | ≤ 2 s |
| PERF-3 | Lần mở đầu sau 30 phút không ai dùng (giờ demo) | ≤ 15 s |
| PERF-4 | `/api/star` khi đã có cache | p95 ≤ 2 s |
| PERF-5 | Lighthouse mobile ở landing | Performance ≥ 80, Accessibility ≥ 95 |

Công cụ: `scripts/bench_views.py` (ghi CSV thời gian), Lighthouse CI trong `ci.yml`.

## 3. UI và khả năng truy cập

| ID | Kiểm tra | Đạt khi |
| --- | --- | --- |
| UI-1 | Ở 375×812 không có cuộn ngang trên `/`, `/where-are-you`, `/the-eyes` | `scrollWidth == innerWidth` |
| UI-2 | Tutorial không che tên mục tiêu và khung ảnh đang xem | Kiểm tra bằng screenshot |
| UI-3 | Người mới mở được phim trong ≤ 2 lần bấm | Thử với 5 người |
| UI-4 | Bàn phím: Space, ←/→, G, F, Esc | Có test e2e |
| UI-5 | Không thiếu chuỗi i18n | Script so key giữa `vi.json` và `en.json` |

## 4. Test tự động cần thêm

- `tests/test_constellation.py`: 20 điểm, gồm cả các điểm sát ranh giới.
- `tests/test_star_card.py`: mock Gaia, SIMBAD, Exoplanet; kiểm tra khi một nguồn sập thì vẫn có thẻ.
- `tests/test_range_cutout.py`: pixel range read == pixel IRSA cutout.
- `tests/test_movers_synthetic.py`: chèn vật thể giả (theo ý tưởng của NODIXHI), phải tìm lại ≥ 90 % khi SNR ≥ 7.
- `tests/test_movers_shuffle.py`: xáo trộn thời gian thì gần như không ra track nào.
- Frontend: `constellation-layer.test.ts`, `star-card.test.tsx`, `view-job.test.ts`.

## 5. Checklist trước buổi chấm

- [ ] Cron keep-alive bật 2 giờ trước
- [ ] Đã làm nóng 5 mục tiêu và 3 field có vật thể chuyển động
- [ ] Đã chụp sẵn video dự phòng
- [ ] Mỗi kết quả trên landing có link "Checked against …"
