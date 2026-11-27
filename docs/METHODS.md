# Methods

A screening-level flood exposure analysis for Bujumbura. Everything is **modelled and uncalibrated**; see
[LIMITATIONS.md](LIMITATIONS.md).

## Scenarios

| Id | Name | SFINCS run | Rain | Lake stage (EGM2008) |
|---|---|---|---|---|
| S1 | Frequent storm | `rain10_lake2024` | 64.6 mm in 6 h (10-yr) | 772.50 m |
| S2 | Severe storm | `cnfix_rain100_lake2024` | 100.4 mm in 6 h (100-yr) | 772.50 m |
| S3 | Copernicus benchmark | `cnfix_bench_cop_s4` | 162.5 mm in 8 h | 772.95 m |

SFINCS 2.0 (hydromt-sfincs 2.0.0) at 20 m, rivers included. S2 and S3 were run after the lab's curve-number fix
(built-up cells without soil data use group D, CN 92). S1 predates the fix; in the two pairs that were re-run the
fix changed flooded area by under 1 %.

## Depth per building

The maximum modelled water depth under each building footprint, computed with exactextract on the 10 m grid
(both layers are EPSG:32735). Open Lake Tanganyika is removed first: the DEM holds the lake flat at 770.0 m and
SFINCS reports lake stage minus 770 m (about 2.5 m) over those cells, which is open water, not flooding.
Depth classes: dry below 0.1 m, low 0.1 to 0.5 m, moderate 0.5 to 1.5 m, high 1.5 m and above.

## People

WorldPop 2020, UN-adjusted, constrained, 3 arc-seconds (about 93 m), CC BY 4.0. Each pixel's people are shared among
the buildings whose representative point falls in it, in proportion to floor area, where floor area is footprint times
storeys and storeys = height / 3 m, rounded and clamped to 1 to 10 (missing height means 1 storey). Pixels with people
but no building lose them: 2.4 % of the people inside the buildings' bounding box. The allocated total is 1.28 million.
People are published per H3 hex and per neighbourhood only, never per building.

## Priority (a screening rank)

For each H3 cell (resolution 9, about 0.1 km2): people in buildings flooded 0.5 m or deeper in S2, times
(0.5 + 0.5 x the share of the three scenarios that flood any building in the cell at 0.5 m), converted to a percentile
rank. Its three inputs are people, S2 depth and how often the cell floods. It says where to look first, not where to act.

## Neighbourhoods

Voronoi cells around the 77 `neighbourhood_places` points, clipped to the Mairie outline. They are approximate and
labelled so in the app. They are not official administrative units. 45 cells fall inside the outline. Each has a
stable `id` (two places share the name Mutimbuzi; their labels carry the OSM class), a label point and a bounding box
for the app's search and fly-to (`lon`, `lat`, `minx` ... `maxy` in `exposure_zones.csv`).

## Vegetation per neighbourhood (descriptive)

`canopy_pct`: share of the cell's ground under canopy 2 m or taller, from the 1 m Meta and WRI canopy height map,
sampled 1 in 25 cells (nearest, not maximum, so the share is unbiased). `trees_ha`: CHM-detected trees per hectare (a
lower bound under closed canopy). Median over the 45 cells: 11.9 % and 7 trees/ha; range 1.6 % (Rukaramu) to 37.1 %
(Kiriri). Neither value is a model input or a flood-protection measure. `roughness_test_pct` is the share of the cell
inside the synthetic roughness block described in LIMITATIONS.md.
