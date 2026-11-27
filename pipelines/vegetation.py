"""Vegetation layers: canopy height raster (classed) and detected trees (points).

Sources (both CC BY 4.0, Meta & WRI High Resolution Canopy Height, co-registered 6 m north / 4 m east of the raw tile):
  vegetation/processed/meta_chm_1m_domain.tif   1 m canopy height
  vegetation/processed/trees_detected.csv       296,933 detected trees, provenance "measured_chm"

Run:  python pipelines/vegetation.py --dist dist/v20261126      (after rollups.py)
Writes <dist>/tmp/canopy_rgba.tif and <dist>/tmp/trees.geojsonl (make_tiles.sh turns them into PMTiles), and adds
canopy_pct and trees_ha to each neighbourhood in exposure/exposure_zones.csv and exposure/zones.geojson.
Legacy random-point vegetation is never used. The flood model does not use this canopy (see LIMITATIONS.md).
"""
import argparse
import json
import subprocess
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
import rasterio
from pyproj import Transformer
from rasterio.features import rasterize

from common import LAB, TWIN

VEG = TWIN / "vegetation/processed"
# The roughness grid SFINCS read for every published run holds a 4 x 4 km synthetic "forest" test block
# (compute_canopy_roughness.py, synthetic mode). Until the runs are redone, each zone carries its overlap with it.
ROUGHNESS_TEST = LAB / "02_processed/vegetation/canopy_cover_fraction_10m.tif"
EDGES = [2.0, 5.0, 10.0, 20.0]  # metres of canopy height: shrub and young trees, then three tree classes
HEX = ["#d5dfc9", "#a9c09a", "#6f9a68", "#3e6b4b"]
ALPHA = [170, 190, 210, 230]


def canopy(tmp: Path) -> dict:
    """1 m CHM -> 5 m maximum in Web Mercator -> classed RGBA GeoTIFF."""
    coarse = tmp / "canopy_5m.tif"
    subprocess.run(["gdalwarp", "-overwrite", "-q", "-t_srs", "EPSG:3857", "-tr", "5", "5", "-r", "max",
                    "-ot", "Float32", str(VEG / "meta_chm_1m_domain.tif"), str(coarse)], check=True)
    with rasterio.open(coarse) as r:
        h = r.read(1).astype("float32")
        prof = r.profile
    rgba = np.zeros((4, *h.shape), dtype="uint8")
    for i, lo in enumerate(EDGES):
        hi = EDGES[i + 1] if i + 1 < len(EDGES) else np.inf
        m = (h >= lo) & (h < hi)
        for b, off in enumerate((1, 3, 5)):
            rgba[b][m] = int(HEX[i][off:off + 2], 16)
        rgba[3][m] = ALPHA[i]
    prof.update(driver="GTiff", count=4, dtype="uint8", nodata=None, photometric="RGB", compress="deflate",
                tiled=True, blockxsize=512, blockysize=512)
    prof.pop("predictor", None)
    with rasterio.open(tmp / "canopy_rgba.tif", "w", **prof) as o:
        o.write(rgba)
        o.colorinterp = [rasterio.enums.ColorInterp.red, rasterio.enums.ColorInterp.green,
                         rasterio.enums.ColorInterp.blue, rasterio.enums.ColorInterp.alpha]
    px_km2 = abs(prof["transform"].a * prof["transform"].e) / 1e6
    return {"canopy_km2_ge_2m": round(float((h >= 2).sum() * px_km2), 1),
            "canopy_km2_ge_10m": round(float((h >= 10).sum() * px_km2), 1)}


def trees(tmp: Path) -> int:
    t = pd.read_csv(VEG / "trees_detected.csv", usecols=["x_utm35s", "y_utm35s", "height_m", "crown_diam_m", "provenance"])
    assert (t["provenance"] == "measured_chm").all(), "only CHM-detected trees may be published"
    lon, lat = Transformer.from_crs(32735, 4326, always_xy=True).transform(t["x_utm35s"].to_numpy(), t["y_utm35s"].to_numpy())
    with (tmp / "trees.geojsonl").open("w") as f:
        for x, y, h, d in zip(np.round(lon, 6), np.round(lat, 6), t["height_m"].round(0).astype(int), t["crown_diam_m"].round(0).astype(int)):
            f.write(json.dumps({"type": "Feature", "properties": {"h": int(h), "d": int(d)},
                                "geometry": {"type": "Point", "coordinates": [float(x), float(y)]}}, separators=(",", ":")) + "\n")
    return len(t)


def zone_vegetation(exposure: Path) -> None:
    """Per neighbourhood: share of ground under canopy >= 2 m, and detected trees per hectare (descriptive only)."""
    geo, csv = exposure / "zones.geojson", exposure / "exposure_zones.csv"
    zones = gpd.read_file(geo).to_crs(32735)
    with rasterio.open(VEG / "meta_chm_1m_domain.tif") as src:
        step = 5  # an unbiased 1-in-25 sample of the 1 m cells (nearest, not max), enough for a share per zone
        h = src.read(1, out_shape=(src.height // step, src.width // step))
        tr = src.transform * src.transform.scale(step, step)
    lab = rasterize([(g, int(i)) for i, g in zip(zones["id"], zones.geometry)], out_shape=h.shape, transform=tr, fill=0)
    ids = zones["id"].to_numpy()
    tot = np.bincount(lab.ravel(), minlength=ids.max() + 1)
    can = np.bincount(lab.ravel(), weights=(h >= 2).ravel(), minlength=ids.max() + 1)
    t = pd.read_csv(VEG / "trees_detected.csv", usecols=["x_utm35s", "y_utm35s", "provenance"])
    assert (t["provenance"] == "measured_chm").all(), "only CHM-detected trees may be used"
    pts = gpd.GeoDataFrame(geometry=gpd.points_from_xy(t["x_utm35s"], t["y_utm35s"]), crs=32735)
    n = gpd.sjoin(pts, zones[["id", "geometry"]], predicate="within").groupby("id").size()
    stats = pd.DataFrame({"id": ids,
                          "canopy_pct": np.round(100 * can[ids] / np.maximum(tot[ids], 1), 1),
                          "trees_ha": np.round(n.reindex(ids, fill_value=0).to_numpy() / (zones.geometry.area.to_numpy() / 1e4), 1)})
    if ROUGHNESS_TEST.exists():
        with rasterio.open(ROUGHNESS_TEST) as r:
            block = r.read(1) == 1
            zl = rasterize([(g, int(i)) for i, g in zip(zones.to_crs(r.crs)["id"], zones.to_crs(r.crs).geometry)],
                           out_shape=block.shape, transform=r.transform, fill=0)
        inside = np.bincount(zl.ravel(), weights=block.ravel(), minlength=ids.max() + 1)
        cells = np.bincount(zl.ravel(), minlength=ids.max() + 1)
        stats["roughness_test_pct"] = np.round(100 * inside[ids] / np.maximum(cells[ids], 1), 0)
    cols = ["canopy_pct", "trees_ha", "roughness_test_pct"]
    table = pd.read_csv(csv).drop(columns=cols, errors="ignore").merge(stats, on="id", how="left")
    table.to_csv(csv, index=False)
    g = gpd.read_file(geo).drop(columns=cols, errors="ignore").merge(stats, on="id", how="left")
    g.to_file(geo, driver="GeoJSON")
    print(json.dumps({"zone_canopy_pct_median": float(stats["canopy_pct"].median()),
                      "zone_trees_ha_median": float(stats["trees_ha"].median())}))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dist", required=True)
    dist = Path(ap.parse_args().dist)
    tmp = dist / "tmp"
    tmp.mkdir(parents=True, exist_ok=True)
    if (dist / "exposure/zones.geojson").exists():
        zone_vegetation(dist / "exposure")
    info = canopy(tmp)
    info["trees"] = trees(tmp)
    cat_path = tmp.parent / "catalog.json"
    cat = json.loads(cat_path.read_text())
    cat["vegetation"] = {**info, "canopy_classes": [{"min": lo, "max": EDGES[i + 1] if i + 1 < len(EDGES) else None, "colour": HEX[i]}
                                                    for i, lo in enumerate(EDGES)],
                         "source": "Meta & WRI High Resolution Canopy Height (CC BY 4.0), CHM-detected trees"}
    cat_path.write_text(json.dumps(cat, indent=2) + "\n")
    print(json.dumps(cat["vegetation"]))


if __name__ == "__main__":
    main()
