# Runbook — SPHEREx Explorer frontend

Cập nhật 14/11/2026. Frontend nằm trong `frontend/` (Vite + React + TypeScript), thay hoàn toàn frontend cũ của repo luyện tập. Repo không có secret phía client.

CI (`.github/workflows/ci.yml`, job `frontend`): `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`. Job Playwright e2e cũ đã bỏ cùng frontend cũ.

## 1. Chạy trên máy

```bash
cd frontend
npm ci
npm run dev            # http://localhost:5173, mặc định dùng dữ liệu "Illustrative demo"
```

Nối với backend API 0.1 thật (ví dụ chạy FastAPI cục bộ ở cổng 8000):

```bash
# frontend/.env.local (không commit)
VITE_USE_MOCK=false
VITE_API_BASE_URL=http://127.0.0.1:8000
```

Backend phải cho phép đúng origin của trang trong `CORS_ALLOW_ORIGINS` (ví dụ `http://localhost:5173`).

Kịch bản kiểm tra trạng thái khi chạy mock: thêm `&mock=one-frame`, `no-frames`, `error`, `slow` hoặc `expired` vào URL của The Eyes.

## 2. Kiểm tra trước khi phát hành

```bash
npm run typecheck
npm test               # 31 unit test
npm run lint           # oxlint: 0 lỗi; cảnh báo React Compiler đã ghi trong QA_REPORT
npm run build
npm run preview        # kiểm tra deep link: /, /story, /where-are-you, /the-eyes?q=barnard
```

## 3. Biến môi trường (build-time, công khai)

| Biến | Ý nghĩa | Mặc định |
| --- | --- | --- |
| `VITE_API_BASE_URL` | Origin của API, không có `/` ở cuối | rỗng → bắt buộc mock |
| `VITE_USE_MOCK` | `true` dùng dữ liệu minh hoạ trong trình duyệt; `false` gọi API | `true` |

Vite thay giá trị lúc build, nên đổi API phải build/deploy lại. Bản production phải đặt `VITE_USE_MOCK=false`; nếu không, footer và popup hiện "Illustrative demo".

## 4. Deploy Vercel (chưa thực hiện — chờ xác nhận project)

- Deploy từ gốc repo như project cũ: `vercel.json` ở gốc chạy `npm ci --prefix frontend`, `npm run build --prefix frontend`, output `frontend/dist`, rewrite SPA cho mọi route (trừ `/assets`, `/textures`, favicon), cache dài hạn cho `/assets`. `.vercelignore` chỉ upload `frontend/` và `vercel.json`.
- Đặt `VITE_API_BASE_URL` và `VITE_USE_MOCK=false` trong Project Settings → Environment Variables (Production và Preview).
- Thêm origin preview/production vào `CORS_ALLOW_ORIGINS` của backend; kiểm CORS cho JSON, PNG và response lỗi.
- Bằng CLI (khi đã đăng nhập), từ gốc repo: `npx vercel` (preview), `npx vercel --prod` (production).

Sau deploy, kiểm tra:
1. Reload trực tiếp `/story`, `/where-are-you`, `/the-eyes?q=barnard` → không 404.
2. Where are you → Explore the sky → The Eyes.
3. Chọn 5 mục tiêu; ảnh tải; Play; Difference; footer ghi "Service: live/fixture mode".
4. Bản đồ DSS2 hiện (wrapper tự dùng mirror nếu CDS lỗi).
5. Ghi lại URL deploy và commit SHA.

Rollback: Vercel → Deployments → chọn bản trước → Promote to Production. Rollback frontend không đổi schema backend.

## 5. Phụ thuộc bên ngoài lúc chạy

| Dịch vụ | Dùng cho | Khi lỗi |
| --- | --- | --- |
| HiPS DSS2 (CDS, mirror IRSA/ESA) | Bản đồ nền | Dò mirror theo thứ tự; nếu tất cả lỗi, hiện thông báo, phần SPHEREx vẫn dùng được |
| VizieR (CDS, mirror CfA/IUCAA) | Gaia DR3 overlay | Hiện "could not be loaded" trong More tools |
| API SPHEREx Explorer | Ảnh, quang trắc, astrometry | Thông báo theo mã lỗi; Try again; watchdog 125 s; Cancel |

Ngày 14/11/2026, `alasky.cds.unistra.fr` trả 404 cho HiPS và `vizier.cds.unistra.fr` không phản hồi; ứng dụng chạy qua IRSA và CfA.

## 6. Giấy phép và nguồn cần ghi trong bài nộp

- Aladin Lite (CDS) — GPL-3. Cần nhóm xác nhận phù hợp với license của repo.
- DSS2 (STScI/CDS HiPS), Gaia DR3 (ESA, qua VizieR), SIMBAD (toạ độ mục tiêu), NASA Blue Marble (texture Earth, lấy từ gói `three-globe`; nên đối chiếu nguồn NASA Visible Earth).
- Fonts Averia Serif Libre, Andika (SIL OFL) qua `@fontsource`; icon Lucide (ISC).
