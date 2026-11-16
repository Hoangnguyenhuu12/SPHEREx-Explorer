# 09 · Mô hình kinh doanh và tính thương mại

Trả lời cho tiêu chí: **tính thương mại**, **khả năng tạo giá trị**.

> Mức giá và chi phí dưới đây là **khung để thảo luận**, chưa phải báo giá. Giá hosting thay đổi theo thời gian; trước khi
> lập ngân sách cần kiểm tra bảng giá hiện hành của Vercel, Render và Supabase.

## 1. Lean Canvas

| Ô | Nội dung |
| --- | --- |
| **Vấn đề** | 1) Dữ liệu vũ trụ công khai nhưng khó dùng · 2) Giáo viên thiếu học liệu khoa học dữ liệu bằng tiếng Việt · 3) Khoa học công dân thiếu phản hồi và kiểm chứng |
| **Phân khúc khách hàng** | Người trả tiền: trường học, trung tâm STEM, bảo tàng. Người dùng: học sinh, CLB, cộng đồng. Người dùng sớm (early adopter): giáo viên Vật lý trẻ, CLB thiên văn đại học |
| **Giá trị độc nhất** | Từ một điểm trên trời tới một thay đổi thấy được và kiểm chứng được, trong vài giây, bằng tiếng Việt |
| **Giải pháp** | Viewer + bài học dựng sẵn + tìm vật thể có kiểm chứng + forum xác minh |
| **Kênh** | Hội thảo giáo viên, sở GD&ĐT, CLB thiên văn, NASA Space Apps, mạng xã hội (GIF thật), báo khoa học |
| **Dòng doanh thu** | Freemium · gói trường học · gói kiosk/triển lãm · API trả phí · tài trợ, grant |
| **Cấu trúc chi phí** | Hosting (compute, disk, băng thông), làm nội dung, hỗ trợ, phát triển |
| **Chỉ số chính** | Số lớp dùng hằng tuần, bài học hoàn thành, candidate được xác nhận, số lệnh gọi API |
| **Lợi thế không công bằng** | Dữ liệu cộng đồng đã kiểm duyệt + nội dung bản địa (xem [08 §5](08-value-and-market.md#lợi-thế-khó-sao-chép-moat-xếp-theo-độ-bền)) |

## 2. Các dòng doanh thu

| Dòng | Đối tượng | Gói | Khung giá (giả định) | Ưu tiên |
| --- | --- | --- | --- | --- |
| **Free** | Mọi người | Viewer, 5 mục tiêu, chòm sao, thẻ sao, forum | 0 | Luôn có |
| **Edu (trường học)** | Trường, giáo viên | Bài học + phiếu bài tập, lớp học (quản lý học sinh), báo cáo tiến độ, chế độ trình chiếu, ưu tiên tốc độ | Theo trường/năm | **P1** |
| **Kiosk / Triển lãm** | Bảo tàng, trung tâm STEM, sự kiện | Chế độ kiosk tự chạy, nội dung theo chủ đề, giao diện mang thương hiệu của đơn vị (không phải NASA), hỗ trợ lắp đặt | Theo điểm/năm hoặc theo sự kiện | P2 |
| **API Pro** | Nhà nghiên cứu, ứng dụng khác | Hạn mức cao, job ưu tiên, xuất hàng loạt, SLA | Theo lượng dùng | P3 |
| **Tài trợ / grant** | Quỹ khoa học, quỹ giáo dục, CSR doanh nghiệp | Chiến dịch khoa học công dân, chương trình phổ cập | Theo dự án | **P1** (song song) |
| **Dịch vụ** | Đơn vị truyền thông, nhà xuất bản | Video, hình ảnh từ dữ liệu thật, nội dung tùy biến | Theo hợp đồng | P3 |

**Nguyên tắc:** phần khám phá cốt lõi luôn **miễn phí** (phù hợp tinh thần dữ liệu công khai và các điều khoản dữ liệu). Tiền đến từ **nội dung, công cụ quản lý, độ tin cậy và dịch vụ**, không đến từ việc bán dữ liệu.

## 3. Chi phí vận hành theo quy mô (ước lượng tương đối)

| Quy mô | Người dùng đồng thời | Hạ tầng | Mức chi phí |
| --- | --- | --- | --- |
| S0 Hackathon | < 10 | Vercel free + Render free (ngủ) + Supabase free | ≈ 0 |
| S1 Pilot | 10–50 | Vercel + Render gói không ngủ (1 instance) + disk cache + Supabase gói cơ bản | Thấp (vài chục USD/tháng) 🔎 |
| S2 Nhiều trường | 50–300 | 2–4 instance API + hàng đợi job + object storage cho khung ảnh + CDN | Trung bình 🔎 |
| S3 Toàn quốc | 300+ | Autoscale worker, đặt gần `us-east-1` (cạnh S3 SPHEREx), cache nhiều tầng | Theo lượng dùng 🔎 |

Các yếu tố chi phí chính: CPU khi cắt và resample ảnh, dung lượng cache, băng thông ảnh. Cách giảm được nêu trong [10-scalability](10-scalability.md).

## 4. Giấy phép và pháp lý (BẮT BUỘC xử lý trước khi bán)

| Thành phần | Giấy phép / điều khoản | Rủi ro thương mại | Hành động |
| --- | --- | --- | --- |
| Mã của dự án | MIT | Thấp | Giữ nguyên |
| **Aladin Lite** (`aladin-lite` 3.8.x, đang đóng gói vào frontend) | **GPL-3** (theo `package.json` của gói) | **Cao**: phân phối JS đã đóng gói chứa mã GPL có thể buộc phần frontend phải theo GPL | Hỏi ý kiến pháp lý; hoặc tải Aladin như một thành phần riêng không đóng gói chung; hoặc liên hệ CDS về giấy phép; hoặc cân nhắc thư viện thay thế cho phiên bản thương mại |
| three.js, React, TanStack Query | MIT | Thấp | Ghi công trong `THIRD-PARTY-NOTICES` |
| d3-celestial (nếu dùng cho M01) | BSD-3 | Thấp | Ghi công |
| sphere-blink (đối thủ) | AGPL-3.0 | Cao nếu chép mã | Không chép mã ([ADR-001](03-decisions.md#adr-001)) |
| Dữ liệu NASA/IPAC (SPHEREx, WISE, 2MASS) | Dữ liệu công khai, yêu cầu trích dẫn; **logo và tên NASA không được dùng để ngụ ý được bảo trợ** | Trung bình (thương hiệu) | Ghi nguồn; giữ dòng "independent, not an official NASA product" |
| Gaia (ESA) | Dùng tự do, có yêu cầu ghi nguồn (kiểm tra điều khoản hiện hành của ESA) 🔎 | Thấp–trung bình | Ghi nguồn theo mẫu của ESA |
| SIMBAD, VizieR (CDS) | Điều khoản sử dụng của CDS, có yêu cầu ghi nguồn, giới hạn lưu lượng 🔎 | Trung bình khi gọi API ở quy mô lớn | Cache mạnh; liên hệ CDS nếu dùng thương mại hoặc lưu lượng cao |
| NASA Exoplanet Archive, JPL Horizons, IMCCE SkyBoT | Dịch vụ công, có giới hạn lưu lượng 🔎 | Trung bình | Cache, tôn trọng giới hạn |
| Dữ liệu người dùng (forum, tài khoản) | Luật bảo vệ dữ liệu cá nhân (Việt Nam: Nghị định 13/2023/NĐ-CP) 🔎; học sinh là người chưa thành niên | Cao với gói Edu | Chính sách quyền riêng tư, cần đồng ý của phụ huynh, giảm thiểu dữ liệu thu thập |

> Đây là danh sách cần kiểm tra, **không phải tư vấn pháp lý**. Trước khi ký hợp đồng thương mại đầu tiên, cần người có chuyên môn rà soát.

## 5. Lộ trình thương mại hóa

| Giai đoạn | Mục tiêu | Điều kiện để sang giai đoạn sau |
| --- | --- | --- |
| G0 Kiểm chứng (1–2 tháng) | Phỏng vấn, pilot 2 lớp, 1 trung tâm STEM | Đạt ngưỡng ở [08 §6](08-value-and-market.md#6-kiểm-chứng-giả-định) |
| G1 Pilot có phí hoặc tài trợ (3–6 tháng) | 3–5 trường, 1 grant | Xử lý xong rủi ro Aladin GPL và chính sách dữ liệu; uptime ≥ 99 % |
| G2 Gói Edu (6–12 tháng) | Tự phục vụ: đăng ký, thanh toán, quản lý lớp | Doanh thu định kỳ đủ trang trải hạ tầng |
| G3 Mở rộng | Kiosk, API Pro, thêm dữ liệu (WISE, Euclid, Rubin) | – |

## 6. Rủi ro thương mại

| Rủi ro | Mức | Giảm thiểu |
| --- | --- | --- |
| Trường học có ngân sách thấp, chu kỳ mua dài | Cao | Bắt đầu bằng grant hoặc CSR; giá theo trường, không theo đầu học sinh |
| Phụ thuộc dịch vụ bên ngoài (IRSA, CDS) | Trung bình | Cache, dự phòng, giảm dần mức phụ thuộc vào gọi trực tiếp |
| Đối thủ quốc tế miễn phí (Zooniverse, Stellarium) | Trung bình | Tập trung vào nội dung bản địa + kiểm chứng + lớp học |
| Giấy phép (Aladin GPL, thương hiệu NASA) | Cao | Xem §4 |
| Đội nhỏ, kiêm nhiệm | Cao | Tập trung vào một phân khúc (Edu) trước |
