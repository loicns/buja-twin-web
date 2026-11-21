# Bujumbura Flood Twin (web)

An open flood digital twin for Bujumbura, Burundi: a 10 m terrain model, about 250,000 buildings with heights, a SFINCS hydrodynamic model coupling Lake Tanganyika levels with river and rainfall flooding, and a machine-learning surrogate (U-Net) that approximates SFINCS flood maps in under a second.

This repository holds the public web map, the live-preview API and the data and DevOps pipelines. Large data lives in object storage, not in git.

**Three headline scenarios**
- S1: frequent event (`rain10_lake2024`, 64.6 mm / 6 h, lake 772.50 m)
- S2: severe event (`rain100_lake2024`, 100.4 mm / 6 h, lake 772.50 m)
- S3: Copernicus benchmark (`cnfix_bench_cop_s4`, 162.5 mm / 8 h, lake 772.95 m)

> **Not an official warning.** This is a non-commercial research demo. The model is uncalibrated and tends to over-predict flooded area. Do not use it for evacuation or emergency decisions.

See [`docs/`](docs/) for data licences, methods and limitations.
