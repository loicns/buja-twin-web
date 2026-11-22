"""Collect the lab's existing validation scores into one JSON the app and LIMITATIONS.md quote.

Run:  python pipelines/collect_validation.py --dist dist/v20261122
"""
import argparse
import json
from pathlib import Path

from common import LAB

V = LAB / "06_validation_and_reports"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dist", required=True)
    out = Path(ap.parse_args().dist) / "validation.json"
    s4 = json.loads((V / "sfincs_benchmark_scores.json").read_text())["runs"]["bench_cop_s4"]["wet_hull"]
    gfm = json.loads((V / "sfincs_cnfix_rain100_lake2024_scores.json").read_text())
    doc = {
        "sfincs_vs_copernicus_s4": {"csi": s4["csi"], "hit_rate": s4["hit_rate"], "far": s4["far"],
                                    "model_km2": s4["model_km2"], "copernicus_km2": s4["reference_km2"],
                                    "note": "wet-hull score, threshold 0.15 m; floods about 40% more area than Copernicus"},
        "sfincs_rain100_vs_gfm_2024": {"observed_km2": gfm["observed_wet_km2_in_domain"],
                                       "model_km2": gfm["model_wet_km2_in_domain"],
                                       "hit_rate": gfm["strict"]["hit_rate"],
                                       "note": "Sentinel-1 saw almost no flooding in 2024, so this cannot test storm floods; do not quote its CSI"},
        "surrogate": {"csi_unseen_storms": [0.75, 0.79], "csi_unseen_catchment": [0.49, 0.63],
                      "source": "04_models/surrogate/eval_console.txt, 06_validation_and_reports/phase7_surrogate_report.md"},
        "calibration": "none: SFINCS is uncalibrated and over-floods (phase5_overflood_diagnosis.md)",
    }
    out.write_text(json.dumps(doc, indent=2) + "\n")
    print(json.dumps(doc["sfincs_vs_copernicus_s4"]))


if __name__ == "__main__":
    main()
