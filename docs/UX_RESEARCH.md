# UX research and redesign, November 2026

What we learned about the people this map is for, what changed in the app as a result, and what is still worth doing.
Seven research tracks ran in parallel on 2026-11-26: target users, landing and onboarding, map interaction and
accessibility, visual design system, performance, vegetation, and an audit of the two core research projects. Sources
are linked where a claim depends on them.

## 1. Who the map is for

About 11 to 12 % of Burundians use the internet; about 90 % of mobile web traffic is Android; mobile data cost about
USD 1.10 per GB in 2022 ([DataReportal 2025](https://datareportal.com/reports/digital-2025-burundi),
[StatCounter](https://gs.statcounter.com/os-market-share/mobile-tablet/burundi)). Most residents will meet this map
second-hand, through an intermediary or a forwarded screenshot. About 98 % speak Kirundi; far fewer read French well.

| Persona | Device and language | Decides | Needs from the map |
|---|---|---|---|
| Urban planner (Mairie, ABUH, World Bank urban-resilience team) | Laptop, French, some GIS | Which catchments and neighbourhoods to study first | Scenario comparison, method, validation, data |
| Humanitarian coordinator (Red Cross, IOM DTM, NGO) | Laptop and Android, French/English | Where to pre-position, which zones to assess | Rounded people per neighbourhood, a shareable view, plain words |
| Journalist or researcher | Laptop, French | What to report | Numbers with their caveat attached, a link, an embed |
| Resident (Buterere, Kinama, Kanyosha, Gatumba) | Prepaid Android, Kirundi first | "Is my area affected, how deep, who warns me?" | A neighbourhood finder, depth in body terms, who issues real alerts |

Official warnings come from IGEBU; the Red Cross and WFP act on them, and Google Flood Hub covers Burundi. This map must
never look like a third, competing warning.

### Risk-communication rules adopted
1. Frame as "what if": never "risque demain", "alerte" or "évacuer".
2. Return periods as a yearly chance ("1 chance sur 100 par an"), not "1 sur 100 ans", which reads as "once a century"
   ([GFDRR](https://www.gfdrr.org/en/returnperiod)).
3. Depth in body terms first, metres second: people tested found metric depths meaningless and body terms clear
   ([Environment Agency SC150013](https://assets.publishing.service.gov.uk/media/6038c0a2e90e070563e5a6f9/Communicating_impacts_in_flood_warning_and_forecasting_-_summary.pdf)).
4. Every number rounded and marked "≈"; people never per building.
5. Never a claim about one home; "a grey area can still flood" (users trust "it never flooded here" over a map,
   [Defra Digital](https://defradigital.blog.gov.uk/2020/02/05/long-term-flood-risk-a-user-centred-service)).
6. Jargon (SFINCS, H3, CSI, EGM2008) stays in the layer details and the limits dialog.
7. No red banners or siren icons; flooded must read stronger than dry.

## 2. What changed in the app

### First screen
- **A first-visit cover, not a separate landing page.** Plain HTML in `index.html`, so it reads before the 1 MB map
  library loads: one-sentence purpose, three rounded S2 figures, the "floods about 40 % too much" admission, the "not a
  warning, ask IGEBU" line, one button. The map loads behind it. Click-to-accept disclaimer gates and multi-step tours
  were rejected: people click through gates, and tours did not improve task performance
  ([NN/g](https://www.nngroup.com/articles/mobile-app-onboarding/)).
- `public/boot.js` decides before first paint: the cover shows on a first visit with no state in the link, or with
  `?intro=1`; never with `?intro=0`, in embeds, or for a shared deep link. Dismissal is stored in
  `localStorage["bft:intro:v1"]`; bump the key to show it again after a major model change. "Présentation de la carte"
  in the About fold reopens it.
- **The caveat is in the header on every screen**, phone included ("Modélisé · non calibré", opens the limits dialog).
  Before, a phone user never saw it unless they opened the layers panel.

### Panel (information hierarchy)
Search, then scenario, then the headline figures (people first, 20 px), then the depth legend with body terms, then
the five most affected neighbourhoods as buttons that fly to them. Layers, view and sources are folded. Each layer's
legend and opacity sit under its own switch; layers that need zooming get a "Zoom in to see" button.

### Interaction
- Neighbourhood search: an offline APG combobox over the release's own list (no geocoder, nothing sent anywhere;
  Nominatim's policy forbids autocomplete anyway).
- Top-5 and search fly to the neighbourhood, outline it (white casing, navy line) and open its popup.
- Scenario switches cross-fade: the old depth layer stays until the new one has drawn, then fades out. No blank flash.
- Keys 1, 2, 3 switch scenario when focus is on the map or panel (never while typing).
- Share button: the system share sheet on phones, copy-link with confirmation elsewhere.
- "Whole city" button under the zoom controls; home zoom scales to the screen, so phones see the whole city.
- Popups: per-scenario swatch, depth and body term; Escape closes; focus returns; they nudge the map to stay on screen.
- In 2D, tilt and rotate gestures are off (the commonest accidental touch).
- In 3D, buildings are extruded from zoom 13, as soon as building tiles exist (before: only from zoom 15, so the 3D
  view showed no houses until you zoomed far in). Below zoom 13 a "Zoom in to see the buildings" button sits on the map.

### Phone
A bottom sheet replaces the all-or-nothing panel: a peek strip with the three scenarios and the people figure always
in thumb reach, a "Show details" button (a short swipe also works) for the rest. Map framing accounts for the strip.
Phones start in 2D. Touch targets are 44 px.

### Accessibility (WCAG 2.2 AA)
Fixed: 3D/2D radios had no arrow keys (2.1.1); the page had no `main` landmark; the map canvas was `aria-hidden` but
focusable; the summary was a live region re-read on every layer toggle (now a plain description linked with
`aria-describedby`, and one short announcement per scenario change). Control outlines raised to 3:1 (1.4.11); no text
under 11 px; range inputs 24 px tall (2.5.8).

### Visual design
One token block in `style.css` (colours, three text levels on navy, rules vs. control edges, a five-step type scale,
4-px spacing, motion, z-index). Map control styles are scoped under `#map` because MapLibre's own CSS now loads later.
Data colours:
- Dry buildings `#c3cbd6` → warm grey `#cfccc4`: the old grey looked deeper than the 0.1 to 0.5 m class (ΔE 4.9).
- Rivers and neighbourhood lines get a white casing; rivers shared the deepest class's blue.
- Priority ramp `#f3d9b5 #e6ab62 #c8693a #8f2f1f` at 0.7: the lightest old class was invisible on the basemap.
- The depth ramp itself stays: single-hue, monotonic lightness, distinguishable under deuteranopia and protanopia.

French typography: narrow no-break space before `: ; ? !` and inside « », no-break space between number and unit,
en dash in ranges. Copy is generated from one table (`web/scripts/i18n.py`) so FR and EN cannot drift.

### Vegetation
Canopy and detected trees stay off by default in their own "Végétation" group, with a short honest "why vegetation?"
note. Each neighbourhood now reports its canopy share and trees per hectare (descriptive). The legend says the canopy
is **not used by the flood model**. Claims we must not make: that the model accounts for real trees; any "X % less
flooding with more trees"; that deforestation caused the 2014 Gikoma flood (a landslide-dam breach, [Nibigira et al.
2018](https://nhess.copernicus.org/articles/18/1867/2018/nhess-18-1867-2018.pdf)) or the 2020 to 2024 lake flooding;
riparian "encroachment" maps, which could be used to justify evictions. Context for the explainer: over 1,200
landslides on the city's hillslopes ([Kubwimana et al. 2021](https://www.mdpi.com/2076-3263/11/6/259/htm)) and 81
gullies with 108 floods from 1997 to 2021 ([Nsabimana et al. 2023](https://mdpi.com/2073-445X/12/10/1876)).

### Performance
| Change | Effect |
|---|---|
| Data sources added on `style.load`, not `load` | `load` waits for the basemap's first complete render; flood tiles now request at about 0.3 to 0.5 s, in parallel with the basemap |
| Basemap starts before the release JSON arrives | removes a round-trip from the critical path |
| Sources created on first use | hidden layers cost nothing, not even their PMTiles header (6 of 11 sources at start) |
| MapLibre in its own chunk | entry script 312 KB → 24 KB gzip; 70 KB MapLibre CSS no longer render-blocking; the cover paints from HTML |
| `preconnect` to the data and basemap hosts | saves a TLS setup on each |
| Phones and slow devices start in 2D | half the terrain requests, no fill-extrusion |
| Loading label clears on a reliable signal | the old `idle` signal could never fire: the basemap's `ne2_shaded` source never reports loaded and a few 3D edge tiles stay "loading", so the live site's label stayed up for good |

Timing marks are in the page: `performance.getEntriesByType("mark")` lists `bft:style-load`, `bft:release`,
`bft:first-render` and `bft:flood-ready`. Measure in a visible tab: background tabs throttle rendering.

## 3. Data changes (release v20261127)

- Neighbourhoods have stable ids; the duplicate "Mutimbuzi" no longer merges two cells and counts 1,499 S2 people twice.
- `exposure_zones.csv` gains a label point and bounding box per neighbourhood (for search and fly-to), `canopy_pct`,
  `trees_ha` and `roughness_test_pct`; `zones.pmtiles` carries `id`, `canopy_pct` and `roughness_test_pct`.
- A new release test checks unique ids, boxes inside the domain, label points inside their boxes and value ranges.
- The app still works on older releases: search hides itself and the top-5 rows are not clickable.

## 4. What the core projects hold that the map does not show yet

From an audit of `buja_flood_forecast` and `buja_geo_twin` (paths are in the lab):

| Ready or nearly | Why it matters |
|---|---|
| Rain 10/50/100-yr × lake mean (769.89 m) or 2024 peak (772.50 m) runs, `04_models/sfincs/runs/` | a rain × lake selector: the lake alone floods 3.2 km², storms far more |
| Lake-only floods at 772.0/772.5/773.0 m, `04_models/lake_floods/` | separates lake flooding from storm flooding |
| Observed lake level 1992 to 2026 (G-REALM) | the only responsible "conditions now" item (771.28 m on 2026-11-06, 1.2 m below the 2024 peak) |
| Rivers on / halved / off diagnostic runs | "where the water comes from": the honest substitute for a nature-based-solution claim |
| Copernicus S4 depth and agreement map | validation shown on the map, not only in numbers |
| OSM schools and health sites (needs merging and checking) | what stakeholders ask about first |

Keep back: velocity and depth × velocity hazard (spikes up to 10.8 m/s need checking); the forecast pipeline (ECMWF
missed all three > 20 mm days in the 2024 hindcast, so the map stays scenario-only); the canyon-cliff layers, the 775 m
legacy lake layers, the quarantined random-point trees, and `roads_transportation` / `water_bodies` (unverified source).

## 5. Backlog, ranked by value for effort

1. **Redo the SFINCS runs with a measured-canopy roughness** (lab work, see LIMITATIONS.md). Until then the most
   affected neighbourhoods carry a reliability flag.
2. **Move the data off `r2.dev`** to a cached HTTP/2 origin (R2 behind a Cloudflare-managed `data.` domain with a cache
   rule for `.pmtiles`, or same-origin on Vercel). r2.dev is HTTP/1.1 only, so tiles queue six at a time, and it is not
   meant for production ([R2 limits](https://developers.cloudflare.com/r2/platform/limits/)). Needs a DNS decision.
3. **Rain × lake scenario selector** and a **lake-only** view from runs that already exist.
4. **"Where the water comes from"** view (rivers on / halved / off).
5. **Shareable neighbourhood sheet** (image or A4 with the caveat burned in, so a cropped screenshot cannot become a
   fake warning).
6. **Kirundi core set** (about 30 strings: caveat, scenarios, depth bands, sheet), translated by people and checked with
   Red Cross volunteers. Not machine translation.
7. **Lossless WebP** for terrain and depth tiles (identical pixels, an estimated 20 to 35 % fewer bytes; check on this
   data).
8. **Self-hosted basemap** (a Protomaps extract of the Bujumbura box on the same origin) to remove the third-party
   basemap from the critical path.
9. **Compare two scenarios** (swipe on desktop; an "S3 minus S1" building mode is the cheap first step).
10. **Hover highlight** with feature-state on hexes and neighbourhoods (`promoteId`).
11. ESA WorldCover "land cover used by the model" layer and Hansen tree-cover loss for the upstream basins, labelled as
    trend, not area.

Rejected for now: a scrollytelling front page (heavy on low-end Android, hides the map from returning users), a
geolocation "locate me" (permissions friction for little gain at city scale; the search covers it), automatic
machine translation.
