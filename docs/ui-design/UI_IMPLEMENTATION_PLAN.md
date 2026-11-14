# Forum cộng đồng: kế hoạch triển khai UI

Ngày: 14/11/2026. Phương án đã chọn: **B làm khung + editor và diff đơn giản của A, giao 2 đợt** (`UI_DESIGN_PROPOSALS.md` §6).
Trạng thái: **đã duyệt (14/11) và đã triển khai cả hai đợt** trên nhánh `duy-hoang/new-frontend`, chưa commit. Mặc định M1–M7 được áp dụng như đề xuất.

### Kết quả triển khai (14/11)

- Đợt 1 và Đợt 2 xong theo §4. Khác kế hoạch: không làm "Delete draft" (không có trong requirement); công tắc vai trò và link Moderation có sẵn trong `AccountMenu` từ Đợt 1.
- Kiểm tra: 102 test Vitest (gồm 17 test quy tắc nghiệp vụ AC02–AC13 trên mock), typecheck, lint (không cảnh báo mới), build đều đạt.
- Đã bấm thử trên trình duyệt (bằng script, do khung trình duyệt bị ẩn): khách → login → quay lại; display name; lưu nháp; gửi duyệt; rút; sửa bài đã đăng; bình luận giữ nội dung qua login; báo cáo và báo cáo trùng; rời trang khi chưa lưu; trạng thái loading/empty/error (`?forumMock=slow|empty|error`); duyệt bản sửa có diff; quyết định cũ (stale) không ghi đè; từ chối có lý do; ẩn/khôi phục; thêm/ngừng chủ đề; không cuộn ngang ở 375 px.
- Lỗi tìm ra và đã sửa khi kiểm tra: link The Eyes dán dạng URL đầy đủ không hiện thẻ quan sát; đăng xuất ở trang riêng tư bị đưa về Log in; bấm nhanh hai chủ đề làm mất một chủ đề.
- Chưa kiểm chứng bằng mắt: ảnh chụp giao diện ở 375/768 px (khung trình duyệt ẩn nên chỉ đo bố cục bằng script); trình đọc màn hình thật.

---

## 1. Phạm vi đã duyệt và mặc định đang đề xuất

### 1.1. Đã duyệt

- Bố cục B: S1 feed hai cột (mục lục chủ đề dính bên trái), S2 chi tiết có cột phụ, S4 nhóm theo việc cần làm, S5 admin dạng danh sách + panel.
- Lấy từ A: editor dùng `segmented` Write | Preview; diff admin một chế độ (khối trên/dưới, đánh dấu thêm/bớt theo đoạn); checklist "Before you submit" là `notice` ở đầu form.
- Hai đợt giao: Đợt 1 (public + member), Đợt 2 (admin).
- Không lấy gì từ Option C.

### 1.2. Mặc định đề xuất cho các câu chưa trả lời

Nếu duyệt kế hoạch này, các mặc định dưới đây được coi là đồng ý. Muốn đổi mục nào thì ghi số mục.

| # | Câu hỏi | Mặc định đề xuất |
| --- | --- | --- |
| M1 | Công tắc vai trò demo | **Có**, trong `AccountMenu`, gắn nhãn "Demo", chỉ tồn tại ở chế độ mock. Không có thì không trình diễn được Đợt 2 |
| M2 | Tag dạng pill | **Có**, mở rộng quy tắc pill trong `DESIGN.md` §4 thành "chip preset và tag"; sửa `DESIGN.md` cùng PR |
| M3 | Giả định A01–A10 | **Dùng nguyên đề xuất của BA**, đặt trong một file cấu hình `forum/config.ts` để đổi nhanh |
| M4 | Nơi hiện thông báo (A09) | Khối "Your posts" ở cột trái S1 + nhóm "Needs your action" của S4 (theo B, không có chuông) |
| M5 | Display name (A07) | Dialog hỏi tên một lần trước lần đóng góp đầu tiên; form Sign up giữ nguyên email + mật khẩu |
| M6 | Lưu dữ liệu mock | `localStorage` (key có version), seed sẵn khoảng 6 bài mẫu gắn nhãn "Illustrative demo"; có nút "Reset demo data" trong `AccountMenu` |
| M7 | Định dạng nội dung | Markdown giới hạn tự viết: đoạn, xuống dòng, **đậm**, *nghiêng*, `code`, danh sách, link. Render thành React element, không dùng `innerHTML`, không thêm thư viện |

### 1.3. Ngoài phạm vi

- Backend, auth thật, API HTTP cho Forum. Frontend chỉ định nghĩa interface `ForumApi` và bản mock; có thêm file `FORUM_API_NEEDS.md` mô tả endpoint cần BE làm.
- Upload ảnh, like/vote/follow, email/push, trả lời bình luận lồng nhau, sửa/xoá bình luận, xoá bài đã công khai.
- Không đổi bốn trang hiện có ngoài việc thêm mục "Forum" vào navigation và thay nút Log in/Sign up bằng `AccountMenu` khi đã đăng nhập.

---

## 2. Kiến trúc component

```text
src/
├─ app/
│  ├─ App.tsx                 (+ routes forum/admin, bọc AuthProvider)
│  └─ config.ts               (+ PATHS.forum, forumPost, forumNew, forumEdit, myPosts, adminForum)
├─ features/
│  ├─ auth/
│  │  ├─ session.tsx          MỚI  AuthProvider, useSession, logIn/logOut, setDisplayName, setDemoRole
│  │  ├─ RequireAuth.tsx      MỚI  điều hướng /login?returnTo=…; returnTo chỉ nhận đường dẫn nội bộ
│  │  ├─ returnTo.ts          MỚI  sanitizeReturnTo() (thuần, có test)
│  │  ├─ AccountMenu.tsx      MỚI  display name ▾: My posts, Moderation (admin), Demo role, Reset demo, Log out
│  │  ├─ DisplayNameDialog.tsx MỚI
│  │  └─ AuthForm.tsx         SỬA  gọi session.logIn; sau login về returnTo thay vì màn "You're logged in"
│  └─ forum/
│     ├─ config.ts            giới hạn, danh sách lý do, page size, tag seed (A01–A08)
│     ├─ types.ts             Post, Revision, Comment, Report, Tag, Notification, trạng thái
│     ├─ api.ts               interface ForumApi + forumApi (mock)
│     ├─ mock/
│     │  ├─ store.ts          dữ liệu trong localStorage, seed, reset
│     │  └─ mockForumApi.ts   áp quy tắc nghiệp vụ, trả lỗi FORBIDDEN / NOT_FOUND / CONFLICT
│     ├─ queries.ts           query keys + hooks TanStack (keys riêng tư gắn userId)
│     ├─ validation.ts        validatePost, validateComment, validateReason (thuần, có test)
│     ├─ markdown.tsx         parse + MarkdownView an toàn (có test)
│     ├─ diff.ts              diffParagraphs (LCS theo đoạn), diffTags, diffLinks (có test)
│     ├─ components/
│     │  ├─ StatusBadge.tsx
│     │  ├─ TagChip.tsx       chip hiển thị + chip chọn (aria-pressed)
│     │  ├─ TagPicker.tsx     chỉ tag Active; giới hạn 1–5
│     │  ├─ TopicList.tsx     cột trái S1 (tags + count, Your posts)
│     │  ├─ PostListItem.tsx
│     │  ├─ ObservationLinkCard.tsx
│     │  ├─ CommentList.tsx, CommentComposer.tsx
│     │  ├─ ReasonDialog.tsx  dùng cho Report / Reject / Hide
│     │  ├─ ConfirmDialog.tsx
│     │  ├─ AuthorStatusPanel.tsx  khối trạng thái chỉ tác giả thấy (S2)
│     │  ├─ RevisionDiff.tsx
│     │  ├─ EmptyState.tsx, Pagination.tsx, ForumMessage.tsx (Not found / No access)
│     │  └─ useLeaveGuard.ts
│     └─ forum.css
├─ pages/
│  ├─ forum/ForumPage.tsx         S1
│  ├─ forum/PostPage.tsx          S2
│  ├─ forum/EditorPage.tsx        S3 (new | draft | edit)
│  ├─ forum/MyPostsPage.tsx       S4
│  └─ admin/ModerationPage.tsx    S5 (Đợt 2: tab Queue / Reports / Hashtags)
└─ shared/
   ├─ layout/Shell.tsx        SỬA  NAV + Forum; AccountMenu khi đã đăng nhập; header trang Forum có nút "Write a post"
   └─ ui/
      ├─ Dialog.tsx           MỚI  modal dùng chung: focus trap, Esc, trả focus (rút từ mẫu NavDrawer/popup)
      └─ ui.css               SỬA  thêm .textarea, .chip, .dialog, .tabs (chuyển từ popup.css, giữ alias cũ)
```

### Quyết định kỹ thuật chính

| Quyết định | Lý do |
| --- | --- |
| `ForumApi` tách riêng `ObservationApi` | BA §11: hợp đồng Forum không gộp vào API ảnh |
| Mock kiểm quyền và trạng thái như backend thật (trả lỗi, không chỉ ẩn nút) | Để AC07, AC11, AC12 test được trên UI; khi có BE chỉ thay adapter |
| Mọi mutation trên revision gửi kèm `revisionId` + `expectedState` | Mock trả `CONFLICT` nếu đã đổi, UI hiện notice stale (AC07) |
| Nút gửi khoá trong lúc chờ + mock idempotent theo `revisionId` | Chặn double click (BA §7) |
| Query key riêng tư có `userId`; logout gọi `queryClient.removeQueries` cho nhóm `['forum','private']` | AC12 |
| Bài chờ/ẩn của người khác trả `NOT_FOUND` | AC02, AC09: không tiết lộ bài tồn tại |
| Bộ lọc, trang, tab trạng thái ở URL search params | Deep link, Back đúng (A05) |
| Nội dung không dùng `dangerouslySetInnerHTML`; link chỉ cho `http(s):` và đường dẫn nội bộ | BA §11 |
| Draft bình luận lưu `sessionStorage` theo postId khi chuyển sang login | FR-12 |
| Không thêm dependency | Giữ bundle và rủi ro thấp trong hackathon |

---

## 3. Thay đổi file

| File | Đợt | Loại | Nội dung |
| --- | --- | --- | --- |
| `app/config.ts` | 1 | Sửa | Thêm PATHS Forum/admin |
| `app/App.tsx` | 1, 2 | Sửa | Route lazy cho 5 trang; `AuthProvider` bọc `Root` |
| `shared/layout/Shell.tsx` | 1 | Sửa | Mục Forum; `AccountMenu`; nút header theo trang |
| `shared/layout/layout.css` | 1 | Sửa | Style `AccountMenu` |
| `shared/ui/Dialog.tsx`, `ui.css` | 1 | Mới/Sửa | Dialog, textarea, chip, tabs dùng chung |
| `features/target-details/popup.css` | 1 | Sửa nhỏ | Bỏ phần `.tabs` đã chuyển (giữ hiển thị như cũ) |
| `features/auth/*` | 1 | Mới/Sửa | Session, RequireAuth, returnTo, AccountMenu, DisplayNameDialog; AuthForm dùng session |
| `features/forum/**` | 1, 2 | Mới | Như cây ở §2 |
| `pages/forum/*` | 1 | Mới | S1–S4 |
| `pages/admin/ModerationPage.tsx` | 2 | Mới | S5 |
| `test/forum-*.test.ts`, `test/return-to.test.ts` | 1, 2 | Mới | Xem §5 |
| `docs/DESIGN.md` | 1 | Sửa | Quy tắc pill (M2), mục 7.6 Forum |
| `docs/ui-design/FORUM_API_NEEDS.md` | 1 | Mới | Endpoint và mã lỗi đề xuất cho BE |

Không đổi: Landing (ngoài header dùng chung), Story, Where are you, The Eyes, API ảnh, artwork.

---

## 4. Các bước triển khai

### Đợt 1: public + member

1. **Nền tảng dùng chung:** `Dialog`, `.textarea`, `.chip`, chuyển `.tabs`; kiểm The Eyes không đổi giao diện.
2. **Session mock:** `AuthProvider`, `sanitizeReturnTo`, `RequireAuth`; nối `AuthForm` (login xong về `returnTo`, mặc định `/forum`); `AccountMenu`, logout xoá cache riêng; `DisplayNameDialog`.
3. **Domain Forum:** `types`, `config`, `validation`, `markdown`, mock store (seed + reset) và `mockForumApi` với quy tắc revision, quyền, tag, comment, report.
4. **S1 Feed:** `TopicList` (count chỉ bài công khai), tìm kiếm debounce, `PostListItem` có dòng mục tiêu quan sát, phân trang, empty/loading/error; mục Forum trong nav.
5. **S2 Chi tiết:** header bài, `MarkdownView`, `ObservationLinkCard`, nhãn cộng đồng, bình luận (hiện ngay, giữ nội dung khi lỗi, khoá khi bài Hidden), `ReasonDialog` cho Report (báo trùng: "You already reported this"), `AuthorStatusPanel`.
6. **S3 Editor:** 3 chế độ; Title, Write | Preview, `TagPicker`, links (tối đa 3, kiểm định dạng); Save draft; Submit có xác nhận; `useLeaveGuard`; chế độ sửa có notice "Readers keep seeing the published version until your edit is approved".
7. **S4 My posts:** nhóm Needs your action / In review / Drafts / Published; Withdraw có xác nhận; thông báo kết quả duyệt.
8. **Kiểm tra Đợt 1** (§5), sửa lỗi, cập nhật `DESIGN.md` và `FORUM_API_NEEDS.md`.

### Đợt 2: admin

9. **Công tắc vai trò demo** trong `AccountMenu`; route `/admin/forum` có "No access" cho member.
10. **Queue:** danh sách cũ nhất trước + panel; bài mới hiện snapshot, bản sửa hiện `RevisionDiff` (title, tags, links, body); Approve / Reject (lý do bắt buộc); tự chuyển bài kế; xử lý `CONFLICT`. Tablet/mobile: danh sách → trang xem.
11. **Reports:** danh sách Open; xem nội dung; Hide (lý do) / Dismiss / Resolve; Restore cho nội dung đã ẩn.
12. **Hashtags:** bảng tag, thêm/đổi tên, Active/Inactive (không xoá); kiểm slug trùng sau chuẩn hoá.
13. **Kiểm tra Đợt 2** (§5).

Mỗi bước kết thúc bằng typecheck + test. Commit theo từng bước trên nhánh hiện tại (chỉ khi được yêu cầu).

### Phụ thuộc

- Bước 2 trước mọi màn có đóng góp. Bước 3 trước 4–7.
- Đợt 2 dùng lại `ReasonDialog`, `StatusBadge`, mock store của Đợt 1.
- Khi BE có API thật: viết `httpForumApi` theo `FORUM_API_NEEDS.md`, đổi một dòng chọn adapter.

---

## 5. Danh sách kiểm tra

### Tự động (Vitest)

- [ ] `sanitizeReturnTo`: nhận `/forum/new`; từ chối `https://…`, `//evil`, `javascript:`.
- [ ] `validatePost` / `validateComment` / `validateReason` theo giới hạn A01.
- [ ] `markdown`: không tạo HTML từ `<script>`; link `javascript:` bị bỏ; đoạn, danh sách, đậm/nghiêng đúng.
- [ ] `diff`: đoạn thêm/bớt/giữ nguyên; tag thêm/bớt; link thêm/bớt.
- [ ] Mock: bài Pending không có trong list/search/count và trả NOT_FOUND cho người khác (AC02); duyệt bản sửa giữ bài cũ tới khi duyệt (AC05, AC06); CONFLICT khi revision đã đổi (AC07); không bình luận được vào bài Hidden (AC08); duyệt bản sửa không khôi phục Hidden (AC09); tag Inactive không chọn được, chuỗi `#abc` trong body không tạo tag (AC10); member gọi approve → FORBIDDEN (AC11); báo cáo trùng không tạo bản mới (AC13).

### Trên trình duyệt (preview, bấm thật)

- [ ] Khách: đọc feed, lọc tag, tìm kiếm, mở bài, mở link The Eyes đúng mục tiêu (AC01, AC14); bấm Write/Comment/Report → login → quay lại đúng chỗ, bình luận đang gõ còn nguyên.
- [ ] Thành viên: dialog display name lần đầu; lưu nháp; preview; gửi duyệt; thấy Pending; Withdraw; sửa bài đã đăng; bình luận hiện ngay; báo cáo.
- [ ] Admin (Đợt 2): duyệt, từ chối có lý do, xem diff, xử lý báo cáo, ẩn/khôi phục, quản lý tag; mô phỏng stale bằng hai tab.
- [ ] Logout / đổi vai trò: không còn My posts, nháp, hàng đợi của tài khoản trước (AC12).
- [ ] Loading, empty, error cho từng màn (dùng tham số mock làm chậm / gây lỗi).
- [ ] Responsive 1440, 1024, 768, 375: không cuộn ngang; cột trái thành dải chip; nút editor không bị che.
- [ ] Bàn phím: Tab qua mọi control, focus ring thấy rõ, dialog giữ focus và Esc đóng, trả focus về nút mở.
- [ ] Nhất quán với Landing: font Averia/Andika, token màu, nút, header/footer; không artwork trong vùng đọc.
- [ ] Review bằng skill `web-design-guidelines` cho các file Forum.

### Lệnh

```bash
npm --prefix frontend test
```

```bash
npm --prefix frontend run typecheck
```

```bash
npm --prefix frontend run lint
```

```bash
npm --prefix frontend run build
```

---

## 6. Rủi ro khi triển khai

| Rủi ro | Cách giảm |
| --- | --- |
| Hết thời gian trước Đợt 2 | Đợt 1 tự đứng được; Đợt 2 có thể demo chỉ Queue nếu thiếu giờ |
| Người chấm hiểu mock là hệ thống thật | Nhãn "Illustrative demo" trên dữ liệu seed và "Demo" trên công tắc vai trò |
| Dữ liệu localStorage hỏng giữa các phiên bản | Key có version; lỗi parse → seed lại |
| Đổi `.tabs` làm vỡ popup The Eyes | Giữ alias cũ; chụp màn The Eyes trước/sau |
| Markdown tự viết sót trường hợp | Chỉ hỗ trợ tập nhỏ; mọi text còn lại hiện nguyên văn |
