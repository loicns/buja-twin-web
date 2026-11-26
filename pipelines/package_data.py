"""twin + lab rasters -> web-ready COGs, classed flood rasters and catalog.json.

Run:  python pipelines/package_data.py --out dist/v20261121
Needs GDAL command-line tools (gdalwarp) on PATH, plus rasterio and numpy.
"""
import argparse
import json
import subprocess
from pathlib import Path

import numpy as np
import rasterio
from rasterio.warp import transform_bounds

from common import RUNS, SCENARIOS, TWIN

EDGES = [0.10, 0.50, 1.50, 3.00, 5.00]  # depth class edges (m): five navy-blue classes
HEX = ["#d4e1f0", "#a6c1e2", "#6c95c9", "#3866a6", "#163d78"]
ALPHA = [150, 175, 195, 215, 235]
COLOURS = [(*(int(h[i:i + 2], 16) for i in (1, 3, 5)), a) for h, a in zip(HEX, ALPHA)]
NODATA = -9999
# The hydro-enforced DEM flattens open Lake Tanganyika at exactly 770.0 m, and SFINCS reports
# lake stage minus 770 (about 2.5 m) over those cells. That is open water, not flooding.
LAKE_DEM_M = 770.01
DEM_SRC = TWIN / "02_processed/terrain/dem_hydro_enforced_10m.tif"


def sh(*cmd: str) -> None:
    print("+", " ".join(cmd), flush=True)
    subprocess.run(cmd, check=True)


def to_cog(src: Path, dst: Path, resampling: str) -> None:
    """Reproject to EPSG:3857 and write a Cloud-Optimised GeoTIFF."""
    dst.parent.mkdir(parents=True, exist_ok=True)
    sh("gdalwarp", "-overwrite", "-t_srs", "EPSG:3857", "-r", resampling,
       "-srcnodata", str(NODATA), "-dstnodata", str(NODATA),
       "-of", "COG", "-co", "COMPRESS=DEFLATE", "-co", "PREDICTOR=3",
       "-co", "BLOCKSIZE=512", "-co", "OVERVIEWS=AUTO", "-co", "RESAMPLING=" + resampling.upper(),
       str(src), str(dst))


def depth_stats(src: Path) -> dict:
    """Wet LAND areas from the ORIGINAL UTM grid, so km2 are true ground areas (open lake excluded)."""
    with rasterio.open(src) as r:
        d = r.read(1, masked=True).filled(0).astype("float32")
        px_km2 = abs(r.transform.a * r.transform.e) / 1e6
    with rasterio.open(DEM_SRC) as r:
        d[r.read(1) <= LAKE_DEM_M] = 0.0
    return {"wet_km2_gt_0p1m": round(float((d >= 0.10).sum() * px_km2), 2),
            "wet_km2_gt_0p5m": round(float((d >= 0.50).sum() * px_km2), 2),
            "max_depth_m": round(float(d.max()), 2)}


def colourise(depth_cog: Path, dem_cog: Path, rgba_tif: Path) -> None:
    """4 depth classes -> RGBA GeoTIFF (dry and open lake = transparent)."""
    with rasterio.open(depth_cog) as r:
        d = r.read(1, masked=True).filled(0).astype("float32")
        prof = r.profile
    with rasterio.open(dem_cog) as r:  # same warp grid as the depth COG
        dem = r.read(1, masked=True)
    d[(dem <= LAKE_DEM_M).filled(False)] = 0.0
    rgba = np.zeros((4, *d.shape), dtype="uint8")
    for i, lo in enumerate(EDGES):
        hi = EDGES[i + 1] if i + 1 < len(EDGES) else np.inf
        m = (d >= lo) & (d < hi)
        for b in range(4):
            rgba[b][m] = COLOURS[i][b]
    rgba_tif.parent.mkdir(parents=True, exist_ok=True)
    prof.update(driver="GTiff", count=4, dtype="uint8", nodata=None, photometric="RGB",
                compress="deflate", tiled=True, blockxsize=512, blockysize=512)
    prof.pop("predictor", None)
    prof.pop("interleave", None)
    with rasterio.open(rgba_tif, "w", **prof) as o:
        o.write(rgba)
        o.colorinterp = [rasterio.enums.ColorInterp.red, rasterio.enums.ColorInterp.green,
                         rasterio.enums.ColorInterp.blue, rasterio.enums.ColorInterp.alpha]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    out = Path(ap.parse_args().out)

    dem_cog = out / "cog/dem_10m.tif"
    to_cog(DEM_SRC, dem_cog, "bilinear")
    with rasterio.open(dem_cog) as r:
        west, south, east, north = transform_bounds(r.crs, "EPSG:4326", *r.bounds)

    catalog = {"version": out.name, "crs": "EPSG:3857",
               "bounds_4326": [round(west, 5), round(south, 5), round(east, 5), round(north, 5)],
               "depth_classes": [{"min": lo, "max": EDGES[i + 1] if i + 1 < len(EDGES) else None, "colour": HEX[i]}
                                 for i, lo in enumerate(EDGES)],
               "stats_note": "wet areas are land cells only; open Lake Tanganyika (DEM at 770.0 m) is excluded",
               "scenarios": []}
    for sid, run_id in SCENARIOS.items():
        run = RUNS / run_id
        meta = json.loads((run / "run.json").read_text())
        f = meta["forcing"]
        src = run / "max_water_depth_10m.tif"
        cog = out / f"cog/depth_{sid}.tif"
        to_cog(src, cog, "nearest")  # nearest: never invent depths between cells
        colourise(cog, dem_cog, out / f"tmp/depth_{sid}_rgba.tif")
        catalog["scenarios"].append({
            "id": sid, "run_id": run_id, "label": meta["label"],
            "rain_mm": f["rain_mm"], "rain_T_yr": f["rain_T_yr"], "storm_hours": f["storm_hours"],
            "lake_stage_m_egm2008": f["lake_stage_m_egm2008"],
            "model": "SFINCS 20 m (uncalibrated)",
            "tiles": f"pmtiles/depth_{sid}.pmtiles", "cog": f"cog/depth_{sid}.tif",
            "stats": depth_stats(src)})
    (out / "catalog.json").write_text(json.dumps(catalog, indent=2) + "\n")
    print(json.dumps([s["stats"] for s in catalog["scenarios"]], indent=1))


if __name__ == "__main__":
    main()
