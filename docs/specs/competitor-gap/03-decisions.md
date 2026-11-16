# 03 · Decisions (ADR)

Mỗi ADR gồm: bối cảnh → quyết định → hệ quả. Trạng thái mặc định là **Proposed** cho tới khi nhóm duyệt.

---

## ADR-001

**Không dùng mã của sphere-blink; được dùng có ghi công mã và dữ liệu của NODIXHI, d3-celestial**

- **Bối cảnh.** sphere-blink dùng AGPL-3.0: phần mềm phái sinh chạy trên mạng phải công bố mã theo AGPL. Dự án mình là MIT.
  NODIXHI dùng MIT. d3-celestial (Olaf Frohn) dùng BSD-3.
- **Quyết định.** Chỉ đọc tài liệu và thuật toán của sphere-blink rồi tự viết lại; không copy hàm, hằng số dạng bảng hay file dữ liệu của họ.
  Được phép lấy `constellation_bounds.tsv` (bảng Roman 1987, dữ liệu khoa học công khai) và dữ liệu d3-celestial, có ghi trong `THIRD-PARTY-NOTICES`.
- **Hệ quả.** Phải viết lại M05, M06, M07 từ đầu. Mỗi file mới ghi "Algorithm inspired by … (docs), independent implementation".

## ADR-002

**Backend không được ngủ khi demo**

- **Bối cảnh.** Lần gọi đầu mất khoảng 50 giây (cold start trên Render). Người chấm bỏ đi trước khi có ảnh. Vanilla dùng gói Pro Plus, NODIXHI gói free.
- **Quyết định.** Bậc 1: GitHub Actions cron ping `/api/health` mỗi 10 phút trong giờ demo, và landing tự ping (đã làm).
  Bậc 2: chuyển sang gói Starter hoặc Standard cho các vòng chấm và gắn persistent disk cho cache. Khi khởi động thì làm nóng 5 mục tiêu.
- **Hệ quả.** Có chi phí theo tháng ở bậc 2. Cần chú ý cron trên gói free vẫn tiêu tốn giờ chạy free.

## ADR-003

**Lấy dữ liệu: dùng range read trên S3 cho view mới, giữ cutout IRSA làm phương án dự phòng**

- **Bối cảnh.** Hiện mình dùng dịch vụ cutout của IRSA (server của IRSA cắt ảnh). Vanilla đọc thẳng 4 range request từ bucket AWS Open Data và thấy nhanh hơn rõ rệt.
- **Quyết định.** Thêm `RangeCutoutProvider` (astropy `fsspec`/`s3fs` với `use_fsspec=True`, `section=`) bên cạnh `IrsaCutoutProvider`. Chọn bằng cấu hình và tự chuyển nếu lỗi.
- **Hệ quả.** Cần đặt server gần `us-east-1` (Render Virginia hoặc Fly `iad`). Viết test chứng minh pixel giống hệt cutout IRSA.

## ADR-004

**API job bất đồng bộ + kết quả trả dần cho view mới**

- **Bối cảnh.** `/api/frames` hiện là một request đồng bộ có timeout 125 giây.
- **Quyết định.** `POST /api/views` trả `{job_id}` ngay; `GET /api/views/{id}` trả các khung đã xong cùng `status`, `progress`, `queue_position`.
  View idempotent theo khóa `(ra, dec, fov, detector)` làm tròn. Giữ `/api/frames` cho 5 mục tiêu để tương thích.
- **Hệ quả.** Frontend chuyển sang polling bằng TanStack Query (`refetchInterval` khi `status != ready`). Job lưu trong Redis hoặc Postgres, không để trong RAM, để có thể chạy nhiều instance.

## ADR-005

**Chòm sao: d3-celestial cho hình, Astropy cho tra cứu**

- **Bối cảnh.** Aladin Lite v3 không có sẵn lớp chòm sao.
- **Quyết định.** Hình: `constellations.lines.json` vẽ bằng `A.graphicOverlay` + `A.polyline`; tên đặt tại `constellations.json`. Tra cứu: backend `get_constellation(SkyCoord)` (Roman 1987).
  Tên tiếng Việt lấy từ bảng tên (tham khảo `NAMES` của NODIXHI, MIT).
- **Hệ quả.** Thêm khoảng 300 KB dữ liệu tĩnh, lazy-load khi bật lớp chòm sao.

## ADR-006

**Tìm vật thể chuyển động không dùng ML**

- **Bối cảnh.** Kết quả cần giải thích và kiểm chứng được. Vanilla dùng "No AI inside" làm điểm nhấn uy tín.
- **Quyết định.** Thuật toán xác định (median, ngưỡng σ, nối kiểu Hough/bỏ phiếu, xác nhận pixel). Mỗi lần chạy lưu `params` và `stats` để tái lập được.
  Chatbot vẫn giữ, nhưng chỉ để **giải thích**, không bao giờ tạo ra kết quả khoa học.
- **Hệ quả.** Trang "Methods" mô tả từng bước; có test hồi quy trên 3 field cố định.

## ADR-007

**Phát hiện đi qua forum, không coi là kết luận**

- **Bối cảnh.** NODIXHI có báo cáo gửi admin, Vanilla có bình chọn. Mình có forum đầy đủ, có kiểm duyệt.
- **Quyết định.** Track → "Discovery post" (loại bài mới) gồm GIF, link view, `stats`, tên SkyBoT nếu có. Có bình chọn thật/giả/không rõ.
  Trạng thái: `candidate → community-checked → catalogue-matched | rejected`. Không bao giờ dùng chữ "discovery" cho track chưa khớp với catalogue.
- **Hệ quả.** Mở rộng schema forum (bảng `discoveries`, `discovery_votes`). Admin cần quyền đổi trạng thái.

## ADR-008

**Song ngữ bằng i18n nhẹ**

- **Quyết định.** Dùng `i18next` (hoặc map JSON tự viết), ưu tiên landing, The Eyes, thẻ sao. Lưu ngôn ngữ trong `localStorage` và tham số `?lang=`.
- **Hệ quả.** Mọi chuỗi mới phải đi qua `t()`. Có test kiểm tra không thiếu key.
