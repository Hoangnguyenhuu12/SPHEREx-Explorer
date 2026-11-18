import type { PlanetCategory, PlanetKey } from '../../shared/config/planets'

export const PLANET_CATEGORY_VI: Record<PlanetCategory, string> = {
  'Rocky inner planet': 'Hành tinh đá bên trong', 'Home planet (observer)': 'Hành tinh quê nhà (người quan sát)', 'Gas giant': 'Hành tinh khí khổng lồ', 'Ice giant': 'Hành tinh băng khổng lồ', 'Kuiper Belt dwarf planet': 'Hành tinh lùn vành đai Kuiper',
}
export const PLANET_FACTS_VI: Record<PlanetKey, { fun: string; science: string }> = {
  mercury: { fun: 'Hành tinh gần Mặt Trời nhất hoàn thành một vòng chỉ trong 88 ngày Trái Đất.', science: 'Luôn nằm trong vùng tránh góc ly Mặt Trời của SPHEREx (khoảng 89°); bức xạ nhiệt mạnh sẽ làm bão hòa cảm biến hồng ngoại.' },
  venus: { fun: 'Được bao phủ bởi mây axit sulfuric dày, Sao Kim là hành tinh sáng nhất trên bầu trời đêm của chúng ta.', science: 'Thường nằm dưới giới hạn góc ly Mặt Trời khoảng 90°; khi ra ngoài giới hạn, độ sáng hồng ngoại rất cao khiến cảm biến che vùng hành tinh sáng.' },
  earth: { fun: 'Bạn đang quan sát từ ngay phía trên Trái Đất! Bật Chân trời để hình dung hành tinh quê nhà bên dưới kính thiên văn.', science: 'SPHEREx bay cách Trái Đất khoảng 650 km dọc ranh giới ngày đêm; ba lớp chắn photon ngăn bức xạ nhiệt 300 K của Trái Đất.' },
  mars: { fun: 'Bụi oxit sắt làm Sao Hỏa có màu đỏ gỉ; hành tinh mất gần hai năm Trái Đất để quay quanh Mặt Trời.', science: 'Có thể quan sát gần góc ly 90°; làm bão hòa các kênh hồng ngoại sáng nhất nhưng cho thấy khoáng vật ngậm nước trong cận hồng ngoại phản xạ.' },
  jupiter: { fun: 'Hành tinh lớn nhất Hệ Mặt Trời có thể chứa hơn 1.300 Trái Đất bên trong.', science: 'Một nguồn tiền cảnh sáng chuyển động với cánh hàm PSF do ánh sáng tán xạ và đặc trưng methane 2,3/3,3 µm dọc hoàng đạo.' },
  saturn: { fun: 'Các vành rộng của Sao Thổ gồm hàng tỷ mảnh băng nước và đá quay quanh hành tinh.', science: 'Phản xạ của băng nước trong vành có các dải hấp thụ mạnh tại 1,5, 2,0 và 3,0 µm trên cảm biến D2–D4.' },
  uranus: { fun: 'Sao Thiên Vương quay nghiêng khoảng 98°, khiến mùa hè và mùa đông kéo dài 42 năm.', science: 'Đủ mờ để khảo sát hấp thụ CH₄ và phổ của lớp mù tầng đối lưu trên trong dải 0,75–5,0 µm.' },
  neptune: { fun: 'Hành tinh lớn có gió mạnh nhất cách Mặt Trời xa gấp 30 lần Trái Đất; ánh sáng Mặt Trời mất hơn 4 giờ để tới đó.', science: 'Mục tiêu chuyển động có tỷ số tín hiệu trên nhiễu cao cho khảo sát methane và băng/khí CO ở dải 1–5 µm của SPHEREx.' },
  pluto: { fun: 'Dù ở xa trong vành đai Kuiper băng giá, Sao Diêm Vương có đồng bằng nitơ đóng băng hình trái tim.', science: 'Phổ quang SPHEREx khảo sát chất dễ bay hơi ở ngoài Hệ Mặt Trời (băng N₂, CH₄, CO và H₂O) trong dải 0,75–5,0 µm.' },
}
