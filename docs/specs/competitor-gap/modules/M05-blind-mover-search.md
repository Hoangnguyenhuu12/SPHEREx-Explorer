# M05 · Tìm vật thể chuyển động (blind search)

**Ưu tiên** P2 · **Phụ trách** Hữu Hoàng (ảnh), Nguyên (khoa học), Khôi (tên) · **Đây là tính năng để VƯỢT**

> Viết lại độc lập từ mô tả thuật toán trong `sphere-blink/docs/moving-objects.md` (AGPL; không copy mã). Xem ADR-001.

## Đầu vào
Các khung đã căn chỉnh của một field (M03), mỗi khung có `mjd`, `detector`, ảnh, nhiễu và cờ.

## Các bước
| # | Bước | Tham số khởi đầu |
| --- | --- | --- |
| 1 | Bầu trời tĩnh = median theo pixel cho từng detector; che pixel sáng | ngưỡng che: median > 5σ |
| 2 | Phát hiện trên (khung − median): nhóm liền kề, đỉnh ≥ 5σ (nhiễu cục bộ tính theo ô 32 px) | 2–400 px, tối đa 80 nguồn/khung |
| 3 | Loại nguồn lặp lại tại cùng chỗ ở những thời điểm quá xa nhau | bán kính 3″ |
| 4 | Nối trong từng lượt quét (cách > 2 ngày là lượt mới): mỗi cặp nguồn đề xuất vận tốc, các nguồn khác bỏ phiếu | 2–600″/h; dung sai 7,5″ |
| 5 | Giữ track có ≥ 4 thời điểm, ≥ 2 visit | |
| 6 | Xác nhận trên pixel tại vị trí dự đoán: đỉnh ≥ 3,5σ và tổng 3×3 ≥ 1,3 × đỉnh (loại tia vũ trụ) | ≥ 6 thời điểm, ≥ 70 % độ phủ |
| 7 | Báo động giả: xáo trộn thời gian trong từng lượt, chạy lại 10 lần | ghi `chance_tracks` |
| 8 | Gắn tên: IMCCE SkyBoT cone search tại (ra0, dec0, mjd0) | khớp nếu ≤ 10″ |
| 9 | Track không có tên: ≥ 8 thời điểm, ≥ 3 visit → "candidate"; nếu không đạt thì không hiển thị | |

## Điểm mình làm khác (để vượt)
- **Chèn vật thể giả** (ý tưởng của NODIXHI) chạy tự động trong CI để đo độ hoàn chỉnh (completeness) theo SNR và vận tốc, rồi công bố biểu đồ.
- **Forum xác minh** (M09).
- Hiển thị `params` và `stats` ngay trong UI ("Đã tìm 1.243 nguồn, 3 track, 0 do ngẫu nhiên").

## Hiệu năng
Field 22′ (3×3) với khoảng 700 exposure: mục tiêu ≤ 60 s. Dùng NumPy vector hóa, tính median theo từng khối (chunk).

## Nghiệm thu
SCI-3, SCI-4, `test_movers_synthetic.py`.
