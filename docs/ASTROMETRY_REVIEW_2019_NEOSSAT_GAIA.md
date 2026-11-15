# Bàn giao kiểm tra astrometry: NEOSSAT và Gaia/unWISE

Các sản phẩm đã được lưu trên Supabase Storage trong bucket `spherex-dr1-demo`,
prefix `astrometry-review/2026-11-15-v1/`. `manifest.json` ghi URL và SHA-256
của từng file; trạng thái là `provisional_science_review_required`. Chạy
`scripts/publish_astrometry_review.py` để đồng bộ lại từ các sản phẩm cục bộ.
Việc tải lên không thay đổi cờ xác minh WCS hay overlay đã công bố.

## NEOSSAT — 1999-KW4

Sáu FITS gốc không có WCS thiên cầu. `scripts/review_neossat_wcs.py` tìm nguồn ảnh bằng DAOStarFinder và gửi **chỉ danh sách centroid** tới SkySolver, rồi so với hướng kính trong FITS và một truy vấn Gaia DR3 qua MAST. Kết quả là nghiệm ứng viên để rà soát, không ghi đè FITS hoặc đánh dấu `wcs_verified` trong DB.

| Obs ID | Kết quả | Số nguồn Gaia ghép trong 3″ | Trung vị sai lệch |
| --- | --- | ---: | ---: |
| 2019119185220 | Chưa giải được sau các cấu hình thử | — | — |
| 2019130125130 | WCS ứng viên | 94 | 0,284″ |
| 2019141231520 | WCS ứng viên | 27 | 0,189″ |
| 2019143234020 | WCS ứng viên | 22 | 0,174″ |
| 2019148001900 | Chưa giải được sau các cấu hình thử | — | — |
| 2019152014345 | Chưa giải được sau các cấu hình thử | — | — |

Ba nghiệm có scale khoảng 2,993–2,994″/pixel, tâm lệch hướng kính trong header khoảng 0,0068–0,0083°. Residual là khoảng cách nguồn ảnh gần nhất với nguồn Gaia, có lọc ghép không trùng và ngưỡng 3″; không phải sai số astrometry đã hiệu chỉnh. Gaia được truy vấn riêng nhưng không khẳng định catalog nội bộ của solver độc lập với Gaia. Nguồn ảnh có thể là artifact, có chuyển động hoặc bị ghép nhầm; residual, độ méo trường và sai số hệ thống cần được kiểm tra độc lập.

Nghiệm và kết quả kiểm tra cục bộ nằm tại `data/neossat_review/wcs_candidates/`; `review.json` ghi cả các lượt thất bại. FITS gốc và sản phẩm công bố không bị thay đổi. Nghiệm WCS không xác nhận vật thể 1999-KW4 ở pixel nào; cần ephemeris ứng với vị trí NEOSSAT, thời điểm phơi sáng và phân tích tín hiệu để xác định.

Nguồn: [hướng dẫn ảnh FITS NEOSSat của CSA](https://data.asc-csa.gc.ca/users/OpenData_DonneesOuvertes/pub/NEOSSAT/Supporting%20Documents/CSA-NEOSSAT-MAN-0002_FITS_IMAGE_UGUIDE-v4-00.pdf), [SkySolver API](https://skysolver.app/api-docs), [MAST Gaia DR3](https://archive.stsci.edu/).

## Gaia trên unWISE — phép kiểm tra thị sai

`scripts/review_gaia_parallax.py` tính riêng độ nhạy đối với thị sai Gaia bằng vị trí barycentric của **tâm Trái Đất** tại trung điểm mỗi epoch, so với overlay chuyển động riêng hiện tại. Chi tiết vị trí thử nghiệm tại `data/gaia_geocentric_review/`; tóm tắt tại `data/reports/gaia_geocentric_parallax_review.json`. Đây là một phép tính gần đúng bậc nhất, giữ cả thị sai âm như dữ liệu Gaia và không thay thế overlay đã công bố.

Trên các điểm Gaia có thị sai, độ dịch pixel lớn nhất trong từng trường (hai dải cho cùng giá trị gần đúng) là: Barnard 0,2001 px; Epsilon Indi B 0,1000 px; RW Aurigae 0,00282 px; R Draconis 0,000824 px; WISE 0855 0,00203 px. Đây là **cực đại của các nguồn Gaia trong vùng**, không khẳng định là chuyển động hay độ dịch của chính thiên thể mục tiêu.

Chưa có quỹ đạo WISE/NEOWISE cho từng ảnh nên vị trí tâm Trái Đất chỉ là proxy, không phải vị trí vệ tinh. Chưa mô hình hóa aberration, light deflection, vận tốc xuyên tâm, hiệp phương sai hoặc quy ước astrometry của từng coadd; nguồn không có thị sai không được hiệu chỉnh. Các chi tiết này cần người phụ trách science kiểm định trước khi dùng để đo hoặc thay đổi nhãn trong ứng dụng.
