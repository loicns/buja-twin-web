"""Vegetation layers: canopy height raster (classed) and detected trees (points).

Sources (both CC BY 4.0, Meta & WRI High Resolution Canopy Height, co-registered 6 m north / 4 m east of the raw tile):
  vegetation/processed/meta_chm_1m_domain.tif   1 m canopy height
  vegetation/processed/trees_detected.csv       296,933 detected trees, provenance "measured_chm"

Run:  python pipelines/vegetation.py --dist dist/v20261126
Writes <dist>/tmp/canopy_rgba.tif and <dist>/tmp/trees.geojsonl (make_tiles.sh turns them into PMTiles).
Legacy random-point vegetation is never used.
"""
import argparse
import json
import subprocess
from pathlib import Path

import numpy as np
import pandas as pd
import rasterio
from pyproj import Transformer

from common import TWIN

VEG = TWIN / "vegetation/processed"
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


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dist", required=True)
    tmp = Path(ap.parse_args().dist) / "tmp"
    tmp.mkdir(parents=True, exist_ok=True)
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
