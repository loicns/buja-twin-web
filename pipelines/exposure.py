"""Building-level flood exposure, people estimate and H3 priority cells.

Run:  python pipelines/exposure.py --dist dist/v20261121 [--pop bdi_ppp_2020_UNadj_constrained.tif]
Without --pop only the depth part runs (people and priority need the population raster).
Needs: geopandas (pyogrio), rasterio, exactextract, h3>=4, pyarrow.
"""
import argparse
import json
from pathlib import Path

import geopandas as gpd
import h3
import numpy as np
import pandas as pd
import rasterio
from exactextract import exact_extract
from rasterio.io import MemoryFile
from rasterio.transform import rowcol

from common import EXPORTS, RUNS, SCENARIOS, TWIN

CLASS_EDGES = [0.10, 0.50, 1.50]   # 0 dry (<0.1 m) | 1 low | 2 moderate (>=0.5 m) | 3 high (>=1.5 m)
DEM = TWIN / "02_processed/terrain/dem_hydro_enforced_10m.tif"
LAKE_LEVEL_M = 770.01              # the DEM holds open Lake Tanganyika flat at 770.0 m
H3_RES = 9                         # about 0.1 km2 per cell


def depth_class(d: pd.Series) -> pd.Series:
    return pd.cut(d, [-np.inf, *CLASS_EDGES, np.inf], labels=[0, 1, 2, 3], right=False).astype(int)


def lake_masked_depth(tif: Path) -> MemoryFile:
    """The SFINCS depth raster shows ~2.5 m of 'depth' over open lake cells: set those to 0."""
    with rasterio.open(DEM) as dem, rasterio.open(tif) as src:
        assert dem.transform == src.transform and dem.shape == src.shape, "DEM and depth grids differ"
        d = src.read(1).astype("float32")
        d[dem.read(1) <= LAKE_LEVEL_M] = 0.0
        d[d == src.nodata] = 0.0
        prof = src.profile
    prof.update(nodata=None)
    mem = MemoryFile()
    with mem.open(**prof) as o:
        o.write(d, 1)
    return mem


def add_depths(b: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    for sid, rid in SCENARIOS.items():
        with lake_masked_depth(RUNS / rid / "max_water_depth_10m.tif") as mem, mem.open() as ds:
            z = exact_extract(ds, b[["bid", "geometry"]], ["max"], include_cols=["bid"], output="pandas")
        b = b.merge(z.rename(columns={"max": f"d_{sid}"}), on="bid", how="left")
        b[f"d_{sid}"] = b[f"d_{sid}"].fillna(0).clip(lower=0).round(2)
        b[f"c_{sid}"] = depth_class(b[f"d_{sid}"])
    return b


def add_people(b: pd.DataFrame, pop_tif: Path) -> tuple[pd.DataFrame, dict]:
    """Share each WorldPop pixel among the buildings whose representative point falls in it, by floor area."""
    b["floor_m2"] = b["area_m2"] * np.clip(np.round(b["height_m"].fillna(3) / 3), 1, 10)
    with rasterio.open(pop_tif) as r:
        assert r.crs.to_epsg() == 4326
        pop = r.read(1, masked=True).filled(0).astype("float64")
        rows, cols = rowcol(r.transform, b["lon"].to_numpy(), b["lat"].to_numpy())
        rows, cols = np.asarray(rows), np.asarray(cols)
        west, south, east, north = b["lon"].min(), b["lat"].min(), b["lon"].max(), b["lat"].max()
        r0, c0 = r.index(west, north)
        r1, c1 = r.index(east, south)
    inside = (rows >= 0) & (rows < pop.shape[0]) & (cols >= 0) & (cols < pop.shape[1])
    pix = np.where(inside, rows.astype("int64") * pop.shape[1] + cols, -1)
    b["pix"] = pix
    pix_pop = np.where(inside, pop[np.clip(rows, 0, pop.shape[0] - 1), np.clip(cols, 0, pop.shape[1] - 1)], 0.0)
    share = b["floor_m2"] / b.groupby("pix")["floor_m2"].transform("sum")
    b["people"] = (pix_pop * share).round(2)
    allocated = float(b.drop_duplicates("pix").loc[lambda x: x["pix"] >= 0, "pix"].map(
        lambda p: pop[p // pop.shape[1], p % pop.shape[1]]).sum())
    box_total = float(pop[min(r0, r1):max(r0, r1) + 1, min(c0, c1):max(c0, c1) + 1].sum())
    info = {"worldpop_total_in_building_bbox": round(box_total), "allocated_to_buildings": round(allocated),
            "share_in_pixels_without_buildings": round(1 - allocated / box_total, 3)}
    return b.drop(columns="pix"), info


def add_h3(b: pd.DataFrame, with_people: bool) -> pd.DataFrame:
    b["h3"] = [h3.latlng_to_cell(y, x, H3_RES) for y, x in zip(b["lat"], b["lon"])]
    agg = {"bid": "count"}
    if with_people:
        agg["people"] = "sum"
    for sid in SCENARIOS:
        b[f"n_{sid}"] = (b[f"c_{sid}"] >= 2).astype(int)  # building in >= 0.5 m
        agg[f"n_{sid}"] = "sum"
        if with_people:
            b[f"p_{sid}"] = np.where(b[f"c_{sid}"] >= 2, b["people"], 0.0)
            agg[f"p_{sid}"] = "sum"
    hexes = b.groupby("h3").agg(agg).rename(columns={"bid": "buildings"})
    hexes["freq"] = sum((hexes[f"n_{s}"] > 0).astype(int) for s in SCENARIOS) / len(SCENARIOS)
    if with_people:
        hexes["priority"] = (hexes["p_s2"] * (0.5 + 0.5 * hexes["freq"])).rank(pct=True).round(3)
        hexes["rank_s2"] = hexes["priority"].rank(ascending=False, method="first").astype(int)
    return hexes


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dist", required=True)
    ap.add_argument("--pop", type=Path, help="WorldPop people-per-pixel GeoTIFF (EPSG:4326)")
    ap.add_argument("--reuse-depths", action="store_true", help="skip the 2-minute depth step if its cache exists")
    a = ap.parse_args()
    out = Path(a.dist) / "exposure"
    out.mkdir(parents=True, exist_ok=True)

    cache = out / "_depths.parquet"
    if a.reuse_depths and cache.exists():
        b = pd.read_parquet(cache)
    else:
        b = gpd.read_file(EXPORTS / "buildings_3d.gpkg", columns=["fclass", "height_m", "area_m2"],
                          fid_as_index=True).rename_axis("bid").reset_index()  # bid = GeoPackage fid (1-based)
        pts = b.geometry.representative_point().to_crs(4326)
        b["lon"], b["lat"] = pts.x.round(6), pts.y.round(6)
        b = add_depths(b)
        b.drop(columns="geometry").to_parquet(cache)
        b = pd.DataFrame(b.drop(columns="geometry"))
    assert len(b) == 254_532, len(b)
    info = {}
    if a.pop:
        b, info = add_people(b, a.pop)
    hexes = add_h3(b, with_people=bool(a.pop))

    b.to_parquet(out / "exposure_buildings.parquet")
    hexes.reset_index().to_csv(out / "exposure_h3.csv", index=False)
    summary = {"buildings_total": len(b), "people_method": info or "not run (no --pop)"}
    for sid in SCENARIOS:
        summary[sid] = {"buildings_ge_0p1m": int((b[f"c_{sid}"] >= 1).sum()),
                        "buildings_ge_0p5m": int((b[f"c_{sid}"] >= 2).sum()),
                        "buildings_ge_1p5m": int((b[f"c_{sid}"] >= 3).sum())}
        if a.pop:
            summary[sid]["people_ge_0p5m"] = int(b.loc[b[f"c_{sid}"] >= 2, "people"].sum())
    if a.pop:
        summary["people_total"] = int(b["people"].sum())
    (out / "exposure_summary.json").write_text(json.dumps(summary, indent=2) + "\n")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
