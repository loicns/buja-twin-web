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

`api/chat.ts` is a Vercel Function that answers questions about the map with Google Gemini, grounded on the published data
release. The key is only ever read on the server.

- Local: copy `.env.example` to `.env.local`, paste the key, run `npx vercel dev --listen 3000` and, in another terminal, `npm run dev`
  (Vite proxies `/api` to port 3000).
- Production: add `GEMINI_API_KEY` in Vercel (Project Settings, Environment Variables), then redeploy.
- Set a quota or spend alert in Google AI Studio. The function also slows bursts per IP, but serverless instances do not share memory.

## Hosting on Vercel with buja.servunt.com

1. `cd web && npx vercel login`, then `npx vercel link` (create a project, root directory `web`).
2. `npx vercel env add GEMINI_API_KEY production` and paste the key.
3. `npx vercel deploy --prod`.
4. `npx vercel domains add buja.servunt.com` and add the DNS record it prints in Route 53 (a CNAME to the Vercel target).
5. Add `https://buja.servunt.com` to the R2 CORS policy (`../infra/r2-cors.json`).

## Embedding

```html
<iframe src="https://buja.servunt.com/?embed=1&s=2&layers=flood,buildings" title="Bujumbura modelled flood map"
        style="width:100%;height:560px;border:0" loading="lazy"></iframe>
```

`embed=1` hides the header and panel. Other link options: `s` (1 to 3), `layers` (comma list: flood, buildings, priority, zones, canopy,
trees, rivers, bridges, terrain), `z`, `x`, `y`, `b`, `p` (view), `o` (opacity, e.g. `o=flood:60`), `release` (pin a data version).
Framing is allowed from servunt.com only (see `vercel.json`).
