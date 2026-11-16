# M06 · Shift-and-stack

**Ưu tiên** P2 · **Phụ trách** Nguyên

## Ý tưởng
Một vật thể quá mờ để thấy trên từng exposure sẽ hiện ra khi cộng các exposure lại **dọc theo quỹ đạo đúng của nó**. SNR tăng theo √N.

## Thiết kế
- Lưới vận tốc thử: 0,05–20″/h, bước bằng (½ pixel) / (khoảng thời gian của lượt quét); góc 0–360°.
- Với mỗi (v, θ): dịch từng khung (khung − median) về `t0`, lấy trung bình có trọng số theo 1/σ².
- Điểm = đỉnh / nhiễu của ảnh stack; giữ các đỉnh ≥ 7σ, rồi tinh chỉnh quanh đỉnh.
- So với ephemeris JPL Horizons (astroquery) để đặt tên.
- Chế độ thủ công cho người dùng (như NODIXHI): nhập pmRA/pmDec hoặc kéo mũi tên.

## Tham chiếu kết quả của Vanilla (để làm mục tiêu)
Pluto 279σ (43 exposure), Makemake 17σ, Haumea 9,6σ, Chiron 8,5σ, Orcus 7,4σ, Eris 5,6σ.

## Nghiệm thu
SCI-5.
