"""Shared paths for the pipelines.

The two research folders are siblings of this repo. Override with
BUJA_TWIN_DIR / BUJA_LAB_DIR if they live somewhere else. No absolute paths
are hard-coded, because this repo is public.
"""
import os
from pathlib import Path

HERE = Path(__file__).resolve().parents[2]  # folder that holds the sibling projects
TWIN = Path(os.environ.get("BUJA_TWIN_DIR", HERE / "buja_geo_twin"))
LAB = Path(os.environ.get("BUJA_LAB_DIR", HERE / "buja_flood_forecast"))
EXPORTS = TWIN / "exports/blender_flood_twin"
RUNS = LAB / "04_models/sfincs/runs"

# The three headline scenarios: id -> SFINCS run folder
SCENARIOS = {"s1": "rain10_lake2024", "s2": "rain100_lake2024", "s3": "cnfix_bench_cop_s4"}
