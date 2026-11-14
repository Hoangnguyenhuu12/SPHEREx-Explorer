# Phân tích tài nguyên 1/4: SPHEREx tại IRSA

Ngày kiểm tra: 14/11/2026. Tài nguyên do ban tổ chức cung cấp: [IRSA – SPHEREx](https://irsa.ipac.caltech.edu/Missions/spherex.html). Phân tích dựa trên trang này, tài liệu IRSA được liên kết và mã trong nhánh `huu-hoang` tại thời điểm kiểm tra; chưa phải nghiệm thu bằng truy vấn live.

## 1. Tài nguyên này giúp dự án làm gì?

IRSA là cổng truy cập dữ liệu và công cụ SPHEREx. Với Sky Viewer, tài nguyên này hỗ trợ tìm ảnh theo tọa độ và thời gian, tải vùng ảnh nhỏ dạng FITS, tìm hiểu cấu trúc ảnh phổ và kiểm chứng phép đo. Trang gốc cũng liên kết tài liệu, API và notebook mẫu; đây là điểm bắt đầu tra cứu, không phải một bộ dữ liệu duy nhất. [Nguồn](https://irsa.ipac.caltech.edu/Missions/spherex.html)

| Tài nguyên | Có thể tận dụng | Mức ưu tiên |
| --- | --- | --- |
| [Data Explorer](https://irsa.ipac.caltech.edu/applications/spherex/) | Tìm và xem ảnh thủ công, kiểm tra nhanh ảnh nào bao phủ mục tiêu trước khi dựng demo. | Cao |
| [SIA và giao diện lập trình](https://irsa.ipac.caltech.edu/voapi.html) | Tự động tìm ảnh và lấy metadata/URL theo vùng trời; làm đầu vào cho backend. | Cao |
| [Cutout Tool](https://irsa.ipac.caltech.edu/data/SPHEREx/docs/cutout_tool.html) | Tải vùng nhỏ từ FITS nhiều extension, giữ cấu trúc và metadata cần cho xử lý; giảm tải so với ảnh đầy đủ. | Cao |
| [Spectrophotometry Tool](https://irsa.ipac.caltech.edu/onlinehelp/spherex/) | Tham khảo phép đo phổ bằng forced photometry, đối chiếu phương pháp và kết quả khi dữ liệu phù hợp. | Cao cho phần khoa học |
| [Notebook ảnh phổ](https://caltech-ipac.github.io/irsa-tutorials/spherex-intro/), [cutout](https://caltech-ipac.github.io/irsa-tutorials/spherex-cutouts/) và [PSF](https://caltech-ipac.github.io/irsa-tutorials/spherex-psf/) | Học cách đọc extension, tọa độ và PSF; dùng làm tài liệu kiểm tra pipeline. | Cao |
| [Source Discovery Tool](https://caltech-ipac.github.io/irsa-tutorials/spherex-source-discovery-tool-demo/) | Thử tìm và mô tả nguồn trong vùng chọn mà không cần tọa độ nguồn có sẵn; phù hợp nghiên cứu thêm, không mặc định là phát hiện khoa học đã xác nhận. | Sau MVP |
| [Mosaic Tool](https://irsa.ipac.caltech.edu/Missions/spherex.html) và all-sky cube | Tạo mosaic đa bước sóng hoặc xem dữ liệu phổ toàn trời. Có thể hữu ích cho ngữ cảnh/bổ sung phổ; cần xác minh phù hợp trước khi dùng thay chuỗi ảnh theo thời gian. | Sau MVP |
| [MOST](https://irsa.ipac.caltech.edu/Missions/spherex.html) | Tìm ảnh theo vị trí dự đoán của thiên thể trong hệ Mặt Trời ở thời điểm quan sát; hữu ích nếu mở rộng sang tiểu hành tinh/sao chổi. | Sau MVP |

## 2. Thông tin quan trọng về dữ liệu

- SPHEREx quan sát trong khoảng **0,75–5,0 µm**, bằng thiết bị quang phổ ảnh sử dụng bộ lọc biến thiên tuyến tính (LVF). Trang IRSA liệt kê sáu khoảng bước sóng với độ phân giải phổ khác nhau; không nên hiểu mọi ảnh ở cùng một bước sóng. [Nguồn](https://irsa.ipac.caltech.edu/Missions/spherex.html)
- IRSA thông báo **DR1 ra tháng 11/2026**: ảnh DR1 là dữ liệu QR2 được xử lý lại và được thiết kế để sử dụng cùng ảnh QR3 như một tập xử lý thống nhất. DR1 còn có all-sky cube với **102 kênh phổ danh nghĩa**. Điều này không có nghĩa cube mặc nhiên thay thế được ảnh riêng lẻ cho phân tích theo thời gian. [DR1](https://irsa.ipac.caltech.edu/data/SPHEREx/docs/overview_dr1.html)
- Khi DR1 được phát hành, **QR2 không còn được trả về qua tìm kiếm IRSA/VO**; theo IRSA, QR2 vẫn có thể tải trực tiếp đến hết tháng 2/2027. QR1 đã ngừng cung cấp. Vì vậy cần kiểm tra cả lựa chọn release và đường dẫn trực tiếp cũ, không giả định query QR2 tiếp tục hoạt động. [Quick Releases](https://irsa.ipac.caltech.edu/data/SPHEREx/docs/overview_qr.html)
- QR1/QR2 ban đầu có lỗi header của PSF; sai lệch phép đo phụ thuộc vị trí và có thể tới khoảng ±5% ở một số góc detector. IRSA nêu bản sửa `+psffix1` cho pipeline 6.4–6.5.5; từ 6.5.6 trở đi không bị ảnh hưởng theo thông báo. Kiểm tra phiên bản/header của chính file trước khi dùng PSF hoặc so sánh kết quả cũ. [Thông báo PSF](https://irsa.ipac.caltech.edu/data/SPHEREx/docs/psfhdrerr.html)
- Cutout có thể chỉ phủ một phần vùng yêu cầu. Cần kiểm tra kích thước ảnh, WCS, footprint, mask và vị trí dự đoán trước khi đo; có URL hoặc FITS không có nghĩa nguồn nằm trong vùng đo. [Tài liệu cutout](https://irsa.ipac.caltech.edu/data/SPHEREx/docs/cutout_tool.html)

## 3. Đối chiếu với dự án hiện tại

1. **Ưu tiên kiểm tra release:** [shared/pipeline/irsa.py](shared/pipeline/irsa.py) đang mặc định `spherex_qr2`, còn [build_frames.py](members/huu-hoang/build_frames.py) có metadata `release: qr2` cố định. Đây là rủi ro trực tiếp với tìm kiếm live và nhãn dữ liệu khi dùng release mới. Cần xác minh tên collection DR1/QR3 thực tế bằng tài liệu hoặc truy vấn, cập nhật cấu hình và truyền release thật xuyên suốt; chưa nên tự đoán tên collection hay gộp dữ liệu mà không kiểm tra.
2. **Tận dụng pipeline có sẵn:** mã đã có truy vấn SIA2, phương án TAP dự phòng, tải cutout, căn TAN và ghép median. Nên đối chiếu đầu vào/đầu ra với tài liệu IRSA, kiểm thử bằng dữ liệu thật và giữ lại release, detector, thời điểm, nguồn URL cùng trạng thái chất lượng trong metadata.
3. **Việc Hữu Hoàng đang làm:** mẫu Luhman 16 `2026W01_2A_0408_2` D6 có vị trí dự đoán ngoài mảng cutout; ghi chú chi tiết ở [TASKS.md](members/huu-hoang/TASKS.md). Có thể dùng Data Explorer/SIA để chọn ảnh khác có footprint bao phủ mục tiêu, sau đó kiểm tra mask và nền. Đối chiếu thêm Spectrophotometry Tool và PSF cùng Nguyên trước khi sử dụng kết quả như phổ khoa học.
4. **Giữ cảnh báo khoa học:** khi so sánh blink, ảnh hiệu hoặc độ sáng, cần ghi detector/bước sóng, thời điểm, release, thang hiển thị và giới hạn đo. Thay đổi trông thấy trên ảnh chưa tự chứng minh chuyển động hay biến quang.
5. **Chuẩn bị demo:** lưu bộ dữ liệu mẫu nhỏ có nguồn và thông tin release rõ ràng; kiểm tra chế độ offline để demo không phụ thuộc tốc độ hoặc tình trạng dịch vụ IRSA. Dữ liệu mẫu không thay thế kiểm thử live.

## 4. Thứ tự đề xuất

1. Khôi và Đông kiểm tra truy vấn live DR1/QR3, collection thực tế và cách báo lỗi khi release không khả dụng.
2. Hữu Hoàng kiểm tra metadata release, footprint và chất lượng cutout; thử một ảnh thay thế cho mẫu Luhman thiếu coverage.
3. Nguyên cùng Hữu Hoàng so sánh phương pháp nền, khẩu độ và PSF với tài liệu/công cụ IRSA; ghi rõ dữ liệu nào đủ điều kiện sử dụng.
4. Nhóm cập nhật fixture và QA cho các release đã xác minh; chỉ sau đó cân nhắc mosaic, cube hoặc tìm nguồn tự động.

## 5. Ghi nguồn khi công bố

Trang IRSA yêu cầu lời cảm ơn SPHEREx cho các ấn phẩm sử dụng sản phẩm dữ liệu. Trang DR1 và QR còn cung cấp DOI riêng theo từng bộ dữ liệu; khi dùng, chọn đúng release/sản phẩm và chép nguyên văn lời cảm ơn từ nguồn chính thức. Xem [DR1](https://irsa.ipac.caltech.edu/data/SPHEREx/docs/overview_dr1.html) và [Quick Releases](https://irsa.ipac.caltech.edu/data/SPHEREx/docs/overview_qr.html). Quy định ghi nguồn của cuộc thi cần kiểm tra riêng theo hướng dẫn chính thức của ban tổ chức.
