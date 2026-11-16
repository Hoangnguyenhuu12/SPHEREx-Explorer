# M04 · Hiệu năng và hosting

**Ưu tiên** P0 · **Phụ trách** Duy Hoàng, Đông

| | MINIONS | Vanilla | NODIXHI |
| --- | --- | --- | --- |
| Host | Vercel (FE) + Render (BE) | Render Pro Plus 4 CPU / 8 GB, Virginia | Render free (Docker) |
| Disk lâu dài | không rõ | 40 GB (cache SQLite + 2MASS) | không (mất khi restart) |
| Ngủ | **có, khoảng 50 s** | không | có, khoảng 1 phút |
| Làm nóng khi khởi động | không | có (5 mục tiêu + catalogue) | không |

## Việc cần làm
1. **Đã làm**: landing tự gọi `/api/health` (PR feedback).
2. GitHub Actions `keepalive.yml`: `schedule: '*/10 0-15 * * *'` (giờ VN 7h–22h), `curl -fsS $API/api/health`.
3. Startup hook: tải trước timeline của 5 mục tiêu vào cache.
4. Vòng chấm: nâng lên gói không ngủ và gắn disk; đặt `X-Cache` để đo tỉ lệ trúng cache.
5. Frontend: prefetch `/api/frames` cho WISE 0855 khi người dùng rê chuột vào CTA trên landing.

## Đo
PERF-3 trước và sau khi thay đổi; ghi vào `docs/evidence/perf-YYYYMMDD.csv`.
