# SPHEREx: hình dáng và quỹ đạo (đã xác minh)

Ngày 14/11/2026. Mục đích: làm căn cứ cho việc thêm vệ tinh SPHEREx bay quanh Trái Đất ở trang Where are you. **Chưa code.**

Nguồn chính:
- **[JPL1]** NASA JPL, SPHEREx press kit, mục Spacecraft: https://www.jpl.nasa.gov/press-kits/spherex/mission-overview/spacecraft/
- **[JPL2]** NASA JPL, SPHEREx press kit, mục Mission: https://www.jpl.nasa.gov/press-kits/spherex/mission-overview/
- **[SAT]** Bài báo của đội SPHEREx, "The SPHEREx Satellite Mission", arXiv:2511.02985 (bảng 1): https://arxiv.org/html/2511.02985v2
- **[LAUNCH]** NASA JPL, "NASA Launches Missions to Study Sun, Universe's Beginning": https://www.jpl.nasa.gov/news/nasa-launches-missions-to-study-sun-universes-beginning/
- **[SVS]** NASA Scientific Visualization Studio, animation tàu SPHEREx: https://svs.gsfc.nasa.gov/14966/

## 1. Hình dáng

| Bộ phận | Đã xác minh | Nguồn |
| --- | --- | --- |
| Tấm chắn photon | **3 hình nón lồng nhau**, đồng tâm, bao quanh kính. Cả cụm cao 1,7 m, đường kính 3,2 m. Mỗi lớp dày khoảng 19 mm (nhôm tổ ong kẹp hai lá nhôm). **Mặt ngoài nón ngoài sơn trắng**, mặt trong phản xạ. Góc mở nón tăng dần từ trong ra ngoài | JPL1, SAT |
| Hướng nón | Miệng nón ở trên, kính **luôn nhìn ra xa Trái Đất**; trục nón luôn cách Mặt Trời ít nhất 91° | JPL1, JPL2 |
| Kính | 3 gương, khẩu độ hiệu dụng 20 cm, nằm trong lòng nón, đặt trên bộ tản nhiệt chữ V; nghiêng 8° về phía tấm pin | JPL1, SAT |
| Bộ tản nhiệt chữ V (V-groove) | 3 tầng nằm giữa thân và kính, mỗi tầng như chiếc ô lộn ngược; hai tầng dưới rộng hơn tầng trên | JPL1, SAT |
| Thân (bus) | Ở dưới cùng, do BAE Systems (Boulder) làm; chứa máy tính, điều khiển hướng, liên lạc. **Hình dạng thân không được mô tả bằng chữ** | JPL1, SAT |
| Tấm pin Mặt Trời | **Một tấm cố định**, 2,67 × 1,02 m, khoảng 750 W, **luôn hướng về Mặt Trời** nhờ quỹ đạo dọc đường phân chia ngày đêm | JPL1, SVS |
| Ăng-ten | 2 ăng-ten S ở hai đầu tấm pin; 1 ăng-ten S và 2 ăng-ten Ka hình nón ở đáy thân | JPL1 |
| Kích thước tổng | Cao 2,6 m [JPL1]; bài báo ghi kích thước ngoài "ϕ320 × 230 cm" [SAT] (hai nguồn lệch nhau 0,3 m về chiều cao) | JPL1, SAT |
| Khối lượng | 499,9 kg khi phóng | SAT |
| Điều khiển hướng | Không dùng nhiên liệu: con quay, bánh xe phản lực, thanh từ | JPL1 |

**Chưa xác minh bằng chữ:** tấm pin gắn dọc một bên thân hay nằm phẳng. Ảnh minh họa chính thức có hiển thị, nhưng mình chưa xem được ảnh (cần tải ảnh về để nhìn, nên chưa làm). Về logic: trục nón hướng ra ngoài không gian và vuông góc với hướng Mặt Trời, còn tấm pin phải nhìn về Mặt Trời. Vì vậy mặt tấm pin gần như **song song với trục nón**, gắn ở phía thân hướng về Mặt Trời.

Không tìm thấy mô hình 3D chính thức của SPHEREx trên NASA 3D Resources (https://science.nasa.gov/3d-resources/).

## 2. Quỹ đạo

| Tham số | Giá trị | Nguồn |
| --- | --- | --- |
| Loại | Quỹ đạo thấp, **đồng bộ Mặt Trời**, gần cực, đi **dọc đường phân chia ngày đêm** (terminator) | JPL2, SAT |
| Độ cao | Khoảng 650 km [JPL2]; bán trục lớn 7037,4 km [SAT], tức khoảng 659 km trên xích đạo | JPL2, SAT |
| Độ nghiêng | **97,951°** (hơi vượt quá cực, tức chuyển động ngược chiều quay của Trái Đất) | SAT |
| Giờ địa phương ở nút lên | **06:00** (quỹ đạo bình minh và hoàng hôn) | SAT |
| Độ lệch tâm | 0,00034 (gần như tròn) | SAT |
| Chu kỳ | Khoảng 98 phút; khoảng 14,5 vòng mỗi ngày | JPL2 |
| Cách quét | Mỗi vòng chụp một dải trời 360°, dải này dịch dần theo chuyển động của Trái Đất quanh Mặt Trời; trọn bầu trời mỗi 6 tháng; 4 lần trong 25 tháng; khoảng 600 ảnh mỗi ngày | JPL2, SAT |
| Phóng | **11/3/2025**, 8:10 tối giờ Thái Bình Dương, tức 03:10 UTC ngày 12/3/2025, tên lửa Falcon 9, bệ SLC-4E Vandenberg, phóng cùng PUNCH | LAUNCH |

Tính lại chu kỳ từ bán trục lớn: T = 2π√(a³/μ) với a = 7037,4 km và μ = 398 600 km³/s² cho T ≈ 5875 s ≈ 97,9 phút, khớp với con số "khoảng 98 phút".

## 3. Hệ quả cho cảnh 3D ở Where are you

Cảnh hiện tại (`features/earth-scene/EarthScene.tsx`): Trái Đất bán kính 1 đơn vị, quay quanh trục Y thẳng đứng mỗi 48 giây, Mặt Trời ở phía trên bên trái phía sau. Nhãn cảnh đã ghi rõ không theo tỉ lệ.

| Sự thật | Áp dụng | Phải nói rõ là minh họa |
| --- | --- | --- |
| Quỹ đạo gần cực, nghiêng 97,95° so với xích đạo | Mặt phẳng quỹ đạo gần như chứa trục quay, lệch khoảng 8° | |
| Đi dọc đường phân chia ngày đêm | Pháp tuyến mặt phẳng quỹ đạo hướng gần về phía Mặt Trời, nên vệ tinh luôn bay trên viền sáng tối | |
| Độ cao khoảng 659 km, bằng 0,103 bán kính Trái Đất | Bán kính quỹ đạo khoảng 1,10 đơn vị (rất sát mặt đất) | Có thể đẩy xa hơn một chút cho dễ nhìn |
| Kích thước vệ tinh 3,2 m | | **Phóng to vệ tinh hàng nghìn lần** (không thể vẽ đúng tỉ lệ) |
| 98 phút một vòng, so với 24 giờ một vòng Trái Đất (khoảng 14,7 lần) | | Theo tỉ lệ thật, vệ tinh sẽ bay 1 vòng trong khoảng 3,3 giây khi Trái Đất quay 48 giây, quá nhanh để nhìn. Cần **làm chậm** và ghi "speeds not to scale" |
| Nón hướng ra ngoài, tấm pin nhìn về Mặt Trời | Trục nón theo phương bán kính ra ngoài, tấm pin quay về phía Mặt Trời ở mọi vị trí trên quỹ đạo | |
| Nón 3 lớp, mặt ngoài trắng; tản nhiệt chữ V; thân ở dưới; một tấm pin chữ nhật | Dựng mô hình đơn giản bằng hình học của three.js theo đúng tỉ lệ các bộ phận (nón 3,2 × 1,7 m, tấm pin tỉ lệ 2,6 : 1) | Thân vẽ dạng hộp vì nguồn không mô tả hình dạng |

Trục Trái Đất trong cảnh đang thẳng đứng (không nghiêng 23,4°). Giữ nguyên như vậy là chấp nhận được, vì quỹ đạo đồng bộ Mặt Trời được định nghĩa theo hướng Mặt Trời, không phụ thuộc vào cách cảnh vẽ độ nghiêng trục.
