# Web map

Vite + TypeScript + MapLibre GL 5 + PMTiles. No framework and no backend: the app reads the data release
that `current.json` points to on R2.

```bash
npm install
npm run dev        # http://localhost:5173 (that port is allowed by the R2 CORS policy)
npm run build      # type-checks, then builds dist/
```

Build-time options (all optional): `VITE_DATA_URL` (public data origin), `VITE_FEEDBACK_URL` (shows a feedback link).
Defaults live in `src/config.ts`. Deploy `dist/` to Cloudflare Pages; `public/_headers` sets the security headers.
