"""Live flood preview from the ONNX surrogate. Stateless, scale-to-zero (AWS Lambda behind a Function URL)."""
import io
import json
import os
from functools import lru_cache
from pathlib import Path

import numpy as np
import onnxruntime as ort
import rasterio
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from PIL import Image
from rasterio.warp import transform

MODEL = Path(os.environ.get("MODEL_DIR", "/app/model"))
ORIGINS = os.environ.get("ALLOWED_ORIGINS", "http://localhost:5173").split(",")
RAIN_RANGE, LAKE_RANGE = (33.0, 166.0), (769.9, 773.0)  # span of the training runs
EDGES = [0.10, 0.50, 1.50, 3.00]
COLOURS = np.array([[0, 0, 0, 0], [198, 219, 239, 160], [107, 174, 214, 190],
                    [33, 113, 181, 215], [8, 48, 107, 235]], dtype="uint8")
PAD = 1024
H = W = 1000

meta = json.loads((MODEL / "norm.json").read_text())
NORM, STATIC = meta["norm"], meta["static"]
with rasterio.open(MODEL / "features_20m.tif") as r:
    F = {n: r.read(i + 1).astype("float32") for i, n in enumerate(r.descriptions)}
    TRANSFORM = r.transform
    CRS = r.crs
CELL_KM2 = abs(TRANSFORM.a * TRANSFORM.e) / 1e6
# Cells the surrogate is allowed to report: land AND active in the SFINCS grid (as in the lab's own predictions).
ACTIVE = np.load(MODEL / "active_20m.npy").astype(bool)
LAND = (F["land"] == 1) & ACTIVE
STATIC_STACK = np.stack([(F[n] - NORM[n][0]) / NORM[n][1] for n in STATIC]).astype("float32")
SESSION = ort.InferenceSession(str(MODEL / "unet.onnx"), providers=["CPUExecutionProvider"])

# The grid is UTM 35S, rotated about 0.14 deg from north at Bujumbura: send the 4 real corners (TL, TR, BR, BL),
# not a bounding box, or the overlay is off by up to ~50 m at the edges.
_xs, _ys = zip(*[(TRANSFORM.a * c + TRANSFORM.b * r + TRANSFORM.c, TRANSFORM.d * c + TRANSFORM.e * r + TRANSFORM.f)
                 for c, r in [(0, 0), (W, 0), (W, H), (0, H)]])
_lons, _lats = transform(CRS, "EPSG:4326", list(_xs), list(_ys))
CORNERS_4326 = [[round(x, 6), round(y, 6)] for x, y in zip(_lons, _lats)]

app = FastAPI(title="Bujumbura flood surrogate", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=ORIGINS, allow_methods=["GET"], allow_headers=["*"])


def inputs(rain_mm: float, lake_m: float) -> np.ndarray:
    """Same as train_surrogate.unet_inputs(), with the static part precomputed."""
    shape = F["elev_m"].shape
    lme = ((lake_m - F["elev_m"]) - NORM["lake_minus_elev_m"][0]) / NORM["lake_minus_elev_m"][1]
    dyn = np.stack([lme, np.full(shape, (rain_mm - 100.0) / 50.0), np.full(shape, (lake_m - 771.5) / 1.0)])
    x = np.nan_to_num(np.concatenate([STATIC_STACK, dyn.astype("float32")]))
    xp = np.zeros((x.shape[0], PAD, PAD), dtype="float32")
    xp[:, :H, :W] = x
    return xp[None]


def run_model(rain_mm: float, lake_m: float) -> np.ndarray:
    d = SESSION.run(["depth"], {"x": inputs(rain_mm, lake_m)})[0][0, :H, :W]
    return np.where(LAND, d, 0.0).astype("float32")


@lru_cache(maxsize=128)
def predict(rain_key: int, lake_key: int) -> np.ndarray:
    return run_model(rain_key * 5.0, lake_key * 0.05)


def check(rain_mm: float, lake_m: float):
    warn = []
    if not RAIN_RANGE[0] <= rain_mm <= RAIN_RANGE[1]:
        warn.append(f"rain {rain_mm} mm is outside the training range {RAIN_RANGE}: extrapolation")
    if not LAKE_RANGE[0] <= lake_m <= LAKE_RANGE[1]:
        warn.append(f"lake {lake_m} m is outside the training range {LAKE_RANGE}: extrapolation")
    return round(rain_mm / 5.0), round(lake_m / 0.05), warn


@app.get("/health")
def health():
    return {"ok": True, "model": "resnet-unet onnx", "cache": predict.cache_info()._asdict()}


@app.get("/predict")
def predict_json(rain_mm: float = Query(..., ge=0, le=300), lake_m: float = Query(..., ge=768, le=776)):
    rk, lk, warn = check(rain_mm, lake_m)
    d = predict(rk, lk)
    return {"rain_mm": rk * 5.0, "lake_m": round(lk * 0.05, 2), "model": "surrogate (not SFINCS)",
            "wet_km2_gt_0p15m": round(float((d >= 0.15).sum() * CELL_KM2), 2),
            "wet_km2_gt_0p5m": round(float((d >= 0.50).sum() * CELL_KM2), 2),
            "max_depth_m": round(float(d.max()), 2),
            "corners_4326": CORNERS_4326, "warnings": warn,
            "skill_note": "CSI 0.75-0.79 on unseen storms, 0.49-0.63 on an unseen catchment"}


@app.get("/predict.png")
def predict_png(rain_mm: float = Query(..., ge=0, le=300), lake_m: float = Query(..., ge=768, le=776)):
    rk, lk, _ = check(rain_mm, lake_m)
    img = Image.fromarray(COLOURS[np.digitize(predict(rk, lk), EDGES)], mode="RGBA")
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    if buf.tell() > 3_000_000:  # Lambda Function URLs allow 6 MB responses; stay well below
        raise HTTPException(500, "png too large")
    return Response(buf.getvalue(), media_type="image/png", headers={"Cache-Control": "public, max-age=86400"})
