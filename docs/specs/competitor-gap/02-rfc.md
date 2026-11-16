# 02 · RFC: "Explorer that verifies"

| | |
| --- | --- |
| Trạng thái | Draft |
| Người đề xuất | (team MINIONS) |
| Người review | Thạch (UI), Duy Hoàng (FE/DevOps), Đông (API), Khôi (data), Hữu Hoàng (ảnh), Nguyên (khoa học) |

## Vấn đề

Ở các vòng chấm tiếp theo và khi được người dùng thật so sánh, nhóm mình thua ở ba điểm:

1. **Không tự tìm ra điều gì.** Viewer chỉ cho xem những gì đã biết. Vanilla tìm được 3I/ATLAS và Pluto mà không cần được chỉ chỗ.
2. **Chậm ở lần đầu và bị giới hạn ở 5 mục tiêu.** Backend ngủ (khoảng 50 giây), timeline dựng sẵn cho 5 mục tiêu.
3. **Thiếu lớp kiến thức chung về bầu trời**: không có chòm sao, không có thẻ sao, không song ngữ.

## Mục tiêu

- G1. Mở một view mới ở bất kỳ tọa độ nào trong ≤ 15 giây (p50) và ≤ 2 giây khi đã có cache.
- G2. Người mới bấm vào một ngôi sao bất kỳ sẽ thấy tên, chòm sao, khoảng cách và loại sao trong ≤ 2 giây.
- G3. Có ít nhất một kết quả khoa học "tự tìm" được kiểm chứng độc lập (ví dụ một tiểu hành tinh được SkyBoT xác nhận), kèm kiểm tra báo động giả.
- G4. Mọi phát hiện đều có thể đem ra forum để cộng đồng bình chọn và bình luận, rồi được kiểm duyệt. **Đây là điểm khác biệt.**
- G5. Giữ nguyên lợi thế: Story, 3D orbit, timeline 14 năm, chatbot.

## Ngoài phạm vi

- Không viết lại frontend sang JS thuần. React là lợi thế về khả năng bảo trì.
- Không sao chép mã của sphere-blink (AGPL). Chỉ tự viết lại từ mô tả thuật toán.
- Không làm planetarium 3D đầy đủ như NODIXHI ở giai đoạn đầu (để P3).
- Không đưa ML vào phần phát hiện. Dùng số học xác định để có thể giải thích và kiểm chứng.

## Đề xuất

### Lớp 1: Đuổi kịp (P0–P1)

| Việc | Cách làm ngắn gọn | Module |
| --- | --- | --- |
| Backend không ngủ | Gói Render trả phí, hoặc cron ping 10 phút một lần + làm nóng 5 mục tiêu khi khởi động | M04 |
| Chòm sao | Overlay Aladin từ d3-celestial (BSD-3) + `astropy.coordinates.get_constellation` | M01 |
| Thẻ sao | `GET /api/star?gaia_id=` gộp Gaia DR3 + SIMBAD + Exoplanet Archive + chòm sao, cache 30 ngày | M02 |
| Bất kỳ tọa độ nào | Job bất đồng bộ + trả kết quả dần; đọc range từ S3 hoặc giữ cutout IRSA nhưng song song hóa | M03 |
| Chia sẻ và API | Trạng thái view nằm trong URL; `/api/movie.gif`, `/api/frame.png`, `/api/export.csv`; trang `/docs` | M10 |

### Lớp 2: Vượt (P2)

| Việc | Cách làm ngắn gọn | Module |
| --- | --- | --- |
| Tìm vật thể chuyển động | Median → phát hiện 5σ → nối theo vận tốc (bỏ phiếu) → xác nhận pixel → xáo trộn thời gian để đếm báo động giả → SkyBoT | M05 |
| Shift-and-stack | Lưới vận tốc chậm 0,05–2″/h; điểm σ; kiểm tra bằng ephemeris JPL | M06 |
| Đo PM | Fit PSF trên stamp gốc; so với Gaia | M07 |
| Phát hiện → forum | Mỗi track thành một bài forum có ảnh, GIF, link view; bình chọn thật/giả; admin duyệt | M09 |

### Lớp 3: Hoàn thiện (P3)

Đọc phổ tự động (M08), bầu trời thời gian thực (M11), redshift.

## Các phương án đã cân nhắc

| Phương án | Ưu | Nhược | Kết luận |
| --- | --- | --- | --- |
| Fork sphere-blink rồi ghép vào | Nhanh | AGPL lây sang dự án MIT; kiến trúc khác hẳn | ❌ |
| Chỉ làm giáo dục (chòm sao, thẻ sao) | Rẻ | Không vượt được Vanilla về khoa học | ❌ (chỉ là P0) |
| Chỉ làm khoa học | Đối đầu Vanilla | Bỏ mất lợi thế cộng đồng và kể chuyện | ❌ |
| **Khoa học có kiểm chứng + cộng đồng xác minh** | Không đội nào có cả hai | Khối lượng lớn | ✅ |

## Rủi ro

| Rủi ro | Mức | Giảm thiểu |
| --- | --- | --- |
| Tìm vật thể sinh nhiều báo động giả | Cao | Bắt buộc kiểm tra xáo trộn thời gian; gọi là "candidate" khi chưa có tên |
| Chi phí hosting | Trung bình | Bắt đầu bằng cron keep-alive; chỉ nâng gói khi có demo hoặc vòng chấm |
| IRSA/SIMBAD chậm hoặc sập | Trung bình | Cache, mirror Harvard, hiển thị một phần |
| Thời gian của 6 người | Cao | Làm theo P0 → P3, mỗi module có người phụ trách rõ ràng ([04-plan](04-plan.md)) |
