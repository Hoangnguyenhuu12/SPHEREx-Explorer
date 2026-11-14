# Forum cộng đồng: các phương án UI/UX

Ngày: 14/11/2026. Dựa trên `FEATURE_UI_ANALYSIS.md`.

> **Quyết định (14/11):** chọn phương án khuyến nghị ở §6: B làm khung, editor và diff theo A, giao 2 đợt. Kế hoạch chi tiết ở `UI_IMPLEMENTATION_PLAN.md` (đang chờ duyệt, chưa code).

Cả ba phương án cùng:
- đáp ứng FR-01 → FR-13 và D01 → D06;
- dùng nguyên token, font, màu, radius, icon Lucide của `DESIGN.md`;
- dùng chung các khối: `StatusBadge`, `TagChip`, `ObservationLinkCard`, `ReasonDialog`, `MarkdownView`, `AuthProvider` mock;
- chạy bằng React 19 + React Router 7 + TanStack Query hiện có, không thêm thư viện UI.

Khác nhau ở **cách tổ chức thông tin và luồng thao tác**, không phải ở màu.

Phần chung trước, ba phương án sau.

---

## 0. Phần dùng chung cho mọi phương án

### 0.1. Điểm nhấn duy nhất: thẻ link quan sát

Bài nào có link The Eyes thì hiện thành một thẻ, thay vì một URL dài:

```text
┌──────────────────────────────────────────────────────────┐
│ ◎  Barnard's Star                                         │
│    Detector D6 · 10′ field                                │
│    [Open in The Eyes]                                     │
└──────────────────────────────────────────────────────────┘
```

- Dữ liệu lấy bằng `parseSelection()` từ chính link, không gọi API, không tự suy ra kết luận khoa học (AC14).
- Viền trái 3px màu `--blue` (màu "measured" của sản phẩm), nền `--surface`. Đây là chỗ duy nhất Forum có nhấn màu ngoài nút primary.
- Link ngoài (không phải The Eyes) chỉ hiện dạng link thường có icon external.

### 0.2. Trạng thái: chữ + icon + màu

| Trạng thái | Icon Lucide | Màu | Ai thấy |
| --- | --- | --- | --- |
| Draft | `PencilLine` | `--muted` | Tác giả |
| Pending review | `Clock` | `--warn` | Tác giả, admin |
| Published | `CircleCheck` | `--olive` | Tác giả (trong My posts) |
| Edit pending | `Clock` cạnh Published | `--warn` | Tác giả |
| Rejected | `CircleAlert` | `--danger` | Tác giả |
| Withdrawn | `Undo2` | `--muted` | Tác giả |
| Hidden | `EyeOff` | `--danger` | Tác giả, admin |

Người đọc công khai không thấy badge nào (mọi bài họ thấy đều là Published).

### 0.3. Nhãn chống hiểu nhầm khoa học

Một dòng `caption` cố định dưới nội dung mỗi bài: *"Community post. Reviewed for our community rules, not for scientific accuracy."* (BA §1, rủi ro §13). Copy cuối cùng cần nhóm duyệt.

### 0.4. Đăng nhập

- `AuthProvider` mock giữ `{ userId, email, displayName, role }` trong bộ nhớ và `sessionStorage` (không lưu mật khẩu). Trang Log in hiện có gọi vào provider này.
- Bản demo có công tắc vai trò "Member / Admin" trong `AccountMenu`, gắn nhãn **Demo** rõ ràng. Cần duyệt (mục 1.8 của bản phân tích).
- Khách bấm hành động đóng góp → `/login?returnTo=<đường dẫn nội bộ>`; chỉ chấp nhận đường dẫn bắt đầu bằng `/`.

### 0.5. Header

- `NAV` thêm "Forum" (icon `MessagesSquare`) ở cuối, nên nó tự có trên topnav Landing, drawer và footer.
- Khi đã đăng nhập: cặp nút Log in/Sign up thay bằng `AccountMenu` (display name + menu: My posts, Moderation khi là admin, Log out).

---

## OPTION A: Simple & Practical, "Bảng tin một cột"

### 1. Concept

Forum là một trang đọc giống Story: một cột chữ hẹp, mọi thứ xếp theo chiều dọc. Ít quyết định bố cục, ít component mới, nhanh nhất để có bản chạy được.

### 2. Cấu trúc màn hình

S1 feed · S2 chi tiết · S3 editor · S4 My posts · S5 admin 3 tab (mỗi bản gửi mở trang riêng S5a).

### 3. Bố cục

**S1 Feed (desktop 1440)**

```text
 64  ☰ SPHEREx Explorer                                   [Write a post] (Account)
     ┌──────────── .wrap, cột nội dung 760px, căn trái ────────────┐
     │ Forum                                         (h1)          │
     │ Ask about SPHEREx images and share what you found.           │
     │ [🔍 Search posts…                     ] [Tag: All ▾]         │
     │ ──────────────────────────────────────────────────────────── │
     │ How do I tell a moving star from noise?          (h4)        │
     │ I blinked Barnard's Star in D6 and saw a pair of…  (2 dòng)  │
     │ #questions #moving-stars        Linh · 2 days ago · 4 comments│
     │ ──────────────────────────────────────────────────────────── │
     │ …                                                            │
     │                [← Newer]  Page 2 of 5  [Older →]             │
     └──────────────────────────────────────────────────────────────┘
```

**S2 Chi tiết**: một cột 68ch: tiêu đề h2, meta, tag, nội dung, thẻ link quan sát, nhãn cộng đồng, rồi "Comments (n)", danh sách bình luận, ô bình luận. Tác giả thấy một `notice` ở đầu bài khi có bản chờ/bị từ chối.

**S3 Editor**: một cột: nhắc quy trình (notice info), Title, `segmented` Write | Preview, textarea, Tags (danh sách checkbox chip), Links, rồi hàng nút [Save draft] [Submit for review].

**S4 My posts**: `segmented` All | Drafts | Pending | Published | Rejected, sau đó là danh sách dòng có badge.

**S5 Admin**: `.tabs` Queue | Reports | Hashtags; Queue là bảng (tiêu đề, tác giả, loại First post/Edit, gửi lúc); bấm dòng mở `/admin/forum/queue/:id` có nội dung đầy đủ, diff (nếu là bản sửa) và [Approve] [Reject].

### 4. Components

Tái dùng: `.btn`, `.input`, `.select` (lọc tag), `.segmented`, `.tabs`, `.notice`, `.modal`. Mới: chỉ bộ chung ở mục 0, `PostListItem`, `Pagination`, `RevisionDiff` dạng hai khối trên/dưới.

### 5. Tương tác

- Tag lọc bằng `select`, giữ trong URL.
- Thông báo kết quả duyệt: một khối "Updates" ở đầu S4, không có biểu tượng chuông.
- Mọi quyết định của admin cần qua trang chi tiết, xong quay lại hàng đợi.

### 6. Responsive

Một cột nên đổi rất ít: dưới 720px search và select xếp chồng; nút editor dồn vào thanh cố định dưới cùng.

### 7. Nhất quán

Giống Story (cột 68ch, tiêu đề Averia, divider `--line`). Không thêm mẫu bố cục mới.

### 8. Ưu điểm

Nhanh nhất; ít lỗi; dễ đọc trên mobile; dễ cho nhóm khác sửa.

### 9. Đánh đổi

- Tag ẩn trong dropdown, người mới không biết có những chủ đề nào (giảm khả năng khám phá).
- Admin phải qua lại giữa danh sách và trang chi tiết; duyệt nhiều bài chậm.
- Tác giả phải vào My posts mới biết bài bị từ chối.

### 10. Độ phức tạp

**Thấp.** Khoảng 5 trang + 10 component nhỏ.

---

## OPTION B: UX Optimized, "Sổ quan sát có mục lục"

### 1. Concept

Mượn bố cục mục lục dính của Story: cột trái là "mục lục" của Forum (chủ đề và việc của tôi), cột phải là nội dung. Người mới thấy ngay có những chủ đề nào; thành viên thấy ngay bài nào cần mình xử lý; admin duyệt theo kiểu danh sách + panel như The Eyes.

### 2. Cấu trúc màn hình

S1 feed (2 cột) · S2 chi tiết (bài + cột phụ) · S3 editor · S4 My posts (nhóm theo việc cần làm) · S5 admin master-detail (không cần trang S5a riêng trên desktop).

### 3. Bố cục

**S1 Feed (desktop 1440)**

```text
 64  ☰ SPHEREx Explorer                                   [Write a post] (Account ▾)
     ┌─ 240px sticky ──────┐ ┌──────────── danh sách, tối đa 760px ─────────────┐
     │ Forum         (h1)  │ │ [🔍 Search posts…                             ]   │
     │                     │ │ Showing 12 posts in #moving-stars   [Clear]       │
     │ Topics              │ │ ───────────────────────────────────────────────── │
     │  All posts      48  │ │ How do I tell a moving star from noise?   (h4)    │
     │ ▌#moving-stars  12  │ │ I blinked Barnard's Star in D6 and saw…           │
     │  #variable-stars 9  │ │ ◎ Barnard's Star · D6                             │
     │  #brown-dwarfs   4  │ │ #questions #moving-stars   Linh · 2 days · 4 cmts │
     │  #questions     15  │ │ ───────────────────────────────────────────────── │
     │  …                  │ │ …                                                 │
     │                     │ │                 [Newer]  2 / 5  [Older]           │
     │ Your posts (đã login)│ └──────────────────────────────────────────────────┘
     │  Needs action    1  │
     │  Pending review  2  │
     │                     │
     │ Community rules ↗   │
     └─────────────────────┘
```

- Danh sách tag có số bài (chỉ đếm bài công khai, AC10), tag đang chọn có viền trái `--primary` như drawer.
- Dòng bài có thêm một dòng mục tiêu quan sát khi bài có link The Eyes, nên người đọc lướt thấy bài nói về sao nào.
- Khối "Your posts" chỉ hiện khi đã đăng nhập; "Needs action" = bị từ chối hoặc bị ẩn. Đây là nơi hiện thông báo (A09), không cần chuông.

**S2 Chi tiết**

```text
     ┌─ cột bài 68ch ────────────────────────────┐ ┌─ 280px ──────────────────┐
     │ ← Forum                                    │ │ Observation              │
     │ How do I tell a moving star from noise?(h2)│ │ ┌──────────────────────┐ │
     │ Linh · 12 Nov 2026 · Edited 13 Nov         │ │ │◎ Barnard's Star      │ │
     │ #questions #moving-stars                   │ │ │  D6 · 10′            │ │
     │                                            │ │ │ [Open in The Eyes]   │ │
     │ (nội dung bài)                             │ │ └──────────────────────┘ │
     │                                            │ │ Topics                   │
     │ Community post. Reviewed for our rules,…   │ │  #questions #moving-…    │
     │ [Report]                                   │ │ [Report post]            │
     │ ─────────────────────────────────────────  │ └──────────────────────────┘
     │ 4 comments                                 │
     │ (bình luận …)               [Report]       │
     │ ┌ Add a comment ─────────────────────────┐ │
     │ │                                        │ │
     │ └────────────────────────── [Comment] ───┘ │
     └────────────────────────────────────────────┘
```

Tác giả thấy thêm một khối trạng thái ở đầu cột phụ: badge, lý do từ chối (nếu có), [Edit and resubmit] / [Withdraw] / [Suggest an edit].

**S3 Editor**: cột chính 68ch (Title, Write | Preview, Tags, Links) + cột phụ 280px "Before you submit": 3 dòng điều admin kiểm tra (on topic, no personal info, add context or source), trạng thái lưu nháp ("Saved 2 min ago"), nút [Submit for review] và [Save draft] luôn thấy khi cuộn (sticky).

**S4 My posts**: nhóm theo việc, không theo bảng trạng thái:

```text
 Needs your action (1)   ← Rejected / Hidden, kèm lý do ngay trong dòng
 In review (2)           ← Pending, Edit pending; [Withdraw]
 Drafts (1)
 Published (5)
```

**S5 Admin master-detail**

```text
 [Queue 3] [Reports 1] [Hashtags]
 ┌─ 360px danh sách ─────────┐ ┌─ panel xem ──────────────────────────────────────┐
 │ ▌How do I tell…  First post│ │ Edit to "Seasonal change in R Dra"   Linh · 2h  │
 │  Seasonal change… Edit     │ │ [Published] [Proposed] [Side by side]           │
 │  WISE 0855 in D5  First    │ │ Title: unchanged                                │
 │                            │ │ Tags:  − #questions  + #variable-stars          │
 │ Oldest first               │ │ Body:  (đoạn đổi được đánh dấu thêm/bớt)        │
 │                            │ │ Links: + /the-eyes?q=R+Dra&det=4                │
 │                            │ │ ─────────────────────────────────────────────── │
 │                            │ │ Reviewing revision 3   [Reject…]  [Approve]     │
 └────────────────────────────┘ └──────────────────────────────────────────────────┘
```

- Approve/Reject xong tự chuyển sang bản kế tiếp trong hàng đợi.
- Nếu server trả 409: notice warn "This submission was withdrawn by the author" / "Already approved by another moderator", nút [Reload], và hai nút quyết định bị khoá.

### 4. Components

Tái dùng như A, thêm: `TopicList` (dùng lại style `.nav-drawer a` / `.story-toc`), `AsideCard`, `RevisionDiff` có 3 chế độ xem, `MasterDetail` layout.

### 5. Tương tác

- Lọc tag bằng một cú bấm ở cột trái (không mở dropdown); URL `?tag=` cập nhật, Back hoạt động.
- Tìm kiếm debounce 300ms, Enter để tìm ngay; kết quả ghi rõ "Showing n posts for 'x' in #tag".
- Thông báo nằm trong "Your posts" của cột trái và mục "Needs your action" của S4.
- Bàn phím trong hàng đợi admin: ↑/↓ chọn bài; Approve/Reject vẫn là nút, không gán phím tắt để tránh duyệt nhầm.

### 6. Responsive

| | ≥ 1000px | 720–999px | < 720px |
| --- | --- | --- | --- |
| S1 cột trái | Sticky 240px | Thành hàng chip tag cuộn ngang (có nhãn "Topics") phía trên danh sách; "Your posts" thành một link | Như tablet; search full width |
| S2 cột phụ | 280px bên phải | Thẻ quan sát và khối trạng thái chuyển lên trên nội dung | Như tablet |
| S3 cột phụ | Sticky | Checklist thu thành `details` "Before you submit"; nút dồn xuống thanh dưới | Như tablet |
| S5 | Master-detail | Danh sách → trang xem riêng `/admin/forum/queue/:id` | Như tablet; diff xếp dọc |

### 7. Nhất quán

Cột trái dính = mẫu `.story-toc`; mục đang chọn có viền trái primary = mẫu `NavDrawer`; master-detail = mẫu popup The Eyes. Không có mẫu bố cục nào chưa từng xuất hiện trong sản phẩm.

### 8. Ưu điểm

- Người mới thấy toàn bộ chủ đề ngay (khám phá tốt hơn A).
- Tác giả thấy "Needs action" ở mọi trang Forum, không bỏ lỡ bài bị từ chối.
- Thẻ quan sát trong danh sách gắn Forum với dữ liệu SPHEREx.
- Admin duyệt nhanh, ít chuyển trang; diff rõ cho D03.

### 9. Đánh đổi

- Nhiều component hơn A (cột phụ, master-detail, 3 chế độ diff).
- Bộ đếm tag phụ thuộc API trả count; mock phải mô phỏng đúng.
- Trên tablet/mobile cần thêm một biến thể (chip cuộn ngang).

### 10. Độ phức tạp

**Trung bình.** Khoảng 1,6 lần khối lượng A.

---

## OPTION C: Engagement Focused, "Thảo luận theo mục tiêu" (chỉ phù hợp một phần)

### 1. Concept

Lấy năm mục tiêu mẫu (Barnard, WISE 0855, Eps Ind B, RW Aur, R Dra) làm lối vào: mỗi mục tiêu có "góc thảo luận" riêng; The Eyes có nút "Discuss this target" mở editor với link quan sát điền sẵn.

### 2–7. Tóm tắt

- S1 có dải 5 thẻ mục tiêu phía trên feed (tên + số bài), bấm vào thì lọc.
- S2 thêm "More about this target" (các bài khác cùng mục tiêu).
- The Eyes (popup, tab More tools) thêm "Discuss in Forum"; editor tự điền link quan sát.
- Bài hướng dẫn được ghim (pinned) ở đầu feed.

### 8. Ưu điểm

Vòng lặp "quan sát → thảo luận → quay lại" của BA §1 ngắn nhất: một cú bấm từ The Eyes.

### 9. Đánh đổi (lý do không khuyến nghị lúc này)

- **Vượt phạm vi:** lọc theo mục tiêu, ghim bài và nút trong The Eyes không có trong requirement; BA §3 dặn không ép Forum vào bốn route cũ; BA §5 loại like/vote/follow, nên phần "engagement" thực chất còn rất ít.
- Lọc theo mục tiêu cần backend hiểu link quan sát (phân loại thứ hai, ngoài hashtag), mâu thuẫn tinh thần D04 (phân loại chỉ bằng tag do admin quản lý).

### 10. Độ phức tạp

**Cao** (đụng The Eyes, cần thêm trường dữ liệu).

Đề xuất giữ C làm **danh sách ý tưởng cho giai đoạn sau**. Riêng nút "Discuss in Forum" (điền sẵn link) có thể xin duyệt riêng vì nó nhỏ.

---

## 5. So sánh

| Tiêu chí | A: Bảng tin một cột | B: Sổ quan sát có mục lục | C: Theo mục tiêu |
| --- | --- | --- | --- |
| Usability (người đọc) | Tốt, nhưng tag bị ẩn | **Tốt nhất**: thấy chủ đề và số bài ngay | Tốt cho 5 mục tiêu, kém cho chủ đề khác |
| Usability (tác giả) | Phải vào My posts mới biết bị từ chối | **"Needs action" luôn thấy** | Như B |
| Usability (admin) | Qua lại nhiều trang | **Master-detail, tự sang bài kế** | Như B |
| Visual consistency | Rất cao (giống Story) | Rất cao (Story + drawer + popup) | Cao, nhưng đụng The Eyes |
| Implementation complexity | **Thấp** | Trung bình | Cao |
| Responsive | **Đơn giản nhất** | Cần biến thể chip cho tablet/mobile | Như B + dải thẻ |
| Maintainability | **Cao** | Cao | Trung bình (logic phân loại thứ hai) |
| Requirement coverage | Đủ FR-01 → FR-13 | Đủ FR-01 → FR-13 | Đủ + phần ngoài phạm vi |
| Community engagement | Thấp | Trung bình (khám phá chủ đề, thẻ quan sát) | Cao nhất |

## 6. Khuyến nghị

**Chọn B làm khung, giữ editor và S4 ở mức đơn giản của A, giao theo hai đợt.**

1. **Vì sao B:** Forum phục vụ người mới, nên việc thấy ngay "có những chủ đề gì" và "bài của tôi đang ra sao" là hai điều giảm cognitive load nhiều nhất. B làm được cả hai mà chỉ dùng lại các mẫu sẵn có (mục lục Story, drawer, popup The Eyes). Master-detail cũng là cách hợp lý nhất cho D03 (so sánh bản sửa).
2. **Lấy từ A:**
   - Editor dùng `segmented` Write | Preview (không chia đôi màn hình). Ít code hơn và hợp mobile; checklist "Before you submit" của B giữ lại nhưng ở dạng `notice` đầu form.
   - Diff admin chỉ một chế độ (khối trên/dưới, đánh dấu thêm/bớt theo đoạn), bỏ "Side by side" ở bản đầu.
3. **Trade-off chấp nhận:** nhiều component hơn A; cần mock trả số bài theo tag; tablet/mobile có biến thể chip cuộn ngang.
4. **Thứ tự giao (đề xuất, do hạn nộp 22:30 15/11):**
   - **Đợt 1 (public + member):** `AuthProvider` mock + returnTo; S1, S2 (gồm bình luận, báo cáo); S3; S4; nav Forum. Đây là phần người chấm thấy được.
   - **Đợt 2 (admin):** S5 Queue + diff + Reject/Hide, Reports, Hashtags; công tắc vai trò demo.
5. Không lấy gì từ C ở bản đầu.

## 7. Cần quyết định

1. Chọn phương án (A / B / C / kết hợp như khuyến nghị / sửa).
2. Có cho bản demo một công tắc vai trò Member/Admin (gắn nhãn Demo) không?
3. Có đồng ý mở rộng quy tắc "pill chỉ cho chip preset" thành "pill cho chip preset và tag" không?
4. Có giao theo hai đợt như mục 6.4 không?
5. Các giả định A01–A10 trong `FEATURE_UI_ANALYSIS.md` §1.7: dùng nguyên đề xuất của BA hay có chỉnh?

Sau khi có quyết định, tôi sẽ viết `UI_IMPLEMENTATION_PLAN.md` và trình duyệt lần nữa trước khi code. Nếu cần, tôi có thể dựng mockup tĩnh (artifact riêng, không đụng source) cho phương án được chọn.
