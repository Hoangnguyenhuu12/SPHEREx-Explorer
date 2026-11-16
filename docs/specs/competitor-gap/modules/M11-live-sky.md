# M11 · Bầu trời thời gian thực

**Ưu tiên** P3 · **Phụ trách** Thạch · **Chuẩn tham chiếu**: NODIXHI "My sky"

## Phạm vi tối thiểu
- Chọn vị trí (Hà Nội, TP.HCM, Đà Nẵng hoặc vị trí GPS, chỉ dùng trong trình duyệt) và thời gian (hiện tại, tua nhanh).
- Hiện đường chân trời, Mặt Trăng (pha), các hành tinh và 5 mục tiêu SPHEREx, kèm câu "Mục tiêu này đang ở trên/dưới đường chân trời".
- Dữ liệu: `ephemeris.json` dựng sẵn từ JPL Horizons (script giống `build_ephemeris.py` của NODIXHI); thuật toán alt/az chạy phía client.

## Tái sử dụng
The Eyes đã có "Ground" và "Sky motion", nên chỉ cần thêm đồng hồ, vị trí và lớp hành tinh theo thời gian thật.

## Không làm
Lịch mưa sao băng và bản đồ 3D Việt Nam (để sau, không phục vụ trực tiếp đề bài).
