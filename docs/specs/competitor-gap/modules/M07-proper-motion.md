# M07 · Đo chuyển động riêng

**Ưu tiên** P2 · **Phụ trách** Nguyên, Hữu Hoàng · Mở rộng `/api/astrometry` hiện có

## Các bước
1. Stamp trên **lưới detector gốc** (không resample) quanh vị trí dự đoán (Gaia PM + thị sai, ephemeris Trái Đất của Astropy).
2. Fit PSF Gauss tích phân theo pixel (SPHEREx 6,15″/px, PSF bị undersampled); fit cùng các sao Gaia trong bán kính 30″.
3. Sao bão hòa: đo theo phần cánh (che lõi).
4. Fit `ra0, dec0, pmra, pmdec` (+ thị sai khi có ≥ 3 lượt quét), loại điểm ngoại lai, sai số jackknife theo nhóm (lượt quét, detector).
5. Trả `positions[]`, `fit`, `residual_rms`, `catalog_compare`.

## Giới hạn cần ghi rõ trên UI
Một exposure cho độ chính xác 0,2–0,5″; baseline khoảng 1 năm → sai số PM từ hàng chục đến hàng trăm mas/năm; độ lệch 0,1–0,3″ đổi dấu theo hướng quét.

## Nghiệm thu
SCI-1, SCI-2.
