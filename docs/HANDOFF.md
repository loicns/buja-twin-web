# Handoff: Bujumbura flood twin web app

State as of 2026-11-26. Public-safe: no keys, no account IDs. Secrets live in Vercel and in git-ignored local files.

## What exists

A public, read-only web map of modelled flooding in Bujumbura, live at **https://buja.servunt.com**.

- Three SFINCS storm scenarios (S1 frequent 1-in-10, S2 severe 1-in-100, S3 Copernicus benchmark): water depth, buildings coloured by
  depth, estimated people per neighbourhood and priority hexagon, tree canopy and detected trees, rivers, bridges, terrain.
- First-visit cover (static HTML, `public/boot.js` decides before paint; `?intro=1` / `?intro=0`), a "Modélisé · non
  calibré" chip in the header on every screen, neighbourhood search with fly-to, clickable top five, depth legend in body
  terms, scenario cross-fade, share button, keys 1/2/3, a bottom sheet on phones. Opens in 3D with buildings (2D only on
  low-end devices); the 3D / 2D switch is on the map, top right. Limits dialog always reachable.
  FR (default) and EN. Cursor readout on mouse devices. Deep links and an `?embed=1` iframe mode (see `web/README.md`).
  The research behind the redesign, and the ranked backlog, are in [`UX_RESEARCH.md`](UX_RESEARCH.md).
- AI assistant (Gemini) grounded on the published data release; it refuses to forecast.
- Design language follows `/Users/loicns/Projects/servunt/docs/webmap-agent-prompt.md` (navy, hairlines, mono labels, 4 px corners max).
  The brand is **not** Servunt: no Servunt logo or name in the app.

## Where things are

| Piece | Location |
| --- | --- |
| Repo | `~/Projects/buja-twin-web`, GitHub `loicns/buja-twin-web` (public), branch `main` |
| Web app | `web/` (Vite, TypeScript, MapLibre GL 5, PMTiles; no framework) |
| Assistant | `web/api/chat.ts`, a Vercel Function (Web handler, Node runtime) |
| Hosting config | `web/vercel.json` (CSP, headers, `maxDuration`) |
| Data pipeline | `pipelines/` and `Makefile` (`make dist V=vYYYYMMDD`, 27 pytest checks) |
| Live-preview API (not deployed) | `api/` (FastAPI + ONNX), `api/Dockerfile`, `pipelines/export_onnx.py` |
| CI | `.github/workflows/ci.yml` (green); `deploy-api.yml` is manual-only |
| R2 CORS policy | `infra/r2-cors.json` (pasted into the R2 dashboard by hand) |
| Sibling research folders (not in git) | `~/Projects/buja_geo_twin` (18 GB twin), `~/Projects/buja_flood_forecast` (SFINCS lab, surrogate) |

## Hosting and data

- **Vercel** project `buja-flood-twin`, Root Directory `web`, connected to the GitHub repo, production branch `main`.
  **Deploy by pushing to `main`.** `npx vercel --prod` fails inside `web/` ("web/web does not exist") because of the root directory.
  Redeploy without a change: `git commit --allow-empty -m "Redeploy" && git push`.
- **Domain:** `buja.servunt.com`, A record to `76.76.21.21` in Route 53.
- **Env vars on Vercel:** `GEMINI_API_KEY` (sensitive). Optional `GEMINI_MODELS` (comma list, tried in order; default
  `gemini-3.1-flash-lite,gemini-flash-lite-latest,gemini-3.8-flash`), `VITE_DATA_URL`, `VITE_FEEDBACK_URL`, `VITE_API_URL`.
- **Data** is not in git. Cloudflare R2 bucket `buja-twin-data`, public through the `r2.dev` address
  `https://pub-7368a1bf7f2b44898e1f5028f7fdb733.r2.dev`. `current.json` names the live release (now `v20261127`); the app reads it first,
  so never hard-code a version. A link can pin one with `?release=`. Release folders are immutable: publish a new one, then switch the pointer.
- **Private bucket** `buja-twin-private` holds the surrogate model files (`model/v1/`). Never put private files in the public bucket
  (public access covers a whole bucket).
- **rclone** remote `r2` (bucket-scoped token). Upload with the `Makefile` `publish` target, which excludes per-building people.
- **Old site:** `buja-flood-twin.pages.dev` on Cloudflare Pages is still up and can be deleted.

## Changes of 2026-11-27

- **Data release `v20261127` is live** (`current.json` points to it). It adds neighbourhood ids, boxes, canopy share and
  the roughness-block flag, and fixes the duplicate Mutimbuzi. `v20261126b` stays in the bucket for pinned links.
- **Synthetic roughness block in every published run** (see `LIMITATIONS.md`): the SFINCS runs need redoing in the lab.
- Local testing against an unpublished release: serve `dist/` with a CORS + Range static server on port 5181 and run
  Vite with `VITE_DATA_URL=http://127.0.0.1:5181` (R2's CORS policy only allows `localhost:5173`).

## Rules and decisions that must not be undone

- Everything is modelled and uncalibrated; say so next to numbers. Not a forecast, not an official warning (IGEBU, civil protection).
- Open Lake Tanganyika is masked out of areas and tiles (DEM at 770.0 m shows about 2.5 m of fake "depth" there).
- S2 uses `cnfix_rain100_lake2024`; S3 uses `cnfix_bench_cop_s4`; S1 (`rain10_lake2024`) predates the curve-number fix (effect under 1 %).
- Lake stage is 772.50 m EGM2008, not the press gauge figure near 777 m.
- People are never published per building; only per hexagon and neighbourhood, rounded (ten below 1,000, hundred above).
- Neighbourhoods are Voronoi cells of 77 OSM points, labelled approximate. Priority is a screening rank.
- Vegetation: only CHM-detected trees (`provenance = measured_chm`). The legacy random-point trees are quarantined and must never be used.
- `roads_transportation` and `water_bodies` are **not** published: their fields look like a Copernicus EMS product, not OSM. Verify first.
- Terrain is FABDEM (CC BY-NC-SA, non-commercial), so this demo is non-commercial. The Servunt guide forbids FABDEM for its own site.
- Assistant: key only server-side; never in a `VITE_` variable or in a committed file.
- Neighbourhoods are keyed by `id`, never by name (two OSM places are both called Mutimbuzi).
- Vegetation is descriptive: never claim the flood model uses the canopy or that trees would lower these depths.
- Return periods are written as a yearly chance ("1 chance sur 100 par an"), depths in body terms first.

## Gotchas

- Add data sources on MapLibre `style.load`, not `load`: `load` waits for the basemap's first full render. Do not use
  `idle`, `map.loaded()` or `isSourceLoaded()` as "ready": the Positron style's `ne2_shaded` source never reports loaded
  and a few 3D edge tiles can stay "loading", so those may never turn true. `map.ts` uses tile events plus a quiet period.
- MapLibre's CSS loads lazily with the map chunk, after `style.css`: scope overrides of `.maplibregl-*` under `#map`.
- The built-in browser pane throttles rendering while hidden; measure load times in a visible tab
  (`performance.getEntriesByType("mark")` has `bft:*` marks).

- Gemini's newest models are often overloaded (503) or slow; the lite models answer in about 2-3 s. List the models a key can use with
  a `curl` to `/v1beta/models`. In zsh write `${m}:generateContent`, not `$m:generateContent`.
- First tile loads from the free `r2.dev` address can take 10-15 s (no edge caching). A custom domain would fix it, but needs a
  Cloudflare zone.
- New origins need two edits: the R2 CORS policy (dashboard) and the CSP `connect-src` / `frame-ancestors` in `web/vercel.json`.
- `web/.dev.vars` (git-ignored) holds a local key; `web/.env.example` documents `.env.local`, which is what Vercel's local dev reads.
- The `.env*` pattern in the root `.gitignore` hides `.env.example`; it was added with `git add -f`.

## Open work, in rough priority

1. **Live-preview sliders.** The code is built and tested locally (`api/`, `web/src/ui/preview.ts`). To go live: AWS account and $10 budget,
   `aws configure sso`, Docker Desktop, then ECR, Lambda container, Function URL, reserved concurrency (commands are in the Phase 4 doc),
   set `VITE_API_URL` on Vercel. The Dockerfile has never been built here and the Lambda cold start is unmeasured.
2. Lighthouse (mobile), a throttled Fast 3G run, Safari and Firefox checks, a screen-reader pass (a keyboard pass was
   done for the redesign). Move the data off `r2.dev` (see `UX_RESEARCH.md` §5).
3. Rate limiting for `/api/chat` beyond the best-effort per-IP check (Vercel Firewall), and a quota alert in Google AI Studio.
4. Decide on the free-tier Gemini privacy note (Google may use free-tier prompts) before wide sharing.
5. Optional: swipe compare, contours, a post-curve-number-fix S1 run, an A4 priority map.
6. Phase 5 workflows: SFINCS on demand and the daily forecast (GitHub Actions); `deploy-api.yml` still needs the AWS role and secrets.
7. Phase 6: stakeholder pilot, feedback form (`VITE_FEEDBACK_URL`), the RICH Hub inquiry email (draft in
   `~/Projects/buja_flood_forecast/05_outputs/communication/rich_hub_inquiry.md`, address unverified) and the EOI.
8. Housekeeping: delete the Cloudflare Pages project; tag the live data release (`data-v20261127`); update the Phase 0 doc (second bucket).

## Run it

```bash
cd ~/Projects/buja-twin-web/web && npm install && npm run dev        # http://localhost:5173 (allowed by the R2 CORS policy)
cd ~/Projects/buja-twin-web && make dist V=v20261128                  # rebuild a data release (needs the sibling folders, rclone)
```
