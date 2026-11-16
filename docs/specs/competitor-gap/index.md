# Index

## Mục lục

- [README](README.md): đọc gì trước
- [01 Research](01-research.md): khảo sát 3 hệ thống
- [02 RFC](02-rfc.md): đề xuất
- [03 Decisions](03-decisions.md): ADR-001 đến ADR-009
- [04 Plan](04-plan.md): lộ trình P0 → P3
- [05 Spec](05-spec.md): chức năng và API
- [06 Verification](06-verification.md): nghiệm thu
- [07 Guide](07-guide.md): chạy, demo, phát triển
- [08 Value & market](08-value-and-market.md): persona, use case, giá trị, đối thủ ngoài hackathon, kiểm chứng giả định
- [09 Business model](09-business-model.md): Lean Canvas, doanh thu, chi phí, **giấy phép và pháp lý**
- [10 Scalability](10-scalability.md): kiến trúc mở rộng, mô hình tải, đa sứ mệnh, SLO
- [11 Maturity scorecard](11-maturity-scorecard.md): chấm 8 tiêu chí, TRL từng module, tiêu chí sẵn sàng thương mại

### Bản đồ 8 tiêu chí cốt lõi → tài liệu

| Tiêu chí | Tài liệu chính |
| --- | --- |
| Trải nghiệm người dùng | [ui/](ui/), [08 §2](08-value-and-market.md#2-chân-dung-người-dùng-persona), [06 §3](06-verification.md#3-ui-và-khả-năng-truy-cập) |
| Khả năng mở rộng | [10-scalability](10-scalability.md), [ADR-004](03-decisions.md#adr-004) |
| Chất lượng giải pháp | [06-verification](06-verification.md), [ADR-006](03-decisions.md#adr-006) |
| Tính thương mại | [09-business-model](09-business-model.md) |
| Tiềm năng khai thác thực tế | [08 §3](08-value-and-market.md#3-trường-hợp-sử-dụng-thực-tế) |
| Khả năng tạo giá trị | [08 §4](08-value-and-market.md#4-giá-trị-tạo-ra) |
| Lợi thế cạnh tranh | [08 §5](08-value-and-market.md#5-bối-cảnh-cạnh-tranh-ngoài-hackathon), ma trận bên dưới, [02-rfc](02-rfc.md) |
| Mức độ hoàn thiện | [11-maturity-scorecard](11-maturity-scorecard.md) |

### modules/

| Module | Ưu tiên | Đuổi kịp hay vượt |
| --- | --- | --- |
| [M01 Chòm sao](modules/M01-constellations.md) | P0 | Đuổi kịp |
| [M02 Thẻ thông tin sao](modules/M02-star-card.md) | P0 | Đuổi kịp |
| [M03 Xem bất kỳ tọa độ nào](modules/M03-any-position-viewer.md) | P1 | Đuổi kịp |
| [M04 Hiệu năng và hosting](modules/M04-performance-hosting.md) | P0 | Đuổi kịp |
| [M05 Tìm vật thể chuyển động](modules/M05-blind-mover-search.md) | P2 | **Vượt** |
| [M06 Shift-and-stack](modules/M06-shift-and-stack.md) | P2 | Đuổi kịp |
| [M07 Đo chuyển động riêng](modules/M07-proper-motion.md) | P2 | Đuổi kịp |
| [M08 Đọc phổ tự động](modules/M08-spectrum-reading.md) | P3 | Đuổi kịp |
| [M09 Nhật ký phát hiện + forum](modules/M09-discoveries-forum.md) | P2 | **Vượt** |
| [M10 API công khai và chia sẻ](modules/M10-public-api-share.md) | P1 | Đuổi kịp |
| [M11 Bầu trời thời gian thực](modules/M11-live-sky.md) | P3 | Đuổi kịp |

### ui/

| Màn hình | File |
| --- | --- |
| Bản đồ bầu trời và chòm sao | [ui/U01-sky-map.md](ui/U01-sky-map.md) |
| Viewer The Eyes | [ui/U02-eyes-viewer.md](ui/U02-eyes-viewer.md) |
| Thẻ thông tin sao | [ui/U03-star-card.md](ui/U03-star-card.md) |
| Nhật ký phát hiện | [ui/U04-discoveries.md](ui/U04-discoveries.md) |
| Mobile | [ui/U05-mobile.md](ui/U05-mobile.md) |

## Ma trận khoảng cách một trang

Ký hiệu: ✅ có, 🟡 một phần, ❌ chưa có.

| Năng lực | MINIONS (mình) | Vanilla Sphere | NODIXHI |
| --- | --- | --- | --- |
| Bản đồ toàn trời | ✅ Aladin Lite + HiPS SPHEREx | ✅ canvas tự vẽ + 2MASS | ✅ 3D, 3.187 sao |
| Đường nối và tên chòm sao | ❌ | ✅ | ✅ |
| Một điểm thuộc chòm sao nào | ❌ | ✅ (lưới 1°) | ✅ (Roman 1987) |
| Thẻ thông tin cho mọi ngôi sao | 🟡 chọn được sao Gaia, chưa có thẻ | 🟡 khoảng cách, chuyển động | ✅ rất đầy đủ |
| Blink ở bất kỳ tọa độ nào | 🟡 API có đường live, UI tập trung vào 5 mục tiêu | ✅ khoảng 10 s, lần sau dưới 1 s | ✅ khoảng 70 s lần đầu |
| Timeline dài WISE → SPHEREx | ✅ unWISE W2 14 năm + D6, giữ khoảng trống thật | ❌ | ✅ NEOWISE W2 |
| Trừ ảnh (difference) | ✅ | ✅ median, reference, sum | ✅ |
| Tự tìm vật thể chuyển động | ❌ | ✅ 3I/ATLAS, 14 track, 0 do ngẫu nhiên | ❌ |
| Shift-and-stack | ❌ | ✅ tự động (Pluto 279σ) | 🟡 thủ công |
| Đo chuyển động riêng | 🟡 có `/api/astrometry` | ✅ fit PSF, sai lệch 0,1″ so với Gaia | ❌ |
| Phổ 102 màu | ✅ `/api/spectrum` | ✅ kèm tự đọc vạch | ❌ |
| Đường cong ánh sáng | ✅ `/api/photometry` | ✅ theo từng dải | ❌ |
| Redshift và khoảng cách | ❌ | ✅ | ❌ |
| API công khai, GIF/PNG/CSV/FITS | 🟡 có API, chưa có GIF và trang tài liệu public | ✅ 22 endpoint | 🟡 |
| Link chia sẻ trạng thái | 🟡 `?q=` | ✅ mọi view là một URL | 🟡 |
| Cộng đồng | ✅ forum, đăng nhập, kiểm duyệt | 🟡 bình chọn thật/giả | 🟡 báo cáo cho admin |
| Chatbot | ✅ | ❌ (“No AI inside”) | ✅ |
| Kể chuyện, giáo dục | ✅ Story, 3D orbit, tutorial | 🟡 | ✅ hành trình, lịch, song ngữ |
| Song ngữ VI/EN | ❌ | 🟡 i18n.js | ✅ |
| Backend không bị ngủ | ❌ Render, khoảng 50 s để thức dậy | ✅ Render Pro Plus + disk 40 GB | ❌ Render free |
| Test | 223 FE + pytest backend | 237 + repo UI test riêng | 3 script Node |
| Tài liệu kiến trúc | 🟡 nhiều file, rời rạc | ✅ 119 file, có sơ đồ | 🟡 |

## 10 việc ưu tiên

1. **P0**: backend luôn thức hoặc tự thức trước khi cần ([M04](modules/M04-performance-hosting.md))
2. **P0**: lớp chòm sao trên Aladin + tra chòm sao của một điểm ([M01](modules/M01-constellations.md))
3. **P0**: thẻ thông tin sao khi bấm vào sao Gaia ([M02](modules/M02-star-card.md))
4. **P1**: mở blink ở bất kỳ tọa độ hay tên nào, có tiến độ dạng streaming ([M03](modules/M03-any-position-viewer.md))
5. **P1**: mọi view là một URL, kèm GIF/PNG/CSV có thể nhúng ([M10](modules/M10-public-api-share.md))
6. **P1**: song ngữ VI/EN cho landing và viewer ([U05](ui/U05-mobile.md#i18n))
7. **P2**: tìm vật thể chuyển động tự động, có kiểm tra báo động giả ([M05](modules/M05-blind-mover-search.md))
8. **P2**: nhật ký phát hiện nối với forum, cộng đồng xác minh ([M09](modules/M09-discoveries-forum.md))
9. **P2**: shift-and-stack và đo chuyển động riêng ([M06](modules/M06-shift-and-stack.md), [M07](modules/M07-proper-motion.md))
10. **P3**: đọc phổ tự động, bầu trời thời gian thực ([M08](modules/M08-spectrum-reading.md), [M11](modules/M11-live-sky.md))
