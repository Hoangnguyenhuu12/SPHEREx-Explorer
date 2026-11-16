# M09 · Nhật ký phát hiện + forum xác minh

**Ưu tiên** P2 · **Phụ trách** Đông (API), Thạch (UI) · **Tính năng để VƯỢT**: kết hợp phần "Discoveries" của Vanilla với phần "Report" của NODIXHI trên forum có sẵn của mình

## Luồng
```text
M05 track ──► Discovery (status=candidate | catalogue_matched)
            ├─ trang /discoveries: danh sách, lọc theo trạng thái, vận tốc, ngày
            ├─ "Discuss" ──► bài forum (template: GIF, view_url, stats, tên SkyBoT)
            ├─ vote real / artefact / unsure (cần đăng nhập, mỗi người 1 phiếu)
            └─ admin: rejected / confirmed
```

## Quy tắc trạng thái
| Từ | Sang | Điều kiện |
| --- | --- | --- |
| candidate | community_checked | ≥ 5 phiếu, ≥ 70 % "real" |
| * | catalogue_matched | SkyBoT/JPL khớp ≤ 10″ (tự động) |
| * | rejected | admin, bắt buộc ghi lý do |

## Ngôn từ
Không dùng chữ "discovery" cho thứ chưa khớp catalogue; dùng "candidate". Có banner "Một báo cáo không phải là xác nhận khoa học".

## Bảo mật
Rate limit tạo bài và bình chọn; RLS của Supabase; kiểm duyệt dùng lại `admin/` hiện có.
