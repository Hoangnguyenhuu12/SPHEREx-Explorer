# Báo cáo tải DR1: Barnard và WISE 0855

> **Cập nhật sau khi đổi chính sách lưu:** Hiện Barnard và WISE đều có 18 file, mỗi detector D1–D6 có 3 file. Pixel `NaN` là cảnh báo chất lượng, không còn làm loại FITS nguyên vẹn. Bảng và mô tả bên dưới là lịch sử của lần kiểm tra trước; xem manifest và `validation_report.json` của từng mục tiêu để biết trạng thái hiện tại.

Ngày 14/11/2026. Đầu vào là kết quả SIA DR1 được lưu trong từng thư mục `data/spherex/<target>/sia-votable.xml`; mỗi detector được chọn ban đầu tối đa ba quan sát và sắp theo thời gian. Ảnh đã tải trước đó được giữ lại và không tải lại. Các phép thử bổ sung Barnard D1–D4 dùng các quan sát khác, không dùng lại chỉ mục đã thử.

| Mục tiêu | D1 | D2 | D3 | D4 | D5 | D6 | Tổng file |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Barnard | 2 | 0 | 0 | 0 | 3 | 3 | 8 |
| WISE 0855 | 3 | 3 | 3 | 3 | 3 | 3 | 18 |

Các số trong bảng là file đã được lưu sau kiểm tra kỹ thuật, không phải số nguồn đã được phát hiện. Kích thước: Barnard 31.985.280 byte; WISE 72.230.400 byte; tổng 104.215.680 byte.

Với Barnard D1, một trong ba lựa chọn đầu và ba lựa chọn bổ sung đều không đạt vì pixel tại vị trí dự đoán không hữu hạn. Với mỗi detector D2–D4, ba lựa chọn đầu và ba lựa chọn bổ sung có cùng lỗi. Đây là kết quả của một mẫu quan sát hạn chế, không chứng minh toàn bộ detector không có dữ liệu dùng được; chưa xác định nguyên nhân. File FITS không đạt không được giữ như file đã xác nhận. Mã quan sát và lý do được lưu trong `data/spherex/barnard/validation_report.json` và `selection_report.json`.

Các lỗi 503 xuất hiện trong khi tải đều đã hết trong thời gian thử lại và không còn chỉ mục nào đang chờ vì timeout trong hai mục tiêu này. Script ghi checkpoint từng file; file có sẵn và SHA-256 khớp được bỏ qua. Các danh sách URL lựa chọn theo detector và theo ảnh thay thế được giữ tại `irsa-download-lists/` của từng mục tiêu. Lưu ý: chạy lại script lựa chọn ban đầu sẽ thử lại các quan sát từng không đạt; chỉ chạy lại sau khi có lý do và kiểm tra report.

Kiểm thử API cục bộ chế độ `DATA_MODE=real`: Barnard D1, D5, D6 và WISE D1–D6 đều trả 200; Barnard D2–D4 trả `NO_FRAMES` thay vì hiện dữ liệu cũ. Một số ảnh gộp cùng visit nên số frame hiển thị thấp hơn số FITS. Các chuỗi WISE và Barnard D5/D6 có cảnh báo `MIXED_WAVELENGTH`; không diễn giải thay đổi độ sáng là biến quang khi chưa kiểm tra bandpass và hiệu chuẩn. Vị trí dự đoán có thể sai do mô hình chưa bao gồm thị sai hoặc chuyển động hệ đôi; cần xem cờ và đánh giá độc lập trước kết luận khoa học.
