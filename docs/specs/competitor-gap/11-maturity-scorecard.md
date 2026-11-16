# 11 · Bảng chấm điểm và mức độ hoàn thiện

Tổng hợp **8 tiêu chí cốt lõi** để thương mại hóa, chấm cho cả 3 đội tại thời điểm 2026-11-16, kèm mục tiêu của nhóm sau P2.

## 1. Thang điểm (1–5)

| Điểm | Ý nghĩa |
| --- | --- |
| 1 | Chưa có hoặc chỉ có ý tưởng |
| 2 | Có bản đầu, còn nhiều lỗ hổng |
| 3 | Dùng được cho demo, có bằng chứng một phần |
| 4 | Dùng được với người thật, đo được, có tài liệu |
| 5 | Sẵn sàng thương mại: ổn định, có số liệu, có quy trình |

## 2. Bảng điểm

| # | Tiêu chí | MINIONS hiện tại | Vanilla | NODIXHI | MINIONS mục tiêu (sau P2) | Căn cứ / tài liệu |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Trải nghiệm người dùng | **3** (Story, 3D, tutorial; đã sửa mobile; chưa có chòm sao, thẻ sao) | 4 | 4 | **4** | [U01–U05](ui/), [08 §2](08-value-and-market.md) |
| 2 | Khả năng mở rộng | **2** (1 instance, ngủ, timeline dựng sẵn) | 3 (máy lớn, không mở rộng ngang) | 1 | **4** | [10-scalability](10-scalability.md) |
| 3 | Chất lượng giải pháp | **3** (223 test FE + pytest, timeline có kiểm chứng) | 5 | 2 | **4** | [06-verification](06-verification.md) |
| 4 | Tính thương mại | **1** (chưa có mô hình) | 1 | 1 | **3** | [09-business-model](09-business-model.md) |
| 5 | Tiềm năng khai thác thực tế | **2** | 3 (API, nghiên cứu) | 3 (giáo dục đại chúng) | **4** | [08 §3](08-value-and-market.md) |
| 6 | Khả năng tạo giá trị | **2** | 3 | 3 | **4** | [08 §4](08-value-and-market.md) |
| 7 | Lợi thế cạnh tranh | **3** (forum, kể chuyện, timeline 14 năm) | 4 | 3 | **5** | [08 §5](08-value-and-market.md), [02-rfc](02-rfc.md) |
| 8 | Mức độ hoàn thiện | **3** | 4 | 3 | **4** | §3 bên dưới |
| | **Tổng (/40)** | **19** | **27** | **20** | **32** | |

> Điểm là đánh giá định tính của người viết, dựa trên mã nguồn, tài liệu và site live. Nhóm nên chấm lại độc lập (mỗi người chấm riêng rồi lấy trung vị).

## 3. Mức độ hoàn thiện theo module (TRL rút gọn)

| Mức | Định nghĩa |
| --- | --- |
| L0 | Ý tưởng / spec |
| L1 | Prototype chạy được trên máy dev |
| L2 | Demo trên môi trường public |
| L3 | Beta: người dùng thật, có đo đạc, có test |
| L4 | GA: SLO, giám sát, tài liệu, hỗ trợ |

| Module | Hiện tại | Mục tiêu G1 (pilot) | Mục tiêu G2 (thương mại) |
| --- | --- | --- | --- |
| Landing, Story, 3D orbit | L2 | L3 | L4 |
| The Eyes + timeline 5 mục tiêu | L2 | L3 | L4 |
| Phổ, quang trắc, astrometry | L2 | L3 | L3 |
| Forum, đăng nhập, kiểm duyệt | L2 | L3 | L4 |
| Chatbot | L2 | L3 | L3 |
| M01 Chòm sao | L0 | L3 | L4 |
| M02 Thẻ sao | L0 | L3 | L4 |
| M03 Tọa độ bất kỳ | L1 (API có đường live) | L3 | L4 |
| M04 Hosting không ngủ | L1 (đã có ping ở landing) | L3 | L4 |
| M05 Tìm vật thể | L0 | L2 | L3 |
| M06, M07 Stack, PM | L0 / L1 | L2 | L3 |
| M09 Discoveries + forum | L0 | L2 | L3 |
| M10 API công khai | L1 | L3 | L4 |
| Edu (quản lý lớp, bài học) | L0 | L2 | L4 |

## 4. Tiêu chí "sẵn sàng thương mại" (Definition of Commercial-Ready)

- [ ] Ngưỡng kiểm chứng ở [08 §6](08-value-and-market.md#6-kiểm-chứng-giả-định) đạt ít nhất 3 trên 5
- [ ] Rủi ro **Aladin Lite GPL-3** đã có hướng xử lý được người có chuyên môn pháp lý xác nhận ([09 §4](09-business-model.md#4-giấy-phép-và-pháp-lý-bắt-buộc-xử-lý-trước-khi-bán))
- [ ] Có chính sách quyền riêng tư và điều khoản sử dụng; có quy trình xin đồng ý của phụ huynh cho gói Edu
- [ ] Ghi nguồn dữ liệu đầy đủ trên UI và trong mọi file xuất ra
- [ ] Đạt SLO pilot trong 30 ngày liên tục ([10 §6](10-scalability.md#6-slo-đề-xuất))
- [ ] Các benchmark SCI-1 đến SCI-8 đạt
- [ ] Có ít nhất 3 bài học hoàn chỉnh (giáo án, phiếu bài tập, đáp án)
- [ ] Có quy trình hỗ trợ (email/form, thời gian phản hồi)
- [ ] Có ít nhất 1 khách hàng trả phí hoặc 1 grant

## 5. Ba việc tác động lớn nhất tới điểm số

| Việc | Tiêu chí cải thiện | Điểm tăng (ước tính) |
| --- | --- | --- |
| API job + cache trên object storage + không ngủ (M03, M04, [10](10-scalability.md)) | Mở rộng, hoàn thiện, UX | +4 |
| Pilot giáo dục (UC1, UC2) + mô hình Edu ([08](08-value-and-market.md), [09](09-business-model.md)) | Thương mại, khai thác, giá trị | +5 |
| Tìm vật thể + forum xác minh (M05, M09) | Lợi thế, chất lượng, giá trị | +4 |
