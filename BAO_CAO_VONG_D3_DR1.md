# Báo cáo vòng D3 — DR1 (14/11/2026)

Thứ tự: Barnard → WISE 0855 → Epsilon Indi B → RW Aurigae → R Draconis. Mỗi sao: tải 3 cutout DR1 D3 chưa thử từ IRSA (SIA đã cache) → sàng lọc → xử lý cặp nếu đạt; lặp đến khi có cặp D3 hoặc hết ứng viên. Cuối vòng thử lại một lần các chỉ mục HTTP 503.

| Sao | Ảnh D3 (tổng) | Mới tải vòng này | Qua lọc riêng lẻ | Cặp D3 | Kết thúc vì | 503 còn treo |
| --- | ---: | ---: | ---: | ---: | --- | ---: |
| Barnard | 29 | 10 | 0 | 0 | Hết ứng viên SIA | 10 |
| WISE 0855 | 3 | 0 | 3 | 1 (có sẵn) | Đã có cặp | 0 |
| Epsilon Indi B | 9 | 6 | 9 | **1 (mới)** | Tìm được cặp | 5 |
| RW Aurigae | 18 | 12 | 1 | 0 | Hết ứng viên SIA | 20 |
| R Draconis | 35 | 23 | 0 | 0 | Giới hạn 10 lượt | 8 |

**Cặp mới:** Epsilon Indi B D3 `2025W18_1B_0091_2` (29/04/2025, 1,805 µm) và `2025W40_1A_0067_2` (29/09/2025, 1,822 µm), cách 153 ngày. Sản phẩm ở `data/processed/epsilon_indi_b_d3_comparison/`: vùng chung hình học 88,3%, vùng hợp lệ 57,3% (1265 pixel), 0 nguồn nền ghép cặp. Đây là demo kỹ thuật; căn ảnh chưa được xác nhận độc lập.

**Không có cặp:**
- Barnard và R Draconis: mọi ảnh D3 đều có pixel dự đoán không hữu hạn và có cờ chất lượng (bão hòa), giống như ở các detector khác.
- RW Aurigae D3: chỉ 1/18 ảnh qua lọc.

Không nới ngưỡng, không xóa cờ.

**Còn lại:** 43 chỉ mục vẫn bị HTTP 503 sau khi thử lại. Danh sách nằm trong `selection_report.json` (status `deferred_503`) và `irsa-download-lists/retry503-d3-round1.txt` của từng sao. Ứng viên D3 chưa thử: Epsilon ~46 (không cần vì đã có cặp), R Draconis ~26 trong SIA, cùng ~500 bản ghi TAP.

Tổng sau vòng (tất cả detector, theo lần sàng lọc gần nhất, gồm cả ảnh do agent D1/D2 chạy song song tải): Barnard 139 ảnh/0 cặp, WISE 42/10, Epsilon 63/20, RW 81/4, R Draconis 110/0.
