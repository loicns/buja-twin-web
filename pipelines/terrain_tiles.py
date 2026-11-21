"""DEM (EPSG:3857 GeoTIFF) -> Terrarium-encoded PNG tiles in an MBTiles file.

Terrarium: elevation_m = (R * 256 + G + B / 256) - 32768. MapLibre reads it with
`raster-dem` + `encoding: "terrarium"`. This replaces rio-rgbify, which fails on
current rasterio/GDAL ("densify_pts must be at least 2").

Run:  python pipelines/terrain_tiles.py dem.tif out.mbtiles --min-z 8 --max-z 14
"""
import argparse
import io
import sqlite3

import mercantile
import numpy as np
import rasterio
from PIL import Image
from rasterio.enums import Resampling
from rasterio.transform import from_bounds
from rasterio.warp import reproject, transform_bounds

TILE = 256


def terrarium(elev: np.ndarray) -> np.ndarray:
    v = np.clip(elev.astype("float64") + 32768.0, 0, 65535.99)
    r = np.floor(v / 256.0)
    g = np.floor(v - r * 256.0)
    b = np.floor((v - np.floor(v)) * 256.0)
    return np.dstack([r, g, b]).astype("uint8")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("dem")
    ap.add_argument("out")
    ap.add_argument("--min-z", type=int, default=8)
    ap.add_argument("--max-z", type=int, default=14)
    a = ap.parse_args()

    with rasterio.open(a.dem) as src:
        data = src.read(1).astype("float32")
        src_tf, src_crs, nodata = src.transform, src.crs, src.nodata
        w, s, e, n = transform_bounds(src.crs, "EPSG:4326", *src.bounds)
    floor_m = float(np.nanmin(np.where(data == nodata, np.nan, data)))  # fill outside the DEM with its lowest value

    db = sqlite3.connect(a.out)
    db.executescript("""
        DROP TABLE IF EXISTS tiles; DROP TABLE IF EXISTS metadata;
        CREATE TABLE metadata (name TEXT, value TEXT);
        CREATE TABLE tiles (zoom_level INTEGER, tile_column INTEGER, tile_row INTEGER, tile_data BLOB);
        CREATE UNIQUE INDEX tile_index ON tiles (zoom_level, tile_column, tile_row);""")
    meta = {"name": "terrain", "format": "png", "type": "baselayer", "version": "1",
            "minzoom": a.min_z, "maxzoom": a.max_z, "bounds": f"{w},{s},{e},{n}",
            "description": "Terrarium-encoded elevation (m)"}
    db.executemany("INSERT INTO metadata VALUES (?, ?)", [(k, str(v)) for k, v in meta.items()])

    count = 0
    for z in range(a.min_z, a.max_z + 1):
        for t in mercantile.tiles(w, s, e, n, z):
            b = mercantile.xy_bounds(t)
            dst = np.full((TILE, TILE), nodata, dtype="float32")
            reproject(data, dst, src_transform=src_tf, src_crs=src_crs, src_nodata=nodata,
                      dst_transform=from_bounds(b.left, b.bottom, b.right, b.top, TILE, TILE),
                      dst_crs="EPSG:3857", dst_nodata=nodata, resampling=Resampling.bilinear)
            valid = dst != nodata
            if not valid.any():
                continue
            dst[~valid] = floor_m
            buf = io.BytesIO()
            Image.fromarray(terrarium(dst), "RGB").save(buf, format="PNG", optimize=True)
            db.execute("INSERT INTO tiles VALUES (?, ?, ?, ?)",
                       (z, t.x, (1 << z) - 1 - t.y, buf.getvalue()))  # MBTiles rows are TMS (y flipped)
            count += 1
    db.commit()
    db.close()
    print(f"wrote {count} tiles, z{a.min_z}-{a.max_z}")


if __name__ == "__main__":
    main()
