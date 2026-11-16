# U02 · Viewer The Eyes

## Nguyên tắc
**Một hành động chính** (Play observations). Mọi thứ khác nằm trong "More options" hoặc chế độ Science. Phần này đã làm ở PR feedback.

## Trạng thái và nội dung
| Trạng thái | Hiển thị |
| --- | --- |
| queued | "Đang chờ, vị trí #2 trong hàng đợi" (cần M03 trả `queue_position`) |
| searching | "Đang tìm exposure… 358 file" |
| fetching | Phim lớn dần với các khung đã có, thanh tiến độ `done/found`, hình minh họa blink khi chưa có khung nào |
| ready | Play tự bật lần đầu (trừ khi bật reduced motion) |
| failed | Lỗi dễ hiểu + "Thử lại" + "Mở bằng dữ liệu đã cache" |

## Bảng điều khiển (Advanced / Science)
- Bands: RGB mô phỏng · D1–D6
- Mỗi khung là: lượt quét · ngày · exposure (như Vanilla)
- Phép toán ảnh: Blink · − Median · − Reference · Sum
- Overlay: Gaia · CatWISE · Crosshair · Tracks · Movers · Constellations
- Panel phải: Spectrum + reading, Over time, Distance, Source files, Measured in this field, Share

## Học từ đối thủ
- Vanilla: thanh thời gian có mốc tháng, tốc độ 1/3/6/12 fps, phím Space và ←/→.
- NODIXHI: chú thích màu vòng tròn theo nhiệt độ, "Time machine" 1990–2040, chèn vật thể giả.
