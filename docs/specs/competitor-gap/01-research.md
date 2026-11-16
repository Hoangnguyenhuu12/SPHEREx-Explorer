# 01 · Research: kiến trúc, cách chạy và chất lượng của 3 hệ thống

Nguồn: mã nguồn clone ngày 2026-11-16 (sphere-blink có 327 commit, commit cuối 2026-11-15; NODIXHI có 92 commit, commit cuối 2026-11-15),
README và docs trong repo, cộng với việc dùng thử site live. Số liệu khoa học do các đội **tự công bố** trong tài liệu của họ; mình chưa chạy lại.

---

## 1. Vanilla Sphere: `Vanilla-Sphere/sphere-blink`

### 1.1 Cấu trúc repo

```text
sphereblink/   28 module Python (khoảng 11.900 dòng): FastAPI + engine ảnh + đo đạc + tìm vật thể chuyển động
web/           viewer HTML/CSS/JS thuần, không framework, không bước build (khoảng 25 file JS)
docs/          119 file: architecture, imaging-engine, measurement-pipeline, moving-objects, shift-and-stack,
               performance, security, deployment, api-reference, science/, diagrams/ (HTML → PNG, có bản dark)
tests/         54 file (pytest + runner JS), 237 test; UI test nằm ở repo riêng `sphere-blink-ui-tests`
scripts/       build sky.json, redshift, prewarm, completeness, README art
sql/           schema Postgres cho các phép đo
render.yaml    service production; render.dev.yaml cho môi trường dev
```

Module chính: `cutout.py` (đọc ảnh bằng range request), `service.py` (scheduler và job), `render.py` (epoch, màu, GIF),
`tiles.py` (field 3×3 / 7×7 tải dần), `measure.py` (PSF, track), `movers.py` (tìm vật thể), `mover_stack.py` (shift-and-stack),
`known_objects.py` (SkyBoT/JPL), `distance.py` (redshift), `catalogs.py` (Gaia, CatWISE), `guard.py` (giới hạn lưu lượng).

### 1.2 Kiến trúc

- **Một web process duy nhất** (uvicorn `--workers 1`). Job và tiến độ nằm trong RAM; phần việc nặng chạy trong `ProcessPoolExecutor`
  (spawn), mỗi process có một asyncio loop và connection pool riêng.
- **Đọc ảnh theo range request** từ bản sao SPHEREx trên AWS Open Data (S3 `us-east-1`): 4 request mỗi file, 1,3–1,9 MB thay vì 65 MB.
  Pixel thu được giống hệt khi cắt từ file đầy đủ.
- **Cache** bằng SQLite WAL trên disk lâu dài 40 GB; ảnh 2MASS nền cũng được cache. Postgres (tùy chọn) lưu phép đo và track.
- **API trả về ngay**: `/api/view` trả job handle tức thì, `/api/cube` trả những gì đã có, nên trình duyệt hiện được phim đang lớn dần.
  View có tính idempotent, nhiều người xem cùng mục tiêu chỉ tốn một lần tải.
- **Scheduler có hàng đợi công bằng**: giới hạn số view đang chạy theo RAM; ai mở view đầu tiên được phục vụ trước view thứ hai của người khác.
  Vị trí trong hàng đợi được hiển thị cho người dùng.
- **Hosting**: Render, gói **Pro Plus (4 CPU, 8 GB)**, region Virginia (cạnh bucket S3), disk 40 GB, tên miền riêng.
  Không bao giờ ngủ. Khi khởi động sẽ tự đo và tải sẵn view của 5 mục tiêu nổi bật.

### 1.3 Tính năng (theo `docs/features.md`, 18 mục)

Bản đồ bầu trời tự vẽ (Hammer, sao tới cấp 6, chòm sao, tên sao, ảnh 2MASS mờ dần phía sau, readout chòm sao) · tìm theo tên hoặc tọa độ ·
chế độ Simple/Advanced · blink tùy vị trí · màu giả và D1–D6 · nhóm khung theo exposure/ngày/lượt quét · trừ ảnh (median, reference, sum) ·
field tải dần tới 7×7 ô (0,84°) · phổ và đường cong ánh sáng tại tâm ngắm, kèm "preliminary reading" · overlay Gaia DR3 và CatWISE ·
đo vị trí, chuyển động, độ sáng · overlay track đã đo · cờ chất lượng từng khung · link chia sẻ, GIF/PNG nhúng được · mục tiêu nổi bật ·
**tìm vật thể chuyển động mù**, có nhật ký, tên và bình chọn · khoảng cách và redshift.

### 1.4 Thuật toán tìm vật thể chuyển động (tóm tắt từ `docs/moving-objects.md`)

1. Ảnh trung vị theo từng detector = bầu trời tĩnh; che pixel sáng.
2. Phát hiện: nhóm 2–400 pixel liền nhau, đỉnh ≥ 5σ so với nhiễu cục bộ (ô 32 px); tối đa 80 nguồn mỗi khung; loại nguồn lặp lại tại cùng chỗ.
3. Nối: theo từng lượt quét (cách nhau > 2 ngày là lượt mới). Mỗi cặp nguồn đề xuất một vận tốc 2–600″/h, các nguồn còn lại bỏ phiếu.
   Giữ lại nếu có ≥ 4 thời điểm, ≥ 2 visit, nằm trong 7,5″ quanh đường thẳng.
4. Xác nhận trên pixel: đỉnh ≥ 3,5σ cộng kiểm tra nguồn compact 3×3 (loại tia vũ trụ). Cần ≥ 6 thời điểm và ≥ 70 % độ phủ.
5. Quỹ đạo cong (gia tốc hằng) cho track ≥ 20 giờ; ghép các mảnh trong vòng 48 giờ.
6. **Kiểm tra báo động giả**: chạy lại với thời gian chụp bị xáo trộn, kết quả là 0 track do ngẫu nhiên.
7. Gắn tên bằng SkyBoT/JPL. 8. Track không có tên phải đạt chuẩn cao hơn và chỉ được gọi là *candidate*.

Lượt tìm thứ hai (`shift-and-stack`) cộng exposure dọc theo hàng nghìn quỹ đạo thử, tìm được Pluto 279σ, Makemake 17σ, Haumea, Chiron, Orcus, Eris.

### 1.5 Đo đạc (`measure.py`)

Stamp 49×81 pixel trên lưới detector gốc (không resample) → dự đoán vị trí từ PM + thị sai → fit PSF Gauss tích phân theo pixel, fit cùng các sao Gaia lân cận →
sao bão hòa thì đo theo phần cánh → stack khi ít exposure thấy được → fit vị trí, PM, thị sai (jackknife) → đường cong ánh sáng chuẩn hóa theo phổ.
Kết quả họ công bố: Barnard 10,33 ± 0,25″/năm (Gaia 10,36″); Eps Indi B lệch 0,6″ so với dự đoán Gaia.

### 1.6 Cách chạy (theo README)

```bash
python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
uvicorn sphereblink.main:app --port 8000
# mở http://localhost:8000/sky?target=barnard
SPHEREX_AUTO_MEASURE=0 python -m pytest -q   # 237 test
```

Không cần key. Các biến môi trường chính: `SPHEREX_COLLECTIONS`, `SPHEREX_CACHE_DIR`, `SPHEREX_FETCH_WORKERS=64`, `SPHEREX_MAX_FOV_ARCMIN=51`,
`SPHEREX_AUTO_MEASURE`, `SPHEREX_WARM_CATALOGS`, `DATABASE_URL`.

### 1.7 Chất lượng kỹ thuật

- CI có 2 workflow (`checks.yml`, `ui-tests.yml`) và repo UI test riêng.
- Tài liệu theo kiểu "functional spec": mỗi tính năng ghi rõ cách người dùng mở tới, file nào làm, giới hạn ra sao.
- "Honest limits": họ ghi rõ giới hạn sai số và các trường hợp không có kết quả.
- Không có AI trong sản phẩm (dùng làm điểm nhấn uy tín). AI chỉ được dùng để phát triển, và việc này được công khai.
- Điểm yếu: frontend JS thuần nên khó mở rộng; một process duy nhất nên mỗi lần deploy là site gián đoạn; gói Pro Plus tốn tiền;
  giấy phép **AGPL** hạn chế việc tái sử dụng.

---

## 2. NODIXHI: `RevDra/NODIXHI`

### 2.1 Cấu trúc repo

```text
viewer/          ứng dụng chính
  serve.py         server stdlib (http.server) + proxy cùng origin (299 dòng)
  spherex_live.py  SPHEREx từ IRSA (SIA), cắt, resample về lưới 6,15″/px
  wise_live.py     WISE/NEOWISE W1/W2 2010–2024
  gaia_live.py     nguồn Gaia DR3 trong trường nhìn, chiếu tới năm 2026
  star_info.py     thẻ sao: Gaia (FLAME, GSP-Phot, GSP-Spec) + SIMBAD (+ mirror Harvard) + NASA Exoplanet Archive + chòm sao Roman 1987 + SkyView
  reports_store.py báo cáo "tôi tìm thấy sao mới" + trang admin có token
  index.html       viewer, khoảng 10.000 dòng HTML/JS/CSS trong MỘT file
  welcome.html + sky/*.js   hành trình chào mừng, bầu trời 3D, chòm sao, tour, lịch, bộ sưu tập, chat, bản đồ Việt Nam
  constellation_bounds.tsv  ranh giới IAU (Roman 1987)
  tools/           build ephemeris, sky data, targets; 3 test Node (astro, constellations, hz)
backend/         pipeline FITS tùy chọn (không deploy)
documentation/   chiến lược, gap analysis (tiếng Việt), kiến trúc, khoa học
research/, Pan-STARRS/   thử nghiệm
.agents/         khoảng 1.850 file cấu hình agent AI (không phải mã sản phẩm)
Dockerfile, render.yaml  Render gói free, Docker
```

### 2.2 Kiến trúc

- **Không framework, không phụ thuộc** ở đường chạy chính: Python stdlib làm server và proxy, trình duyệt làm phần lớn việc.
- Dữ liệu tĩnh dựng sẵn: `sky-data.json` (3.187 sao SIMBAD), `ephemeris.json` (JPL Horizons), `hr-gaia.json`, `vietnam.json`.
- Cache trên ổ đĩa (`spherex_cache/`), lần đầu khoảng 70 giây.
- **Hosting**: Render **free**, ngủ sau khoảng 15 phút không có ai, báo cáo bị mất mỗi lần deploy.

### 2.3 Tính năng nổi bật

- **My sky**: bầu trời thật theo vị trí và thời gian, tua 1 phút đến 1 tháng mỗi giây; Mặt Trời, Mặt Trăng, hành tinh, sao chổi (JPL), mưa sao băng (IMO).
- **Chòm sao**: 19 chòm sao có hướng dẫn, chế độ xem 3D "hình dạng chỉ là ảo giác", tên tiếng Việt.
- **Thẻ sao**: tên, chòm sao, lịch sử (bài báo SIMBAD sớm nhất), khoảng cách, bán kính, khối lượng, nhiệt độ, tuổi, hành tinh, hiện tượng, dải phổ theo nguyên tố, ảnh lưu trữ DSS/2MASS.
- **Viewer**: D1–D6 thật, WISE 14 năm, overlay Gaia tô màu theo nhiệt độ, time machine 1990–2040, difference, shift-and-add thủ công,
  **chèn vật thể giả** để thử độ nhạy, tách hướng quét (thị sai), phím tắt.
- **Cộng đồng**: báo cáo ứng viên, lưu nháp, tải JSON; trang admin.
- **Giáo dục**: lịch, địa điểm trời tối, bản đồ 3D Việt Nam (có Hoàng Sa, Trường Sa), song ngữ VI/EN, chatbot.

### 2.4 Cách chạy (theo README)

```powershell
Set-Location viewer
python serve.py            # http://127.0.0.1:8000 ; viewer tại /index.html
node tools/test_astro.mjs; node tools/test_constellations.mjs; node tools/test_hz.mjs
```

### 2.5 Chất lượng kỹ thuật

- Điểm mạnh: không cần cài gì, thẻ sao rất giàu dữ liệu, có fallback khi SIMBAD sập, nội dung tiếng Việt.
- Điểm yếu: `index.html` 10k dòng khó bảo trì; chỉ có 3 test; gói free nên ngủ và mất dữ liệu; không có thuật toán tìm vật thể tự động.

---

## 3. MINIONS (dự án mình)

- **Frontend**: React + TypeScript + Vite, TanStack Query, Aladin Lite v3, react-three-fiber; deploy Vercel. 28 file test, 223 test.
- **Backend**: FastAPI (`members/dong/app`, khoảng 2.600 dòng trong `services/`), Supabase (Postgres + Storage + Auth), deploy Render.
  Theo comment trong `frontend/src/app/config.ts`, server cần khoảng 50 giây để thức dậy.
- **Dữ liệu**: IRSA SIA + dịch vụ cutout của IRSA (cắt phía server), diskcache; timeline unWISE W2 + SPHEREx D6 dựng sẵn cho 5 mục tiêu
  (`KNOWN_TARGETS`); Gaia DR3 qua MAST/VizieR; NEOSSat.
- **Tính năng riêng**: Story, 3D orbit, The Eyes (Aladin + HiPS), so sánh A/B, timeline 14 năm, phổ, quang trắc, astrometry, forum có kiểm duyệt, chatbot, tutorial.
- **CI**: `.github/workflows/ci.yml`.

## 4. Kết luận khảo sát

| Trục | Ai dẫn | Bài học cho mình |
| --- | --- | --- |
| Khoa học dữ liệu | Vanilla | Đưa thuật toán vào **kèm kiểm chứng độc lập**, và nói rõ giới hạn |
| Tốc độ và hạ tầng | Vanilla | Range read, trả job ngay, streaming, cache trên disk, server không ngủ |
| Giáo dục đại chúng | NODIXHI | Chòm sao, thẻ sao, song ngữ, bầu trời theo thời gian thực |
| Cộng đồng | **MINIONS** | Forum là lợi thế; nối nó với kết quả khoa học thì không đội nào có |
| Kể chuyện | **MINIONS** | Story và 3D orbit; giữ lại, chỉ cần gọn hơn |
| Kỹ thuật phần mềm | Vanilla ≈ MINIONS | Mình có React và test tốt; cần tài liệu kiến trúc gọn như họ |
