# Báo cáo một lượt DR1 — D6 — 14/11/2026

Đã thực hiện tuần tự Barnard → WISE 0855 → Epsilon Indi B → RW Aurigae → R Draconis và dừng sau một lượt.

Bản clone ban đầu không có FITS. Số liệu dưới đây là dữ liệu thực tải trong lần làm việc này, không cộng các snapshot cũ trong repo. Dùng SIA/IBE của IRSA để truy vấn và tải; mỗi sao dừng khi có một cặp xử lý đạt hoặc đã thử hết ứng viên phù hợp trong truy vấn đã lưu. Không phải khảo sát toàn bộ archive.

| Sao | FITS D6 đã tải/kiểm tra | Ảnh đạt riêng lẻ | Cặp qua lọc | Cặp đã xử lý | Kết quả |
| --- | ---: | ---: | ---: | ---: | --- |
| Barnard’s Star | 41 | 0 | 0 | 0 | Pixel mục tiêu không đạt chất lượng |
| WISE 0855 | 3 | 3 | 1 | 1 | Đã tạo FITS căn lưới, PNG, GIF |
| Epsilon Indi B | 6 | 6 | 1 | 1 | Đã tạo FITS căn lưới, PNG, GIF |
| RW Aurigae | 38 | 1 | 0 | 0 | Chỉ 1 ảnh đạt, chưa có cặp |
| R Draconis | 70 | 0 | 0 | 0 | Pixel mục tiêu không đạt chất lượng |

Tổng **158 FITS DR1 D6**, **631,560,960 byte**; tất cả SHA-256 khớp manifest và đã qua kiểm tra thu nhận FITS. Hai cặp đã xử lý là demo kỹ thuật, chưa đủ cặp cho cả năm sao.

| Sao | Hai quan sát | Cách nhau (ngày) | Vùng chung hợp lệ |
| --- | --- | ---: | ---: |
| WISE 0855 | `2025W19_1B_0116_1` → `2026W20_1A_0033_1` | 370.4 | 83.57% |
| Epsilon Indi B | `2025W18_1B_0081_2` → `2026W18_2A_0174_2` | 367.2 | 83.02% |

Sản phẩm nằm trong `data/processed/wise0855_d6_comparison/` và `data/processed/epsilon_indi_b_d6_comparison/`: `aligned_diagnostic.fits`, `comparison.png`, `blink.gif`, `report.json`.

Tiêu chí giữ nguyên: cùng DR1/D6, cách ít nhất 30 ngày; chênh lệch bước sóng tại vị trí dự đoán ≤ 0,5 lần độ rộng dải nhỏ hơn; pixel hữu hạn và không có cờ xấu ngoài SOURCE/FULLSAMPLE. Sản phẩm yêu cầu ít nhất 50% vùng chung hợp lệ. Đây là ngưỡng kỹ thuật của pipeline, chưa phải xác thực khoa học.

Các lỗi HTTP 503/timeout và trạng thái cuối nằm trong `data/d6_round.log` và `data/spherex/<target>/selection_report.json`. Chi tiết từng ảnh, cặp, cờ chất lượng: `data/reports/comparison_candidates.json`. Kết quả lượt: `data/reports/d6_round.json`; kiểm tra toàn vẹn: `data/reports/d6_round_integrity.json`.

Đã chạy 6 kiểm thử đạt (3 kiểm thử sàng lọc/thu nhận/retry và 3 kiểm thử mask/sản phẩm). Căn ảnh chưa được xác nhận độc lập; chưa khớp PSF, nền hay truyền sai số. Không dùng blink/ảnh hiệu này để khẳng định chuyển động hoặc biến quang. Dữ liệu trong data/ không được Git theo dõi.

Nguồn truy vấn: [IRSA SPHEREx](https://irsa.ipac.caltech.edu/applications/spherex/search-spectral-images), [SIA](https://irsa.ipac.caltech.edu/SIA). URL chính xác cho từng FITS được lưu trong manifest.
