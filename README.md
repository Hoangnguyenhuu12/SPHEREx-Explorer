# SPHEREx Explorer — Planet X and SPHEREx

Public-facing multi-epoch infrared sky viewer built for the **2026 NASA Space Apps Challenge** ([Planet X and SPHEREx](https://www.spaceappschallenge.org/2026/challenges/planet-x-and-spherex/)).

> **Disclaimer:** SPHEREx Explorer is an independent open-source project created for the NASA Space Apps Challenge and is not an official NASA product.

---

## Overview

SPHEREx maps the entire sky every six months across 102 near-infrared spectral bands (`0.75–5.0 µm`). Because SPHEREx only began surveying in 2025, spotting proper motion or brightness variability on a single-year baseline can be challenging. **SPHEREx Explorer** helps anyone explore real observations without needing to know FITS headers or archive query languages:

- **SPHEREx Orbit:** 3D Solar System & SPHEREx orbital view leading into the sky explorer.
- **The Eyes (`/the-eyes`):** Interactive all-sky map powered by Aladin Lite v3 and the SPHEREx DR1 All-Sky HiPS Cube, with epoch-propagated Gaia DR3 catalog overlays.
- **Multi-Mission Blink Timeline (`unWISE W2 + SPHEREx D6`):** Combines 14 years of `unWISE` W2 (`4.6 µm`, 2010–2024) coadds with new `SPHEREx` D6 (`4.4–5.0 µm`, 2025–2026) cutouts—preserving the real mission gap—across all five challenge benchmark targets:
  - **Barnard's Star** (`barnard`) — 27 frames (23 unWISE + 4 SPHEREx D6)
  - **Epsilon Indi B** (`epsindib`) — 27 frames (23 unWISE + 4 SPHEREx D6)
  - **WISE 0855−0714** (`wise0855`) — 27 frames (23 unWISE + 4 SPHEREx D6)
  - **RW Aurigae** (`rwaur`) — 27 frames (23 unWISE + 4 SPHEREx D6)
  - **R Draconis** (`rdra`) — 52 frames (48 unWISE + 4 SPHEREx D6)

---

## Data Sources, Attributions & Licenses

All astronomical datasets, catalogs, and third-party open-source tools used in this project are credited below in compliance with the NASA Space Apps Challenge citation policy. See [docs/HARVESTED_DATA_SOURCES.md](docs/HARVESTED_DATA_SOURCES.md) for the full archive inventory.

### NASA Data & Resources
- **SPHEREx Observations (`spherex_dr1`, `spherex_qr3`) & All-Sky HiPS Cube:** Retrieved from the **NASA/IPAC Infrared Science Archive (IRSA)** ([irsa.ipac.caltech.edu/Missions/spherex.html](https://irsa.ipac.caltech.edu/Missions/spherex.html)), following the official [IRSA SPHEREx Tutorial Notebooks](https://caltech-ipac.github.io/irsa-tutorials/spherex/).
- **WISE / unWISE Time-Resolved Coadds (`W1` 3.4 µm & `W2` 4.6 µm, 2010–2024):** Cutouts accessed via **WiseView** ([byw.tools/wiseview](http://byw.tools/wiseview) / `unwise.me`), using public NASA WISE/NEOWISE survey data.
- **Earth Imagery:** **NASA Blue Marble** used in the 3D Solar System & SPHEREx orbit view.

### Space Agency Partner Resources & Astronomical Catalogs
- **ESA Gaia DR3:** Astrometric star catalog (`ra`, `dec`, `g_mag`, `parallax`, `pmra`, `pmdec` at reference epoch J2016.0) retrieved from **STScI MAST** (`archive.stsci.edu`, `Mast.Catalogs.GaiaDR3.Cone`) and **CDS VizieR**, used to propagate reference stars and target trajectories to each observation epoch.
- **CSA / CADC NEOSSat (`cadc:NEOSSAT`):** Public Level 2 observations of near-Earth asteroid `(66391) Moshup` (`1999-KW4`) queried from the **Canadian Astronomy Data Centre (CADC)** ([cadc-ccda.hia-iha.nrc-cnrc.gc.ca](https://www.cadc-ccda.hia-iha.nrc-cnrc.gc.ca/en/)) and **CSA Open Data** ([data.asc-csa.gc.ca/dataset/neossat](https://data.asc-csa.gc.ca/dataset/neossat)) for our moving-target ingestion and astrometry review pipeline.
- **CDS Strasbourg Services:** **Aladin Lite v3**, **SIMBAD**, and **AllWISE / CDS** sky tiles for interactive sky rendering and object resolution.

### Software & Open-Source Stack
- **Backend & Astronomical Processing:** Python 3.12, FastAPI, Astropy, Photutils, NumPy, SciPy, Supabase (PostgreSQL + Storage).
- **Frontend:** React, TypeScript, Vite, TanStack Query, Aladin Lite.
- **Project License:** Released under the **MIT License** (see [LICENSE](LICENSE)).

---

## Repository Layout

```text
frontend/            React + TypeScript + Vite web application
members/dong/        FastAPI backend API, services, and pytest suite
scripts/             IRSA / unWISE / Gaia / NEOSSat harvesters & timeline builders
shared/              Shared target definitions, FITS/image processing, IRSA client
supabase/            Database schema migrations
docs/                Architecture, QA, resource alignment, and data inventory docs
data/                Local gitignored cache, FITS cutouts, and generated sequences
```

### Team (`NASA Minions`)

| Member | Focus |
| --- | --- |
| Thạch | Frontend UI/UX & coordination |
| Duy Hoàng | Frontend architecture, DevOps & testing |
| Đông | Backend API & caching |
| Khôi | IRSA / archive data pipelines & database |
| Hữu Hoàng | Image processing & alignment |
| Nguyên | Astronomical science, photometry & spectra |

---

## Quick Setup & Verification

Requires **Python 3.12+** and **Node 22.12+ / 24 LTS**.

```bash
# 1. Python virtual environment & dependencies
py -3.12 -m venv .venv
.venv\Scripts\Activate.ps1        # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt

# 2. Environment variables (.env from .env.example)
cp .env.example .env

# 3. Frontend packages
npm install
cd frontend && npm install && cd ..
```

### Run Locally

```bash
# Backend API (from repo root)
node members/dong/dev.mjs

# Frontend dev server
cd frontend && npm run dev
```

### Run Tests & Build Checks

```bash
# Backend tests
.\.venv\Scripts\python.exe -m pytest members\dong\tests

# Frontend checks
cd frontend
npm run typecheck
npm run lint
npm test
npm run build
```

> **Note:** Never commit `.env`, `.fits` files, local cutouts, or `.db`/`.sqlite` artifacts (all excluded by `.gitignore`). Pre-rendered timeline PNGs and manifests are served from Supabase Storage (`spherex-dr1-demo`).
