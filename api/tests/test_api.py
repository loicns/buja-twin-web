import time
from pathlib import Path

import numpy as np
from fastapi.testclient import TestClient

import main

client = TestClient(main.app)
REF = Path(main.MODEL) / "reference_cnfix_rain100_lake2024.npy"


def test_health():
    assert client.get("/health").json()["ok"]


def test_parity_with_lab_unet():
    ref = np.load(REF)  # the lab's own stored Emulated_unet_cnfix_rain100_lake2024.tif
    got = main.run_model(100.4, 772.5)  # exact forcing, bypassing the 5 mm cache grid
    assert np.abs(got - ref).max() < 1e-3


def test_corners_are_four_real_corners_not_a_box():
    c = client.get("/predict", params={"rain_mm": 100, "lake_m": 772.5}).json()["corners_4326"]
    assert len(c) == 4
    # a rotated grid: top edge is not exactly level in latitude
    assert c[0][1] != c[1][1]


def test_warns_outside_training_range():
    r = client.get("/predict", params={"rain_mm": 250, "lake_m": 772.5}).json()
    assert any("extrapolation" in w for w in r["warnings"])


def test_png_is_rgba_1000_square():
    r = client.get("/predict.png", params={"rain_mm": 100, "lake_m": 772.5})
    assert r.status_code == 200 and r.headers["content-type"] == "image/png"
    from io import BytesIO

    from PIL import Image
    im = Image.open(BytesIO(r.content))
    assert im.size == (1000, 1000) and im.mode == "RGBA"


def test_warm_latency_under_3s():
    client.get("/predict", params={"rain_mm": 120, "lake_m": 772.0})  # warm the session
    t = time.perf_counter()
    client.get("/predict.png", params={"rain_mm": 125, "lake_m": 772.05})  # a different cache key
    assert time.perf_counter() - t < 3.0
