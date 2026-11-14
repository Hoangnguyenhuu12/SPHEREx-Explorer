# SPHEREx Explorer — frontend

Four pages: `/` (Landing), `/story`, `/where-are-you` (rotating Earth), `/the-eyes` (Aladin Lite sky map + SPHEREx observation player).

```bash
npm ci
npm run dev        # Illustrative demo data by default
npm test
npm run build
```

Set `VITE_API_BASE_URL` and `VITE_USE_MOCK=false` to use the API (see `.env.example`). Design rules: `../docs/DESIGN.md`. Operations: `../docs/RUNBOOK.md`.

## Structure

- `src/app` — router, providers, public config.
- `src/pages` — page composition.
- `src/features` — `sky-map` (Aladin wrapper), `blink` (frame session, player, canvas, viewport math), `target-details` (popup, science panels, charts), `target-search` (coordinate parsing, URL codec), `earth-scene` (React Three Fiber), `route-transition`, `artwork`.
- `src/shared` — API adapter (`http.ts` for API 0.1, `mock/` for the labelled demo), layout, UI styles, target catalog.
- `src/test` — unit tests for parsing, URL state, player, overlay exclusivity, viewport and sky/pixel conversion.
