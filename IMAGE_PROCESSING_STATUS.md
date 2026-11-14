# Trạng thái xử lý ảnh SPHEREx

Ngày kiểm tra: 14/11/2026. Phạm vi là bộ **DR1 thật trong `data/spherex/`**, không phải dữ liệu demo cũ.

## Đã thực hiện

1. Đã tải 90 FITS ban đầu (5 mục tiêu × 6 detector × 3 ảnh), sau đó bổ sung 21 FITS để tìm cặp so sánh, tổng 111 FITS. Manifest ghi detector, thời điểm, URL, hash và kết quả kiểm tra kỹ thuật.
2. Đã kiểm tra cấu trúc FITS, ID quan sát, detector, WCS, vị trí dự đoán, pixel hữu hạn và SHA-256. `NaN` là cảnh báo chất lượng; không xóa cả ảnh hoặc tự điền dữ liệu.
3. Backend `DATA_MODE=real` đọc riêng bộ DR1, kiểm tra hash, căn ảnh về lưới TAN, ghép ảnh theo visit và tạo PNG cùng ảnh hiệu. Ảnh gốc FITS không bị sửa.
4. Khi không có file thật đúng mục tiêu/detector, API trả `NO_FRAMES`; không thay bằng ảnh demo. Frontend được cấu hình tắt mock trong `.env` cục bộ.
5. Sửa bộ đọc cờ để hỗ trợ header `MSKNxxxx`/`MSKMxxxx` của FITS hiện tại, bên cạnh dạng `MP_` cũ. Các pixel mang cờ được chọn để loại được mask trước khi căn ảnh; cờ `SOURCE` và `FULLSAMPLE` đơn lẻ không bị coi là pixel lỗi. Cảnh báo `SATURATION_POSSIBLE` nói có cờ trong ảnh, không chứng minh riêng mục tiêu bị bão hòa.

## Kiểm tra 30 tổ hợp

Lần chạy `scripts/check_image_pipeline.py` gần nhất trên 102 FITS với `DATA_MODE=real`, DR1: **30/30 tổ hợp sao–detector trả kết quả**, có 79 frame theo visit; 79 PNG và 79 PNG ảnh hiệu đọc được, kích thước khớp lưới. Chín FITS bổ sung sau lần chạy đó chưa có trong kết quả API này. Báo cáo: `data/reports/image_pipeline_qa.json`. Các kiểm tra này chứng minh luồng API và định dạng chạy được, không khẳng định đã thấy nguồn, đo được chuyển động hoặc xác minh ảnh hiệu.

- 30/30 tổ hợp có `MIXED_WAVELENGTH`; không diễn giải chênh lệch sáng giữa frame thành biến quang. Việc ghép hoặc so sánh ảnh cần được kiểm tra thêm theo bandpass.
- 26/30 tổ hợp có `SATURATION_POSSIBLE` vì ít nhất một pixel trong ảnh có cờ liên quan; cần xem vùng mục tiêu và flags cụ thể trước khi kết luận về sao.
- 11/30 tổ hợp có `FEW_FRAMES`; số frame ít hơn số FITS do gộp cùng visit hoặc dữ liệu không đủ. Cần kiểm tra đủ khoảng thời gian và nguồn thực tế trước khi chọn demo.
- Trong 111 FITS hiện tại, xem `data/reports/comparison_candidates.json` để biết các pixel không hữu hạn và cờ chất lượng. R Draconis có cờ `OVERFLOW`, `SUR_ERROR`, `SOURCE`, `BLOOM` ở các pixel đã kiểm tra; xem `data/fusion_repairs/r_draconis_quality.json` cho 18 ảnh gốc và báo cáo sàng lọc cho ảnh bổ sung.
- Vị trí dự đoán hiện chỉ dùng proper motion tuyến tính; chưa kiểm chứng centroid, thị sai, chuyển động hệ đôi hoặc astrometry độc lập.
- API photometry và astrometry đang chủ động trả 503 trong chế độ dữ liệu thật. Không thay bằng phép đo mẫu hoặc kết luận khoa học chưa kiểm định.
- Chưa có nghiệm thu frontend/browser trên máy này vì không tìm thấy `npm` trong PATH. Kiểm thử API không thay thế kiểm tra người dùng nhìn thấy gì trong giao diện.
- Đã bổ sung 5 kiểm thử tự động cho FITS DR1 thật trên máy này (mỗi sao một kiểm thử D6), kiểm tra API và PNG không dùng mạng hay fixture. Trong môi trường không có dữ liệu cục bộ, các kiểm thử này sẽ được bỏ qua có ghi lý do.

## Việc tiếp theo

1. Cùng Khôi thống nhất nguồn đầu vào và manifest; cùng Nguyên xác định tiêu chí ảnh đủ tốt, xử lý cờ, PSF, bandpass và vị trí nguồn.
2. Chọn một mục tiêu/detector có các ảnh đủ độ phủ, thời gian và bước sóng tương thích; kiểm tra hình ảnh và marker trên trình duyệt, rồi mới thêm mục tiêu khác.
3. Kiểm tra phép ảnh hiệu trên ảnh thật cùng bandpass, mask, nền và thang đo; không dùng khác biệt do bước sóng như bằng chứng chuyển động hoặc biến quang.
4. Rà lại R Draconis và Barnard bằng ảnh thay thế hoặc phương pháp đo được chuyên gia duyệt; chỉ tải thêm khi xác định được dữ liệu thiếu.
5. Kiểm tra fixture QR2 cũ riêng nếu nhóm còn duy trì chế độ thử nghiệm; kiểm thử DR1 mới đã chạy đạt trên máy này, không dùng dữ liệu QR2 cũ.

Tái lập từ thư mục gốc repo: `.venv/Scripts/python.exe scripts/check_image_pipeline.py`. `data/` bị Git bỏ qua và cần sao lưu riêng.
