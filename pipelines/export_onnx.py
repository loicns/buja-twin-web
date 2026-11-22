"""Export the lab's ResNet-UNet surrogate to ONNX and check it against PyTorch.

Run with the lab's Python (it has torch):
  PYTHONPATH=<dir with onnx + onnxruntime> scripts/labpy pipelines/export_onnx.py --out api/model
The model files are NOT committed (api/model/ is ignored); the API image bakes them in at build time.
"""
import argparse
import json
import shutil
import sys
from pathlib import Path

import numpy as np
import torch

from common import LAB

SUR = LAB / "04_models/surrogate"
sys.path.insert(0, str(LAB / "scripts/surrogate"))
from train_surrogate import active_mask, build_unet, load_features, unet_inputs  # noqa: E402

def _read(path: Path) -> np.ndarray:
    import rasterio
    with rasterio.open(path) as r:
        return r.read(1).astype("float32")


PAD = 1024  # three poolings: pad the 1000 x 1000 grid to 1024, exactly as predict_unet() does


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    out = Path(ap.parse_args().out)
    out.mkdir(parents=True, exist_ok=True)

    norm = json.loads((SUR / "norm.json").read_text())["norm"]
    F, _ = load_features()
    x = unet_inputs(F, {"rain_mm": 100.4, "lake": 772.5}, norm)  # = cnfix_rain100_lake2024 forcing, (12, 1000, 1000)
    xp = np.zeros((x.shape[0], PAD, PAD), dtype="float32")
    xp[:, :1000, :1000] = x

    net = build_unet(x.shape[0])
    net.load_state_dict(torch.load(SUR / "unet.pt", map_location="cpu"))
    net.eval()  # BatchNorm in inference mode
    t = torch.from_numpy(xp[None])
    with torch.no_grad():
        ref = net(t)[0, :1000, :1000].numpy()

    onnx_path = out / "unet.onnx"
    torch.onnx.export(net, t, str(onnx_path), input_names=["x"], output_names=["depth"],
                      opset_version=17, dynamo=False)

    import onnxruntime as ort
    sess = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
    got = sess.run(["depth"], {"x": xp[None]})[0][0, :1000, :1000]
    diff = float(np.abs(got - ref).max())
    print(f"max |onnx - torch| = {diff:.2e} m")
    assert diff < 1e-3, "ONNX parity failed"

    # The lab only keeps cells that are active in SFINCS (msk > 0) and on land. Save that mask so the API matches.
    active = active_mask()
    land = F["land"] == 1
    stored = _read(SUR / "predictions/Emulated_unet_cnfix_rain100_lake2024.tif")  # what the lab published
    masked = np.where(land & active, ref, 0.0)
    mdiff = float(np.abs(masked - stored).max())
    print(f"max |masked onnx - stored lab prediction| = {mdiff:.2e} m")
    assert mdiff < 1e-3, "masked output does not reproduce the lab's stored prediction"

    shutil.copy(SUR / "features_20m.tif", out / "features_20m.tif")
    shutil.copy(SUR / "norm.json", out / "norm.json")
    np.save(out / "active_20m.npy", active.astype("uint8"))
    np.save(out / "reference_cnfix_rain100_lake2024.npy", stored.astype("float32"))
    print("wrote", sorted(p.name for p in out.iterdir()), f"| unet.onnx {onnx_path.stat().st_size / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
