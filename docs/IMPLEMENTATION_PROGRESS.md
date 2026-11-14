# Implementation progress: SPHEREx Explorer frontend

Thư mục đích: `frontend/` trong repo thi đấu `nasa-minions-PhanetX-SphereX` (xác nhận 14/11/2026). Báo cáo mỗi phase được nối vào cuối file này.

---

## Phase 1 — Audit MVP và code tham khảo

Trạng thái: **Hoàn thành**.

1. **Kết quả.** Export Stitch có đủ bốn trang và khung nội dung đúng (Landing 4 section, Story 6 chương, Earth three.js xoay trục Y thật, popup có đủ nhóm thông tin). Vấn đề chính: không có Aladin thật (ảnh tĩnh ghi nhầm "PanSTARRS DR1"), ảnh blink là screenshot giao diện, bố cục desktop là mobile kéo giãn (thanh tab dưới), Earth nằm trong khung vuông với texture vẽ khối, và rất nhiều số liệu bịa (Story "94%", "4 STEM academies", trích dẫn nhân vật; popup "Gaia DR3 4472832130", "S/N 148.4"; Where are you "L2 HALO", "97.4 Minutes" — sai cả sự thật vì SPHEREx bay quỹ đạo thấp đồng bộ mặt trời). Thiếu công cụ: detector, seek theo ngày, image viewport, crosshair, Gaia, click spectrum, tutorial; thiếu loại trừ nav/popup và mọi trạng thái loading/error.
2. **Đầu ra.** `docs/DESIGN_REVIEW.md` (đối chiếu yêu cầu, bảng Giữ/Thiết kế lại/Loại bỏ, kiểm kê asset, gap list, backlog). Ảnh desktop 1440 của export: `docs/evidence/phase1/`.
3. **Kiểm chứng.** Mở 4 `code.html` qua server tĩnh ở 1440×900 trong trình duyệt tích hợp; trích văn bản hiển thị của cả 4 trang để đối chiếu nội dung. Giới hạn: export tĩnh, không có prototype tương tác; `screen.png` gốc chỉ ở bề ngang mobile.
4. **Skills.** Đọc SKILL.md upstream (chưa cài, chưa chạy checker): Taste Skill 2.5 (dùng các mục "no invented figures", "one system", "equal edges" cho audit), Web Design Guidelines (chỉ là wrapper trỏ tới `command.md`, sẽ dùng ở Phase 5), Vercel React Best Practices (dùng từ Phase 3).
5. **Phụ thuộc/rủi ro.** Toàn bộ dữ liệu sẽ là mock có nhãn đến Phase 6. Earth texture cần asset có quyền dùng.
6. **Bước tiếp.** Tự chuyển Phase 2.

---

## Phase 2 — Thiết lập hợp đồng thiết kế

Trạng thái: **Hoàn thành**.

1. **Kết quả.** Chốt typography thực (thang 11 bậc, Averia cho tiêu đề, Andika cho nội dung/control, số tabular), palette có số contrast đo được (thêm `--line-strong` vì `#2A2A38` chỉ 1,4:1 cho viền control), spacing 4 px, chiều rộng 1200 px/lề 48 px, control 40 px, focus ring vàng, radius 4/8, motion (800 ms transition, reduced motion = fade). Layout mẫu cho cả 4 trang, trong đó The Eyes có popup trái 460 px trên nền Aladin full-bleed và Earth entry dạng cảnh mở không panel.
2. **Đầu ra.** `docs/DESIGN.md` (mục 7: wireframe chú thích cho Landing, Story, Where are you, The Eyes; mục 8: 8 tiêu chí review quan sát được).
3. **Kiểm chứng.** Contrast tính bằng công thức WCAG cho 16 cặp màu. Layout sẽ được kiểm bằng trình duyệt từ Phase 3.
4. **Skills.** Taste Skill: áp dụng "equal edges", "one system", "hero enters once", "pause cho vòng lặp > 5 s", "không số liệu bịa". Không áp dụng: cấm caption dưới hình (dự án cần nhãn khoa học và "Illustrative demo"), section cao đúng 100vh, ảnh chụp thật, cấm tím (accent tím không có trong palette nên không xung đột). Chưa chạy checker của skill.
5. **Phụ thuộc/rủi ro.** About Us dùng bảng vai trò trong PROJECT_CONTEXT, chờ nhóm xác nhận. Biểu đồ tự viết bằng SVG thay Plotly.
6. **Bước tiếp.** Tự chuyển Phase 3.

---

## Phase 3 — Dựng nền tảng và một luồng hoàn chỉnh

Trạng thái: **Hoàn thành** (giới hạn kiểm chứng animation ghi ở mục 3).

1. **Kết quả.**
   - Scaffold `frontend/` bằng Vite 8 + React 19 + TypeScript 7 (strict), React Router 7, TanStack Query 5, Aladin Lite 3.8.2, three 0.187 + React Three Fiber 9, motion 12, Lucide, fonts self-host qua `@fontsource` (Averia Serif Libre, Andika). Không dùng component kit; CSS thuần theo tokens.
   - Một adapter API duy nhất mỗi bản build: `httpApi` (API 0.1 đồng bộ) hoặc `mockApi` (ảnh tổng hợp sinh trong trình duyệt, mọi response mang `mode: 'mock'` và nhãn "Illustrative demo"). Mock có các kịch bản `?mock=one-frame|no-frames|error|slow|expired` để kiểm trạng thái.
   - Luồng The Eyes chạy thật: Aladin (DSS2 thật) → bấm Barnard → popup trái → tải/decode 4 khung → Play/Pause → seek → Original/Difference (thấy cặp sáng–tối). Một `activeFrameIndex` điều khiển ảnh, ngày, scrubber, crosshair. Viewport bản đồ và viewport ảnh tách riêng. Huỷ request cũ bằng AbortController + generation token; late response không ghi đè mục tiêu mới; `FRAME_NOT_FOUND` gọi lại E3 đúng một lần.
   - Earth: quả cầu R3F với texture NASA Blue Marble, `mesh.rotation.y` 48 s/vòng, tâm và viền đứng yên; Moon/Mars minh hoạ; Pause rotation; reduced motion tắt xoay; fallback ảnh tĩnh tròn (chiếu orthographic từ cùng texture) khi không có WebGL.
   - Phát hiện ngoài dự kiến: máy chủ chính CDS (`alasky.cds.unistra.fr`) trả 404 cho mọi HiPS hôm nay. Wrapper Aladin dò lần lượt các mirror chính thức (CDS → IRSA → ESA → CDS bis) và dùng mirror đầu tiên phản hồi; hiện đang chạy qua IRSA.
2. **Đầu ra.** `frontend/` (routes `/`, `/story`, `/where-are-you`, `/the-eyes`, 404). Landing và Story là placeholder ghi rõ "Page under construction" (hoàn thiện ở Phase 4). Ảnh: `docs/evidence/phase3/`.
3. **Kiểm chứng.**
   - `tsc -b` sạch. oxlint: 0 lỗi, còn cảnh báo (sửa ở Phase 5).
   - Trình duyệt 1440×900: đã thấy DSS2, marker 5 mục tiêu, popup Barnard với ảnh và nhãn demo; script kiểm tra Play làm index tăng và Pause dừng; seek tới khung 4 đổi ngày thành 2026-11-06; Difference tải 4 ảnh hiệu; nav mở thì popup đóng (state), reopen hoạt động.
   - Earth: ba ảnh cách nhau 6 s cho thấy lục địa dịch, viền tròn đứng yên.
   - Transition: bấm "Explore the sky" → `/the-eyes` sau ~620 ms.
   - **Giới hạn:** pane trình duyệt tích hợp đang ẩn nên rAF bị throttle (~2 khung/s) và CSS/motion animation đứng ở khung đầu; vì vậy chưa chụp được giữa transition (blur + veil) và tốc độ phát thực. Sẽ kiểm lại khi pane hiển thị ở Phase 5.
4. **Skills.** Vercel React Best Practices: tách bundle theo route (`lazy`), Aladin/three chỉ tải ở route của nó, giá trị tần suất cao (viewport, pointer) giữ trong ref, cleanup bitmap/AbortController.
5. **Phụ thuộc/rủi ro.** Mọi dữ liệu SPHEREx đang là mock. Aladin Lite giấy phép GPL-3 (cần nhóm xác nhận phù hợp với license repo). Texture Earth lấy từ gói npm `three-globe` (ảnh NASA Blue Marble, public domain) — nên đối chiếu nguồn gốc NASA Visible Earth trước khi nộp.
6. **Bước tiếp.** Tự chuyển Phase 4.

---

## Phase 4 — Hoàn thiện bốn trang và toàn bộ UI

Trạng thái: **Hoàn thành** (UI). Tích hợp khoa học với dữ liệu thật chưa làm — thuộc Phase 6.

1. **Kết quả.**
   - Landing đúng 4 section (Hero có preview blink "Illustrative demo" + Pause, Introduction 4 bước trên một đường thời gian, About us với vai trò thành viên, CTA tới Where are you). Artwork grain vẽ bằng SVG theo slide, đặt ngoài vùng chữ.
   - Story 6 phần với mục lục dính; nhãn "Built / Planned / Results pending"; không có số liệu hay trích dẫn bịa; phần Validation ghi rõ chờ kết quả.
   - The Eyes: popup có ảnh 392 px, cụm zoom và Expand trên ảnh, chọn detector ngay dưới player, 5 tab (Overview, Motion, Brightness, Data, More tools), tutorial lần đầu, Help + phím tắt, chế độ embed (`&embed=1`).
   - Gaia DR3 là dữ liệu thật (VizieR). VizieR của CDS cũng đang lỗi hôm nay nên wrapper dò mirror (CDS → CfA → IUCAA); lọc G < 18 trong 6′ để không bị cắt ở giới hạn số nguồn.
2. **Đầu ra.** Bốn route hoàn chỉnh; ảnh `docs/evidence/phase4/` (8 ảnh). Bảng công cụ:

| Công cụ | UI | Đã kiểm tra mock | Đã kiểm tra dữ liệu thật | Phụ thuộc còn thiếu |
| --- | --- | --- | --- | --- |
| Tìm tên / RA-Dec (2 định dạng) | Có | Có (tên, sexagesimal, lỗi RA, tên không có) | Chưa | Resolver thật (E2 + SIMBAD) |
| 5 preset | Có | Có | Toạ độ SIMBAD thật | — |
| Detector D1–D6 | Có (select + tab Data) | Có | Chưa | E3 thật |
| Lưới RA/Dec | Có | — | **Có** (Aladin) | — |
| Play/Pause, Prev/Next, speed, seek | Có | Có | Chưa | E3/E4 thật |
| Map pan/zoom/center/fullscreen | Có | — | **Có** (DSS2 qua mirror IRSA) | — |
| Image pan/zoom/Fit/FOV/crosshair/expand | Có | Có | Chưa | PNG thật |
| Original/Difference | Có | Có (dipole thấy rõ) | Chưa | E5 ảnh hiệu đã hiệu chuẩn |
| Motion trail + astrometry | Có | Có | Chưa | E7 thật; `measured_px` |
| Gaia overlay | Có | — | **Có** (VizieR I/355/gaiadr3) | — |
| Quality flags | Có | Có | Chưa | Endpoint flags chưa có trong API 0.1 |
| Light curve | Có | Có | Chưa | E6 thật, tách theo detector |
| Click spectrum | Có | Có | Chưa | Endpoint spectrum chưa có trong API 0.1 |
| False-color RGB | Có (ghép 3 detector ở FE) | Có | Chưa | E3 cho D2/D4/D6 cùng lưới |
| Share link / iframe embed | Có | Có | URL thật lúc chạy | Domain deploy |
| Help / tutorial | Có | Có | — | — |

3. **Kiểm chứng.** Trình duyệt 1440×900: Landing, Story, The Eyes (4 mục tiêu, 5 tab). Kịch bản mock: `one-frame` (Play và Difference tắt, cảnh báo FEW_FRAMES), `no-frames`, `error` (có Try again), `expired` (tự gọi lại E3 một lần rồi hiển thị). Đổi mục tiêu nhanh Barnard → RW Aur → WISE: tiêu đề và khung đều của WISE. Back trả về RW Aur đúng dữ liệu.
4. **Skills.** Taste Skill: hero vào một lần, nút có trạng thái hover/press, không thẻ lặp, không số liệu bịa, vòng lặp preview có Pause. Vercel React: Aladin/three/biểu đồ tải theo route; không thêm Plotly (biểu đồ SVG tự viết).
5. **Phụ thuộc/rủi ro.** Dữ liệu SPHEREx vẫn là mock. Flags và spectrum cần endpoint mới (đã nêu trong `FE_API_CONTRACT_NEEDS.md`). Map nền phụ thuộc mirror HiPS khi CDS lỗi.
6. **Bước tiếp.** Tự chuyển Phase 5.

---

## Phase 5 — Review trình duyệt, chỉnh thị giác và kiểm tra

Trạng thái: **Hoàn thành** (giới hạn ghi ở mục 3).

1. **Kết quả.** Review ở 1440×900 và 1366×768; sửa 10 lỗi quan sát được (bảng trong QA_REPORT mục 3), gồm ảnh tràn popup ở 1366, modal ảnh vượt chiều cao, nhãn Moon/Mars lệch, `aria-live` đọc to mỗi khung. Thêm 31 unit test cho logic dễ sai.
2. **Đầu ra.** `docs/QA_REPORT.md`, ảnh `docs/evidence/phase5/`, `frontend/src/test/*.test.ts`.
3. **Kiểm chứng.** typecheck pass; 31/31 test pass; oxlint 0 lỗi, 16 cảnh báo có chủ đích; build pass. Kiểm tra trình duyệt theo bảng QA mục 2. **Giới hạn:** pane trình duyệt tích hợp bị ẩn trong phiên nên animation (transition, drawer) đứng ở khung đầu; chỉ kiểm được logic và route, chưa có ảnh giữa hiệu ứng.
4. **Skills.** Web Interface Guidelines: đọc `command.md` thật và rà thủ công các mục (aria-label, label, focus-visible, skip link, placeholder "…", `name` cho input, kích thước ảnh, overscroll trong drawer/modal, aria-live, translate="no" cho wordmark, Pause cho vòng lặp > 5 s). Không chạy công cụ checker tự động. Taste Skill checklist: không chạy script của skill (chưa cài).
5. **Phụ thuộc/rủi ro.** Toàn bộ dữ liệu SPHEREx vẫn là mock.
6. **Bước tiếp.** Tự chuyển Phase 6.

---

## Phase 6 — Nối API thật, deploy và bàn giao

Trạng thái: **Chờ đầu vào** (tích hợp API 0.1 đã kiểm với backend cục bộ; chưa deploy).

1. **Kết quả.**
   - Repo thi đấu chưa có backend riêng ở nhánh local. Mình chạy backend FastAPI API 0.1 (chế độ fixture, FITS thật đã tải từ IRSA) từ repo luyện tập trên máy và trỏ frontend vào đó bằng `vite --mode live`. Không copy code backend.
   - Bằng chứng request/response: `GET /api/frames?ra=269.452…&detector=6&size=0.1667&max_frames=24&target_key=barnard` → 200; `GET /api/frames/observed-…-1.png` → 200 qua CORS; `/api/resolve?name=Barnards Star` → 200 (`target_key: barnard`, epoch J2000.0); `/api/health` → `mode: fixture`; `/api/photometry` → 200 với 0 điểm (UI báo "No brightness measurements"); `/api/astrometry` → 200 (chart hiển thị); toạ độ không có dữ liệu `ra=10&dec=10` → 404 `NO_FRAMES` (UI báo đúng).
   - Dữ liệu thật hiển thị đúng: Barnard D6 4,92 µm ngày 2025-08-15, WISE 0855 D6 4,96 µm, R Dra D6 4,46 µm; cảnh báo `SATURATION_POSSIBLE`, `MIXED_WAVELENGTH` từ backend; không có nhãn "Illustrative demo".
   - Sửa phát sinh: backend trả 200 với danh sách khung rỗng cho R Dra ở D3 → thêm trạng thái "No observations for detector D3"; đổi detector mặc định của RW Aur và R Dra sang D6 (fixture chỉ có D6). Thêm footer "Service: <mode>" từ `/api/health`. Thêm alias route `/where`, `/eyes` theo SRS v2 và thẻ thông tin khi bấm sao Gaia.
   - Chuẩn bị deploy: `frontend/vercel.json` (SPA rewrite, cache assets), `.env.example`, `.nvmrc`. `vite preview` bản production: 4 route reload đúng, alias chuyển hướng, 404 hiển thị.
2. **Đầu ra.** `docs/RUNBOOK.md`, `frontend/README.md`, `frontend/vercel.json`, ảnh `docs/evidence/phase6/`.
3. **Kiểm chứng.** typecheck pass, 31/31 test, build pass, oxlint 0 lỗi (16 cảnh báo). Tích hợp: request thật trên trình duyệt như mục 1. **Chưa kiểm:** IRSA live mode, Render, CORS trên domain deploy, smoke 11/11, nhiều quan sát cho mỗi mục tiêu (fixture chỉ có 1 quan sát nên không blink được với dữ liệu thật).
4. **Skills.** Vercel React Best Practices (tách chunk Earth/Aladin, `vercel.json`).
5. **Phụ thuộc/rủi ro (chặn).**
   - **Trạng thái repo thi đấu:** `origin/main` đã có 118 commit mang toàn bộ code repo luyện tập (kể cả `frontend/` cũ và `members/dong/app`) cùng `docs/SRS-v2.md`; local `main` lệch lịch sử (ahead 1, behind 118). Thư mục `frontend/` mới của mình sẽ **đụng** `frontend/` cũ khi pull/merge. Điều này cũng trái quy tắc "không copy code luyện tập" trong CLAUDE.md — cần nhóm quyết định.
   - Chưa có OpenAPI cuối, backend thi đấu deploy, dữ liệu BTC.
   - Chưa có project Vercel/đăng nhập CLI trên máy (Vercel CLI chưa cài).
6. **Bước tiếp.** Hỏi người dùng: cách xử lý `frontend/` so với `origin/main`, và project Vercel để deploy preview.

---

## Tổng kết

**Đã chạy thật:** bốn trang desktop; Aladin Lite với DSS2 thật (qua mirror khi CDS lỗi); Gaia DR3 thật (VizieR); Earth three.js xoay đúng trục với texture NASA Blue Marble; player một clock, Original/Difference, zoom ảnh, tìm kiếm, URL/Back, trạng thái lỗi; adapter HTTP đã nói chuyện với backend API 0.1 thật (fixture FITS) gồm resolve, frames, PNG, photometry, astrometry, health, NO_FRAMES; build production và deep link.

**Còn mock:** chuỗi ảnh nhiều quan sát cho blink, light curve có điểm, flags, spectrum, false-color — chạy trên dữ liệu "Illustrative demo" có nhãn. Flags và spectrum chưa có endpoint.

**File bàn giao:** `frontend/`, `docs/DESIGN_REVIEW.md`, `docs/DESIGN.md`, `docs/QA_REPORT.md`, `docs/RUNBOOK.md`, `docs/IMPLEMENTATION_PROGRESS.md`, `docs/evidence/`.

**Hạn chế:** chưa deploy; chưa xem transition ở pane hiển thị; chưa có e2e tự động; mobile chưa tối ưu; chưa commit (theo quy tắc, chờ người dùng).

---

## Cập nhật 14/11 — thay frontend cũ

Theo quyết định của Duy Hoàng: bỏ frontend cũ (repo luyện tập) trên `origin/main`, dùng frontend mới.

- Nhánh `duy-hoang/new-frontend` tạo từ `origin/main` (`7bec0fa`). Xoá 98 file của `frontend/` cũ (`git rm`), đặt `frontend/` mới và các tài liệu trong `docs/` vào.
- `vercel.json` gốc: vẫn build `frontend/` từ gốc repo, thêm rewrite SPA và cache assets. `.vercelignore`: chỉ upload `frontend/` và `vercel.json`. Bỏ `frontend/vercel.json` để chỉ còn một cấu hình.
- CI: bỏ bước `gen:types` và job Playwright `e2e` (thuộc frontend cũ); `delivery` không còn chờ `e2e`. YAML đã kiểm bằng parser.
- Kiểm chứng trên nhánh: `npm ci`, lint (0 lỗi), typecheck, 31/31 test, build trong `frontend/`; test JS gốc 219/219 (đã loại `frontend/**`); trang The Eyes chạy trên dev server.
- Chưa commit, chưa push. Tài liệu cũ (`RUN_MVP_GUIDE.md`, `QA-matrix.md`, `duyhoang_report.md`) còn nhắc đường dẫn `frontend/src/...` cũ — giữ nguyên vì là lịch sử.

---

## Vòng góp ý 1 (14/11)

| Góp ý | Đã làm |
| --- | --- |
| Chỉ Landing có navigation ngang | Header biến thể `landing`: link ngang Home/Story/Where are you/The Eyes; các trang khác giữ nút Menu + drawer trái |
| Landing có nền chuyển động, lấp lánh | Canvas sao lấp lánh toàn trang (sao sáng có tia chữ thập, trôi chậm), hai vầng sáng hồng/xanh trôi, artwork shimmer |
| Hero: sao băng, vệ tinh SPHEREx bay lơ lửng | Lớp sao băng riêng quanh hero; minh hoạ SVG tự vẽ của SPHEREx (ba lá chắn hình nón, thân, tấm pin) bay nhấp nhô 7 s |
| Title "The eyes of the galaxy" + slogan | Slogan: "Every six months, SPHEREx photographs the whole sky. See what changed." Đoạn dẫn ngắn bên dưới. Preview blink chuyển xuống "How it works" |
| Story chi tiết hơn | Thêm phân công nhóm, 4 rào cản khi dùng dữ liệu, nhóm người dùng, cấu trúc 4 trang, sơ đồ ảnh hiệu, 6 bước xử lý phía sau player, mục tiêu khoa học và cách quan sát của SPHEREx, thẻ cho 5 mục tiêu, 4 lưu ý đọc ảnh trung thực, cách kiểm thử website |
| Where are you: thêm Venus, Mercury, Sun, quay, sao băng | Mặt Trời phát sáng (halo nhấp nháy, là nguồn sáng của cảnh), Sao Thuỷ, Sao Kim, Sao Hoả, Mặt Trăng quay quanh Trái Đất; mọi thiên thể tự quay với bề mặt sinh thủ tục để thấy được chuyển động; nền sao lấp lánh có sao băng; nhãn tên bám theo vị trí 3D |
| The Eyes: cảm giác đứng trên Trái Đất | Mở với góc nhìn rộng 110° (dải Ngân Hà), lớp đồi/cây/đài quan sát minh hoạ ở chân màn hình (bật/tắt "Ground"), logo Aladin vẫn nằm trên |
| Bật/tắt RA/Dec | Nút "RA/Dec" trên thanh dưới (phím G) |
| Nút bật/tắt chuyển động của cả bầu trời | Nút "Sky motion" (phím M): bầu trời xoay theo chiều nhật động, nhanh ~700 lần, kèm ghi chú đây là minh hoạ chứ không phải dữ liệu SPHEREx; tự tắt khi chọn mục tiêu; tắt khi reduced motion |
| Tool nằm ở cạnh dưới | Thanh dock giữa đáy: RA/Dec, Sky motion, Ground, Gaia stars, Center, zoom −/+, Help, Full screen. Popup và tutorial dừng phía trên thanh |

Kiểm chứng: typecheck, 31/31 test, oxlint 0 lỗi, build pass. Trình duyệt 1440×900 và 1366×768: ảnh `docs/evidence/feedback-1/`; hai ảnh Sky motion cách 5 s cho thấy marker Barnard trôi sang phải; popup kết thúc ở y=656, thanh dưới bắt đầu ở y=668 (không đè). Sửa thêm: `getRaDec()` của Aladin trả typed array; chuẩn hoá xuống dòng LF cho 24 file bị CRLF.
