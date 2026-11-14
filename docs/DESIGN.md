# SPHEREx Explorer — design contract

Version 1 · 14/11/2026 · Desktop-first (1440×900, 1366×768). Mọi thông số ở đây là nguồn chuẩn khi triển khai; khi code khác tài liệu, sửa một trong hai và ghi lại.

Hướng thị giác: **sách khám phá thiên văn có minh hoạ**. Nền đen mực, chữ kem ấm, artwork hạt màu hồng/xanh/vàng ở các trang kể chuyện. Vùng dữ liệu và điều khiển sạch, không texture, không glow.

---

## 1. Typography

Font tải thật (self-host qua `@fontsource`), `font-display: swap`. Số dùng `font-variant-numeric: tabular-nums` ở toạ độ, ngày, bộ đếm khung.

| Token | Font | Size / line-height | Weight | Dùng cho |
| --- | --- | --- | --- | --- |
| `display` | Averia Serif Libre | 64 / 68 | 700 | Hero Landing |
| `h1` | Averia Serif Libre | 48 / 56 | 700 | Tiêu đề trang (Story, Where are you) |
| `h2` | Averia Serif Libre | 36 / 44 | 700 | Tiêu đề section |
| `h3` | Averia Serif Libre | 24 / 32 | 400 | Tên mục tiêu trong popup, tiêu đề khối |
| `h4` | Averia Serif Libre | 20 / 28 | 400 | Tiêu đề nhỏ |
| `body-lg` | Andika | 18 / 28 | 400 | Đoạn dẫn |
| `body` | Andika | 16 / 24 | 400 | Văn bản thường |
| `body-sm` | Andika | 14 / 20 | 400 | Mô tả trong popup, chú thích khoa học |
| `label` | Andika | 14 / 20 | 700 | Nút, tab, nhãn control |
| `caption` | Andika | 12 / 16 | 400 | Nguồn, ghi chú "Illustrative demo", footer gọn |
| `mono-data` | Andika + tabular-nums | 14 / 20 | 400 | RA/Dec, ngày, Frame i/n |

Không dùng chữ in hoa giãn chữ hàng loạt. Chỉ `caption` của nhãn nguồn được viết hoa nhỏ khi cần. Wordmark "SPHEREx Explorer" dùng Averia Serif Libre 20/24 700.

## 2. Màu và contrast

| Token | Giá trị | Contrast | Dùng cho |
| --- | --- | --- | --- |
| `--bg` | `#09090D` | — | Nền trang |
| `--surface` | `#17171F` | — | Popup, drawer, khối nổi |
| `--surface-2` | `#22222E` | — | Modal, hover |
| `--fg` | `#FFF3D6` | 18,0 trên bg · 16,2 trên surface | Văn bản chính |
| `--heading` | `#FFD184` | 13,9 trên bg | Tiêu đề trang kể chuyện (không dùng tràn lan trong The Eyes) |
| `--muted` | `#C9C2B7` | 11,3 trên bg · 10,1 trên surface | Văn bản phụ |
| `--primary` | `#F4EF83` | chữ `#09090D` 16,6 | Nút chính, trạng thái chọn |
| `--pink` | `#E948AC` | 5,7 trên bg | Artwork, marker predicted |
| `--blue` | `#2F9DD0` | 6,5 trên bg | Artwork, link, marker measured |
| `--olive` | `#8F942F` | 6,1 trên bg · 5,5 trên surface | Artwork, trạng thái "ok" |
| `--line` | `#2A2A38` | 1,4 (chỉ trang trí) | Divider |
| `--line-strong` | `#6B6B80` | ≥ 3:1 | Viền input, viền control (WCAG 1.4.11) |
| `--warn` | `#FFB45C` | ≥ 9 trên surface | Cảnh báo dữ liệu |
| `--danger` | `#FF8A8A` | 7,9 trên surface | Lỗi |

Điều chỉnh so với brief: thêm `--line-strong` vì `#2A2A38` không đủ 3:1 cho viền control; thêm `--warn`/`--danger` cho trạng thái. Màu accent của brand **không** mang nghĩa nhiệt độ hay độ sáng; ảnh khoa học dùng thang xám với chú giải riêng.

## 3. Spacing, chiều rộng, lưới

- Thang khoảng cách 4 px: `4 8 12 16 24 32 48 64 96`.
- Trang kể chuyện: nội dung tối đa **1200 px**, lề ngang **48 px** (1440) / **40 px** (1366). Văn bản đọc dài tối đa **68 ch**.
- **Mép trái phải bằng nhau**: mọi khối bám `.wrap`; artwork có thể tràn mép nhưng chữ không.
- Workspace The Eyes: full-bleed, lề nổi **16 px** cho các lớp đè lên bản đồ.

## 4. Control, focus, hình khối

- Radius: `4` (ảnh khoa học, input), `8` (nút, popup, modal). Không bo tròn lớn kiểu bubble; pill chỉ cho chip preset và chip chủ đề (hashtag) của Forum (duyệt 14/11, M2).
- Nút: chiều cao **40 px** (desktop), vùng chạm tối thiểu 40×40, nhãn `label`.
  - Primary: nền `--primary`, chữ `--bg`; hover sáng hơn 6%, press dịch 1 px.
  - Secondary: viền `--line-strong`, chữ `--fg`; hover nền `--surface-2`.
  - Icon button: 40×40, luôn có `aria-label` và tooltip.
- Input: nền `--bg`, viền `--line-strong`, cao 40 px, placeholder `--muted` 70%.
- Focus: `outline: 2px solid var(--primary); outline-offset: 2px` cho mọi phần tử tương tác (`:focus-visible`). Không ẩn focus.
- Trạng thái disabled: opacity 0.45 + con trỏ `not-allowed` + lý do trong tooltip.
- Icon: Lucide, nét 1.75, 18–20 px. Không dùng icon trang trí cạnh mọi tiêu đề.
- Viền: `1px solid var(--line)`; tối đa hai lớp hộp lồng nhau.

## 5. Motion

- Một hệ animation: thư viện `motion` cho popup, drawer, transition route; CSS cho hover.
- Thời lượng: hover 120 ms, popup/drawer 220 ms (ease-out), transition Earth → The Eyes **800 ms**.
- Hero Landing vào một lần khi tải. Không fade-in theo scroll, không parallax chữ.
- Vòng lặp trang trí > 5 s phải có nút Pause (Earth, preview Landing).
- `prefers-reduced-motion`: tắt xoay Earth tự động, thay transition bằng fade 200 ms, không tự phát preview. Phát chuỗi ảnh khoa học luôn do người dùng bấm.

## 6. Artwork

- Phong cách từ slide tham khảo: dải màu gradient hạt (grain) hồng → vàng → xanh, ngôi sao cánh nhọn, chấm hành tinh tròn. Vẽ lại bằng **SVG** (gradient + `feTurbulence` noise), không nhúng ảnh slide.
- Chỉ dùng ở Landing (hero, CTA), Story (đầu trang, mốc chương), Where are you (nền rất nhẹ). **Không** dùng trong The Eyes.
- Texture không đè lên chữ, input, ảnh SPHEREx, biểu đồ hay ô bản đồ Aladin. Đặt artwork ở cột riêng hoặc sau vùng chữ có nền đặc.

## 7. Layout từng trang

### 7.1 Shell chung

- Header 64 px: nút **Menu** (mở navigation trái) · wordmark · nút phụ "Open The Eyes" (trang kể chuyện). The Eyes dùng header 56 px.
- Navigation trái: drawer 300 px, 4 link (Home, Story, Where are you, The Eyes), trang hiện tại có `aria-current`. Esc đóng, focus trả về nút Menu.
- Footer chung: "Independent project using NASA SPHEREx data." + 4 link + dòng credit. Biến thể gọn 36 px ở The Eyes.

### 7.2 Landing `/` — 4 section

```text
1440 ┌──────────────────────────────────────────────────────────────┐
 64  │ ☰ SPHEREx Explorer                          [Open The Eyes]  │
     ├──────────────────────────────────────────────────────────────┤
     │ HERO (min 760)                                               │
     │  Watch the sky change.            ┌──────── 480×480 ───────┐ │
     │  Compare SPHEREx observations…    │ blink preview (canvas) │ │
     │  [Find where you are →] [Story]   │ Illustrative demo  ⏸  │ │
     │                                   └────────────────────────┘ │
     │  (artwork grain beams phía sau cột phải, không đè chữ)        │
     ├──────────────────────────────────────────────────────────────┤
     │ INTRODUCTION: "How it works" — 4 bước trên một đường thời     │
     │ gian ngang: 1 Choose a target · 2 Pick a detector ·          │
     │ 3 Step through dates · 4 Spot what changed                   │
     ├──────────────────────────────────────────────────────────────┤
     │ ABOUT US: đoạn mục đích (cột 7) | danh sách thành viên (cột 5)│
     ├──────────────────────────────────────────────────────────────┤
     │ CTA: "Start from Earth" [Find where you are →] + artwork      │
     ├──────────────────────────────────────────────────────────────┤
     │ footer                                                        │
     └──────────────────────────────────────────────────────────────┘
```

CTA chính tới `/where-are-you`. Không có hàng card lặp; bốn bước là một danh sách có số.

### 7.3 Story `/story` — 6 phần

Bố cục bài viết: mục lục dính bên trái (240 px) liệt kê 6 phần; cột chữ 68 ch. Mỗi phần: số thứ tự lớn bằng Averia, tiêu đề `h2`, đoạn văn, tuỳ chọn một hình minh hoạ hoặc bảng (ví dụ bảng detector D1–D6 ở "NASA data"). Phần nào chưa có nội dung thật hiển thị khối "Content pending from the team" rõ ràng, không bịa. Phân biệt "Planned" và "Verified" bằng nhãn chữ.

### 7.4 Where are you `/where-are-you`

```text
1440×900 (cảnh mở, nền gần đen, không panel)
 64  header
     ┌────────────────────────────────────────────────────────────┐
     │                    Where are you        (h1, kem)          │
     │                                              ● Mars        │
     │   Click to explore ──────►  ◯◯◯◯◯◯◯◯                        │
     │                            ◯ EARTH  ◯   (Ø 420 px, tâm     │
     │                             ◯◯◯◯◯◯◯◯     cố định, xoay Y)  │
     │   ● Moon                                                   │
     │        Illustrative scene — sizes and distances not to scale│
     │                                      [⏸ Pause rotation]    │
     └────────────────────────────────────────────────────────────┘
     footer
```

- Earth: cầu three.js/R3F, texture NASA Blue Marble, đèn mặt trời lệch trái, viền khí quyển mỏng xanh. Xoay `mesh.rotation.y` khoảng **48 s/vòng**, trục không lắc.
- Moon, Mars: cầu nhỏ đơn sắc trong cùng scene, đặt lệch mép. Không số liệu quỹ đạo.
- "Click to explore" là phần tử DOM; mũi tên mảnh chỉ vào Earth. Earth bấm được và có nút "Explore the sky" (DOM, bàn phím) cùng hành động.
- Fallback không WebGL: ảnh Earth tĩnh tròn + nút Explore; không ghi là đang xoay.
- Kích hoạt: khoá bấm lặp → camera tiến về Earth + blur → overlay đen → route `/the-eyes`. Reduced motion: fade.

### 7.5 The Eyes `/the-eyes` — layout mẫu khi popup mở

```text
1440×900
  56 ┌ ☰ SPHEREx Explorer │ [🔍 Search a target or RA/Dec…] [Barnard][WISE][Eps Ind B][RW Aur][R Dra] │ ? ⛶ ┐
     ├────────────────────┬──────────────────────────────────────────────────────────────────────────┤
     │ POPUP 460 px        │ ALADIN LITE (full-bleed, survey DSS2 color)                     [Grid]   │
     │ Barnard's Star   ✕  │                                                                 [Center] │
     │ Nearby red dwarf    │            ◎ Barnard's Star (marker)                            [ + ]    │
     │ ┌───────────────┐   │                                                                 [ − ]    │
     │ │ SPHEREx image │   │                                                                          │
     │ │ 390×390, ⤢    │   │                                                                          │
     │ └───────────────┘   │                                                                          │
     │ 2025-05-05 UTC · Frame 1 / 3 · D6 4.70 µm                                                       │
     │ [⏮][▶][⏭] ─●──|──|── speed [1×▾]                                                               │
     │ [Original|Difference] [Crosshair] [Fit] [−][+]                                                 │
     │ Overview | Motion | Brightness | Data | More tools                                             │
     │ (nội dung tab cuộn trong popup)                                                                │
     ├────────────────────┴──────────────────────────────────────────────────────────────────────────┤
  36 │ Independent project using NASA SPHEREx data. · Survey: DSS2 color (CDS) · Illustrative demo data │
     └──────────────────────────────────────────────────────────────────────────────────────────────┘
```

- Popup bên trái 460 px (1440) / 420 px (1366), cao toàn bộ vùng giữa header và footer, cuộn trong. Ảnh SPHEREx ≥ 390 px (1440) / 360 px (1366), nút Expand mở ảnh 720 px trong modal kèm đầy đủ player.
- Navigation và popup **loại trừ nhau**: một state `overlay = none | navigation | target`. Mở popup đóng nav; mở nav đóng popup (giữ lựa chọn mục tiêu).
- Một `activeFrameIndex` điều khiển ảnh, ngày, scrubber, marker trên ảnh và điểm trên biểu đồ.
- Thanh công cụ map dọc mép phải; attribution của Aladin luôn thấy được ở góc dưới phải.
- Nguồn survey nền và nguồn ảnh SPHEREx tách riêng: survey ghi ở footer gọn và góc map; ngày quan sát chỉ ở popup.
- Chi tiết tab: Overview (mô tả, What to look for, toạ độ + copy, khoảng quan sát), Motion (đường đi đo/dự đoán, sai số), Brightness (đường cong ánh sáng), Data (detector, bước sóng, release, khoảng thời gian, cảnh báo, flags), More tools (Gaia overlay, click spectrum, false-color RGB, share/embed).

### 7.6 Forum `/forum`, `/forum/posts/:id`, `/forum/new`, `/forum/my-posts`, `/admin/forum`

Chi tiết: `docs/ui-design/` (phương án B + editor/diff của A). Tóm tắt quy ước:

- Vùng đọc và nhập liệu: **không artwork, không glow**. Danh sách bài là các dòng phân cách `--line`, không phải lưới card.
- Feed: cột chủ đề dính 240 px bên trái (mẫu `.story-toc`), danh sách tối đa 760 px. Dưới 1000 px cột chủ đề thành chip pill xuống dòng.
- Chi tiết bài: cột chữ 72 ch + cột phụ 280 px chứa thẻ quan sát. Dưới 1000 px thẻ quan sát chuyển vào cột chữ.
- Điểm nhấn duy nhất: **thẻ quan sát** (link The Eyes) có viền trái 3 px `--blue`.
- Trạng thái luôn có chữ + icon + màu (`StatusBadge`): Draft `--muted`, Pending `--warn`, Published `--olive`, Rejected/Hidden `--danger`.
- Kiểm duyệt: danh sách 340 px + panel duyệt (mẫu popup The Eyes); dưới 1000 px chuyển thành danh sách → trang xem.
- Dialog dùng chung `shared/ui/Dialog.tsx`: focus trap, Esc, trả focus, không cuộn nền.

## 8. Tiêu chí review quan sát được

1. Computed `font-family` của h1–h4 là Averia Serif Libre, body là Andika; font đã tải (không fallback).
2. Ảnh SPHEREx trong popup ≥ 360 px ở 1366, pixel vuông (`image-smoothing` tắt).
3. Mọi control có nhãn đọc được hoặc `aria-label`; focus ring thấy rõ.
4. Mép trái/phải của nội dung trang kể chuyện bằng nhau; không cuộn ngang.
5. Không có panel bọc Earth; Earth tròn, tâm đứng yên qua nhiều ảnh chụp.
6. Không có số liệu bịa; mọi dữ liệu mock mang nhãn "Illustrative demo".
7. Navigation và popup không cùng mở; footer, attribution Aladin và toolbar không đè nhau.
8. Contrast văn bản ≥ 4,5:1; viền control ≥ 3:1.

## 9. Giả định và điểm chưa có bằng chứng

- Thành viên About Us lấy từ bảng vai trò trong `PROJECT_CONTEXT.md` (tên gọi + vai trò); chờ nhóm xác nhận link và tên đầy đủ.
- Story chỉ viết các ý có căn cứ trong tài liệu; phần "Validation and impact" để "Content pending" đến khi có kết quả thật.
- Dữ liệu ảnh, quang trắc, astrometry là fixture tổng hợp bằng code cho tới Phase 6.
- Biểu đồ dùng SVG tự viết (light curve, astrometry, spectrum có error bar) thay Plotly để giảm bundle; đổi sang Plotly nếu cần tương tác phức tạp.
- Không thay đổi quyết định đã chốt nào.
