# Where are you: vệ tinh SPHEREx bay quanh Trái Đất — kế hoạch thiết kế

Ngày 14/11/2026. Căn cứ: `SPHEREX_SATELLITE_RESEARCH.md` (nguồn JPL, arXiv:2511.02985). Skill dùng: `ui-ux-pro-max` (stack threejs, nhóm Animation/Accessibility), `frontend-design` (một điểm nhấn, chuyển động có nghĩa).

## 1. Mục tiêu

Người xem hiểu ngay: "SPHEREx là chiếc kính hình nón bay vòng qua hai cực, dọc đường ngày–đêm, và từ đó nó chụp cả bầu trời". Vệ tinh là chuyển động chính thứ hai của cảnh, sau Trái Đất quay. Không thêm hiệu ứng nào khác.

## 2. Quyết định thiết kế

| # | Quyết định | Căn cứ | Ghi rõ minh hoạ |
| --- | --- | --- | --- |
| 1 | Mô hình dựng bằng hình học three.js theo đúng tỉ lệ bộ phận: 3 nón lồng nhau (cao 1,7 m, miệng 3,2 m, ngoài trắng, trong bạc), 3 tầng tản nhiệt chữ V, thân lục giác dưới cùng, 1 tấm pin 2,67 × 1,02 m. Tổng cao 2,6 m | JPL1, SAT | Thân lục giác và cách gắn tấm pin là giả định (nguồn không mô tả bằng chữ) |
| 2 | Quỹ đạo gần cực, nghiêng 97,95° so với xích đạo; nút quỹ đạo nằm trên đường ngày–đêm (LTAN 06:00). Mặt phẳng quỹ đạo được tính từ **hướng ánh sáng của cảnh**, nên vệ tinh luôn bay trên viền sáng tối nhìn thấy được | SAT | |
| 3 | Tư thế: trục nón luôn hướng ra ngoài (ra xa Trái Đất), tấm pin luôn quay về phía Mặt Trời | JPL1, JPL2 | |
| 4 | Bán kính quỹ đạo 1,16 bán kính Trái Đất (thật là 1,10) để vệ tinh đã phóng to không chạm mặt đất | | Độ cao và kích thước phóng to |
| 5 | Một vòng 24 giây (Trái Đất 48 giây/vòng). Thật là khoảng 14,7 vòng mỗi ngày, tức 3,3 giây nếu giữ tỉ lệ — quá nhanh | JPL2 | "Speeds not to scale" |
| 6 | Đường quỹ đạo: vòng nét đứt mảnh màu `--blue` (màu "measured" của sản phẩm), mờ 35%; phần sau Trái Đất tự bị che | DESIGN.md | |
| 7 | Nhãn DOM "SPHEREx" bám theo vệ tinh như các nhãn hành tinh; **ẩn khi vệ tinh đi sau Trái Đất** (kiểm tra che khuất bằng tia từ camera) | ui-ux-pro-max: không dựa hover | |
| 8 | Một dòng giải thích dưới cảnh (không phải tooltip): "SPHEREx circles Earth about 14.5 times a day, 650 km up, over both poles along the day–night line, scanning a full ring of sky each orbit." | ux: thông tin ở DOM | |
| 9 | Nút "Pause rotation" đổi thành "Pause motion" vì dừng cả vệ tinh; reduced motion: vệ tinh đứng yên ở vị trí dễ thấy | DESIGN.md §5, ux Reduced Motion | |
| 10 | Canvas có `role="img"` và `aria-label` mô tả cảnh, gồm cả vệ tinh | ui-ux-pro-max threejs Accessibility | |
| 11 | Vệ tinh không nhận click; click vẫn chỉ dành cho Trái Đất (hành động chính "Explore") | Giữ luồng hiện có | |

## 3. Bố cục và responsive

Không đổi bố cục trang. Vệ tinh nằm trong canvas sẵn có, nên tự co theo canvas. Dòng giải thích dài tối đa 68ch, xuống dòng trên mobile.

## 4. File thay đổi

| File | Thay đổi |
| --- | --- |
| `features/earth-scene/spherexOrbit.ts` (mới) | Toán thuần: mặt phẳng quỹ đạo từ hướng sáng + độ nghiêng; vị trí theo góc; ma trận tư thế; kiểm tra che khuất. Có test |
| `features/earth-scene/SpherexSatellite.tsx` (mới) | Mô hình 3D + đường quỹ đạo + chuyển động |
| `features/earth-scene/EarthScene.tsx` | Thêm vệ tinh, nhãn `spherex`, hướng sáng dùng chung, aria cho canvas, ẩn nhãn khi bị che |
| `pages/WhereAreYouPage.tsx`, `pages/where/where.css` | Nhãn SPHEREx, dòng giải thích, đổi chữ nút |
| `test/spherex-orbit.test.ts` (mới) | Độ nghiêng 97,95°, vệ tinh luôn trên đường ngày–đêm (vuông góc hướng sáng ± 8°), trục nón hướng ra ngoài, tấm pin nhìn về Mặt Trời, kiểm tra che khuất |

## 5. Kiểm tra

- Test toán quỹ đạo; typecheck, lint, build.
- Trình duyệt: vệ tinh bay, nhãn bám và ẩn khi sau Trái Đất, nút Pause dừng cả hai, reduced motion đứng yên, click Trái Đất vẫn chuyển trang, không lỗi console.
