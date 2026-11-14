# Design review: Stitch MVP → production frontend

Ngày: 14/11/2026 · Phase 1 · Người review: frontend.
Nguồn đã xem: `hcmc/docs/stitch_spherex_explorer_prototype/` (4 `code.html` + `screen.png`, bản `three.js`, `DESIGN.md` "Illustrated Astronomy Field Guide"), `references/slide-reference-01.png`, `STITCH_FIX_EARTH_AND_UI.md`, `FE_PRODUCT_DESIGN.md`, `FE_ARCHITECTURE.md`, `FE_API_CONTRACT_NEEDS.md`.

## 0. Phương pháp và giới hạn

- `screen.png` của Stitch đều ở bề ngang mobile (136–487 px). Mình mở từng `code.html` qua server tĩnh ở **1440×900** để xem bản desktop. Ảnh lưu tại `docs/evidence/phase1/`.
- Export là HTML tĩnh (Tailwind CDN, Material Symbols, three.js r125 từ CDN). Trạng thái tương tác (popup, sheet, modal RGB/share/shortcuts) chỉ đánh giá được qua markup và script đi kèm, không phải prototype có luồng thật.
- Không có link Stitch xem được. Không có code export nào dùng Aladin thật: bản đồ trong The Eyes là ảnh nền giả lập.

## 1. Đối chiếu với bối cảnh đã chốt

| Yêu cầu đã chốt | MVP hiện tại | Đánh giá |
| --- | --- | --- |
| Bốn trang riêng, route `/`, `/story`, `/where-are-you`, `/the-eyes` | Có bốn file HTML riêng | Đạt về cấu trúc |
| Landing đúng 4 section: Hero, Introduction, About Us, CTA | Hero "Watch the sky change." · "The Observation Method" (4 bước) · "Mission Purpose" · CTA "Choose a patch of sky." | Đạt; About Us chưa có thành viên, dùng nội dung chung chung |
| Story 6 phần | Chapter 01–06 đúng thứ tự ý | Đạt về khung; **nội dung bịa** (xem 3) |
| Where are you: Earth giữa, Moon và hành tinh phụ, "Click to explore", mũi tên | Có Earth three.js thật (`earthGroup.rotation.y`), Moon, Mars, nhãn "Click to explore" | Hình học đúng hướng, nhưng texture vẽ tay dạng khối, Earth nằm trong **khung vuông tối**, kèm panel telemetry lớn |
| Click Earth → zoom/blur/fade sang The Eyes | Có overlay chữ "Aligning Infrared Spectrometers..." | Chưa có transition thật; chữ trang trí |
| The Eyes: Aladin Lite là bản đồ chính | Ảnh tĩnh mô phỏng, chú thích "SPHEREx All-Sky Survey Mock / PanSTARRS DR1" | **Không đạt**: gán nhầm nguồn, không có map thật |
| Navigation trái chỉ đổi trang; popup mở thì nav đóng | Có drawer "Field Registry"; popup là sheet bên dưới map | Chưa thấy loại trừ; nav có mục thừa "Data Disclosure", nút "person" vô nghĩa |
| Popup: chuỗi ảnh đủ lớn, tên, loại, mô tả, RA/Dec, ngày, frame counter, hướng dẫn, chi tiết dữ liệu | Có đủ mục | Đạt về nội dung; ảnh blink là **ảnh chụp giao diện** chứ không phải ảnh trời |
| Một player đồng bộ ảnh/ngày/timeline/marker | "Synchronized Epoch Player" | Chỉ là markup |
| Footer chung "Independent project using NASA SPHEREx data." | Có, nhưng thêm "Epoch 2025.2 • 102 Band Spectra" | Câu chính đạt; dòng phụ là telemetry giả |
| Desktop-first | Thanh tab dưới kiểu mobile app (Home/Story/Track/The Eyes) hiển thị cả ở 1440 | **Không đạt** cho desktop |
| Tools: tìm, 5 preset, D1–D6, lưới, player, map/image zoom, Original/Difference, motion, Gaia, flags, light curve, spectrum, RGB, share/embed, help | Có search, 5 preset, grid/center/palette/share, Raw/Diff, speed, tabs Motion/Photometry/Flags, modal RGB/share/shortcuts | Thiếu: chọn detector, seek có ngày, image pan/zoom/Fit/FOV, crosshair toggle, Gaia toggle, click spectrum, tutorial lần đầu |

## 2. Giữ / Thiết kế lại / Loại bỏ

| Hạng mục | Quyết định | Lý do | Ảnh hưởng |
| --- | --- | --- | --- |
| Font Averia Serif Libre (tiêu đề) + Andika (nội dung) | **Giữ** | Đã chốt; hợp hướng "sách khám phá" | Cao |
| Palette `#09090D / #17171F / #FFF3D6 / #FFD184 / #F4EF83` + accent hồng/xanh/olive | **Giữ**, kiểm contrast ở Phase 2 | Khớp brief và `DESIGN.md` của Stitch | Cao |
| Nút chính vàng nhạt chữ đen | **Giữ** | Rõ affordance | TB |
| Copy Hero "Watch the sky change." + câu phụ | **Giữ** | Ngắn, đúng sản phẩm | TB |
| 4 bước Introduction (Target → View → Step through dates → Spot movement) | **Giữ ý**, viết lại câu | Đúng luồng; câu hiện có bịa ("instant point-spread photometry", "Δt = 6 Mos") | TB |
| Nhóm thông tin popup (mô tả, "What to look for", player, toạ độ, tabs) | **Giữ cấu trúc**, thiết kế lại bố cục | Đúng nhu cầu người không chuyên | Cao |
| Modal Share (URL + iframe), Shortcuts | **Giữ ý** | Đúng công cụ đã chốt; iframe phải trỏ domain thật | TB |
| Earth three.js xoay quanh trục Y | **Thiết kế lại**: texture thật (Blue Marble/NASA, ghi nguồn), cảnh mở không khung, 380–440 px | Đúng hình học nhưng hình ảnh sai; khung vuông bị cấm | Cao |
| Popup The Eyes là sheet dưới map | **Thiết kế lại**: popup bên trái trên nền Aladin full-bleed (desktop) | Đã chốt trong FE_PRODUCT_DESIGN; map là hero | Cao |
| Player | **Thiết kế lại**: một clock, scrubber có tick ngày, ảnh lớn có Expand | Ảnh hiện quá nhỏ để thấy chuyển động 1–2 px | Cao |
| Header | **Thiết kế lại**: wordmark + nút Menu (nav trái), bỏ nút "person", bỏ "Back" mũi tên vô hướng | Không có tài khoản người dùng | TB |
| Tabs khoa học Motion/Photometry/Flags | **Thiết kế lại** thành Overview · Motion · Brightness · Data; thêm Gaia/Spectrum/RGB vào "More tools" | Đủ công cụ, tên dễ hiểu | TB |
| Thanh tab dưới kiểu mobile | **Loại bỏ** ở desktop | Trùng nav, chiếm chỗ toolbar | TB |
| Panel "Observer Horizon", "Sub-Solar Point 12° 28′ N", "Orbital Period 97.4 Minutes", "L2 HALO", "Axis 23.4° tilt • 52s cycle", "Orbital Vantage Point • L2 / GEO-Track" | **Loại bỏ** | Telemetry bịa, sai sự thật (SPHEREx ở quỹ đạo LEO đồng bộ mặt trời, không phải L2) | Cao |
| "Field Registry", "Data Disclosure", "Epoch 2025.2 • 102 Band Spectra", "Multi-Epoch Spectral Sky" badge, "3 Verified Passes", "Difference Blink Active" | **Loại bỏ** | Badge vô nghĩa | TB |
| Số liệu khoa học bịa trong popup: "Gaia DR3 4472832130", "S/N: 148.4", "Variability index 0.03", "L2_SPECTRA_v1.4b", "Stray Light: Clear", "Current Offset +4.21s E", "Δr +5.12″" | **Loại bỏ** | Dữ liệu tự bịa; chỉ hiện khi API trả | Cao |
| Story: "piloted across 4 STEM academies", "94% Faster Concept Grasp", trích dẫn "Dr. L. Morales", "high-fidelity synthetic model streams" | **Loại bỏ** | Kết quả và nhân vật bịa | Cao |
| Chú thích map "SPHEREx All-Sky Survey Mock / PanSTARRS DR1" | **Loại bỏ** | Gán nhầm nguồn; survey nền phải ghi đúng tên HiPS thật | Cao |
| Ảnh blink là screenshot giao diện FITS | **Loại bỏ** | Không phải dữ liệu; thay bằng fixture có nhãn "Illustrative demo" | Cao |
| Overlay "Aligning Infrared Spectrometers…" | **Loại bỏ** | Trang trí; transition là zoom/blur/fade không chữ | Thấp |
| Iframe `https://spherex.explorer.space/embed/...` | **Loại bỏ** | Domain không tồn tại; lấy origin thực lúc chạy | TB |

## 3. Kiểm kê assets

| Asset | Nguồn | Quyền dùng | Thật / minh hoạ | Hành động |
| --- | --- | --- | --- | --- |
| Earth texture (canvas vẽ tay trong export) | Stitch sinh | Không rõ | Minh hoạ, xấu | Thay bằng NASA Blue Marble (public domain, ghi "NASA Visible Earth") |
| Ảnh nền map mô phỏng | Stitch/stock không rõ | Không rõ | Giả | Bỏ; dùng Aladin + HiPS (DSS2 color, CDS), giữ attribution của Aladin |
| Ảnh "blink" trong popup | Screenshot UI | Không rõ | Giả | Bỏ; thay bằng fixture tổng hợp sinh bằng code, nhãn "Illustrative demo" |
| Slide tham khảo "The eyes of the galaxy" | Nhóm MINIONS | Của nhóm | Tham khảo artwork | Dùng làm hướng; vẽ lại artwork bằng SVG (gradient beam, grain, starburst, chấm hành tinh), không nhúng ảnh slide |
| Material Symbols | Google Fonts | Apache 2.0 | Icon | Thay bằng Lucide (tree-shake, không tải font icon) |
| Fonts Averia Serif Libre, Andika | Google Fonts | OFL | — | Self-host qua `@fontsource` hoặc Google Fonts link |
| Moon/Mars | Stitch: màu đơn sắc | — | Minh hoạ | Giữ dạng cầu màu đơn giản, ghi "Illustrative scene" |

## 4. Tận dụng export hay viết lại

- **Viết lại toàn bộ** bằng React + TypeScript + Vite. Export dùng Tailwind CDN, class lặp, script inline, three.js r125 global: không đưa vào repo.
- **Tận dụng làm tài liệu:** token màu và typography scale trong `DESIGN.md`, copy Hero, thứ tự 4 bước, nhóm thông tin popup, danh sách phím tắt.
- Repo luyện tập: chỉ lấy bài học (huỷ request cũ, đồng bộ metadata với ảnh, `crossOrigin`, quy ước `predicted_px` `(x+0.5)·scale`, không gọi lại API khi zoom). Không copy code.

## 5. Chênh lệch yêu cầu (gap list)

1. Không có Aladin thật → Phase 3 dựng wrapper Aladin Lite.
2. Thiếu detector D1–D6, seek theo ngày, image pan/zoom/Fit/FOV, crosshair toggle, Gaia toggle, click spectrum, tutorial.
3. Không có loại trừ nav/popup, không có transition Earth → The Eyes thật.
4. Không có trạng thái loading/cancel/error/one-frame/no-data.
5. Bố cục desktop là mobile kéo giãn.
6. Nội dung bịa ở Story, popup và Where are you.

## 6. Backlog ưu tiên

| P | Việc | Phase |
| --- | --- | --- |
| P0 | DESIGN.md: tokens, contrast, layout bốn trang, composition The Eyes có popup và Earth entry | 2 |
| P0 | Scaffold Vite/React/TS, router 4 trang, fonts, tokens, shell, footer | 3 |
| P0 | Wrapper Aladin Lite + 5 marker; popup loại trừ nav; player một clock với fixture có nhãn | 3 |
| P0 | Earth three.js/R3F với texture thật, Pause, reduced motion, fallback tĩnh | 3 |
| P1 | Đầy đủ tools trong The Eyes (detector, seek, image viewport, motion, brightness, flags, Gaia, spectrum, RGB, share/embed, help) | 4 |
| P1 | Landing 4 section, Story 6 phần, artwork SVG grain | 4 |
| P1 | States: loading/cancel/retry/empty/one-frame/image error/map error | 4 |
| P2 | Test logic (toạ độ, URL, player, race), QA 1440 và 1366 | 5 |
| P2 | Nối API thật, Vercel, runbook | 6 |
