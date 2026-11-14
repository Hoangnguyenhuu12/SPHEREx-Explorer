# Kết quả xử lý gói dữ liệu fusion

Ngày thực hiện: 14/11/2026. Dữ liệu gốc và sản phẩm cũ được giữ nguyên tại `data/imports/full_harvest_fusion/`; kết quả xử lý mới lưu riêng ở `data/fusion_repairs/`. Không coi vị trí dự đoán hoặc pixel hữu hạn là xác nhận đã phát hiện thiên thể.

## 1. Barnard và Epsilon Indi B

Kiểm tra ban đầu cho thấy 34 cutout Barnard và 24 cutout Epsilon Indi B của gói cũ không phủ vị trí dự đoán tại thời điểm quan sát theo mô hình proper motion tuyến tính. Điều này không khẳng định cả ảnh gốc không chứa nguồn: một cutout chỉ là một phần của detector.

Đã truy vấn IRSA SIA cho QR3 quanh vị trí dự đoán J2026, sau đó kiểm tra polygon quan sát tại thời điểm từng ảnh, yêu cầu cutout 0,1° đặt tâm ở vị trí dự đoán của ảnh đó, và kiểm tra WCS/OBSID/detector/checksum sau tải:

| Mục tiêu | Ảnh D6 phủ vị trí dự đoán đã tải | Quan sát |
| --- | ---: | --- |
| Barnard | 3 | `2026W33_2A_0594_4`, `2026W34_1A_0308_1`, `2026W34_2A_0081_1` |
| Epsilon Indi B | 3 | `2026W39_1A_0276_1`, `2026W39_2A_0398_1`, `2026W40_1A_0070_2` |

Các pixel gần vị trí dự đoán trong 6 ảnh trên hữu hạn; không đồng nghĩa nguồn đã được nhận diện, tách thành phần hoặc đo quang. Một ảnh thử Barnard `2026W33_2A_0594_3_D6` chỉ có một phần footprint và không phủ vị trí dự đoán; đã giữ lại cùng cảnh báo, backend không chọn nó. IRSA SIA trả 17 ứng viên D6 có polygon phủ vị trí dự đoán cho Barnard và 36 cho Epsilon Indi B theo phép kiểm tra hình học hiện tại; không phải số phát hiện thiên thể.

Các ảnh mới nằm dưới `data/fusion_repairs/qr3/`, tách biệt 90 ảnh DR1. Không trộn các release trong một lần gọi API: `DATA_RELEASE=dr1` là mặc định, `DATA_RELEASE=qr3` chọn các mẫu QR3 mới. API đã trả ảnh cho hai sao trong chế độ QR3; vì các quan sát gần nhau được gộp theo visit, hiện mỗi sao trả **1 frame**, có cảnh báo `SATURATION_POSSIBLE`/`MIXED_WAVELENGTH`/`FEW_FRAMES`. Cờ bão hòa cho biết có pixel liên quan trong ảnh, chưa chứng minh mục tiêu là pixel đó. Chưa đủ bằng chứng để dùng chuỗi này chứng minh chuyển động.

## 2. WISE 0855

Tệp SED cũ có D1/D6 nhưng gói chỉ có hai FITS AllWISE và không chứa FITS SPHEREx của mục tiêu này; không có code hoặc liên kết đủ để xác định nguồn của các giá trị D1/D6 đó. Không sửa hoặc trình bày chúng như dữ liệu đã truy nguyên.

Truy vấn IRSA QR3 thành công quanh vị trí J2026 với bán kính 0,01° nhưng trả 0 kết quả. Điều này chỉ mô tả truy vấn đó, không chứng minh toàn bộ kho không có ảnh. Truy vấn chẩn đoán rộng hơn 0,1° timeout sau 30 giây, chưa có kết quả.

Bộ DR1 đang có 3 ảnh D1 và 3 ảnh D6. Đã trích **6 mẫu pixel chẩn đoán** tại vị trí dự đoán, kèm FITS, SHA-256, detector, ngày, bước sóng và flags vào `data/fusion_repairs/wise0855_pixel_samples.json`. Đây là độ sáng bề mặt pixel gốc `MJy/sr`, chưa trừ nền, chưa hiệu chỉnh PSF/khẩu độ, không phải flux nguồn `mJy`, phổ đã hiệu chuẩn hay phát hiện nguồn. Cần đo phổ bằng phương pháp đã kiểm định, sau đó truy vết hoặc dựng lại sản phẩm SED.

## 3. R Draconis

Đã kiểm tra 18 FITS DR1 mới và 36 FITS QR3 từ gói: trong cả 54 ảnh, pixel gần vị trí dự đoán nhất không hữu hạn và mang bốn bit `OVERFLOW`, `SUR_ERROR`, `SOURCE`, `BLOOM`. Theo tài liệu IRSA, `OVERFLOW` chỉ pixel gần bão hòa và `SUR_ERROR` chỉ khả năng lỗi xử lý đọc; `SOURCE` là vùng nguồn đã biết và không tự xác nhận đúng danh tính mục tiêu. Các cờ và tín hiệu bất thường cần được kiểm chứng theo PSF, mask và tọa độ; không tự điền pixel hay lấy pixel bên cạnh làm phép đo.

Báo cáo từng ảnh, vùng lân cận 11×11, ngày, detector, hash và cờ nằm tại `data/fusion_repairs/r_draconis_quality.json`. Ảnh vẫn được giữ nguyên cho mục đích xử lý sau. Chưa có phép đo sáng R Draconis được kiểm định.

## 4. Ảnh hiệu SPHEREx–AllWISE

Gói cũ không ghi rõ chính xác file đầu vào hay mã sinh cho từng ảnh hiệu; vì vậy không thể sửa nhãn epoch của ảnh hiệu hiện có mà không suy đoán. Đồng thời AllWISE W1 trong các FITS đã kiểm tra mang `BUNIT=DN`, còn ảnh SPHEREx mang `MJy/sr`; hai thiết bị/band và đơn vị khác nhau. `DATEOBS1`/`DATEOBS2` của WISE cũng là một khoảng quan sát, không phải một epoch tức thời mặc định. QR3 trong SQLite cũ nằm ở năm 2026, trong khi manifest sản phẩm ghi SPHEREx 2025; cần truy đúng ảnh tạo sản phẩm mới kết luận được ngày.

Đã tạo `data/fusion_repairs/cross_mission_difference_review.json`, ghi lại từng giá trị metadata AllWISE và trạng thái **chưa được dùng làm kết quả khoa học hoặc hiển thị trong MVP**. Ảnh hiệu cũ không bị xóa hoặc thay đổi, nhưng không tự đưa vào ứng dụng. Muốn dựng lại cần chọn FITS đã truy xuất nguồn, kiểm tra epoch, đổi đơn vị đúng hiệu chuẩn, WCS/PSF và sai số, rồi ghi đầy đủ provenance; không dùng một ảnh hiệu đa band làm bằng chứng duy nhất về chuyển động.

## Kiểm tra và tái lập

Trong thư mục gốc repo:

```powershell
.venv/Scripts/python.exe scripts/repair_fusion_qr3.py --target all --limit 3
.venv/Scripts/python.exe scripts/build_fusion_quality_review.py
# Kiểm tra lại API với các mẫu QR3; khởi động trong cùng PowerShell:
$env:DATA_MODE='real'
$env:DATA_RELEASE='qr3'
.venv/Scripts/python.exe -m uvicorn app.main:app --app-dir members/dong --host 127.0.0.1 --port 8000
```

Truy vấn và tải được checkpoint theo từng ảnh, xác minh SHA-256 trước khi bỏ qua file có sẵn và thử lại lỗi mạng tối đa 3 phút mỗi lần tải. Không dùng `DATA_RELEASE=qr3` cho demo toàn bộ năm sao: dữ liệu sửa mới chỉ có Barnard và Epsilon Indi B D6, WISE trả `NO_FRAMES`. Chọn `DATA_RELEASE=dr1` để trở lại bộ DR1 đã có.

Nguồn: [IRSA Quick Releases](https://irsa.ipac.caltech.edu/data/SPHEREx/docs/overview_qr.html), [IRSA Spectrophotometry và flags](https://irsa.ipac.caltech.edu/onlinehelp/spherex/spherex/sp.html), [IRSA cutout](https://irsa.ipac.caltech.edu/data/SPHEREx/docs/cutout_tool.html). Các output dưới `data/` bị Git bỏ qua và cần sao lưu riêng.
