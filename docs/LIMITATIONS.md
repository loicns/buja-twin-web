# Limitations

Read this before quoting any number from the map.

- **Not an early-warning service.** Use IGEBU and Burundi civil protection for official warnings.
- **Modelled and uncalibrated.** SFINCS has not been tuned to any observed storm flood. It over-floods: about 57 km2 for
  a 10-year storm, with river inflows the main cause (`phase5_overflood_diagnosis.md` in the lab).
- **Against Copernicus EMSN191 scenario 4** (same forcing as S3): CSI 0.57, hit rate 0.88, false-alarm ratio 0.38.
  It finds almost everything Copernicus floods and floods about 40 % more area (76 km2 against 54 km2).
- **Against Sentinel-1 (GFM) 2024:** Sentinel-1 saw only 0.04 km2 of flooding in the domain, against 32.8 km2 modelled.
  The 2024 record is mostly lake-shore flooding, so it cannot test storm floods. Its CSI (0.001) is not a skill score.
- **The live-preview surrogate (U-Net)** reproduces SFINCS with CSI 0.75 to 0.79 on unseen storms and 0.49 to 0.63 on an
  unseen catchment (Ntahangwa). It is a preview of the model, not a separate source of truth.
- **Lake stage is 772.50 m EGM2008**, the 2024 peak. A press figure of about 777 m is a local gauge reading. The two
  must not be mixed.
- **Open lake is excluded** from wet areas and tiles (see METHODS.md).
- **People are approximate.** WorldPop 2020 shared by floor area; it can misplace people in informal areas. Round
  published counts to hundreds. Building heights are missing for some buildings and capped at 10 storeys.
- **Neighbourhoods are approximate** Voronoi cells, not administrative boundaries.
- **S1 predates the curve-number fix** applied to S2 and S3 (under 1 % effect where tested).
- **FABDEM terrain is non-commercial** (CC BY-NC-SA 4.0), so this demo is a non-commercial research demo.
