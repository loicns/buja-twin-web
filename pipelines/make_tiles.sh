#!/usr/bin/env bash
# Build the PMTiles from the research exports. Run package_data.py first (it writes cog/ and tmp/).
# Usage: bash pipelines/make_tiles.sh dist/vYYYYMMDD
# Needs: ogr2ogr, gdal_translate, gdaladdo, gdal_fillnodata.py (GDAL), tippecanoe, pmtiles, and a Python with
# rasterio, mercantile, pillow (set PYTHON=.venv/bin/python)
set -euo pipefail
DIST=${1:?usage: make_tiles.sh dist/vYYYYMMDD}
SIBLINGS=$(cd "$(dirname "$0")/../.." && pwd)
TWIN=${BUJA_TWIN_DIR:-$SIBLINGS/buja_geo_twin}/exports/blender_flood_twin
mkdir -p "$DIST/pmtiles" "$DIST/tmp"

# 1. Vectors: GPKG (EPSG:32735) -> FlatGeobuf (EPSG:4326) -> PMTiles
for layer in roads_transportation rivers_streams critical_bridges water_bodies; do
  ogr2ogr -f FlatGeobuf -t_srs EPSG:4326 "$DIST/tmp/$layer.fgb" "$TWIN/$layer.gpkg"
done
ogr2ogr -f FlatGeobuf -t_srs EPSG:4326 "$DIST/tmp/boundary.fgb" "$TWIN/administrative_boundaries.gpkg" bujumbura_mairie_boundary
ogr2ogr -f FlatGeobuf -t_srs EPSG:4326 "$DIST/tmp/places.fgb" "$TWIN/administrative_boundaries.gpkg" neighbourhood_places
# buildings: footprint + height + area (+ flood depths when exposure/ exists)
"${PYTHON:-python3}" "$(dirname "$0")/building_layer.py" --dist "$DIST" --out "$DIST/tmp/buildings.geojsonl"
tippecanoe -o "$DIST/pmtiles/buildings.pmtiles" -l buildings -Z13 -z16 \
  --drop-densest-as-needed --extend-zooms-if-still-dropping \
  --use-attribute-for-id=id --force "$DIST/tmp/buildings.geojsonl"
tippecanoe -o "$DIST/pmtiles/context.pmtiles" -zg --force \
  -L roads:"$DIST/tmp/roads_transportation.fgb" -L rivers:"$DIST/tmp/rivers_streams.fgb" \
  -L bridges:"$DIST/tmp/critical_bridges.fgb" -L water:"$DIST/tmp/water_bodies.fgb" \
  -L boundary:"$DIST/tmp/boundary.fgb" -L places:"$DIST/tmp/places.fgb"

# Exposure layers (made by exposure.py + rollups.py): H3 hexes and approximate neighbourhoods
if [ -f "$DIST/exposure/hex.geojson" ]; then
  tippecanoe -o "$DIST/pmtiles/hex.pmtiles" -l hex -Z8 -z15 --no-tile-size-limit --force "$DIST/exposure/hex.geojson"
  tippecanoe -o "$DIST/pmtiles/zones.pmtiles" -l zones -Z8 -z15 --no-tile-size-limit --force "$DIST/exposure/zones.geojson"
fi

# 2. Terrain: DEM -> Terrarium RGB -> PMTiles (MapLibre raster-dem, encoding "terrarium").
#    Terrarium = (R*256 + G + B/256) - 32768. terrain_tiles.py replaces rio-rgbify, which breaks on current GDAL.
#    The warped DEM has nodata slivers at the rotated edges: fill them so no -9999 m spikes are encoded.
gdal_fillnodata.py -md 20 -q "$DIST/cog/dem_10m.tif" "$DIST/tmp/dem_filled.tif"
"${PYTHON:-python3}" "$(dirname "$0")/terrain_tiles.py" "$DIST/tmp/dem_filled.tif" "$DIST/tmp/terrain.mbtiles" --min-z 8 --max-z 14
pmtiles convert "$DIST/tmp/terrain.mbtiles" "$DIST/pmtiles/terrain.pmtiles"

# 3. Flood depth: classed RGBA -> PNG MBTiles (+overviews) -> PMTiles
for s in s1 s2 s3; do
  gdal_translate -q -of MBTILES -co TILE_FORMAT=PNG -co ZOOM_LEVEL_STRATEGY=UPPER \
    "$DIST/tmp/depth_${s}_rgba.tif" "$DIST/tmp/depth_$s.mbtiles"
  gdaladdo -q -r nearest "$DIST/tmp/depth_$s.mbtiles" 2 4 8 16
  pmtiles convert "$DIST/tmp/depth_$s.mbtiles" "$DIST/pmtiles/depth_$s.pmtiles"
done

for f in "$DIST"/pmtiles/*.pmtiles; do pmtiles verify "$f"; done
du -sh "$DIST"/pmtiles/* "$DIST"/cog/*
rm -rf "$DIST/tmp"
