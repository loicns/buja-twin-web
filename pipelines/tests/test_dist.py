"""Checks on a built data release.  Run:  DIST=dist/v20261121 pytest -q pipelines/tests/test_dist.py"""
import io
import json
import os
import subprocess
from pathlib import Path

import numpy as np
import pytest

ROOT = Path(__file__).resolve().parents[2]


def _default_dist() -> Path:
    found = sorted((ROOT / "dist").glob("v*")) if (ROOT / "dist").exists() else []
    return found[-1] if found else ROOT / "dist/latest"


DIST = Path(os.environ.get("DIST", _default_dist()))


def catalog() -> dict:
    return json.loads((DIST / "catalog.json").read_text())


def pmtiles_files() -> list[Path]:
    return sorted((DIST / "pmtiles").glob("*.pmtiles"))


def test_catalog_files_exist():
    cat = catalog()
    assert len(cat["scenarios"]) == 3
    for s in cat["scenarios"]:
        assert (DIST / s["tiles"]).is_file(), s["tiles"]
        assert (DIST / s["cog"]).is_file(), s["cog"]


@pytest.mark.parametrize("cog", sorted((DIST / "cog").glob("*.tif")), ids=lambda p: p.name)
def test_cogs_valid(cog):
    from rio_cogeo.cogeo import cog_validate

    ok, errors, _ = cog_validate(str(cog))
    assert ok, errors


@pytest.mark.parametrize("f", pmtiles_files(), ids=lambda p: p.name)
def test_pmtiles_verify(f):
    r = subprocess.run(["pmtiles", "verify", str(f)], capture_output=True, text=True)
    assert r.returncode == 0, r.stderr


def test_all_expected_pmtiles_present():
    names = {p.stem for p in pmtiles_files()}
    assert names == {"buildings", "context", "terrain", "depth_s1", "depth_s2", "depth_s3", "hex", "zones", "canopy", "trees"}


def test_total_size_under_2gb():
    total = sum(p.stat().st_size for p in DIST.rglob("*") if p.is_file())
    assert total < 2 * 1024**3, f"{total / 1e9:.2f} GB"


def test_no_private_files():
    bad = [p for p in DIST.rglob("*") if p.name.startswith("CV_") or p.suffix in {".env", ".pem", ".pdf"}]
    assert not bad, bad


def _tiles(name: str):
    from pmtiles.reader import MmapSource, Reader, all_tiles

    with open(DIST / "pmtiles" / f"{name}.pmtiles", "rb") as f:
        get_bytes = MmapSource(f)  # a function (offset, length) -> bytes
        return list(all_tiles(get_bytes)), Reader(get_bytes).header()


def test_buildings_tiles_under_500kb():
    tiles, header = _tiles("buildings")
    assert header["min_zoom"] >= 13 and header["max_zoom"] <= 16
    biggest = max(len(data) for _, data in tiles)
    assert biggest < 500 * 1024, f"biggest buildings tile is {biggest / 1024:.0f} KB"


def test_terrain_decodes_to_real_elevation():
    """A terrarium tile must decode to Bujumbura's elevation range (lake 770 m up to ~1900 m)."""
    from PIL import Image

    tiles, header = _tiles("terrain")
    assert header["max_zoom"] == 14
    (z, x, y), data = next(t for t in tiles if t[0][0] == 12)
    rgb = np.asarray(Image.open(io.BytesIO(data)).convert("RGB")).astype("float64")
    elev = rgb[..., 0] * 256 + rgb[..., 1] + rgb[..., 2] / 256 - 32768
    assert 769.9 <= elev.min() and elev.max() <= 1900, (elev.min(), elev.max())


def test_depth_tiles_use_the_five_classes():
    from PIL import Image

    tiles, _ = _tiles("depth_s2")
    alphas = set()
    for _, data in tiles:
        a = np.asarray(Image.open(io.BytesIO(data)).convert("RGBA"))[..., 3]
        alphas |= set(np.unique(a).tolist())
    assert len(alphas & {150, 175, 195, 215, 235}) >= 4, alphas  # five navy-blue classes; a class may be absent in a mild scenario


def _first_tile(name: str, z: int) -> dict:
    import gzip

    import mapbox_vector_tile as mvt

    tiles, _ = _tiles(name)
    data = next(d for (tz, _, _), d in tiles if tz == z)
    try:
        data = gzip.decompress(data)
    except OSError:
        pass
    return mvt.decode(data)


def test_building_tiles_carry_numeric_depths():
    feat = _first_tile("buildings", 15)["buildings"]["features"][0]
    assert isinstance(feat["id"], int)  # the GeoPackage fid, usable with MapLibre feature-state
    props = feat["properties"]
    for k in ("h", "a", "d_s1", "d_s2", "d_s3"):
        assert isinstance(props[k], (int, float)), (k, props)
    assert "people" not in props  # people are published per hex and neighbourhood only


def test_hex_and_zone_tiles_have_people_and_rank():
    hx = _first_tile("hex", 12)["hex"]["features"][0]["properties"]
    assert {"buildings", "people", "p_s2", "priority", "rank_s2"} <= set(hx)
    assert "buildings_ge_0p5m_s2" in _first_tile("zones", 12)["zones"]["features"][0]["properties"]


def test_exposure_outputs_are_complete_and_consistent():
    import pandas as pd

    ex = DIST / "exposure"
    b = pd.read_parquet(ex / "exposure_buildings.parquet")
    assert len(b) == 254_532 and b["bid"].is_unique
    for s in ("s1", "s2", "s3"):
        assert b[f"d_{s}"].notna().all() and (b[f"d_{s}"] >= 0).all()
        assert ((b[f"c_{s}"] >= 2) == (b[f"d_{s}"] >= 0.5)).all()
    summary = json.loads((ex / "exposure_summary.json").read_text())
    assert summary["people_method"]["share_in_pixels_without_buildings"] < 0.05  # people lost to empty pixels
    assert abs(b["people"].sum() - summary["people_total"]) < 2
    top = pd.read_csv(ex / "top20_hexes.csv")
    assert len(top) == 20 and top["rank_s2"].is_monotonic_increasing and top["p_s2"].iloc[0] > 0


def test_catalog_describes_depth_and_vegetation_classes():
    cat = catalog()
    assert [c["min"] for c in cat["depth_classes"]] == [0.1, 0.5, 1.5, 3.0, 5.0]
    assert cat["vegetation"]["trees"] > 250_000 and len(cat["vegetation"]["canopy_classes"]) == 4


def test_tree_tiles_are_light_and_numeric():
    tiles, header = _tiles("trees")
    assert header["min_zoom"] >= 15
    assert max(len(d) for _, d in tiles) < 500 * 1024
    props = _first_tile("trees", 15)["trees"]["features"][0]["properties"]
    assert isinstance(props["h"], (int, float)) and isinstance(props["d"], (int, float))


def test_canopy_tiles_have_four_green_classes():
    from PIL import Image

    tiles, _ = _tiles("canopy")
    alphas = set()
    for _, data in tiles:
        alphas |= set(np.unique(np.asarray(Image.open(io.BytesIO(data)).convert("RGBA"))[..., 3]).tolist())
    assert len(alphas & {170, 190, 210, 230}) >= 3, alphas


def test_zones_have_unique_ids_bounds_and_canopy():
    """Neighbourhoods are keyed by id (two OSM places share a name), carry a fly-to box and a canopy share."""
    import pandas as pd

    z = pd.read_csv(DIST / "exposure" / "exposure_zones.csv")
    assert z["id"].is_unique and z["name"].is_unique
    w, s, e, n = catalog()["bounds_4326"]
    assert ((z["minx"] < z["maxx"]) & (z["miny"] < z["maxy"])).all()
    assert z["minx"].min() >= w - 0.1 and z["maxx"].max() <= e + 0.1 and z["miny"].min() >= s - 0.1 and z["maxy"].max() <= n + 0.1
    assert ((z["lon"] >= z["minx"]) & (z["lon"] <= z["maxx"]) & (z["lat"] >= z["miny"]) & (z["lat"] <= z["maxy"])).all()
    assert z["canopy_pct"].between(0, 100).all() and (z["trees_ha"] >= 0).all()
    if "roughness_test_pct" in z:  # overlap with the synthetic roughness block (see LIMITATIONS.md)
        assert z["roughness_test_pct"].between(0, 100).all()
    # each building sits in at most one neighbourhood, so the zone totals cannot exceed the city total
    assert z["buildings"].sum() <= json.loads((DIST / "exposure" / "exposure_summary.json").read_text())["buildings_total"]
    props = _first_tile("zones", 12)["zones"]["features"][0]["properties"]
    assert {"id", "name", "canopy_pct"} <= set(props)
