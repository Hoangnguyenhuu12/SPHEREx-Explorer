# M01 · Chòm sao

**Ưu tiên** P0 · **Phụ trách** Thạch (UI), Đông (API) · **Đối thủ có**: Vanilla (hình + readout), NODIXHI (hình + 3D + tên VI)

## Mục tiêu
Người dùng thấy đường nối và tên chòm sao trên bản đồ, và biết điểm mình đang chỉ vào thuộc chòm sao nào.

## Dữ liệu
| File | Nguồn | Giấy phép |
| --- | --- | --- |
| `constellations.lines.json` | d3-celestial | BSD-3 |
| `constellations.json` (tên + vị trí nhãn) | d3-celestial | BSD-3 |
| Bảng ranh giới Roman 1987 | CDS VI/42 (cũng có trong NODIXHI dưới dạng `constellation_bounds.tsv`) | Dữ liệu công khai |
| Tên tiếng Việt 88 chòm sao | Tự biên soạn, tham khảo NODIXHI `constellations.js` | MIT, cần ghi công |

## Thiết kế
- **Frontend**: `ConstellationLayer` tạo một `A.graphicOverlay({ color, lineWidth: 1 })`, thêm một `A.polyline` cho mỗi đoạn.
  Tên vẽ bằng `A.catalog` có `displayLabel`. Lazy-load dữ liệu khi lớp được bật lần đầu.
- **Readout**: tính phía client bằng bảng Roman (precess J2000 → B1875 rồi tra bảng, khoảng 50 dòng code) để không phải gọi API mỗi lần rê chuột.
- **Backend** (đối chiếu, dùng cho thẻ sao): `astropy.coordinates.get_constellation(SkyCoord(ra, dec), short_name=True)`.

## Tiêu chí nghiệm thu
- SCI-7 (20/20 tọa độ đúng).
- Bật/tắt bằng nút ở dock và phím `L`.
- Khung hình không giảm dưới 50 fps khi kéo bản đồ (máy tầm trung).

## Mở rộng (P3)
Chế độ "nhìn từ bên cạnh" như NODIXHI, dùng khoảng cách Gaia để cho thấy các sao trong một chòm sao cách nhau rất xa.
