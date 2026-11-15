# Bàn giao triển khai backend cho SPHEREx Explorer

## Mục tiêu

Frontend đang chạy trên Vercel tại:

```text
https://nasa-minions-phanetx-spherex.vercel.app
```

Frontend gọi các endpoint FastAPI `/api/health`, `/api/resolve`, `/api/frames`, `/api/spectrum`, `/api/photometry` và `/api/astrometry`. Vercel chỉ build frontend. Backend FastAPI phải được deploy thành một dịch vụ public riêng.

## Backend cần triển khai

Entry point:

```text
members/dong/app/main.py:app
```

Lệnh chạy production:

```bash
uvicorn app.main:app --app-dir members/dong --host 0.0.0.0 --port $PORT
```

Python cần là 3.12. Cài thư viện bằng `pip install -r requirements.txt`. Không commit `.env`, FITS, database local hoặc service-role key.

## Biến môi trường backend

```env
API_HOST=0.0.0.0
API_PORT=8000
DATA_MODE=database
API_MODE=real
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_ANON_KEY=<publishable-key>
SUPABASE_SCHEMA=sky_archive
DATA_DIR=data
CORS_ALLOW_ORIGINS=https://nasa-minions-phanetx-spherex.vercel.app
```

Nếu có domain preview Vercel, thêm domain đó vào `CORS_ALLOW_ORIGINS`, phân cách bằng dấu phẩy. Không dùng service-role key ở frontend.

## Dữ liệu cần có

Supabase schema phải là `sky_archive` và tối thiểu cần các bảng `targets`, `target_products`, `products`, `cutouts`, `gaia_dr3`, `target_gaia_dr3` và `dr1_frames`.

Để `/api/frames` render ảnh thật, database metadata phải ánh xạ tới FITS local hoặc asset public. Chỉ có metadata mà không có FITS/asset thì không thể tạo PNG.

Để `/api/spectrum` hoạt động, backend phải đọc được FITS có các HDU `IMAGE`, `VARIANCE`, `FLAGS` và `WCS-WAVE` nếu có. Nếu vị trí không có FITS hợp lệ, API phải trả `NO_SPECTRUM`, không tạo dữ liệu thay thế.

## Kiểm tra backend sau deploy

Giả sử domain backend là `https://<backend-domain>`.

```text
GET https://<backend-domain>/api/health
GET https://<backend-domain>/api/resolve?name=Barnard%27s%20Star
GET https://<backend-domain>/api/frames?ra=269.4520769586&dec=4.6933649666&target_key=barnard&detector=6&max_frames=1
GET https://<backend-domain>/api/spectrum?ra=269.4520769586&dec=4.6933649666&target_key=barnard
```

Health phải có `status: ok` và `mode: database`. Spectrum thành công phải trả `mode`, `position`, `flux_unit: mJy` và các point gồm `detector`, `wavelength_um`, `flux_mjy`, `err_mjy`, `flagged`.

## Cấu hình frontend Vercel

Trong Vercel Project Settings → Environment Variables, đặt cho Production và Preview:

```env
VITE_API_BASE_URL=https://<backend-domain>
VITE_USE_MOCK=false
```

Không đặt API URL là `localhost` hoặc `127.0.0.1`. Sau khi đổi biến, phải redeploy vì Vite nhúng `VITE_*` lúc build.

## Kiểm tra trên Vercel

Mở `https://nasa-minions-phanetx-spherex.vercel.app/the-eyes?q=barnard`. Trong DevTools → Network, request API phải đi tới `https://<backend-domain>/api/...`, không phải domain Vercel `/api/...`, `localhost` hoặc `127.0.0.1`.

## Checklist bàn giao

- [ ] Backend public trả `/api/health` với `status: ok`.
- [ ] Backend dùng `DATA_MODE=database`.
- [ ] Supabase schema `sky_archive` truy cập được.
- [ ] CORS cho phép domain Vercel.
- [ ] `/api/resolve` tìm được năm target.
- [ ] `/api/frames` trả ảnh hoặc mã lỗi dữ liệu rõ ràng.
- [ ] `/api/spectrum` trả flux thật hoặc `NO_SPECTRUM`, không tạo số giả.
- [ ] Vercel đặt `VITE_API_BASE_URL` tới backend public.
- [ ] Vercel đặt `VITE_USE_MOCK=false`.
- [ ] Đã redeploy Vercel sau khi đổi biến môi trường.
- [ ] DevTools không còn 404 cho API.
