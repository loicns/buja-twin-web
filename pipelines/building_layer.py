"""Write the buildings GeoJSON lines for tippecanoe: footprint + the few attributes the app needs.

Includes the flood depths d_s1..d_s3 when exposure/exposure_buildings.parquet exists.
People per building are NOT published: people are shown per H3 hex and neighbourhood only.

Run:  python pipelines/building_layer.py --dist dist/v20261122 --out dist/v20261122/tmp/buildings.geojsonl
"""
import argparse
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd

from common import EXPORTS, SCENARIOS


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dist", required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()

    g = gpd.read_file(EXPORTS / "buildings_3d.gpkg", columns=["height_m", "area_m2"], fid_as_index=True)
    out = gpd.GeoDataFrame({"id": g.index.to_numpy(),
                            "h": (np.round(g["height_m"].fillna(3) * 2) / 2).to_numpy(),   # 0.5 m steps
                            "a": np.round(g["area_m2"]).astype("int32").to_numpy()},
                           geometry=g.geometry.to_numpy(), crs=g.crs)
    exp = Path(a.dist) / "exposure/exposure_buildings.parquet"
    if exp.exists():
        e = pd.read_parquet(exp, columns=["bid", *[f"d_{s}" for s in SCENARIOS]]).set_index("bid")
        assert len(e) == len(out) and e.index.is_unique
        for s in SCENARIOS:
            out[f"d_{s}"] = e.loc[out["id"], f"d_{s}"].to_numpy().round(2)
    # GeoJSON lines, not FlatGeobuf: tippecanoe reads FlatGeobuf integers as strings and renumbers features
    out.to_crs(4326).to_file(a.out, driver="GeoJSONSeq")
    print("wrote", len(out), "buildings", list(out.columns))


if __name__ == "__main__":
    main()
