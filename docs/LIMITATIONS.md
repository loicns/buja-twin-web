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
- **Neighbourhoods are approximate** Voronoi cells, not administrative boundaries. Releases before v20261127 keyed them
  by name, so the two cells named Mutimbuzi (a town and a village) were merged and each was shown with the combined
  totals (1,499 people counted twice in S2). They now have ids and labels "Mutimbuzi (town)" / "Mutimbuzi (village)".
- **Synthetic roughness block (found 2026-11-26).** Every published run (S1 to S3, and the surrogate's training runs) read
  its Manning roughness from the lab's `02_processed/vegetation/mannings_n_10m_canopy.tif`, which
  `scripts/compute_canopy_roughness.py` made in *synthetic* mode: a 4 x 4 km square of made-up 8 m "forest"
  (n of about 0.12 to 0.13 instead of 0.035) at about 29.340-29.376 E, 3.326-3.363 S. It covers Mutakura and Ntahangwa,
  most of Ngagara and Bukirasazi, and about half of Buterere and Quartier Industriel. Neighbourhoods touching it hold
  about 63 % of the S2 people in more than 0.5 m of water. Depths there are less reliable; the app flags each
  neighbourhood's overlap (`roughness_test_pct`, from release v20261127). The runs must be redone with a roughness map
  built from the measured canopy. Uniform Manning x0.7 / x1.3 changed flooded area by -10 % / +7 %, which bounds the
  city-wide effect, not the local one.
- **The measured canopy is not in the flood model.** The canopy and tree layers, and the canopy share per neighbourhood,
  are descriptive. Nothing here shows that more trees would lower these depths: no run has changed vegetation, and most
  modelled flooding comes from river inflows draining about 1,000 km2 of hills outside the canopy map.
- **S1 predates the curve-number fix** applied to S2 and S3 (under 1 % effect where tested).
- **FABDEM terrain is non-commercial** (CC BY-NC-SA 4.0), so this demo is a non-commercial research demo.
