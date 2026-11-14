# Cập nhật sàng lọc DR1 — 14/11/2026

## Lượt tiếp theo

Đã tải thêm D1 Barnard `2025W35_1A_0658_3`, `2025W40_1A_0353_1`, `2026W11_1A_0556_3` và R Draconis `2025W23_2B_0206_4`, `2025W42_2A_0526_2`, `2025W46_2A_0205_3`; lỗi 503 tạm thời đã phục hồi. Mỗi sao hiện 42 ảnh, không có ảnh đạt bộ lọc riêng lẻ hay cặp đạt bộ lọc. Đã chạy lại sàng lọc và readiness.

`scripts/inspect_saturated_neighborhoods.py` ghi thống kê vào `data/reports/saturated_neighborhoods.json`: 13/42 ảnh Barnard có ít nhất một pixel sạch trong bán kính 2,5 pixel tính từ vị trí dự đoán; R Draconis là 0/42. Cặp Barnard D6 `2025W35_1A_0484_1` và `2026W19_1A_0326_1` cách 250 ngày và gần bước sóng, có tương ứng 11/19 và 9/19 pixel sạch trong bán kính này, nhưng tâm có cờ xấu nên không phải cặp đạt tiêu chí. Có thể khảo sát fit PSF trên pixel sạch, nhưng chưa được xác thực và không thể xem là khôi phục sao hay đo quang.

Làm việc tại thư mục gốc dự án, dùng `.venv/Scripts/python.exe`. Đã tải thêm các quan sát:

- RW D1: `2025W36_1A_0446_1`, `2026W10_1A_0445_3`, `2026W10_2B_0626_4`.
- Barnard D6: `2025W33_2C_0321_3`, `2026W12_1A_0610_1`, `2026W19_1A_0326_1`.
- R Draconis D6: `2025W20_2D_0243_4`, `2026W01_1A_0404_1`, `2026W20_1A_0101_3`.

Lỗi HTTP 503 và timeout tạm thời đã phục hồi; không có chỉ mục thất bại trong lượt này. Kết quả sàng lọc: Barnard 39 ảnh, 0 cặp; WISE 18 ảnh, 2 cặp; Epsilon 21 ảnh, 1 cặp; RW 48 ảnh, 1 cặp; R Draconis 39 ảnh, 0 cặp. Ảnh mới của Barnard và R Draconis không qua lọc riêng lẻ. Chi tiết và provenance ở `data/reports/comparison_candidates.json` và manifest từng sao.

RW D1 có sản phẩm trong `data/processed/rw_aurigae_d1_comparison/`, vùng chung 59,03%. Kiểm tra tự động tìm được 0 nguồn nền ghép cặp, do đó căn ảnh chưa được xác thực độc lập; đây là minh họa kỹ thuật, không phải bằng chứng đo chuyển động hay biến quang. `shared/image_processing.py` đã được sửa để áp dụng mask theo header MSKN/MSKM của IRSA. Bộ kiểm thử liên quan đạt 7/7; pytest cảnh báo không ghi được cache tại gốc.

Barnard và R Draconis vẫn cần tìm dữ liệu hoặc phương pháp xử lý sao bão hòa được xác thực; không xóa cờ hay nới ngưỡng để tạo cặp. Xem thêm `data/reports/comparison_readiness.json`.
