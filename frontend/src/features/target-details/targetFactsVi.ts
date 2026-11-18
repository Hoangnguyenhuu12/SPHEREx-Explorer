import type { TargetKey } from '../../shared/config/targets'

export const TARGET_FACTS_VI: Record<TargetKey, { fun: string; speed: string; temperature: string }> = {
  barnard: { fun: 'Đây là ngôi sao gần chúng ta thứ tư, sau ba sao trong hệ Alpha Centauri.', speed: 'Đi ngang một khoảng bằng đường kính Trăng tròn trong khoảng 180 năm — nhanh so với các sao nền.', temperature: 'Khoảng 3.200 K, lạnh và mờ hơn Mặt Trời; phát sáng mạnh nhất ở vùng cận hồng ngoại.' },
  wise0855: { fun: 'Thiên thể tự do này quá nhỏ để tỏa sáng như sao nhưng nặng hơn Sao Mộc; nó trôi trong bóng tối.', speed: 'Dịch chuyển khoảng 8,1 giây cung mỗi năm, hơn 2 phút cung từ năm 2010 đến 2025.', temperature: 'Khoảng −23 °C (250 K), lạnh như mùa đông ở Bắc Cực; cần quan sát bằng hồng ngoại nhiệt D6 / W2.' },
  epsindib: { fun: 'Đây thực ra là một hệ đôi gồm hai sao lùn nâu Ba và Bb quay quanh nhau.', speed: 'Dịch chuyển khoảng 4,7 giây cung mỗi năm, tương đương đường kính biểu kiến của Mặt Trăng trong khoảng 380 năm.', temperature: 'Khoảng 600–1.300 K, giống một hòn than đang nguội và phát sáng ở vùng hồng ngoại.' },
  rwaur: { fun: 'Một ngôi sao trẻ vẫn được bao quanh bởi đĩa khí và bụi đang hình thành hành tinh.', speed: 'Gần như đứng yên do cách xa hàng trăm năm ánh sáng; hãy theo dõi độ sáng của nó.', temperature: 'Các đám bụi ấm phát sáng mạnh ở bước sóng hồng ngoại dài hơn (D4–D6).' },
  rdra: { fun: 'Giống một nhịp tim vũ trụ, ngôi sao khổng lồ già này giãn nở và co lại khoảng 245 ngày một lần.', speed: 'Hầu như không đổi vị trí, nhưng độ sáng hồng ngoại tăng giảm rõ rệt qua các tháng.', temperature: 'Lớp ngoài của sao khổng lồ đỏ lạnh khoảng 3.000 K, phát sáng mạnh trên các cảm biến hồng ngoại.' },
}
