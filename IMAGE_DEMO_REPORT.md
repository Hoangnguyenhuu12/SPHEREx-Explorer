# Kết quả xử lý ảnh demo SPHEREx DR1

Ba cặp dưới đây là ảnh quan sát thực, được xử lý để kiểm tra quy trình hiển thị. Mỗi cặp dùng cùng detector và cùng bản phát hành DR1; không trộn D3 với D6 trong một chuỗi.

| Mục tiêu | Detector | Vùng chung hợp lệ | Nguồn nền trùng khớp ứng viên | Kết quả |
| --- | --- | ---: | ---: | --- |
| WISE 0855 | D6 | 83,57% | 1 | Có thể trình diễn quy trình |
| WISE 0855 | D3 | 84,65% | 1 | Có thể trình diễn quy trình |
| Epsilon Indi B | D6 | 83,02% | 0 | Có thể trình diễn quy trình |

Mỗi thư mục trong `data/processed/<mục_tiêu>_d<detector>_comparison/` có ảnh `comparison.png`, ảnh động `blink.gif`, FITS đã căn lưới `aligned_diagnostic.fits` và metadata `report.json`. Vùng tím là vùng bị mask hoặc không có dữ liệu dùng được; dấu cộng là vị trí dự đoán, không xác nhận đã phát hiện mục tiêu. Các file FITS gốc được giữ nguyên.

Các ảnh đã được căn lên lưới WCS chung, loại pixel theo cờ chất lượng và kiểm tra độ tương đồng bước sóng theo ngưỡng kỹ thuật. Hiệu ảnh là hiệu trực tiếp, chưa chuẩn hóa PSF hay nền. Kiểm tra FITS, checksum, phép trừ, WCS và file ảnh đã chạy thành công. Vòng chuyển đổi WCS chỉ chứng minh phép tính tự nhất quán; số nguồn nền khớp ở trên chưa đủ để xác nhận độc lập độ căn ảnh. Các ngưỡng chọn cặp là ngưỡng kỹ thuật thử nghiệm, không phải xác nhận tương đương phổ cho phân tích khoa học.

**Đánh giá:** ổn để demo quy trình và giao diện ảnh có kèm cảnh báo; chưa đủ để khẳng định phát hiện sao, chuyển động hay biến thiên. Cần đối chiếu nguồn với catalog, xác thực vị trí và độ căn, đánh giá PSF, nền, đáp ứng phổ và sai số trước khi diễn giải khoa học. Ba mục tiêu Barnard, RW Aurigae và R Draconis chưa có cặp đạt bộ lọc hiện tại, không đồng nghĩa không có dữ liệu. Các sản phẩm thử nghiệm này chưa được tự động tích hợp vào giao diện MVP.

Tạo lại và kiểm tra từ thư mục `new`:

```powershell
.venv/Scripts/python.exe scripts/process_candidate_pair.py --target wise0855 --detector 6
.venv/Scripts/python.exe scripts/process_candidate_pair.py --target wise0855 --detector 3
.venv/Scripts/python.exe scripts/process_candidate_pair.py --target epsilon_indi_b --detector 6
.venv/Scripts/python.exe scripts/check_comparison_readiness.py
.venv/Scripts/python.exe -m pytest -q --basetemp=data/pytest_demo_tmp scripts/test_processed_comparison.py members/dong/tests/test_spherex_flags.py
```
