# 10 · Khả năng mở rộng

Trả lời cho tiêu chí: **khả năng mở rộng** theo ba chiều: **tải** (nhiều người dùng hơn), **dữ liệu** (nhiều sứ mệnh hơn) và **sản phẩm** (nhiều kênh hơn).

## 1. Hiện trạng và điểm nghẽn

| Thành phần | Hiện tại | Điểm nghẽn khi tăng tải |
| --- | --- | --- |
| Frontend | Vercel (CDN tĩnh) | Gần như không có, CDN tự mở rộng |
| API | FastAPI trên Render, 1 instance, ngủ khi không ai dùng | Cold start khoảng 50 s; `/api/frames` đồng bộ (timeout 125 s) nên giữ worker lâu |
| Lấy ảnh | Dịch vụ cutout của IRSA, cắt phía server IRSA | Phụ thuộc tốc độ và giới hạn của IRSA; không chia sẻ kết quả giữa các instance |
| Cache | `diskcache` trên disk cục bộ | Mỗi instance có cache riêng; mất khi redeploy nếu không có disk lâu dài |
| CSDL | Supabase Postgres + Storage | Tốt; cần index cho bảng job, track |
| Dịch vụ ngoài | SIMBAD, Gaia TAP, JPL | Bị giới hạn lưu lượng |

So sánh: Vanilla chạy **1 web process + process pool** trên một máy lớn. Mô hình đó đơn giản nhưng **không mở rộng ngang được** (job nằm trong RAM; chính họ ghi rằng chạy nhiều worker sẽ lỗi). Đây là chỗ nhóm mình có thể **thiết kế tốt hơn** ngay từ đầu.

## 2. Kiến trúc mục tiêu (S2–S3)

```text
             ┌──────────── CDN (Vercel) ── React app, dữ liệu tĩnh (sky, constellations)
Browser ─────┤
             └──► API gateway (FastAPI, stateless, N instance, autoscale)
                    │  POST /api/views  → ghi job vào hàng đợi
                    │  GET  /api/views/{id} → đọc trạng thái từ Postgres/Redis
                    ▼
              Queue (Redis / Postgres SKIP LOCKED)
                    ▼
              Workers (M instance, autoscale theo độ dài hàng đợi)
                ├─ RangeCutoutProvider (S3 us-east-1) / IRSA fallback
                ├─ render PNG/GIF → Object storage (S3/R2/Supabase Storage) + CDN
                └─ movers / stack / measure (hàng đợi riêng, ưu tiên thấp)
              Postgres: jobs, frames index, tracks, discoveries, forum
              Redis: cache nóng (danh sách exposure, kết quả resolve, thẻ sao)
```

### Nguyên tắc thiết kế
1. **API không giữ trạng thái**: job, tiến độ, kết quả nằm trong Postgres/Redis, không nằm trong RAM ([ADR-004](03-decisions.md#adr-004)).
2. **Idempotent theo khóa view**: nhiều người mở cùng field thì chỉ tính một lần.
3. **Khung ảnh là tài nguyên bất biến**: lưu theo khóa `(exposure_id, grid_key)` trong object storage và phục vụ qua CDN (`immutable`). Lần xem thứ hai không tốn CPU.
4. **Tách hàng đợi theo loại việc**: view (nhanh, tương tác) và phân tích (M05–M07, chậm) để phân tích không làm chậm việc xem.
5. **Công bằng và hạn mức**: mỗi người chỉ chạy tối đa k job cùng lúc; hiển thị vị trí trong hàng đợi (học từ Vanilla).
6. **Đặt gần dữ liệu**: worker ở `us-east-1` hoặc cạnh đó, vì dữ liệu SPHEREx nằm trên S3 ở đó.

## 3. Mô hình tải (để lập kế hoạch)

Giả định 🔎 (cần đo lại bằng `scripts/bench_views.py`):

| Tham số | Giá trị giả định |
| --- | --- |
| Exposure trong một view 8′ | khoảng 350 |
| CPU để cắt một exposure | khoảng 40 ms (con số Vanilla đo được) |
| CPU cho một view mới | 350 × 40 ms ≈ 14 CPU·s |
| Tỉ lệ view mới / tổng view (khi có cache) | 20 % |
| Một lớp 40 học sinh mở cùng mục tiêu | 1 view mới (nhờ idempotent) + 39 lần trúng cache |

→ Với cache và idempotent, **một lớp học gần như chỉ tốn chi phí của một người**. Thứ cần mở rộng chủ yếu là các view mới do người dùng tự khám phá và các job phân tích.

Công thức sơ bộ: `số worker CPU ≈ (số view mới mỗi phút × 14 CPU·s) / 60 / độ tận dụng mục tiêu (0,6)`.
Ví dụ 30 view mới/phút → khoảng 12 CPU.

## 4. Mở rộng dữ liệu (đa sứ mệnh)

Định nghĩa một interface chung để thêm sứ mệnh mới mà không phải sửa viewer:

```python
class SurveyProvider(Protocol):
    name: str                      # "spherex", "unwise", "neowise", "euclid", "rubin"
    def search(self, ra, dec, radius, time_range) -> list[Exposure]: ...
    def cutout(self, exposure, grid) -> Frame: ...           # range read hoặc dịch vụ cutout
    def bands(self) -> list[Band]: ...
    def citation(self) -> str: ...
```

| Sứ mệnh | Trạng thái | Giá trị thêm |
| --- | --- | --- |
| SPHEREx | Đang có | Cốt lõi |
| unWISE / NEOWISE | Đang có (dựng sẵn cho 5 mục tiêu) | Baseline 14 năm, chuyển thành provider động |
| 2MASS | Ảnh nền | Baseline 1998–2001 → tổng cộng khoảng 27 năm |
| Euclid (ESA) | Tương lai 🔎 | Ảnh hồng ngoại sắc nét hơn |
| Rubin/LSST | Tương lai 🔎 | Rất nhiều lần chụp, rất nhiều vật thể chuyển động |

## 5. Mở rộng sản phẩm

| Kênh | Cần thêm |
| --- | --- |
| Lớp học | Quản lý lớp, giao bài, báo cáo (Edu) |
| Kiosk | `?kiosk=1`: tự chạy, tự reset sau khi không ai dùng, không có form nhập liệu |
| Nhúng | `?embed=1` (đã có cờ), oEmbed, Web Component `<spherex-blink ra= dec=>` |
| Ứng dụng di động | PWA trước (offline cho bài học), app gốc sau |
| API | Khóa API, hạn mức theo gói, trang tài liệu |
| Đa ngôn ngữ | i18n ([ADR-008](03-decisions.md#adr-008)) → thêm ngôn ngữ ASEAN |

## 6. SLO đề xuất

| SLO | Mục tiêu (pilot) | Mục tiêu (thương mại) |
| --- | --- | --- |
| Uptime API | 99 % | 99,5 % |
| Mở view đã cache, p95 | ≤ 2 s | ≤ 1 s |
| Mở view mới, p50 | ≤ 15 s | ≤ 10 s |
| Thẻ sao, p95 | ≤ 2 s | ≤ 1 s |
| Thời gian phục hồi sau sự cố (MTTR) | ≤ 4 h | ≤ 1 h |

Giám sát: health check, log có cấu trúc, đo độ dài hàng đợi, tỉ lệ trúng cache (`X-Cache`), cảnh báo khi IRSA hoặc CDS lỗi.
