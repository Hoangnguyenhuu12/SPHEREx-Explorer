# U05 · Mobile và i18n

## Mobile (375 px)
| Màn hình | Quy tắc | Trạng thái |
| --- | --- | --- |
| Landing | Byline ở trên cùng, CTA full width, câu kỳ vọng ngắn | ✅ PR feedback |
| Orbit | Camera lùi theo tỉ lệ canvas, tiêu đề 34 px nằm giữa, có chữ "Loading…" | ✅ PR feedback |
| The Eyes | Dock chỉ giữ công cụ chính, không cuộn ngang | ✅ PR feedback |
| Tutorial | Thẻ gọn nằm ở đáy, chỉ lên trên khi nút đang được chỉ nằm dưới thẻ | ✅ PR feedback |
| Thẻ sao | Bottom sheet | ⏳ M02 |
| 740–900 px | Dock vẫn tràn ngang → nâng breakpoint lên 900 px hoặc thêm menu "More" | ⏳ |

Học từ NODIXHI `mobile.css`: dùng safe-area, `touch-action: manipulation`, vùng chạm 40 px, thanh trên chỉ giữ những gì cần.

## i18n
- Ngôn ngữ: `vi`, `en`. Mặc định theo `navigator.language`, có thể đổi bằng nút trên header và `?lang=`.
- Phạm vi giai đoạn 1: landing, The Eyes (thanh điều khiển, trạng thái, tutorial), thẻ sao, tên chòm sao.
- Thuật ngữ khoa học giữ tiếng Anh trong ngoặc khi lần đầu xuất hiện: "chuyển động riêng (proper motion)".
- Test: script so sánh key giữa `vi.json` và `en.json` trong CI.
