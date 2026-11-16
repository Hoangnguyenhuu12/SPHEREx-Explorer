# 04 · Plan

Ước lượng tính theo **ngày công của một người**. Người phụ trách dựa trên vai trò trong README; nhóm có thể đổi.

## Giai đoạn P0: đuổi kịp những gì dễ thấy (khoảng 1 tuần)

| # | Việc | Phụ trách | Ước lượng | Phụ thuộc | Xong khi |
| --- | --- | --- | --- | --- | --- |
| P0.1 | Keep-alive cron + làm nóng 5 mục tiêu khi khởi động | Duy Hoàng | 0,5 | – | Lần mở đầu tiên < 15 s trong giờ demo |
| P0.2 | Quyết định gói Render, gắn disk cache | Đông | 0,5 | P0.1 | ADR-002 được duyệt |
| P0.3 | Lớp chòm sao trên Aladin (đường + tên, bật/tắt) | Thạch | 2 | – | [U01](ui/U01-sky-map.md) đạt |
| P0.4 | `GET /api/constellation` + readout khi rê chuột | Đông | 1 | – | Test 20 tọa độ đúng |
| P0.5 | `GET /api/star` (Gaia + SIMBAD + Exoplanet) | Khôi | 2 | – | [M02](modules/M02-star-card.md) đạt |
| P0.6 | UI thẻ sao trong viewer và trên bản đồ | Thạch | 2 | P0.5 | [U03](ui/U03-star-card.md) đạt |
| P0.7 | Sửa các điểm của reviewer (đã xong ở PR feedback) | Duy Hoàng | – | – | Đã merge |

## Giai đoạn P1: xem bất kỳ tọa độ nào, chia sẻ, song ngữ (khoảng 1–2 tuần)

| # | Việc | Phụ trách | Ước lượng | Xong khi |
| --- | --- | --- | --- | --- |
| P1.1 | `RangeCutoutProvider` + test pixel giống hệt | Hữu Hoàng | 3 | Sai lệch pixel < 1e-6 so với cutout IRSA |
| P1.2 | API job `POST/GET /api/views` + trả dần | Đông | 3 | [05-spec §2](05-spec.md#2-api-view-jobs) |
| P1.3 | Frontend: tìm theo tên/tọa độ → view job → phim lớn dần | Duy Hoàng | 2 | Mở được 10 tọa độ ngẫu nhiên |
| P1.4 | Trạng thái view trong URL + GIF/PNG/CSV | Đông + Duy Hoàng | 2 | [M10](modules/M10-public-api-share.md) |
| P1.5 | i18n VI/EN cho landing, The Eyes, thẻ sao | Thạch | 2 | Không thiếu key |
| P1.6 | Trang `/docs` (OpenAPI) công khai | Đông | 0,5 | Có link ở footer |

## Giai đoạn P2: vượt (khoảng 2–3 tuần)

| # | Việc | Phụ trách | Ước lượng | Xong khi |
| --- | --- | --- | --- | --- |
| P2.1 | Engine phát hiện: median, nguồn 5σ, mặt nạ | Hữu Hoàng | 3 | Test trên 3 field cố định |
| P2.2 | Nối track (bỏ phiếu vận tốc) + xác nhận pixel | Hữu Hoàng + Nguyên | 4 | Tìm lại được ≥ 1 tiểu hành tinh đã biết |
| P2.3 | Kiểm tra báo động giả bằng xáo trộn thời gian | Nguyên | 1 | `chance_tracks` báo cáo được |
| P2.4 | Gắn tên SkyBoT | Khôi | 1 | Track khớp tên trong 10″ |
| P2.5 | Shift-and-stack | Nguyên | 3 | Pluto ≥ 20σ trên field của nó |
| P2.6 | Đo PM bằng PSF | Nguyên + Hữu Hoàng | 3 | Barnard lệch ≤ 0,5″/năm so với Gaia |
| P2.7 | Discovery posts + bình chọn trong forum | Đông + Thạch | 3 | [M09](modules/M09-discoveries-forum.md) |

## Giai đoạn P3: hoàn thiện

| # | Việc | Phụ trách | Ước lượng |
| --- | --- | --- | --- |
| P3.1 | Đọc phổ tự động (vạch H₂O, CH₄, CO; nhiệt độ theo vật đen) | Nguyên | 3 |
| P3.2 | Bầu trời thời gian thực theo vị trí (JPL Horizons dựng sẵn) | Thạch | 4 |
| P3.3 | Tài liệu kiến trúc gọn (một sơ đồ cho mỗi luồng) | Duy Hoàng | 2 |
| P3.4 | Video demo 90 giây | Cả nhóm | 2 |

## Mốc

```text
Tuần 1  ── P0 xong: chòm sao, thẻ sao, không ngủ            → demo nội bộ
Tuần 2–3 ── P1 xong: tọa độ bất kỳ, chia sẻ, VI/EN           → mời người ngoài thử
Tuần 4–6 ── P2 xong: tìm vật thể + forum xác minh             → "kết quả tự tìm" đầu tiên
Sau đó  ── P3
```
