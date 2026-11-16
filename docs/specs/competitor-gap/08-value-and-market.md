# 08 · Giá trị, người dùng và thị trường

Trả lời cho các tiêu chí: **trải nghiệm người dùng**, **tiềm năng khai thác thực tế**, **khả năng tạo giá trị**, **lợi thế cạnh tranh**.

> Các con số thị trường trong tài liệu này là **giả định cần kiểm chứng** (đánh dấu 🔎). Bước đầu tiên của thương mại hóa
> là phỏng vấn người dùng ([§6](#6-kiểm-chứng-giả-định)), không phải viết thêm code.

## 1. Vấn đề cốt lõi

Dữ liệu thiên văn hiện đại là công khai nhưng **gần như không dùng được với người không chuyên**: file FITS, hệ tọa độ, ngôn ngữ truy vấn ADQL/SIA,
mỗi file khoảng 65 MB, mỗi kho một kiểu. Với SPHEREx, độ dốc học tập càng lớn: 102 dải màu, linear variable filter, pixel 6,15″.

**Giá trị cốt lõi của SPHEREx Explorer:** *từ một cái tên hay một điểm trên trời, tới một thay đổi nhìn thấy được và kiểm chứng được, trong vài giây,
không cần cài đặt.*

## 2. Chân dung người dùng (persona)

| # | Persona | Bối cảnh | Việc cần làm (Job-to-be-done) | Điều họ ngại | Tính năng phục vụ |
| --- | --- | --- | --- | --- | --- |
| P1 | **Giáo viên Vật lý/Địa lý THPT** | Lớp 40 học sinh, máy chiếu, 45 phút | "Cho học sinh thấy vũ trụ thay đổi thật, bằng dữ liệu thật" | Phải chuẩn bị lâu, cài phần mềm, mạng chậm | Story, bài học dựng sẵn, chòm sao, chế độ trình chiếu, VI/EN |
| P2 | **Học sinh, sinh viên tò mò** | Điện thoại, 5–10 phút | "Tự tìm ra một điều gì đó" | Giao diện phức tạp, phải chờ lâu | Play một chạm, thẻ sao, nhật ký phát hiện, chia sẻ |
| P3 | **CLB thiên văn nghiệp dư** | Buổi sinh hoạt, quan sát thực tế | "Biết tối nay ngắm gì, nối với dữ liệu khoa học" | Phải dùng nhiều công cụ rời rạc | Bầu trời thời gian thực (M11), chòm sao, forum |
| P4 | **Nhà khoa học công dân** | Vài giờ mỗi tuần | "Đóng góp phát hiện có giá trị" | Báo động giả, không ai phản hồi | Tìm vật thể (M05), bình chọn và kiểm duyệt (M09) |
| P5 | **Nghiên cứu viên, nghiên cứu sinh** | Đang làm luận văn hoặc paper | "Xem nhanh một field trước khi tải dữ liệu thô" | Tải cả GB chỉ để xem trước | Tọa độ bất kỳ (M03), API, xuất CSV/FITS (M10), phổ (M08) |
| P6 | **Bảo tàng, planetarium, trung tâm STEM** | Màn hình kiosk, khách vãng lai | "Trưng bày có tương tác, tự chạy" | Bảo trì, nội dung cũ | Chế độ kiosk/embed, Story, 3D orbit |
| P7 | **Đơn vị truyền thông khoa học** | Bài báo, video | "Hình ảnh và GIF thật để minh họa" | Bản quyền, khó tạo | `movie.gif`, link nhúng, ghi nguồn tự động |

**Persona ưu tiên cho giai đoạn đầu:** P1 (giáo viên) và P6 (trung tâm STEM). Họ có ngân sách, có nhu cầu lặp lại, và lợi thế kể chuyện của nhóm hợp với họ nhất.

## 3. Trường hợp sử dụng thực tế

| UC | Kịch bản | Persona | Giá trị đo được |
| --- | --- | --- | --- |
| UC1 | Bài học 45 phút "Ngôi sao nhanh nhất bầu trời": so ảnh Barnard qua 14 năm, đo độ dịch, tính vận tốc | P1, P2 | Học sinh tự tính được chuyển động riêng; giáo viên chuẩn bị ≤ 10 phút |
| UC2 | Dự án STEM "Săn tiểu hành tinh": học sinh chạy M05 trên một field, so với catalogue, viết báo cáo | P1, P2, P4 | Mỗi nhóm có ít nhất một track được catalogue xác nhận |
| UC3 | Kiosk bảo tàng: Story tự chạy, khách bấm một ngôi sao để xem thẻ | P6 | Thời gian tương tác trung bình mỗi khách |
| UC4 | Đêm quan sát CLB: "My sky" cho biết mục tiêu nào đang ở trên trời, rồi mở dữ liệu SPHEREx của mục tiêu đó | P3 | Số buổi CLB dùng nền tảng |
| UC5 | Nghiên cứu viên xem nhanh 50 field ứng viên sao lùn nâu qua API, chỉ tải FITS những field đáng xem | P5 | Thời gian và dung lượng tiết kiệm so với tải toàn bộ |
| UC6 | Báo, đài nhúng GIF thật kèm ghi nguồn tự động | P7 | Lượt nhúng, backlink |
| UC7 | Chiến dịch khoa học công dân theo mùa (ví dụ "Tháng sao lùn nâu") trên forum | P4 | Số phiếu, số candidate được kiểm duyệt |

## 4. Giá trị tạo ra

| Nhóm hưởng lợi | Giá trị | Chỉ số tác động (KPI) |
| --- | --- | --- |
| Học sinh, sinh viên | Học khoa học bằng dữ liệu thật, phương pháp kiểm chứng | Số bài học hoàn thành; điểm kiểm tra trước và sau |
| Giáo viên | Bài giảng sẵn có, không cần chuyên môn thiên văn sâu | Thời gian chuẩn bị; số lần dùng lại |
| Cộng đồng | Nơi đóng góp có phản hồi và kiểm duyệt | Người dùng hoạt động hằng tháng ở forum; tỉ lệ candidate được xác nhận |
| Nhà nghiên cứu | Xem nhanh, API, provenance rõ ràng | Số lệnh gọi API; số trích dẫn trong paper |
| Cơ quan khoa học (NASA/IPAC, ESA…) | Tăng mức sử dụng dữ liệu công khai | Lượt truy cập dữ liệu SPHEREx qua nền tảng |
| Việt Nam | Sản phẩm khoa học dữ liệu "made in VN", tiếng Việt | Số trường, tỉnh tham gia |

## 5. Bối cảnh cạnh tranh ngoài hackathon

| Sản phẩm | Mạnh | Yếu so với mình | Mình học gì |
| --- | --- | --- | --- |
| **Zooniverse – Backyard Worlds** | Cộng đồng lớn, quy trình khoa học công dân chuẩn | Chỉ có WISE, giao diện cũ, không có SPHEREx, không có phổ | Quy trình nhiều người cùng phân loại, ghi công người phát hiện |
| **WiseView** | Blink WISE nhanh, chuẩn trong giới | Không có giáo dục, không có SPHEREx, không có cộng đồng | Tốc độ, phím tắt |
| **Aladin Desktop/Lite, ESASky** | Rất mạnh, nhiều survey | Dành cho người chuyên; không có chế độ "kể chuyện" | Tích hợp đa survey (mình đang dùng Aladin Lite) |
| **Stellarium, SkySafari** | Planetarium tuyệt vời, thương mại hóa tốt (SkySafari bán app) | Không có dữ liệu khoa học theo thời gian, không cho phát hiện | Mô hình app trả phí; chất lượng thiên cầu |
| **NASA Eyes, WorldWide Telescope** | Thương hiệu, đồ họa | Không có phân tích blink, không có cộng đồng tiếng Việt | Tour có dẫn dắt |
| **Vanilla Sphere, NODIXHI** | Xem [01-research](01-research.md) | – | – |

### Định vị

> **"Duolingo + Zooniverse cho dữ liệu vũ trụ thật"**: học bằng cách tự phát hiện, kết quả được máy kiểm chứng và cộng đồng xác minh.

### Lợi thế khó sao chép (moat), xếp theo độ bền

1. **Dữ liệu cộng đồng và kết quả đã kiểm duyệt** (forum + phiếu bình chọn + lịch sử). Càng dùng càng có giá trị (hiệu ứng mạng).
2. **Nội dung giáo dục bản địa hóa** (bài học tiếng Việt, theo chương trình Vật lý/Địa lý phổ thông). Tốn công làm và cần chuyên môn sư phạm.
3. **Pipeline đã được kiểm chứng** (benchmark SCI trong [06-verification](06-verification.md), công bố phương pháp). Uy tín tích lũy theo thời gian.
4. **Kỹ thuật** (React, cache, range read). Ít bền nhất, vì đối thủ có thể sao chép.

## 6. Kiểm chứng giả định

| Giả định 🔎 | Cách kiểm chứng | Ngưỡng "tiếp tục" |
| --- | --- | --- |
| Giáo viên muốn dùng dữ liệu thật trong giờ học | Phỏng vấn 15 giáo viên, cho dùng thử UC1 | ≥ 60 % muốn dùng lại |
| Trường hoặc trung tâm STEM sẵn sàng trả tiền | 5 cuộc gặp, đưa ra báo giá thử | ≥ 2 thư bày tỏ ý định (LOI) |
| Học sinh quay lại sau tuần đầu | Pilot ở 2 lớp, theo dõi trong 4 tuần | Tỉ lệ còn dùng sau 4 tuần ≥ 25 % |
| Cộng đồng đóng góp phiếu có chất lượng | Chiến dịch 1 tháng trên forum | ≥ 100 phiếu, độ đồng thuận ≥ 70 % |
| Nhà nghiên cứu dùng API | Giới thiệu ở 2 nhóm nghiên cứu hoặc hội thảo | ≥ 3 nhóm dùng thường xuyên |
