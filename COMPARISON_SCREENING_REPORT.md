# Sàng lọc và thử xử lý cặp ảnh SPHEREx

> Cập nhật: bảng và tổng số bên dưới là ảnh chụp trước lượt tải bổ sung. Kết quả mới nhất gồm 153 file DR1 và ba bộ ảnh demo được ghi tại `MVP_DR1_ADDITIONAL_ACQUISITION.md` và `IMAGE_DEMO_REPORT.md`.

Ngày thực hiện: 14/11/2026. Đây là **sàng lọc kỹ thuật sơ bộ**, không phải xác nhận phát hiện thiên thể hay phép đo khoa học đã được duyệt.

## Tiêu chí chọn cặp

Mỗi cặp dùng cùng mục tiêu, cùng detector, cùng release DR1; hai ảnh cách nhau ít nhất 30 ngày. Vị trí mục tiêu dự đoán phải nằm trong ảnh; pixel gần vị trí đó phải hữu hạn và không mang cờ chất lượng được chọn để loại. Cờ `SOURCE` hoặc `FULLSAMPLE` đơn lẻ không được coi là lỗi.

Để sàng lọc bước sóng, yêu cầu `|λ1−λ2| ≤ 0,5 × min(độ rộng dải 1, độ rộng dải 2)` tại vị trí dự đoán. Đây là **ngưỡng thử nghiệm do pipeline chọn**, không phải chuẩn khoa học IRSA hay bằng chứng hai đáp ứng phổ giống nhau. SPHEREx có bước sóng thay đổi theo pixel; khi dựng sản phẩm đã kiểm tra thêm điều kiện này trên từng pixel chung. Vị trí vẫn là dự đoán tuyến tính, chưa gồm thị sai/quỹ đạo hệ đôi. Nguồn: [IRSA spectral WCS](https://caltech-ipac.github.io/irsa-tutorials/spherex-intro/).

## Kết quả sàng lọc

| Mục tiêu | Ảnh DR1 đã kiểm tra | Cặp vượt tiêu chí sơ bộ | Trạng thái |
| --- | ---: | ---: | --- |
| WISE 0855 | 18 | 2 cặp: D3, D6 | Đã thử xử lý cặp D6 |
| Epsilon Indi B | 21 | 1 cặp D6 | Đã thử xử lý cặp D6 |
| Barnard | 24 | 0 | Pixel mục tiêu dự đoán trong 24 ảnh đều mang ít nhất một cờ chất lượng được chọn để loại |
| RW Aurigae | 24 | 0 | Chỉ 3 ảnh qua kiểm tra pixel/cờ ban đầu, chưa tạo được cặp đáp ứng đủ tiêu chí |
| R Draconis | 24 | 0 | Pixel mục tiêu dự đoán trong cả 24 ảnh không hữu hạn và mang cờ chất lượng |

Đã tải thêm **3 ảnh D6 chưa thử cho mỗi mục tiêu Barnard, Epsilon Indi B, RW Aurigae và R Draconis**, rồi thêm 3 ảnh D1 cho mỗi mục tiêu Barnard, RW Aurigae và R Draconis: tổng cộng 21 ảnh bổ sung, có checkpoint theo file. Không tải lại các file hợp lệ. Bộ DR1 hiện có **111 file**, 445.089.600 byte; tất cả SHA-256 khớp manifest khi kiểm tra. Không có lỗi mạng chưa giải quyết trong lượt bổ sung này. Số cặp 0 không chứng minh IRSA không có cặp khác: chỉ phản ánh các ảnh đã tải, vị trí dự đoán và tiêu chí trên.

Báo cáo máy đọc theo từng ảnh/cặp: `data/reports/comparison_candidates.json`. Các cờ tại một pixel là dữ liệu chất lượng, không tự xác nhận danh tính nguồn hoặc phủ nhận toàn ảnh.

## Hai cặp đã thử xử lý

| Mục tiêu | Quan sát | Khoảng thời gian | Bước sóng tại vị trí dự đoán | Pixel chung vượt mask và tiêu chí phổ |
| --- | --- | ---: | --- | ---: |
| WISE 0855 D6 | `2025W19_1B_0116_1` → `2026W20_1A_0033_1` | 370,4 ngày | 4,967397 → 4,967284 µm | 1.846/2.209 = 83,57% |
| Epsilon Indi B D6 | `2025W18_1B_0081_2` → `2026W18_2A_0174_2` | 367,2 ngày | 4,430915 → 4,428039 µm | 1.834/2.209 = 83,02% |

Mỗi cặp được căn về lưới TAN 47×47 pixel, giữ mask, hiển thị cùng thang độ sáng, tạo blink và ảnh hiệu **mang nhãn chẩn đoán**. Pixel tím là phần bị mask/không qua tiêu chí. Dấu cộng là vị trí dự đoán, không phải centroid đã đo. Mỗi thư mục có `aligned_diagnostic.fits`, `comparison.png`, `blink.gif` và `report.json` kèm nguồn, hash, thời điểm và giới hạn:

- `data/processed/wise0855_d6_comparison/`
- `data/processed/epsilon_indi_b_d6_comparison/`

Đã thử tìm nguồn nền trên hai cặp bằng phép tìm đỉnh 5σ, loại vùng quanh vị trí mục tiêu: WISE có 1 cặp đỉnh gần nhau, Epsilon Indi B không có cặp nào; số lượng này chưa đủ để xác nhận căn chỉnh độc lập. WCS round-trip được kiểm tra riêng chỉ là kiểm tra tính nhất quán số học. Chưa đối chiếu vị trí nguồn với catalog độc lập, kiểm tra hàm đáp ứng phổ, so khớp PSF, nền hoặc truyền sai số. Không dùng ảnh hiệu/blink này làm bằng chứng đã phát hiện chuyển động hay biến quang. Cần Nguyên kiểm tra các phép đo khoa học trước khi dùng trong kết luận hoặc quảng bá MVP.

`data/reports/comparison_readiness.json` ghi rõ hai cặp sẵn sàng **xử lý thị giác thử nghiệm** và cả năm mục tiêu chưa sẵn sàng diễn giải khoa học. Kiểm tra thêm 36 ảnh QR3 có sẵn của RW Aurigae cho thấy chỉ 1 ảnh qua sàng lọc pixel/cờ; 36 ảnh QR3 R Draconis không có pixel mục tiêu hữu hạn. Đây là phép rà theo vị trí dự đoán, không phải đánh giá toàn bộ kho IRSA hoặc kết luận rằng không thể đo bằng phương pháp khác.

## Tái lập và kiểm thử

Chạy từ thư mục gốc repo:

```powershell
.venv/Scripts/python.exe scripts/screen_comparison_candidates.py
.venv/Scripts/python.exe scripts/check_comparison_readiness.py
.venv/Scripts/python.exe scripts/process_candidate_pair.py --target wise0855 --detector 6
.venv/Scripts/python.exe scripts/process_candidate_pair.py --target epsilon_indi_b --detector 6
.venv/Scripts/python.exe -m pytest scripts/test_comparison_screen.py scripts/test_processed_comparison.py scripts/test_repair_fusion_qr3.py scripts/test_validate_fits_acquisition.py members/dong/tests/test_spherex_flags.py -q
```

Lần kiểm thử hiện tại: 6 bài đạt. Hai FITS đầu ra đã được kiểm tra checksum, WCS, kích thước, mask, dấu phép trừ và GIF có hai frame; không thay thế kiểm thử khoa học hoặc kiểm tra trình duyệt. Các file trong `data/` không được Git theo dõi, cần sao lưu riêng.
