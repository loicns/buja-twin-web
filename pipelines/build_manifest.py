"""List every source file the web app may publish, with hash and licence.

Run:  python pipelines/build_manifest.py > data_manifest.csv

Paths are written relative to the two research folders (twin:/lab:) so the
public CSV does not expose local home-directory names.
"""
import csv
import hashlib
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parents[2]  # folder that holds the sibling projects
TWIN = Path(os.environ.get("BUJA_TWIN_DIR", HERE / "buja_geo_twin"))
LAB = Path(os.environ.get("BUJA_LAB_DIR", HERE / "buja_flood_forecast"))
EXP = TWIN / "exports/blender_flood_twin"
RUNS = LAB / "04_models/sfincs/runs"

# (layer id, path, licence, publish?)
SOURCES = [
    ("dem_10m",   TWIN / "02_processed/terrain/dem_hydro_enforced_10m.tif", "FABDEM CC BY-NC-SA 4.0", "y"),
    ("buildings", EXP / "buildings_3d.gpkg", "Google Open Buildings CC BY 4.0 + OSM ODbL", "y"),
    ("roads",     EXP / "roads_transportation.gpkg", "OSM ODbL", "y"),
    ("rivers",    EXP / "rivers_streams.gpkg", "HydroRIVERS + derived", "y"),
    ("bridges",   EXP / "critical_bridges.gpkg", "OSM ODbL", "y"),
    ("admin",     EXP / "administrative_boundaries.gpkg", "OSM ODbL", "y"),
    ("chm_1m",    TWIN / "vegetation/processed/meta_chm_1m_domain.tif", "Meta/WRI CC BY 4.0", "n"),
    ("s1", RUNS / "rain10_lake2024/max_water_depth_10m.tif", "own CC BY 4.0", "y"),
    ("s2", RUNS / "rain100_lake2024/max_water_depth_10m.tif", "own CC BY 4.0", "y"),
    ("s3", RUNS / "cnfix_bench_cop_s4/max_water_depth_10m.tif", "own CC BY 4.0", "y"),
]
BLOCKLIST = ("CV_", ".env", "credentials")


def sha256(p: Path, chunk: int = 1 << 20) -> str:
    h = hashlib.sha256()
    with p.open("rb") as f:
        while b := f.read(chunk):
            h.update(b)
    return h.hexdigest()


def rel(p: Path) -> str:
    for tag, root in (("twin", TWIN), ("lab", LAB)):
        if p.is_relative_to(root):
            return f"{tag}:{p.relative_to(root)}"
    return p.name


def main() -> int:
    w = csv.writer(sys.stdout, lineterminator="\n")
    w.writerow(["layer", "path", "bytes", "sha256", "licence", "publish"])
    missing = 0
    for layer, path, lic, pub in SOURCES:
        if any(b in path.name for b in BLOCKLIST):
            raise SystemExit(f"refusing to manifest {path}")
        if not path.exists():
            print(f"MISSING {path}", file=sys.stderr)
            missing += 1
            continue
        w.writerow([layer, rel(path), path.stat().st_size, sha256(path), lic, pub])
    return 1 if missing else 0


if __name__ == "__main__":
    sys.exit(main())
