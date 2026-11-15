# Kế hoạch giao diện admin (moderator) cho Forum

> Viết 15/11/2026 08:30 (giờ 23,5 / 39), theo `main` tại `66c0d8d`.
> Phạm vi: chỉ Forum. API thiên văn (`/api/frames`, `/api/sky-archive/*`…) không có khái niệm admin và không cần.

## 1. Hiện trạng

### Backend (Đông, `members/dong/app/forum/`): đã có phân quyền thật

| Thành phần | Chi tiết |
| --- | --- |
| Vai trò | `forum.profiles.role` ∈ `user` \| `admin` (CHECK trong migration `supabase/migrations/20261114110430_forum_v1.sql`). |
| Xác thực | `identity.py` kiểm tra access token Supabase (HS256 hoặc JWKS). Role **chỉ đọc từ DB**, không tin metadata trong token. |
| Chặn quyền | `common.py`: `contributor()` (đã xác nhận email, có display name) và `admin()` (role = admin, không ẩn danh, sai thì 403). Mọi route `/api/forum/admin/*` đều gọi `admin()`. |
| RLS | Bật RLS, không có policy cho `anon`/`authenticated`: client không đọc thẳng DB được. |
| Cấp admin | Chỉ bằng SQL: `update forum.profiles set role = 'admin' where id = '<auth user id>'`. Không có endpoint quản lý user. |
| Test | `members/dong/tests/forum` có test phân quyền (user thường gọi admin bị 403). |

Endpoint admin hiện có (forum-v1.1):

| Endpoint | Việc |
| --- | --- |
| `GET /admin/reviews` | Hàng chờ duyệt (revision `pending`, cursor) |
| `POST /admin/posts/{post_id}/revisions/{revision_id}/decision` | Duyệt / từ chối (có `reason_code`) |
| `POST /admin/posts/{post_id}/visibility` | Ẩn / hiện bài |
| `POST /admin/comments/{comment_id}/visibility` | Ẩn / hiện bình luận |
| `GET /admin/reports?status=open\|resolved\|dismissed` | Danh sách báo cáo |
| `POST /admin/reports/{report_id}/decision` | Xử lý báo cáo |
| `POST /admin/hashtags`, `PATCH /admin/hashtags/{id}` | Quản lý chủ đề |
| `GET /admin/audit-events` | Nhật ký thao tác |

### Frontend (`frontend/`): có màn hình, nhưng chạy trên dữ liệu giả

- Đã có trang `/admin/forum` (`src/pages/admin/ModerationPage.tsx`) với 3 tab: Review queue, Reports, Topics, cùng `features/forum/moderation/*` (diff revision, hộp lý do, thông báo dữ liệu cũ).
- **Đăng nhập là giả**: `features/auth/authService.ts` chỉ `setTimeout`; role lưu ở `localStorage`; menu tài khoản có nút đổi Member/Moderator để demo. Chưa cài `@supabase/supabase-js`.
- **API là mock**: `features/forum/api.ts` gán cứng `forumApi = mockForumApi`. Interface `ForumApi` khác hợp đồng forum-v1.1 ở vài chỗ (cursor, `Idempotency-Key`, `expected_version`, tên trường).

**Kết luận:** phân quyền admin/user đã có ở backend. Thứ còn thiếu là frontend nối vào backend thật (đăng nhập Supabase + adapter HTTP), cộng vài màn hình admin backend đã hỗ trợ nhưng frontend chưa có (nhật ký).

### Chỗ lệch giữa `ForumApi` (FE) và backend

| Hàm FE | Backend | Cách xử lý |
| --- | --- | --- |
| `moderationCounts()` | Không có endpoint đếm | Tạm: gọi `reviews?limit=50` và `reports?limit=50`, hiện "50+" nếu còn `next_cursor`. Sau: thêm `GET /admin/summary` (chỉ thêm, hợp lệ với khoá hợp đồng). |
| `hiddenContent()` | Không có danh sách nội dung đã ẩn | Bỏ tab này ở bản đầu; hoặc thêm `GET /admin/hidden`. |
| `queue()` / `reports()` trả mảng | Backend trả trang + `next_cursor` | Adapter đổi sang `useInfiniteQuery` hoặc nút "Load more". |
| `approve/reject/hide/resolveReport` | Cần `Idempotency-Key`, có thể cần `expected_version` | Adapter sinh key (`crypto.randomUUID()`), giữ `version` từ lần đọc; 409 thì hiện `StaleNotice` (đã có). |
| (chưa có) | `GET /admin/audit-events` | Thêm tab Nhật ký. |
| (chưa có) | Không có API cấp quyền | Giữ cấp admin bằng SQL; không làm màn hình quản lý user. |

## 2. Định hướng giao diện

Nguồn: skill ui-ux-pro-max (design system "admin moderation dashboard", density 8, motion 2, cùng các tra cứu UX). Chỉ lấy phần hợp với site hiện tại; **không** đổi font, không dùng glassmorphism mà kết quả gợi ý, vì admin phải dùng chung token của site (`src/styles`).

- **Mật độ cao, chuyển động tối thiểu:** khoảng cách 8–32px, bảng/danh sách gọn, transition 150–200ms, tôn trọng `prefers-reduced-motion`.
- **Màu trạng thái có nghĩa và không chỉ dựa vào màu:** pending = amber, approved/resolved = green, rejected/hidden = red, dismissed = muted. Luôn kèm chữ hoặc icon.
- **Bố cục:** khung `/admin` có thanh điều hướng trái (desktop) / tab ngang cuộn được (mobile 375px), nội dung kiểu master–detail: danh sách bên trái, chi tiết + diff bên phải; mobile thì chi tiết thành trang riêng (`?item=` đã có trong URL).
- **Thao tác phá huỷ phải xác nhận:** ẩn bài, từ chối, xử lý báo cáo đều qua `ReasonDialog` (đã có, bắt buộc lý do). Thành công thì hiện flash (đã có `Flash`).
- **Badge đếm:** dùng một `role="status"` có câu đủ nghĩa ("3 bài đang chờ duyệt"), không đặt `aria-live` lên từng con số.
- **Loading / rỗng / lỗi:** skeleton giữ chỗ với `aria-busy`; trạng thái rỗng có câu hướng dẫn ("Không còn bài nào chờ duyệt"); lỗi đọc `error.code` (403 → "Bạn không có quyền moderator", 503 → "Forum chưa được cấu hình trên server").
- **Bàn phím:** giữ mẫu WAI-ARIA tabs đang có; phím tắt tuỳ chọn `a`/`r` để duyệt/từ chối trong hàng chờ (chỉ khi focus ở danh sách).
- **Không bulk action ở bản đầu:** số lượng bài trong cuộc thi nhỏ; thao tác hàng loạt là việc sau.

### Cấu trúc trang

```text
/admin                       → chuyển đến /admin/forum
/admin/forum                 Tổng quan nhanh + tab
  ?tab=queue  (mặc định)     Hàng chờ duyệt: danh sách | chi tiết + RevisionDiff + Duyệt/Từ chối
  ?tab=reports&status=open   Báo cáo: lọc open/resolved/dismissed | xem nội dung, Ẩn, Resolve/Dismiss
  ?tab=tags                  Chủ đề: tạo, đổi tên, bật/tắt
  ?tab=audit                 Nhật ký (MỚI): bảng thời gian, người làm, hành động, lý do; "Load more"
```

Giữ một route và các tab (đã có) thay vì tách nhiều route, để ít thay đổi nhất.

## 3. Các bước làm

Đánh dấu **[Cần]** là tối thiểu để admin chạy thật; **[Nên]** làm nếu còn giờ.

| # | Việc | Ai | Ước lượng |
| --- | --- | --- | --- |
| 1 | **[Cần]** Đăng nhập thật: cài `@supabase/supabase-js`, `authService` gọi `signInWithPassword` / `signUp`; `session.tsx` lấy session Supabase, gọi `GET /api/forum/me` để lấy `role` và `display_name`. Bỏ role trong localStorage. | Duy Hoàng | 1,5 giờ |
| 2 | **[Cần]** Ẩn nút đổi Member/Moderator khi không ở chế độ mock (`USING_DEMO_DATA === false`). | Duy Hoàng | 10 phút |
| 3 | **[Cần]** `httpForumApi.ts`: implement các hàm admin của `ForumApi` trên endpoint thật (Bearer token, `Idempotency-Key`, `expected_version`, map lỗi). Chọn adapter bằng `VITE_FORUM_API=http\|mock`. | Duy Hoàng | 2 giờ |
| 4 | **[Cần]** Đổi Queue/Reports sang trang có cursor ("Load more"); `moderationCounts` theo cách tạm ở bảng trên. | Duy Hoàng | 45 phút |
| 5 | **[Cần]** Cấu hình: biến `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` trên Vercel; `FORUM_*` trên Render; thêm origin Vercel vào redirect URL của Supabase Auth và `CORS_ALLOW_ORIGINS`. Cấp admin cho 1–2 tài khoản bằng SQL. | Duy Hoàng + Đông | 30 phút |
| 6 | **[Nên]** Tab Nhật ký (`GET /admin/audit-events`). | Duy Hoàng / Thạch | 45 phút |
| 7 | **[Nên]** Backend: `GET /admin/summary` (đếm queue, report open) và `GET /admin/hidden`; cập nhật `openapi-forum-v1.yaml` (chỉ thêm). | Đông | 1 giờ |
| 8 | **[Nên]** Tab Nội dung đã ẩn, dùng endpoint ở bước 7. | Duy Hoàng | 45 phút |
| 9 | Kiểm thử: Vitest cho adapter (mock `fetch`), test `Gate` với role user/admin; chạy `pytest members/dong/tests/forum`; thử tay: user thường mở `/admin/forum` thấy "No access", gọi API admin nhận 403. | Duy Hoàng | 45 phút |

Không làm: màn hình quản lý user/cấp quyền, thao tác hàng loạt, realtime (Supabase Realtime).

## 3b. Trạng thái bước 1–5 (15/11, nhánh `duy-hoang/admin-real-api`)

Đã làm:

- **Đăng nhập thật:** `features/auth/supabase.ts` (client Supabase), `authService.ts` (`signInWithPassword`, `signUp` có xác nhận email, thông báo lỗi dễ hiểu), `session.tsx` (chế độ live: lấy id, display name và role từ `GET /api/forum/me`, `PATCH /me` khi đặt tên). `RequireAuth` chờ khôi phục phiên rồi mới chuyển trang, nên tải lại `/admin/forum` không bị đẩy về Log in.
- **Ẩn công cụ demo** (đổi Member/Moderator, reset dữ liệu) khi chạy live.
- **Adapter HTTP cho toàn bộ `ForumApi`** (`features/forum/http/`), không chỉ phần admin: nếu Forum vẫn chạy mock thì admin sẽ duyệt dữ liệu thật trong khi trang Forum lại hiện dữ liệu giả. Adapter gửi `Idempotency-Key`, đọc version ngay trước mỗi lần ghi, và ánh xạ lỗi backend sang mã lỗi của UI.
- **Phân trang và bộ đếm:** adapter tự đi hết các trang cursor (tối đa 20 × 50 mục) nên UI giữ nguyên. Bộ đếm hàng chờ và báo cáo là số chính xác. "Nội dung đã ẩn" được suy ra từ audit log (sự kiện hide/restore mới nhất của mỗi mục), nên **không cần endpoint mới**.
- **Chọn chế độ:** `VITE_FORUM_API=http`, cùng `VITE_API_BASE_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. Thiếu bất kỳ biến nào thì vẫn dùng demo như cũ.

Kiểm thử:

- `src/test/forum-http.test.ts`: ánh xạ lý do, link, mã lỗi.
- `src/test/forum-http.live.test.ts`: chạy hết luồng trên backend thật (gửi bài, duyệt, từ chối bản sửa, bình luận, báo cáo, ẩn, khôi phục, thông báo, chủ đề) và kiểm tra user thường bị 403 ở API admin. Chỉ chạy khi có `FORUM_LIVE_API_URL` (và `FORUM_LIVE_ADMIN_ID` cho luồng admin). Đã đạt với backend chạy trên máy cùng PostgreSQL nhúng.
- Đã kiểm tra trên trình duyệt: khách mở `/admin/forum` bị chuyển sang Log in; admin thấy hàng chờ thật, duyệt được, badge giảm; tab Reports và Topics có dữ liệu thật; menu tài khoản không còn công cụ demo.

Chỗ khác so với mock (do hợp đồng API):

- Admin không thấy bình luận đã ẩn ngay dưới bài, vì danh sách bình luận công khai không có chúng. Bình luận đã ẩn nằm ở mục "Hidden content" của tab Reports.
- Lý do ẩn, từ chối và xử lý báo cáo được lưu dạng `[code] ghi chú` trong trường `reason` để UI hiện lại đúng nhãn.
- Admin không duyệt được bài của chính mình (backend chặn tự duyệt). Bài của admin cần admin khác duyệt.

### Deploy (cần người có quyền Vercel và Supabase của forum)

Backend `https://nasa-minions-phanetx-spherex.onrender.com` đã bật forum (`/api/forum/hashtags` trả 200, CORS `*`) và chạy commit `a7cfa63`, có code forum giống `main`. Các việc còn lại:

1. Lấy URL và anon key của **project Supabase dành cho forum** (Đông giữ; đây là project khác project `sky_archive`).
2. Vercel, project `nasa-minions-phanetx-spherex`: đặt `VITE_FORUM_API=http`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (kiểm tra `VITE_API_BASE_URL` trỏ tới backend Render ở trên), rồi deploy lại.
3. Supabase Auth của forum: thêm `https://nasa-minions-phanetx-spherex.vercel.app/login` vào Redirect URLs; giữ bật xác nhận email.
4. Mỗi moderator đăng nhập một lần, sau đó chạy SQL: `update forum.profiles set role = 'admin' where id = '<auth user id>';`. Cần ít nhất 2 admin để duyệt bài của nhau.
5. Thử: đăng ký, xác nhận email, đăng nhập, đặt tên, gửi bài; admin mở `/admin/forum` và duyệt.

## 4. Rủi ro và lưu ý thời gian

- Đang ở giờ 23,5; **dừng mở tính năng ở giờ 30 (15:00 hôm nay)**, nộp trước 22:30. Forum và admin **không nằm trong MVP lẫn danh sách điểm cộng** của đề. Nếu MVP (blink, 5 mục tiêu, smoke 11/11) chưa xong thì làm MVP trước.
- Bước 1–5 khoảng 5 giờ. Nếu không kịp: giữ mock và nút đổi vai trò, ghi rõ trên trang là "demo data" (đã có `USING_DEMO_DATA`). Như vậy ban giám khảo vẫn thấy luồng duyệt bài, còn phân quyền thật được nêu trong bài nộp (backend + test).
- Ẩn giao diện chỉ để tiện; quyền thật luôn do backend kiểm tra ở mỗi request. Không bao giờ đưa `service_role` key lên frontend.
- Render ngủ khi rảnh: lần gọi `/api/forum/me` đầu có thể mất khoảng 50 giây, cần trạng thái "Đang kết nối server…" thay vì báo lỗi ngay.
