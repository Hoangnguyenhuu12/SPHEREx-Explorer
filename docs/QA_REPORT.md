# QA report — SPHEREx Explorer frontend

Ngày: 14/11/2026 · Phase 5 · Môi trường: Vite dev server, trình duyệt tích hợp của Claude desktop (Chromium), viewport giả lập 1440×900 và 1366×768. Dữ liệu SPHEREx: **mock có nhãn**. Bản đồ nền và Gaia: **dữ liệu thật**.

## 1. Kết quả kiểm tra tự động

| Kiểm tra | Lệnh | Kết quả |
| --- | --- | --- |
| Typecheck (strict) | `npm run typecheck` | Pass |
| Unit test | `npm test` | **31/31 pass** (3 file) |
| Lint | `npx oxlint` | 0 lỗi, 16 cảnh báo (xem mục 5) |
| Build | `npm run build` | Pass. Chunk lớn: The Eyes 2,47 MB (Aladin Lite kèm WASM), Earth 0,92 MB (three.js) — đều tải theo route |

Unit test bao gồm: phân tích toạ độ (thập phân, sexagesimal, chữ h/m/s, dấu trừ Unicode, Dec từ 0 đến −1°, giá trị ngoài miền, phút/giây ≥ 60), làm tròn không ra "60 giây", codec URL (giữ dấu `+`/`−` qua mã hoá, loại detector/FOV sai), reducer player (wrap, seek kẹp và dừng, không phát khi 1 khung, reset khi đổi chuỗi), loại trừ navigation/popup, toán viewport (fit số nguyên, crosshair `(x+0.5)·scale`, zoom giữ điểm dưới con trỏ, FOV ↔ scale), chuyển pixel ↔ trời (tâm, Bắc lên Đông trái, khứ hồi, RA quấn qua 0°).

## 2. Kiểm tra trên trình duyệt

| Hạng mục | 1440×900 | 1366×768 | Ghi chú |
| --- | --- | --- | --- |
| Font thật | Pass | Pass | `document.fonts.check` đúng cho Averia Serif Libre 700 và Andika; computed font tiêu đề = Averia, body = Andika |
| Không cuộn ngang | Pass | Pass | `scrollWidth == innerWidth` |
| Landing 4 section | Pass | Pass | Hero, How it works, About us, Start from Earth |
| Story 6 phần | Pass | — | Mục lục dính, nhãn Built/Planned/Results pending |
| Where are you | Pass | Pass | Earth 409 px (1440) / 344 px (1366), không panel bọc; nút và caption trong màn đầu sau khi sửa |
| Earth xoay đúng trục | Pass | Pass | Ảnh cách nhau 6–12 s: lục địa dịch, viền tròn và tâm cố định (`docs/evidence/phase3/earth-rotation-*`) |
| Pause / reduced motion | Pass (logic) | — | Nút Pause đổi trạng thái; reduced motion tắt xoay và dùng fade |
| Transition Earth → The Eyes | Pass (route) | — | Đến `/the-eyes` sau ~620 ms. **Chưa chụp được giữa hiệu ứng**: pane bị ẩn nên animation đứng ở khung đầu |
| Aladin DSS2 thật | Pass | Pass | Qua mirror IRSA vì máy chủ chính CDS trả 404 hôm nay |
| Popup ↔ navigation loại trừ | Pass | Pass | Mở nav → popup gỡ khỏi DOM; nút "Show …" mở lại |
| Ảnh SPHEREx ≥ 360 px | 428 px khung, ảnh 392 px | 400 px khung, ảnh 392 px | Sau khi tăng popup 1366 lên 444 px |
| Ảnh mở rộng | Pass | Pass | Modal nằm trong viewport (26–762 px ở 768) |
| Player đồng bộ | Pass | — | Play tăng index; seek → ngày đổi đúng; crosshair theo khung |
| Original/Difference | Pass | — | Barnard: cặp sáng–tối rõ ở khung 4 |
| Đổi mục tiêu nhanh | Pass | — | Barnard → RW Aur → WISE: tiêu đề và khung đều của WISE |
| Back/Forward, deep link | Pass | — | `?q=rwaur` reload và Back đều mở đúng mục tiêu |
| Tìm kiếm | Pass | — | Sexagesimal, tên, tên không có (toast), toạ độ sai (lỗi tại ô, focus về ô) |
| 1 khung / không có khung / lỗi / ảnh hết hạn | Pass | — | Kịch bản `?mock=`: Play và Difference tắt khi 1 khung; NO_FRAMES và UPSTREAM_ERROR có thông báo; FRAME_NOT_FOUND tự gọi lại một lần |
| Gaia DR3 thật | Pass | — | 1.500 nguồn G < 18 trong 6′ quanh Barnard (VizieR mirror CfA) |
| Footer / attribution / toolbar không đè nhau | Pass | Pass | Logo Aladin góc dưới phải trên footer 36 px |
| Bàn phím | Pass | Pass | Tab đầu tiên tới "Skip to content", focus ring vàng 2 px; Esc đóng popup/nav/modal |

Ảnh bằng chứng: `docs/evidence/phase3/`, `phase4/`, `phase5/`.

## 3. Lỗi tìm thấy và đã sửa trong Phase 3–5

| Lỗi | Ảnh hưởng | Sửa |
| --- | --- | --- |
| Aladin đặt `position: relative` lên host nên bản đồ cao 0 px | Bản đồ đen | Bọc host trong div absolute |
| Máy chủ CDS (HiPS và VizieR) lỗi | Bản đồ và Gaia không tải | Dò mirror chính thức theo thứ tự |
| ResizeObserver giữ closure cũ của hàm vẽ | Canvas ảnh đen sau khi đổi layout | Gọi hàm vẽ qua ref |
| Lần fit đầu ghi `fov=10` vào URL | URL nhiễu | Chỉ ghi khi người dùng zoom |
| Ảnh tràn popup ở 1366 (grid `min-width: auto`) | Cụm zoom bị cắt | `min-width: 0`, popup 444 px |
| Modal ảnh mở rộng vượt chiều cao 768 | Tiêu đề bị cắt | Giới hạn chiều cao theo viewport |
| Nhãn Moon/Mars đặt theo % | Lệch khỏi quả cầu khi đổi kích thước | Chiếu từ vị trí 3D mỗi khung |
| Gaia chạm giới hạn 2.000 nguồn | Overlay bị cắt nửa vòng | Lọc G < 18, sắp theo độ sáng, bán kính 6′ |
| `aria-live` trên dòng ngày | Đọc to mỗi khung khi phát | Bỏ; chỉ thông báo trạng thái tải/lỗi |
| Tutorial hiện sau drawer navigation | Chồng lớp | Ẩn khi có overlay |

## 4. Đối chiếu tiêu chí DESIGN.md mục 8

1. Font đã tải — **đạt**. 2. Ảnh ≥ 360 px, pixel vuông — **đạt**. 3. Control có nhãn, focus thấy rõ — **đạt** (đã rà theo Web Interface Guidelines). 4. Mép trái/phải bằng nhau, không cuộn ngang — **đạt**. 5. Earth không panel, tròn, tâm đứng yên — **đạt**. 6. Không số liệu bịa; mock có nhãn — **đạt**. 7. Nav và popup không cùng mở; footer/attribution/toolbar không đè — **đạt**. 8. Contrast văn bản ≥ 4,5:1, viền control ≥ 3:1 — **đạt** theo tính toán token; chưa đo bằng công cụ tự động.

## 5. Còn mở

| Mức | Vấn đề | Ghi chú |
| --- | --- | --- |
| Cao | Chưa có dữ liệu SPHEREx thật | Phụ thuộc backend (Phase 6) |
| Trung bình | Chưa chụp được transition và tốc độ phát ở pane hiển thị | Pane trình duyệt bị ẩn trong phiên này; nên xem lại trên trình duyệt thường |
| Trung bình | Flags và spectrum chưa có endpoint trong API 0.1 | Đã đề xuất trong `FE_API_CONTRACT_NEEDS.md` |
| Thấp | 16 cảnh báo oxlint (React Compiler: mutate đối tượng three.js, setState đồng bộ khi reset) | Không ảnh hưởng hành vi; để lại có chủ đích |
| Thấp | Chunk The Eyes 2,47 MB | Do Aladin Lite đóng gói WASM; đã tách route |
| Thấp | Chưa có test e2e tự động (Playwright) | Luồng chính được kiểm bằng trình duyệt tích hợp |
| Thấp | Mobile chưa tối ưu | Ngoài phạm vi desktop-first |

Không có khẳng định "hết mùi AI". Thay đổi quan sát được so với Stitch: bỏ toàn bộ telemetry và số liệu bịa, bỏ thanh tab mobile trên desktop, Earth là quả cầu thật không khung, bản đồ là Aladin thật, popup trái với ảnh lớn có thể mở rộng.
