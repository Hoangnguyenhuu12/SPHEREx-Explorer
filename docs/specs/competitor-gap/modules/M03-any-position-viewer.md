# M03 · Xem bất kỳ tọa độ nào

**Ưu tiên** P1 · **Phụ trách** Hữu Hoàng (cutout), Đông (job), Duy Hoàng (FE)

## Hiện trạng
`/api/frames` đồng bộ, timeout 125 s; đường live dùng dịch vụ cutout của IRSA (`shared/pipeline/irsa.py: make_cutout_url`).
Timeline đầy đủ chỉ có cho 5 mục tiêu (`KNOWN_TARGETS`).

## Cách Vanilla đạt khoảng 10 s
1. SIA tìm danh sách exposure (cache).
2. Mỗi file: 4 range request trên S3 (header, WCS, phần ảnh của cutout, mặt nạ cờ), 1,3–1,9 MB.
3. Cắt và resample trong process pool (khoảng 40 ms CPU mỗi file).
4. Trả kết quả dần; cache SQLite trên disk.

## Thiết kế cho mình
```text
POST /api/views ──► view_jobs (Postgres: jobs, frames)
                    │
                    ├─ search: IRSA SIA (cache 7 ngày)
                    ├─ fetch:  RangeCutoutProvider ──(lỗi)──► IrsaCutoutProvider
                    │          ThreadPool 32 I/O + ProcessPool CPU
                    └─ render: PNG từng khung → Supabase Storage / disk
GET /api/views/{id} ◄── client poll 1 s, vẽ ngay khung đã có
```

- Range read: `astropy.io.fits.open(s3_uri, use_fsspec=True, fsspec_kwargs={"anon": True})` rồi `hdu.section[y0:y1, x0:x1]`.
- Server đặt gần `us-east-1`.
- Khóa idempotent: làm tròn ra/dec tới 0,001°, FOV tới 1′.

## Nghiệm thu
PERF-1, PERF-2; test pixel giống hệt (P1.1).
