# Báo cáo thử lại lỗi 503 — D1 DR1

Ngày 14/11/2026. Mỗi chỉ mục gặp 503 trong vòng D1 đầu được thử lại một lần trong vòng này, tuần tự theo từng sao. File FITS đã tải hợp lệ được giữ nguyên; kết quả sàng lọc được ghi riêng để tránh xung đột với các tác vụ khác.

| Sao | Ảnh thử lại | Tải thành công | Còn 503 | Cặp qua lọc sơ bộ | Cặp có sản phẩm | Cặp không đủ vùng chung |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Barnard | 11 | 6 | 5 | 0 | 0 | 0 |
| WISE 0855 | 21 | 10 | 11 | 7 | 7 | 0 |
| Epsilon Indi B | 20 | 4 | 16 | 17 | 9 | 8 |
| RW Aurigae | 8 | 2 | 6 | 4 | 4 | 0 |
| R Draconis | 21 | 1 | 20 | 0 | 0 | 0 |
| Tổng | 81 | 23 | 58 | 28 | 20 | 8 |

Số cặp trong bảng là tổng D1 hiện có, không phải chỉ số cặp mới của lượt này. Cặp Epsilon không đủ 50% vùng chung được ghi là không tạo được sản phẩm. Các chỉ mục còn 503 và URL được lưu trong `data/spherex/<sao>/selection_report.json`; danh sách đã thử của mỗi sao nằm tại `irsa-download-lists/d1-retry-round2.txt`.

Các sản phẩm là chẩn đoán kỹ thuật, có mask; chưa xác thực độc lập căn ảnh và không chứng minh chuyển động hay biến quang. Hai sao Barnard và R Draconis chưa có cặp đạt. Chi tiết ở `data/reports/<sao>_d1_round2.json` và `data/processed/`.

Kiểm thử sản phẩm, bộ lọc và API: 36 passed, một cảnh báo phụ thuộc Starlette TestClient.
