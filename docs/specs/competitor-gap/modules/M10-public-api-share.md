# M10 · API công khai và chia sẻ

**Ưu tiên** P1 · **Phụ trách** Đông, Duy Hoàng

## Hiện trạng
FastAPI đã có OpenAPI; URL The Eyes chỉ mang `?q=` và `compare=`.

## Việc cần làm
1. **Trạng thái view trong URL**: `ra, dec, fov, det, mode (timeline|compare), a, b, i (frame), diff, gaia, lang`. Đồng bộ hai chiều bằng `useSearchParams`.
2. **Nút Share**: copy link, copy `<img src="/api/movie.gif?...">`, tải PNG, CSV, danh sách file FITS gốc.
3. **Endpoint ảnh**: `movie.gif` (imageio, ≤ 2 MB, ≤ 60 khung), `frame.png`.
4. **Trang `/docs`** công khai, kèm ví dụ `curl` cho 6 endpoint chính (giống "API explorer" của Vanilla).
5. **Embed**: `?embed=1` (đã có cờ embed trong TheEyesPage) cho `<iframe>`.

## Nghiệm thu
Mở một link chia sẻ ở cửa sổ ẩn danh thì thấy đúng khung, đúng chế độ.
