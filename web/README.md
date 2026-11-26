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

## Assistant (Gemini)

`functions/api/chat.ts` is a Cloudflare Pages Function that answers questions about the map with Google Gemini, grounded on the
published data release. The key is only ever read on the server.

- Local: copy `.dev.vars.example` to `.dev.vars`, paste the key, then run `npx wrangler pages dev dist --port 8788` next to `npm run dev`
  (Vite proxies `/api` to it).
- Production: `npx wrangler pages secret put GEMINI_API_KEY --project-name buja-flood-twin`, then redeploy.
- Add a Cloudflare rate-limiting rule on `/api/chat` and a spend or quota alert in Google AI Studio.
