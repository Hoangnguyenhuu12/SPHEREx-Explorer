# M08 · Đọc phổ tự động

**Ưu tiên** P3 · **Phụ trách** Nguyên · Mở rộng `/api/spectrum` hiện có

## Đầu ra
`reading: { summary, confidence: low|moderate|high, continuum: { peak_um, teff_k, teff_range }, features: [{ name, um, depth, found|possible }], limits: [] }`

## Quy tắc (cố định, có trích nguồn)
| Đặc trưng | Bước sóng (µm) | Dùng cho |
| --- | --- | --- |
| H₂O | 1,4; 1,9; 2,7 | Sao lạnh, sao lùn nâu |
| CH₄ | 1,6; 2,2; 3,3 | Sao lùn nâu loại T/Y |
| CO | 2,3; 4,6 | Sao khổng lồ, sao lùn nâu |
| CO₂ | 4,3 | Sao lùn nâu lạnh |
| Hα, Paβ, Paα, Brγ (dịch theo z) | | Quasar, thiên hà |

- Fit vật đen để có nhiệt độ; báo độ sâu của vạch so với continuum.
- Mỗi câu kết luận phải có confidence và câu "Not a classification".
- Phổ có nhiều exposure ở các ngày khác nhau thì phải ghi rõ (vì có thể là sao biến quang).

## Nghiệm thu
Eps Indi B có H₂O + CH₄; Barnard ra khoảng 3.200 K.
