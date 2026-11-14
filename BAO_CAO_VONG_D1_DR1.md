# Báo cáo lượt đầu D1 — SPHEREx DR1

Ngày 14/11/2026. Đã đi lần lượt qua Barnard, WISE 0855, Epsilon Indi B, RW Aurigae và R Draconis theo danh mục SIA đã lưu. Bảng ghi trạng thái tại thời điểm tổng hợp; manifest và báo cáo JSON là nguồn chi tiết.

| Sao | FITS D1 đã lưu | Cặp qua lọc sơ bộ | Cặp đã tạo sản phẩm | Cặp không đủ vùng chung | Chỉ mục tạm hoãn vì 503 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Barnard | 28 | 0 | 0 | 0 | 11 |
| WISE 0855 | 15 | 2 | 2 | 0 | 21 |
| Epsilon Indi B | 26 | 11 | 5 | 6 | 20 |
| RW Aurigae | 30 | 4 | 4 | 0 | 8 |
| R Draconis | 43 | 0 | 0 | 0 | 21 |

Sản phẩm gồm FITS căn lưới, PNG và GIF trong `data/processed/`. Các cặp tạo được chỉ qua tiêu chí kỹ thuật sơ bộ, còn mask và chưa xác nhận độc lập độ căn ảnh; không coi là bằng chứng đo chuyển động hay biến quang. Có 81 chỉ mục 503 D1 được giữ trong `data/spherex/<sao>/selection_report.json`, chưa được thử lại trong báo cáo này. Kết quả không chứng minh toàn bộ archive không có thêm cặp; danh mục TAP có thêm bản ghi chưa khảo sát.

Kiểm thử liên quan sau lượt này: 26 passed; có cảnh báo phụ thuộc Starlette TestClient. Có các tiến trình khác đang ghi dữ liệu ở các detector khác, nên không chạy đồng thời tác vụ ghi cùng mục tiêu. Hai sao Barnard và R Draconis chưa có cặp D1 đạt; vòng chỉ là lượt đầu, MVP năm sao chưa hoàn thành.
