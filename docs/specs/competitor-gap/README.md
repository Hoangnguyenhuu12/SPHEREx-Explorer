# Bộ specs: Đuổi kịp và vượt Vanilla Sphere & NODIXHI

> Dự án: **SPHEREx Explorer** (team MINIONS) · https://nasa-minions-phanetx-spherex.vercel.app
> Ngày khảo sát: 2026-11-16 · Trạng thái: **Draft để team review**

Bộ tài liệu này so sánh dự án của nhóm với hai đội cùng đề bài *Planet X and SPHEREx* (NASA Space Apps 2026),
rồi biến khoảng cách thành kế hoạch và spec có thể làm ngay.

| Đối thủ | Live | Mã nguồn | Giấy phép |
| --- | --- | --- | --- |
| Vanilla Sphere (giải Nhì Hà Nội) | https://vanillasphere.com | https://github.com/Vanilla-Sphere/sphere-blink | **AGPL-3.0** |
| NODIXHI (TP.HCM) | https://nasa-spaceapss-challenge-2026.onrender.com | https://github.com/RevDra/NODIXHI | MIT |

## Đọc theo thứ tự nào

| File | Dành cho | Nội dung |
| --- | --- | --- |
| [index.md](index.md) | Mọi người | Mục lục, ma trận khoảng cách một trang, 10 việc ưu tiên |
| [01-research.md](01-research.md) | Cả nhóm | Kiến trúc, cách chạy, dữ liệu, test, deploy của 2 đối thủ và của mình |
| [02-rfc.md](02-rfc.md) | Lead, cả nhóm | Đề xuất: làm gì, không làm gì, vì sao |
| [03-decisions.md](03-decisions.md) | Lead, backend | Các quyết định kiến trúc (ADR), gồm giấy phép và hosting |
| [04-plan.md](04-plan.md) | Cả nhóm | Lộ trình theo giai đoạn, người phụ trách, ước lượng |
| [05-spec.md](05-spec.md) | Dev | Spec chức năng và API mới |
| [06-verification.md](06-verification.md) | QA, khoa học | Tiêu chí nghiệm thu, benchmark khoa học, đo hiệu năng |
| [07-guide.md](07-guide.md) | Dev | Cách chạy 2 repo đối thủ, cách demo và cách làm các module mới |
| [modules/](modules/) | Dev | Spec chi tiết từng module (chòm sao, thẻ sao, tìm vật thể chuyển động…) |
| [ui/](ui/) | Frontend, design | Spec giao diện từng màn hình |

## Tóm tắt một đoạn

Nhóm mình **mạnh về trải nghiệm kể chuyện** (Story, 3D orbit, timeline WISE↔SPHEREx 14 năm, forum, chatbot, tutorial).
Vanilla Sphere **mạnh về khoa học và hạ tầng dữ liệu**: xem bất kỳ tọa độ nào trong khoảng 10 giây, tự tìm vật thể chuyển động mà không cần biết trước,
shift-and-stack, đo chuyển động riêng, tự đọc phổ, có API công khai, 237 test và tài liệu rất kỹ.
NODIXHI **mạnh về giáo dục đại chúng**: bầu trời 3D theo thời gian thực, chòm sao, thẻ thông tin của từng ngôi sao, lịch thiên văn, song ngữ.

Để **đuổi kịp** cần 4 việc: chòm sao, thẻ sao, xem bất kỳ tọa độ nào và backend không bị ngủ.
Để **vượt qua** cần thêm 2 việc: tự tìm vật thể chuyển động (có kiểm chứng báo động giả), rồi gắn kết quả vào forum để cộng đồng xác minh.
Không đội nào làm được cả hai mặt khoa học lẫn cộng đồng.

## Lưu ý quan trọng

- **Không chép code của sphere-blink.** Repo đó dùng AGPL-3.0, còn dự án mình là MIT. Chỉ được học ý tưởng và thuật toán
  từ tài liệu rồi tự viết lại, có ghi nguồn. Xem [ADR-001](03-decisions.md#adr-001).
- **NODIXHI dùng MIT** nên được tái sử dụng có ghi công, ví dụ bảng ranh giới chòm sao Roman (1987).
- Mình **chưa chạy code của hai repo** trên máy (đó là code bên thứ ba). Cách chạy được ghi theo README của họ, còn hành vi
  thì đánh giá trên site live và qua mã nguồn. Hướng dẫn chạy an toàn trong môi trường cô lập nằm ở [07-guide.md](07-guide.md).
