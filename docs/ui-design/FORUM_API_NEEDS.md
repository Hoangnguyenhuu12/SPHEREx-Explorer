# Forum: API frontend cần từ backend

Ngày 14/11/2026. Frontend đang chạy bằng mock (`frontend/src/features/forum/mock/`). Interface chuẩn là `ForumApi` trong `frontend/src/features/forum/api.ts`; khi có backend chỉ cần viết `httpForumApi` cùng chữ ký rồi đổi một dòng `forumApi = …`.

Đây là đề xuất để BE (Đông) chốt, không phải hợp đồng đã khoá. Tách riêng khỏi API ảnh SPHEREx (BA §11).

## Nguyên tắc

- Danh tính lấy từ session (cookie), **không** nhận `author_id`/`role` từ client.
- Mọi quyền kiểm tra ở server. Bài chờ duyệt/bị ẩn của người khác trả **404**, không phải 403 (không tiết lộ bài tồn tại).
- Nội dung public chỉ lấy từ revision đã duyệt; bản nháp/chờ không xuất hiện trong list, search, đếm tag.
- Lỗi dùng chung dạng `{ api_version, error: { code, message, details } }`. Frontend chỉ đọc `code` và `details.reason`.

| HTTP | `code` | `details.reason` (khi có) |
| --- | --- | --- |
| 401 | `UNAUTHENTICATED` | |
| 403 | `FORBIDDEN` | |
| 404 | `NOT_FOUND` | |
| 409 | `CONFLICT` | `STALE_DECISION` (+ `state`, `by`), `PENDING_LOCK`, `POST_NOT_OPEN`, `SLUG_TAKEN` |
| 422 | `VALIDATION` | `INACTIVE_TAG`, `NO_DISPLAY_NAME`; `fields: { title?, body?, tags?, links? }` |

## Endpoint đề xuất

| Method | Path | ForumApi | Ghi chú |
| --- | --- | --- | --- |
| GET | `/api/forum/tags` | `listTags` | Active + tag đã ngừng còn bài; `count` chỉ bài công khai |
| GET | `/api/forum/posts?q=&tag=&page=` | `listPosts` | Mới nhất trước; `PAGE_SIZE` 10 |
| GET | `/api/forum/posts/{id}` | `getPost` | `working`, `hiddenReason` chỉ trả cho tác giả/admin |
| GET | `/api/forum/posts/{id}/comments` | `listComments` | Admin nhận cả bình luận ẩn (`hidden: true`) |
| POST | `/api/forum/posts/{id}/comments` | `addComment` | Chỉ bài `published`, kiểm tra lúc gửi |
| POST | `/api/forum/reports` | `report` | Một báo cáo mở / người / đối tượng → `{ duplicate }` |
| GET | `/api/forum/me/posts` | `myPosts` | |
| GET/POST | `/api/forum/me/notifications` (+ `/read`) | `notifications`, `markNotificationsRead` | |
| GET | `/api/forum/posts/{id}/editor` | `getEditor` | Chỉ tác giả |
| PUT | `/api/forum/drafts` | `saveDraft` | Body có `clientKey` để idempotent ở lần lưu đầu |
| POST | `/api/forum/submissions` | `submit` | Idempotent: cùng nội dung đang chờ → trả kết quả cũ |
| POST | `/api/forum/posts/{id}/revisions/{rev}/withdraw` | `withdraw` | 409 `STALE_DECISION` nếu đã xử lý |
| GET | `/api/forum/admin/counts`, `/queue`, `/submissions/{rev}` | `moderationCounts`, `queue`, `getSubmission` | Hàng đợi cũ nhất trước |
| POST | `/api/forum/admin/submissions/{rev}/approve` \| `/reject` | `approve`, `reject` | Duyệt đúng `rev`; reject bắt buộc lý do |
| GET | `/api/forum/admin/reports`, `/hidden` | `reports`, `hiddenContent` | Không lộ người báo cáo |
| POST | `/api/forum/admin/reports/{id}/resolve` | `resolveReport` | `outcome: resolved \| dismissed` |
| POST | `/api/forum/admin/{posts\|comments}/{id}/hide` \| `/restore` | `hide`, `restore` | Ẩn bắt buộc lý do; duyệt bản sửa không tự khôi phục bài ẩn |
| GET/POST/PATCH | `/api/forum/admin/tags` | `allTags`, `createTag`, `updateTag`, `setTagActive` | Slug chuẩn hoá, duy nhất; không xoá tag |

Mọi quyết định ghi audit log: actor, hành động, bài, revision, thời gian, lý do, trạng thái trước/sau (BA §7). Mock đã ghi các trường này trong `store.ts` (`audit`).

Giới hạn đang dùng ở FE (`features/forum/config.ts`, chưa chốt): tiêu đề 10–150, nội dung 20–20.000, bình luận 1–3.000 ký tự, 1–5 chủ đề, tối đa 3 link.
