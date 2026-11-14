# Báo cáo tiếp nhận gói Full Harvest and Fusion

Ngày kiểm tra: 14/11/2026. Gói gốc do thành viên nhóm cung cấp: `data/imports/full_harvest_fusion_original/` (gói gốc `SPHEREx_Full_Harvest_and_Fusion_Data/`, cục bộ, không theo dõi bằng Git). Bản sao đã nhập: `data/imports/full_harvest_fusion/`. Cả 178 file trong gói gốc được đối chiếu SHA-256 với bản sao; không có sai khác. Giữ nguyên gói gốc và cấu trúc đường dẫn trong bản nhập.

## Thành phần

- **130 FITS SPHEREx QR3**: Barnard 34, Epsilon Indi B 24, RW Aurigae 36 và R Draconis 36; WISE 0855 không có FITS SPHEREx trong gói. Ngoài ra có **10 FITS AllWISE W1/W2**, mỗi mục tiêu 2 file.
- Năm tệp danh sách Gaia DR3 theo nhãn của gói, tổng 272 bản ghi; SQLite có bảng `observations`, `gaia_stars` và `harvest_log`.
- Ảnh RGB giả màu, ảnh hiệu đa nhiệm vụ, các JSON có nhãn SED và overlay Gaia; tệp manifest mô tả sản phẩm đã tạo. Gói này không kèm mã tạo các sản phẩm đó.
- Hướng dẫn gốc ghi 138 SPHEREx FITS, nhưng đối chiếu thư mục và SQLite cho thấy **130 SPHEREx + 10 AllWISE = 140 FITS**. Không dùng con số 138 trong hướng dẫn gốc.

## Kiểm tra tệp và độ phủ

Chạy `scripts/audit_fusion_package.py` đối chiếu 140 bản ghi SQLite với đường dẫn, SHA-256 trong SQLite, cấu trúc FITS và mã quan sát/detector; không thấy lỗi trong các kiểm tra này. Hash trùng khớp dữ liệu do gói cung cấp **không tự xác nhận** phép đo khoa học, tính đầy đủ hoặc nguồn độc lập. Báo cáo chi tiết: `data/imports/full_harvest_fusion/audit.json`.

| Mục tiêu | SPHEREx QR3 | Trong cutout theo vị trí dự đoán | Ngoài cutout | Pixel mục tiêu hữu hạn trong các ảnh phủ |
| --- | ---: | ---: | ---: | ---: |
| Barnard | 34 | 0 | 34 | 0 |
| WISE 0855 | 0 | — | — | — |
| Epsilon Indi B | 24 | 0 | 24 | 0 |
| RW Aurigae | 36 | 35 | 1 | 35 |
| R Draconis | 36 | 36 | 0 | 0 |

Độ phủ tính từ WCS của từng FITS và vị trí mục tiêu được đẩy theo proper motion tuyến tính từ bản chụp SIMBAD J2000 đến thời điểm ảnh. Mô hình này chưa gồm thị sai, quỹ đạo hệ đôi hoặc vận tốc xuyên tâm; nó không xác nhận centroid nguồn. Với Barnard và Epsilon Indi B, các cutout có kích thước danh nghĩa 0,05° và tâm ghi theo vị trí J2000, do đó cần truy vấn lại quanh vị trí theo epoch trước khi kỳ vọng chúng phủ mục tiêu. Với R Draconis, điểm dự đoán nằm trong ảnh nhưng pixel gần nhất đều không hữu hạn; cần kiểm tra mask và vùng lân cận, không suy đoán nguyên nhân.

Manifest harvest của Barnard ghi 0 mục dù SQLite và thư mục có 34 FITS SPHEREx; manifest WISE 0855 ghi 0 và không có FITS SPHEREx. Gói SED WISE 0855 vẫn có nhãn D1/D6, nên nguồn của những điểm này **chưa truy xuất được từ gói**. Trường `peak_flux_mjy_sr` là thống kê độ sáng bề mặt theo pixel, không mặc nhiên là flux nguồn tích phân theo mJy; không trình bày như phổ đo đã hiệu chuẩn.

Các manifest ảnh hiệu ghi SPHEREx D6 so với AllWISE W1, hai band/công cụ khác nhau, nên hiệu ảnh không tự chứng minh chuyển động hoặc biến quang. Metadata mô tả SPHEREx năm 2025, trong khi các bản ghi QR3 của gói nằm trong năm 2026; cần truy vết chính xác file, epoch, căn ảnh, PSF và thang đo trước khi sử dụng hình hoặc nhãn thời gian.

## Cách tận dụng

1. Dùng SQLite, metadata và catalog làm đầu mối tìm nguồn/quan sát hoặc thiết kế màn hình; kiểm tra nguồn và epoch Gaia trước khi vẽ overlay.
2. Dùng 35 ảnh RW Aurigae có vùng phủ và pixel dự đoán hữu hạn làm ứng viên kiểm tra pipeline, sau khi kiểm cờ chất lượng, bước sóng và hiệu chuẩn. Pixel hữu hạn không xác nhận phát hiện.
3. Dùng AllWISE làm dữ liệu tham khảo để nghiên cứu so sánh đa nhiệm vụ; không trừ trực tiếp hay trộn với DR1/QR3 mà không mô tả và kiểm định phép so sánh.
4. Truy vấn lại Barnard/Epsilon Indi B theo tọa độ epoch, bổ sung dữ liệu WISE 0855 và dựng lại sản phẩm từ đầu với provenance, WCS, mask và sai số rõ ràng.

**Trạng thái tích hợp:** gói được nhập nguyên vẹn vào workspace ứng dụng để kiểm tra và sử dụng có chọn lọc; nó không tự động được nối vào API hay thay thế 90 FITS DR1 đang chạy. Đây là chủ ý vì các bất nhất trên cần được xử lý trước. Mặc dù IRSA nêu DR1 và QR3 được xử lý để có thể dùng cùng nhau, mọi so sánh vẫn phải ghi rõ release và kiểm tra hiệu chuẩn/bước sóng. Nguồn: https://irsa.ipac.caltech.edu/data/SPHEREx/docs/overview_qr.html

Chạy lại kiểm tra từ thư mục gốc repo:

```powershell
.venv/Scripts/python.exe scripts/audit_fusion_package.py data/imports/full_harvest_fusion --output data/imports/full_harvest_fusion/audit.json
```

`data/imports/` bị Git bỏ qua; sao lưu riêng cả bản nhập nếu cần chia sẻ.
