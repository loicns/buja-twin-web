# Data licences and attribution

Every layer the app shows has a row here. The attribution string goes in the map footer.

| Layer | Source | Licence | Attribution string | Published as |
|---|---|---|---|---|
| Terrain | FABDEM v1-2 | CC BY-NC-SA 4.0 (non-commercial) | FABDEM, Univ. of Bristol / Fathom | terrain tiles |
| Buildings | Google Open Buildings v3 + OSM | CC BY 4.0 + ODbL | Google Open Buildings; © OpenStreetMap contributors | vector tiles |
| Bridges, boundary, neighbourhood points | OpenStreetMap | ODbL 1.0 | © OpenStreetMap contributors | vector tiles |
| Basemap (roads, water, labels) | OpenFreeMap, OpenMapTiles, OpenStreetMap | ODbL 1.0 / CC BY 4.0 | © OpenStreetMap contributors, OpenMapTiles, OpenFreeMap | third-party vector tiles |
| Rivers | HydroRIVERS + derived | free, with citation | Lehner & Grill 2013 | vector tiles |
| Canopy height and detected trees | Meta / WRI 1 m CHM (co-registered 6 m N, 4 m E) | CC BY 4.0 | Meta & WRI High Resolution Canopy Height | raster tiles (5 m) and points |
| Flood depth S1–S3 | Own SFINCS runs | CC BY 4.0 | Bujumbura Flood Twin | raster tiles + COG |
| Population | WorldPop 2020 (Phase 2) | CC BY 4.0 | WorldPop, Univ. of Southampton | aggregated only |

Because FABDEM is non-commercial, the whole demo stays non-commercial. If the project later goes commercial, swap the terrain for Copernicus GLO-30.

Not published: the twin's `roads_transportation` and `water_bodies` layers. Their attribute fields look like a Copernicus EMS
product rather than OpenStreetMap, and the source is not recorded. Check the source before publishing them.
