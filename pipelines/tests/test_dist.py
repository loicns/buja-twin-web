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
    assert names == {"buildings", "context", "terrain", "depth_s1", "depth_s2", "depth_s3"}


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


def test_depth_tiles_use_the_four_classes():
    from PIL import Image

    tiles, _ = _tiles("depth_s2")
    alphas = set()
    for _, data in tiles:
        a = np.asarray(Image.open(io.BytesIO(data)).convert("RGBA"))[..., 3]
        alphas |= set(np.unique(a).tolist())
    assert {160, 190, 215, 235} <= alphas, alphas
