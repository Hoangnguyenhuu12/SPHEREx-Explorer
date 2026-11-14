# Bổ sung và sàng lọc ảnh DR1 cho MVP

> **Snapshot cũ.** Số liệu mới nhất (14/11/2026): 171 FITS DR1, 4 cặp đã xử lý (WISE 0855 D3/D6, Epsilon Indi B D6, RW Aurigae D1) và đã đưa lên `/api/frames` ở chế độ `DATA_MODE=real`. Xem [AGENT_HANDOFF_DATA.md](AGENT_HANDOFF_DATA.md).

Các ảnh demo WISE 0855 và Epsilon Indi B được tạo từ chính bộ DR1 trong `data/spherex`, không dùng ảnh giả. Trạng thái “sẵn sàng” trong báo cáo trước chỉ có nghĩa là có cặp để thử xử lý hình ảnh, chưa có nghĩa là đủ xác nhận khoa học. Cả hai mục tiêu này đã được xử lý thành ba bộ demo trong `data/processed`.

Lượt bổ sung dùng danh sách SIA IRSA đã lưu tại workspace, chọn các quan sát DR1 chưa thử có footprint phủ vị trí dự đoán; tải cutout 0,1 độ từ URL IRSA thực. Đây không phải khảo sát toàn bộ archive. Thêm 12 ảnh cho Barnard, 18 cho RW Aurigae và 12 cho R Draconis: 42 file mới, mỗi file được kiểm tra và lưu checkpoint, manifest, SHA-256. HTTP 503 tạm thời đã tự khôi phục trong các lần thử; không còn chỉ mục thất bại trong lượt này.

| Mục tiêu | Tổng ảnh DR1 đã kiểm tra | Ảnh qua lọc pixel và phổ | Cặp qua bộ lọc |
| --- | ---: | ---: | ---: |
| Barnard | 36 | 0 | 0 |
| WISE 0855 | 18 | 17 | 2 |
| Epsilon Indi B | 21 | 18 | 1 |
| RW Aurigae | 42 | 6 | 0 |
| R Draconis | 36 | 0 | 0 |

Tổng: 153 FITS, 613.768.320 byte theo manifest. Barnard: 35/36 vị trí dự đoán có cờ overflow, 35/36 bloom; R Draconis: cả 36 có overflow, bloom và SUR_ERROR. RW Aurigae: 6 ảnh qua lọc đơn lẻ, nhưng chưa có cặp đồng detector, cách ít nhất 30 ngày và đủ gần bước sóng theo ngưỡng thử nghiệm. Cờ tại pixel mục tiêu không có nghĩa toàn ảnh vô dụng; có thể dùng vùng nền cho demo nếu thể hiện rõ vị trí bị mask, nhưng không chứng minh hay đo được mục tiêu. Không suy ra toàn bộ archive không có quan sát tốt hơn.

`data/reports/comparison_candidates.json` lưu chi tiết từng ảnh và lý do; `data/reports/comparison_readiness.json` lưu đánh giá căn ảnh. Dữ liệu gốc giữ nguyên; không nới ngưỡng chỉ để tạo cặp. Vị trí mục tiêu là dự đoán chưa gồm đầy đủ thị sai/quỹ đạo; cần xác minh tọa độ, kiểm tra vùng pixel và cân nhắc phương pháp quan trắc nguồn bão hòa với người phụ trách khoa học trước khi kết luận. Các demo chưa tích hợp tự động vào giao diện MVP.

Từ thư mục `new`, dùng `python scripts/acquire_comparison_extras.py --detector 1 --targets rw_aurigae --batch <nhãn_mới>` để chọn thêm tối đa ba quan sát chưa thử; dùng lại cùng nhãn để tiếp tục lô đã chọn. Kiểm tra lại bằng `python scripts/screen_comparison_candidates.py` và `python scripts/check_comparison_readiness.py`. Chạy trong môi trường `.venv` của dự án. Năm kiểm thử cho lọc cặp, sản phẩm ảnh và cờ FITS đã đạt trong lượt này.
