# Luồng request/response của `/api/frames` và chỗ chậm

Ngày 14/11/2026. Đọc từ code trên `main` (commit `6c5b842`) và đo thật: chạy local ở `DATA_MODE=live` gọi thẳng các hàm (bỏ qua cache), và gọi backend Render (`https://nasa-minions-phanetx-spherex.onrender.com`).

## 1. Sơ đồ

```mermaid
sequenceDiagram
    autonumber
    participant B as Trình duyệt (The Eyes)
    participant R as Render (FastAPI)
    participant C as Disk cache (diskcache)
    participant S as IRSA SIA (tìm ảnh)
    participant X as IRSA cutout service

    B->>R: GET /api/frames?ra&dec&detector&size=0.1667&target_key
    Note over R: Instance ngủ? Đánh thức ~60 s (gói free)
    R->>C: cached_result("frames", query)
    alt HIT (≤ 15 phút; ≤ 60 s nếu FEW_FRAMES)
        C-->>R: JSON + PNG bytes
    else MISS
        R->>S: find_images(collection=dr1, r=0.02°, timeout 12 s, 1 retry)
        S-->>R: danh sách ảnh (hoặc 502 → thử qr3)
        Note over R: group_images_into_visits → tối đa 6 visit,<br/>mỗi visit 1 nhóm theo detector
        par 4 luồng song song
            R->>X: download_cutout(ảnh 1, size 0.1667°)
            R->>X: download_cutout(ảnh 2 …)
        end
        X-->>R: FITS (mỗi file 4–13 s)
        Note over R: render_cached: reproject TAN + median theo visit<br/>+ PNG 8-bit + ảnh hiệu (0,1–0,7 s)
        R->>C: lưu 15 phút (60 s nếu FEW_FRAMES)
    end
    R-->>B: JSON frames (id, png, diff_png, grid, warnings)
    loop mỗi khung (4 song song)
        B->>R: GET /api/frames/{id}.png  (bộ nhớ RAM của process)
        R-->>B: PNG
    end
```

Mã nguồn từng bước:

| Bước | File | Ghi chú |
| --- | --- | --- |
| Route | `members/dong/app/fixture_api.py` → `fixtures.frames()` | |
| Cache | `services/live_cutouts.py: cached_result()` | `data/cache/api-0.1-live`, 256 MB; TTL 900 s, **60 s nếu kết quả có `FEW_FRAMES`** |
| Tìm ảnh | `live_cutouts.load_cutouts()` → `shared/pipeline/irsa.py: find_images()` | Hỏi lần lượt `spherex_dr1` rồi `spherex_qr3`; hạn chung 65 s |
| Tải cutout | `load_cutouts.download_visit()` → `irsa.download_cutout()` | `ThreadPoolExecutor(max_workers=4)`, timeout 12 s/lần, 1 retry |
| Dựng ảnh | `observed_frames.render_cached()` → `frame_rendering.build_frames()` | `lru_cache(16)` trong RAM |
| PNG | `fixtures.image()` | Dict RAM 1200 ảnh; mất khi process khởi động lại |

## 2. Số đo

**Local, bỏ cache (detector 6, size 0,1667°):**

| Mục tiêu | Tìm ảnh (SIA) | Tải từng cutout | Tìm + tải | Dựng ảnh | Tổng | Khung |
| --- | --- | --- | --- | --- | --- | --- |
| Barnard | 3,0 s | 4,2 s và 12,9 s (song song) | 15,8 s | 0,7 s | **16,6 s** | 2 |
| R Dra | DR1 lỗi 502 sau 1,1 s → QR3 3,7 s | 11,4 s | 16,2 s | 0,07 s | **16,3 s** | 1 |

Trong lúc đo, IRSA SIA trả **HTTP 502** vài lần liên tiếp (cả DR1 lẫn QR3).

**Render (R Dra, detector 5):**

| Lần gọi | Thời gian trong app (`Server-Timing`) | Tổng phía client | Phần chênh lệch |
| --- | --- | --- | --- |
| Đầu tiên (MISS, instance đang ngủ) | 18,4 s | **81,5 s** | ~63 s đánh thức instance |
| Gọi lại ngay (HIT) | 0,01 s | 2,2 s | mạng tới Render |
| Sau 65 s | 1,5 s | 3,3 s | |

## 3. Chậm ở đâu (xếp theo mức ảnh hưởng)

1. **Render ngủ: khoảng 60 s** ở lần đầu sau một thời gian không ai dùng. Lớn nhất, không liên quan đến code.
2. **Tải cutout từ IRSA: 4–13 s mỗi file.** IRSA phải cắt từ ảnh gốc 2040×2040 mỗi lần. 4 luồng song song nên thời gian bằng file chậm nhất, không phải tổng.
3. **Tìm ảnh SIA: 1–4 s mỗi collection**, cộng thêm thời gian thử lại khi IRSA trả 502 (đi tiếp sang QR3).
4. **Cache ngắn cho kết quả ít khung:** hầu hết mục tiêu hiện trả `FEW_FRAMES`, nên chỉ được cache **60 s** thay vì 15 phút. Người xem quay lại sau 1 phút lại phải chờ tải lại từ IRSA.
5. **Cache nằm trên đĩa và RAM của instance:** Render free không giữ đĩa khi instance ngủ hoặc deploy lại, nên sau mỗi lần ngủ thì cache trống.
6. Dựng ảnh (reproject + median + PNG) chỉ **0,1–0,7 s**: không phải điểm nghẽn.

## 4. Hướng cải thiện (chưa làm, để nhóm chọn)

| Hướng | Tác động | Công sức |
| --- | --- | --- |
| Giữ Render thức (ping `/api/health` mỗi 10 phút, hoặc gói trả phí) | Bỏ ~60 s lần đầu | Thấp |
| Làm nóng cache cho 5 mục tiêu × 6 detector lúc khởi động | Lần xem đầu của mục tiêu mẫu gần như tức thì | Thấp–trung bình |
| Tăng TTL cho `FEW_FRAMES` (ví dụ 15 phút; dữ liệu DR1 không đổi trong ngày) | Bỏ việc tải lại sau 60 s | Rất thấp |
| Lưu cache ra kho bền (Supabase Storage / S3) | Không mất cache khi instance ngủ/deploy | Trung bình |
| Dùng cutout đã tải sẵn (`sky_archive.dr1_frames` có `download_status=downloaded`) và phục vụ file từ storage | Bỏ hoàn toàn bước gọi IRSA cho 5 mục tiêu | Trung bình |
| Frontend: hiện tiến trình theo bước (đánh thức, tìm ảnh, tải ảnh) | Người dùng biết đang chờ gì | Thấp |
