# Tổng hợp & Đối chiếu các nguồn đã cào từ Challenge Resources

Đối chiếu trực tiếp với trang **Resources** chính thức của thử thách ([Planet X and SPHEREx – Resources](https://www.spaceappschallenge.org/2026/challenges/planet-x-and-spherex/?tab=resources)): **toàn bộ 4/4 nguồn dữ liệu đã cào trong repo đều khớp 100% với các nguồn được liệt kê trên trang này** (gồm **NASA Data & Resources** và **Space Agency Partner Resources — CSA**).

---

## Bảng đối chiếu 1-1 với Challenge Resources

| Nhóm trên trang Challenge | Tên tài nguyên chính thức & URL | Trong repo đã cào những gì? |
| :--- | :--- | :--- |
| **NASA Data & Resources** | **NASA/IPAC Infrared Science Archive** (`irsa.ipac.caltech.edu/Missions/spherex.html`) + **SPHEREx Tutorial Notebooks** | Đã cào **SPHEREx `DR1` (1.517 sản phẩm)**, **`QR3` (505 sản phẩm)** đủ 6 detector (`D1–D6`), ảnh cutout FITS Level 2 cho 5 sao, và thông số + tile mẫu **DR1 All-Sky HiPS Cube** (102 lát bước sóng). |
| **NASA Data & Resources** | **WiseView** (`byw.tools/wiseview`) | Đã cào **280 ảnh cutout FITS `unWISE`** theo từng epoch (`2010–2024`, đủ 2 kênh `W1` 3.4 µm và `W2` 4.6 µm) quanh 5 sao mục tiêu (`46` cutout/sao với `barnard`, `epsindib`, `rwaur`, `wise0855`; `96` cutout với `rdra`). |
| **NASA Data & Resources** | **Gaia Mission Data** (`archive.stsci.edu/missions-and-data/gaia` — ghi chú dùng **DR3**) | Đã cào qua STScI MAST (`Mast.Catalogs.GaiaDR3.Cone`) danh mục astrometry cho **2.718 ngôi sao độc nhất** quanh 5 sao mục tiêu (`source_id`, RA/Dec J2016.0, `g_mag`, `parallax_mas`, `pmra_mas_yr`, `pmdec_mas_yr`). |
| **Space Agency Partner (CSA)** | **CADC** (`cadc-ccda.hia-iha.nrc-cnrc.gc.ca`) & **NEOSSat Dataset / Tutorial** (`data.asc-csa.gc.ca/dataset/neossat`) | Đã cào từ CADC TAP (`cadc:NEOSSAT`) **6 bản ghi quan sát** năm 2019 và tải mẫu **2 file FITS** của tiểu hành tinh gần Trái Đất **`1999-KW4`** (`(66391) Moshup`). |

---

## Chi tiết dữ liệu đã cào theo từng nguồn

### 1. NASA / Caltech-IPAC IRSA — SPHEREx (`DR1`, `QR3` & HiPS Cube)
- **Endpoint đã cào:** `https://irsa.ipac.caltech.edu/SIA`, `/ibe/cutout`, `https://irsa.ipac.caltech.edu/data/hips/SPHEREx/spherex_allsky_cube`
- **Metadata sản phẩm quan sát:** **1.517** bản ghi `spherex_dr1` và **505** bản ghi `spherex_qr3` phủ đủ `D1–D6` (`0.75–5.0 µm`) cho 5 sao (`barnard`, `epsindib`, `rdra`, `rwaur`, `wise0855`).
- **Cutout FITS Level 2 (`IMAGE`, `VARIANCE`, `FLAGS`, WCS):**
  - `epsindib`: đầy đủ `D1–D6` (`45–69` frame/detector, `usable = true`).
  - `barnard`: `D1–D6` (`32–41` frame/detector, có cờ bão hòa ở tâm) + `4` cutout `D6`.
  - `rdra`: `D1–D6` (`54–64` frame/detector, có cờ bão hòa ở tâm) + `4` cutout `D6`.
  - `rwaur`: `1` frame `D1` trong `dr1_frames` + `4` cutout `D6`.
  - `wise0855`: `3` frame `D2`, `2` frame `D5` trong `dr1_frames` + `6` cutout `D6`.
- **HiPS Cube:** thông số 102 kênh (`MJD 60789.75–61174.49`) + 3 tile PNG mẫu đã xác minh.

### 2. WiseView (`unWISE` Time-Resolved Coadds)
- **Endpoint đã cào:** `http://byw.tools/cutout` / `http://byw.tools/wiseview` (nền từ `unwise.me`, `2010–2024`)
- **Cutout FITS `W1` (`3.4 µm`) & `W2` (`4.6 µm`):** tổng **280 cutout**:
  - `barnard` (`2688p045`): 23 `W1` + 23 `W2` (**46** cutout, MJD `55273.5–60389.3`)
  - `epsindib` (`3323m576`): 23 `W1` + 23 `W2` (**46** cutout, MJD `55313.9–60433.8`)
  - `rwaur` (`0765p302`): 23 `W1` + 23 `W2` (**46** cutout, MJD `55258.1–60355.9`)
  - `wise0855` (`1342m076`): 23 `W1` + 23 `W2` (**46** cutout, MJD `55319.4–60419.9`)
  - `rdra` (`2486p666`): 48 `W1` + 48 `W2` (**96** cutout, MJD `55344.4–60458.2`)

### 3. Gaia DR3 (STScI MAST)
- **Endpoint đã cào:** `https://mast.stsci.edu/api/v0/invoke` (`Mast.Catalogs.GaiaDR3.Cone`)
- **Số lượng:** **2.718 ngôi sao độc nhất** (`barnard`: 1.573, `rwaur`: 696, `wise0855`: 170, `epsindib`: 161, `rdra`: 118).
- **Trường dữ liệu:** `source_id`, `ra_deg`, `dec_deg` (J2016.0), `g_mag`, `parallax_mas`, `pmra_mas_yr`, `pmdec_mas_yr`.

### 4. CSA / CADC NEOSSat
- **Endpoint đã cào:** `https://ws.cadc-ccda.hia-iha.nrc-cnrc.gc.ca/argus/sync` (`cadc:NEOSSAT`)
- **Dữ liệu đã cào:** **6 bản ghi quan sát** năm `2019` (MJD `58602.79–58635.07`) của tiểu hành tinh **`1999-KW4`** (`(66391) Moshup`) và tải mẫu **2 file FITS** (`2019119185220`, `2019152014345`; mới verify thời gian/header, chưa verify WCS nên chưa đưa lên blink UI).
