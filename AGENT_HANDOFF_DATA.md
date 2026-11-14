# Bàn giao: SPHEREx Sky Viewer — dữ liệu thật và xử lý ảnh MVP

Cập nhật 14/11/2026. Thư mục làm việc `D:\code\NASA-space-challenges-PlanetXvsSphereX\new`; Python hiện có `.venv/Scripts/python.exe`. Đọc manifest và report trước khi tiếp tục vì số liệu có thể thay đổi.

## Yêu cầu của người dùng

- Tận dụng hệ thống đã có để chạy ảnh SPHEREx thật mới tải từ IRSA; không tự động dùng ảnh demo/fixture cũ thay cho dữ liệu nộp thi. Code nằm ở thư mục gốc repo; `old/` cục bộ chỉ là bản sao cũ để tham khảo. Giữ dữ liệu và thay đổi hiện có.
- Tìm thêm ảnh DR1 phù hợp cho các sao còn thiếu cặp, kiểm tra và xử lý ảnh khi tìm được. Mục tiêu là MVP trình diễn ảnh qua thời gian; không tuyên bố phát hiện hay đo chuyển động/biến quang khi chưa xác thực khoa học.
- Giữ FITS gốc và nguồn. Một chuỗi phải cùng detector và release, xem xét bước sóng thực tế, cờ chất lượng, WCS và thời gian; không dùng ảnh tổng hợp lấp dữ liệu thiếu.
- Tải tuần tự, checkpoint từng file, không tải lại file hợp lệ. HTTP 503: thử lại riêng chỉ mục tối đa 3 phút, quá thời gian báo mã lỗi/chỉ mục cho người dùng và chuyển sang chỉ mục khác.

## Trạng thái hiện tại

Tổng **156 FITS DR1, 625.769.280 byte** theo manifest. Ban đầu có 90, sau đó tải thêm để tìm cặp. Sau khi chạy lại `screen_comparison_candidates.py` và `check_comparison_readiness.py`:

| Sao | FITS | Ảnh qua lọc riêng lẻ | Cặp qua bộ lọc sơ bộ |
| --- | ---: | ---: | --- |
| Barnard’s Star | 36 | 0 | 0 |
| WISE 0855−0714 | 18 | 17 | 2: D3, D6 |
| Epsilon Indi B | 21 | 18 | 1: D6 |
| RW Aurigae | 45 | 8 | 0 |
| R Draconis | 36 | 0 | 0 |

Ba cặp của hai sao đã được xử lý thành FITS căn lưới, PNG so sánh và GIF trong `data/processed/wise0855_d3_comparison/`, `wise0855_d6_comparison/`, `epsilon_indi_b_d6_comparison/`. Vùng chung hợp lệ tương ứng 84,65%, 83,57%, 83,02%. Đây là **demo kỹ thuật**, chưa phải bằng chứng phát hiện hoặc chuyển động. Chưa xác nhận độc lập đủ chắc về căn ảnh; số cặp nguồn nền ứng viên lần lượt 1, 1, 0. Chưa match PSF, nền, catalog độc lập hay truyền sai số. Dấu cộng là tọa độ dự đoán, vùng tím là mask. Các cặp đã chọn chưa được tự động tích hợp vào giao diện MVP.

Barnard có phần lớn pixel tại tọa độ dự đoán bị cờ overflow/bloom; R Draconis cả 36 có overflow, bloom, SUR_ERROR. Điều này không làm toàn bộ ảnh vô dụng và không chứng minh kho IRSA không có ảnh phù hợp. RW có 8 ảnh đơn lẻ đạt kiểm tra nhưng chưa có cặp đồng detector, cách ít nhất 30 ngày, cùng ngưỡng bước sóng. Các ngưỡng là **heuristic kỹ thuật**, không phải chuẩn khoa học IRSA. Kiểm tra tọa độ/epoch, vùng lân cận, giải pháp cho sao bão hòa và tìm quan sát khác; không nới ngưỡng hoặc xóa cờ chỉ để báo đủ 5 sao. Tọa độ dùng proper motion tuyến tính từ J2000, chưa tính đầy đủ thị sai/quỹ đạo hệ đôi; vị trí dự đoán không phải phát hiện thực.

Lượt RW Aurigae D1 batch `mvp4` vừa kết thúc thành công, 3 FITS đã lưu; không còn tiến trình tải của lượt đó. Có 503 tạm thời và đã tự phục hồi. `MVP_DR1_ADDITIONAL_ACQUISITION.md` và `IMAGE_DEMO_REPORT.md` mô tả chi tiết nhưng là snapshot trước batch này: số 153 và 6 ảnh RW trong đó đã cũ. Nguồn mới nhất là `data/reports/comparison_candidates.json`, `data/reports/comparison_readiness.json` và từng manifest.

## Dữ liệu Khôi và QR/DR

Gói `SPHEREx_Full_Harvest_and_Fusion_Data/` (cục bộ, không theo dõi bằng Git) là công việc thu thập và thử hợp nhất/hiệu ảnh của Khôi, gồm QR3, AllWISE, Gaia và sản phẩm dẫn xuất; có thể tham khảo code sau kiểm tra, nhưng không trộn QR3 với DR1 trong chuỗi so sánh. Import được kiểm toán tại `data/imports/full_harvest_fusion/`; xem `FUSION_IMPORT_REVIEW.md`, `FUSION_REPAIR_REPORT.md`. Nhiều cutout QR3 Barnard/Epsilon gốc không phủ vị trí dự đoán theo epoch; đã thử sửa một số cutout D6 tại `data/fusion_repairs/qr3/`. WISE trong gói không có FITS SPHEREx để chứng minh các mục JSON; R Dra thường có pixel mục tiêu không hữu hạn/cờ. Ảnh hiệu SPHEREx D6–AllWISE W1 khác thiết bị/dải sóng, không chứng minh chuyển động; một số nhãn thời gian từng không khớp metadata. QR là quick release, DR là data release; dùng DR1 nhất quán cho luồng chính.

## File và lệnh cần đọc

- `data/spherex/<target>/manifest.json`, `selection_report.json`, `validation_report.json`, `sia-votable.xml`, `cutouts/`: ảnh thực, URL, checksum, checkpoint. `data/` bị Git bỏ qua; cần chia sẻ riêng nếu agent chạy trên máy khác.
- `scripts/acquire_comparison_extras.py`: chọn tối đa 3 ảnh chưa thử theo detector từ SIA đã lưu. `--batch <nhãn_mới>` tạo danh sách mới; dùng lại nhãn để tiếp tục danh sách. SIA được cache, không đại diện toàn bộ archive hiện tại. Script gọi downloader nhưng hiện không lan truyền mã lỗi subprocess; xem `selection_report.json`.
- `scripts/download_selected_spherex.py`: retry 180 giây/chỉ mục, xác thực FITS, lưu manifest sau mỗi file, bỏ qua file có SHA khớp. Không chạy nhiều agent cùng ghi manifest một mục tiêu.
- `scripts/screen_comparison_candidates.py`: kiểm tra ảnh và cặp; kết quả `data/reports/comparison_candidates.json`. Cờ SOURCE/FULLSAMPLE đơn lẻ không phải lỗi; các cờ chất lượng khác tại pixel dự đoán bị loại theo quy tắc hiện tại.
- `scripts/process_candidate_pair.py`: tạo ảnh chẩn đoán từ cặp đã qua lọc; `scripts/check_comparison_readiness.py`: kiểm tra sản phẩm và nguồn nền; `scripts/validate_fits.py`: kiểm tra FITS. `members/huu-hoang/tan_pipeline.py` xử lý mask theo header `MSKNxxxx`/`MSKMxxxx`.
- `IMAGE_DEMO_REPORT.md`, `COMPARISON_SCREENING_REPORT.md`, `MVP_DR1_ADDITIONAL_ACQUISITION.md`, `README_DATA.md`: lưu ý số liệu snapshot cũ; ưu tiên JSON hiện tại.

Chạy tại thư mục gốc repo:

```powershell
.venv/Scripts/python.exe scripts/acquire_comparison_extras.py --detector 1 --targets rw_aurigae --batch mvp5
.venv/Scripts/python.exe scripts/screen_comparison_candidates.py
.venv/Scripts/python.exe scripts/process_candidate_pair.py --target rw_aurigae --detector 1  # chỉ khi có cặp đạt
.venv/Scripts/python.exe scripts/check_comparison_readiness.py
.venv/Scripts/python.exe -m pytest -q --basetemp=data/pytest_handoff_tmp scripts/test_comparison_screen.py scripts/test_processed_comparison.py members/dong/tests/test_spherex_flags.py
```

Các batch D2–D5 của ba sao và D1 RW `mvp2`–`mvp4` đã thử. Lựa chọn mặc định trải đều thời gian, không đảm bảo nhanh tìm cặp cùng bước sóng; cải thiện dựa trên metadata phù hợp nếu xác minh được. Chỉ dùng URL/record IRSA có thật. Kiểm thử gần nhất trước batch mvp4: 5 passed. Batch mvp4 chỉ bổ sung dữ liệu; chưa chạy lại pytest sau đó.

## Tích hợp và nguồn

Backend có chế độ dữ liệu thật, nhưng API trả ảnh không đồng nghĩa chuỗi đạt điều kiện so sánh; từng có cảnh báo `MIXED_WAVELENGTH`. Xác minh hệ thống và UI trước khi khẳng định MVP hoàn chỉnh; không fallback ảnh demo. `.env` cục bộ đặt `DATA_MODE=real`, `VITE_USE_MOCK=false`; không chia sẻ secrets. Cấu trúc `new/`/`old/` đã bỏ, code trở về thư mục gốc như GitHub; không reset, clean hoặc ghi đè công việc người khác. Dữ liệu thực không được Git theo dõi.

Nguồn: [IRSA SPHEREx](https://irsa.ipac.caltech.edu/Missions/spherex.html), [cutout tutorial](https://caltech-ipac.github.io/irsa-tutorials/spherex-cutouts/), [archive](https://irsa.ipac.caltech.edu/spherex-archive-documentation/), [QR](https://irsa.ipac.caltech.edu/data/SPHEREx/docs/overview_qr.html). Báo lại file mới tải, mã chỉ mục lỗi, số cặp đạt, ảnh đã xử lý, kiểm thử và hạn chế; không khẳng định hoàn thành nếu còn thiếu.
