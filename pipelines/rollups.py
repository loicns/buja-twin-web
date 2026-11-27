"""Roll the building exposure up to H3 hexes and approximate neighbourhoods.

Run:  python pipelines/rollups.py --dist dist/v20261121      (after exposure.py)
Writes into <dist>/exposure/: hex.geojson, zones.geojson, exposure_zones.csv, top20_hexes.csv
"""
import argparse
import json
from pathlib import Path

import geopandas as gpd
import h3
import pandas as pd
from shapely import MultiPoint, voronoi_polygons
from shapely.geometry import Polygon

from common import EXPORTS, SCENARIOS

SIDS = list(SCENARIOS)


def neighbourhood_zones() -> gpd.GeoDataFrame:
    """Voronoi cells of the 77 neighbourhood points, clipped to the Mairie outline (approximate)."""
    places = gpd.read_file(EXPORTS / "administrative_boundaries.gpkg", layer="neighbourhood_places")
    mairie = gpd.read_file(EXPORTS / "administrative_boundaries.gpkg", layer="bujumbura_mairie_boundary")
    outline = mairie.geometry.union_all()
    cells = voronoi_polygons(MultiPoint(list(places.geometry)), extend_to=outline.buffer(5000))
    zones = gpd.GeoDataFrame(geometry=list(cells.geoms), crs=places.crs)
    zones = gpd.sjoin(zones, places[["name", "fclass", "geometry"]], predicate="contains").drop(columns="index_right")
    zones["geometry"] = zones.geometry.intersection(outline)
    zones = zones[~zones.geometry.is_empty].reset_index(drop=True)
    zones["name"] = zones["name"].fillna("unnamed")
    # Two OSM places share a name (a town and a village called Mutimbuzi): keep the cells apart, with a stable
    # id and a readable label, so their buildings and people are not merged and then counted twice.
    dup = zones["name"].duplicated(keep=False)
    zones.loc[dup, "name"] = zones.loc[dup, "name"] + " (" + zones.loc[dup, "fclass"].astype(str) + ")"
    zones = zones.sort_values(["name"]).reset_index(drop=True)
    zones.insert(0, "id", range(1, len(zones) + 1))
    zones["area_km2"] = (zones.geometry.area / 1e6).round(2)
    return zones


def hex_polygons(hexes: pd.DataFrame) -> gpd.GeoDataFrame:
    polys = [Polygon([(lng, lat) for lat, lng in h3.cell_to_boundary(c)]) for c in hexes["h3"]]
    return gpd.GeoDataFrame(hexes, geometry=polys, crs=4326)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dist", required=True)
    out = Path(ap.parse_args().dist) / "exposure"

    b = pd.read_parquet(out / "exposure_buildings.parquet")
    hexes = pd.read_csv(out / "exposure_h3.csv")
    pts = gpd.GeoDataFrame(b[["bid"]], geometry=gpd.points_from_xy(b["lon"], b["lat"]), crs=4326).to_crs(32735)

    # neighbourhoods
    zones = neighbourhood_zones()
    j = gpd.sjoin(pts, zones[["id", "geometry"]], predicate="within", how="left")
    b["zone"] = j.groupby(level=0)["id"].first().reindex(b.index)
    cols = {"bid": "buildings", "people": "people"}
    for s in SIDS:
        b[f"n_{s}"] = (b[f"c_{s}"] >= 2).astype(int)
        b[f"p_{s}"] = b["people"].where(b[f"c_{s}"] >= 2, 0.0)
        cols[f"n_{s}"] = f"buildings_ge_0p5m_{s}"
        cols[f"p_{s}"] = f"people_ge_0p5m_{s}"
    agg = b.dropna(subset=["zone"]).groupby("zone").agg(
        {"bid": "count", "people": "sum", **{f"n_{s}": "sum" for s in SIDS}, **{f"p_{s}": "sum" for s in SIDS}}
    ).rename(columns=cols).round(0).astype(int)
    agg.index = agg.index.astype(int)
    zones = zones.merge(agg, left_on="id", right_index=True, how="left").fillna(0)
    z4326 = zones.to_crs(4326)
    # where the app flies to when a neighbourhood is picked: label point (inside the cell) and bounding box
    rep = z4326.geometry.representative_point()
    zones["lon"], zones["lat"] = rep.x.round(5), rep.y.round(5)
    bb = z4326.geometry.bounds.round(5)
    zones["minx"], zones["miny"], zones["maxx"], zones["maxy"] = bb["minx"], bb["miny"], bb["maxx"], bb["maxy"]
    zones.drop(columns="geometry").sort_values("people_ge_0p5m_s2", ascending=False).to_csv(
        out / "exposure_zones.csv", index=False)
    z4326["geometry"] = z4326.geometry.simplify(0.00002)
    z4326.to_file(out / "zones.geojson", driver="GeoJSON")

    # hexes: polygons + the nearest neighbourhood name for the table
    hx = hex_polygons(hexes)
    cen = gpd.GeoSeries(hx.geometry.centroid, crs=4326).to_crs(32735)
    near = gpd.sjoin_nearest(gpd.GeoDataFrame(geometry=cen), zones[["name", "geometry"]], how="left")
    hx["near"] = near.groupby(level=0)["name"].first().reindex(hx.index)
    for c in hx.columns:
        if c.startswith(("p_", "people")):
            hx[c] = hx[c].round(0)
    hx.to_file(out / "hex.geojson", driver="GeoJSON")
    top = hx.drop(columns="geometry").sort_values("rank_s2").head(20)
    top.to_csv(out / "top20_hexes.csv", index=False)

    print(json.dumps({"zones": len(zones), "hexes": len(hx), "buildings_in_a_zone": int(b["zone"].notna().sum())}))
    print(top[["rank_s2", "near", "buildings", "people", "n_s2", "p_s2", "p_s1", "p_s3", "freq"]].to_string(index=False))
    print(zones.drop(columns="geometry").sort_values("people_ge_0p5m_s2", ascending=False).head(8)[
        ["name", "buildings", "people", "buildings_ge_0p5m_s2", "people_ge_0p5m_s2"]].to_string(index=False))


if __name__ == "__main__":
    main()
