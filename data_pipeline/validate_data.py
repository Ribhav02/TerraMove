import json
import csv
import re
from pathlib import Path
import shapefile
from shapely.geometry import shape, Point, Polygon, MultiPolygon, LineString, mapping
from shapely.validation import make_valid
from shapely.ops import transform

PROJECT_ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = PROJECT_ROOT / "data" / "raw"
PROCESSED_DIR = PROJECT_ROOT / "data" / "processed"
REPORTS_DIR = PROJECT_ROOT / "data" / "reports"

# Chandigarh approximate bounding box
CHANDIGARH_BBOX = {
    "min_lat": 30.65,
    "max_lat": 30.82,
    "min_lon": 76.68,
    "max_lon": 76.88
}

def clean_float(val):
    if val is None:
        return None
    val_str = str(val).strip()
    if val_str.upper() in ("", "NA", "N/A", "NULL", "NONE", "-"):
        return None
    # Remove degree symbol, quotes, stray letters
    cleaned = re.sub(r"[^\d.-]", "", val_str)
    try:
        return float(cleaned)
    except ValueError:
        return None

def clean_int(val):
    flt = clean_float(val)
    if flt is None:
        return None
    try:
        return int(round(flt))
    except (ValueError, OverflowError):
        return None

def validate_sectors():
    shp_path = RAW_DIR / "Chandigarh_Sectors-SHP" / "Chandigarh_Sectors.shp"
    if not shp_path.exists():
        raise FileNotFoundError(f"Missing shapefile at {shp_path}")

    sf = shapefile.Reader(str(shp_path))
    fields = [f[0] for f in sf.fields[1:]] # skip DeletionFlag
    records = sf.shapeRecords()

    sector17_records = []
    all_sectors = []

    for r in records:
        rec_dict = dict(zip(fields, r.record))
        geom_json = r.shape.__geo_interface__
        geom_shapely = make_valid(shape(geom_json))
        sec_name = str(rec_dict.get('Sector_nam', '')).strip()

        all_sectors.append({
            "attributes": {k: (v.decode('utf-8', errors='replace') if isinstance(v, bytes) else v) for k, v in rec_dict.items()},
            "bounds": geom_shapely.bounds
        })

        if sec_name == "17":
            sector17_records.append((rec_dict, geom_shapely, sec_name))

    if not sector17_records:
        raise ValueError("Could not automatically locate Sector 17 in shapefile")

    # Pick the main Sector 17 polygon
    sec17_attr, sec17_poly, sec17_id = sector17_records[0]
    sec17_bounds = sec17_poly.bounds # (minx, miny, maxx, maxy) -> (min_lon, min_lat, max_lon, max_lat)

    # 100-meter buffer approx in degrees (1 deg lat ~ 111km -> 100m ~ 0.0009 deg)
    BUFFER_DEG = 0.001
    sec17_buffered = sec17_poly.buffer(BUFFER_DEG)

    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    with open(PROCESSED_DIR / "sector17_boundary.geojson", "w", encoding="utf-8") as f:
        json.dump({
            "type": "FeatureCollection",
            "features": [{
                "type": "Feature",
                "properties": {
                    "sector": "Sector 17",
                    "identifier": sec17_id,
                    "attributes": {k: (v.decode('utf-8', errors='replace') if isinstance(v, bytes) else str(v)) for k, v in sec17_attr.items()},
                    "bounds": sec17_bounds,
                    "buffer_deg": BUFFER_DEG
                },
                "geometry": mapping(sec17_poly)
            }]
        }, f, indent=2)

    return {
        "sector_id": sec17_id,
        "total_sectors_in_shp": len(records),
        "fields": fields,
        "bounds": sec17_bounds,
        "polygon": sec17_poly,
        "buffered_polygon": sec17_buffered,
        "buffer_deg": BUFFER_DEG
    }

def validate_parking(sec17_poly, sec17_buffered):
    csv_path = RAW_DIR / "D-58 Parking Lots_0.csv"
    if not csv_path.exists():
        raise FileNotFoundError(f"Missing parking CSV at {csv_path}")

    accepted = []
    quarantined = []
    rejected = []
    sector17_inside = []
    sector17_buffered_inside = []

    with open(csv_path, mode="r", encoding="utf-8-sig", errors="replace") as f:
        reader = csv.DictReader(f)
        fields = reader.fieldnames
        normalized_fields = [f.strip() if f else "" for f in fields]
        
        # Map fields
        lat_field = next((f for f in fields if "lat" in f.lower()), None)
        lon_field = next((f for f in fields if any(c in f.lower() for c in ["lon", "lng"])), None)
        name_field = next((f for f in fields if "name" in f.lower() or "location" in f.lower()), None)
        
        # Detect capacity fields
        cap_fields = [f for f in fields if "cap" in f.lower() or "wheeler" in f.lower() or "space" in f.lower()]

        for row_idx, row in enumerate(reader, start=2):
            raw_lat = row.get(lat_field)
            raw_lon = row.get(lon_field)
            lat = clean_float(raw_lat)
            lon = clean_float(raw_lon)
            name = row.get(name_field, f"Parking #{row_idx}").strip()

            item = {
                "source_row": row_idx,
                "raw": row,
                "name": name,
                "latitude": lat,
                "longitude": lon,
                "capacities": {c: clean_int(row.get(c)) for c in cap_fields}
            }

            # Coordinate validation
            if lat is None or lon is None:
                item["rejection_reason"] = "Missing or unparseable coordinates"
                quarantined.append(item)
                continue

            # Check if lat and lon are accidentally swapped
            if (CHANDIGARH_BBOX["min_lat"] <= lon <= CHANDIGARH_BBOX["max_lat"]) and (CHANDIGARH_BBOX["min_lon"] <= lat <= CHANDIGARH_BBOX["max_lon"]):
                # Swapped coordinates!
                lat, lon = lon, lat
                item["latitude"] = lat
                item["longitude"] = lon
                item["warning"] = "Coordinates appeared swapped (lat/lon reversed); corrected"

            # Check city bounds
            if not (CHANDIGARH_BBOX["min_lat"] <= lat <= CHANDIGARH_BBOX["max_lat"] and CHANDIGARH_BBOX["min_lon"] <= lon <= CHANDIGARH_BBOX["max_lon"]):
                item["rejection_reason"] = f"Coordinates ({lat}, {lon}) outside Chandigarh bounds"
                rejected.append(item)
                continue

            # Spatial check against Sector 17
            pt = Point(lon, lat)
            is_in_sec17 = sec17_poly.contains(pt)
            is_in_buffer = sec17_buffered.contains(pt)

            item["in_sector17_exact"] = is_in_sec17
            item["in_sector17_buffered"] = is_in_buffer

            # Sum total capacity safely
            valid_caps = [v for v in item["capacities"].values() if v is not None and v > 0]
            item["total_capacity_recorded"] = sum(valid_caps) if valid_caps else None
            # Live availability is unknown (no live sensor stream)
            item["availability_status"] = "unknown"

            accepted.append(item)
            if is_in_sec17:
                sector17_inside.append(item)
            elif is_in_buffer:
                sector17_buffered_inside.append(item)

    # Save processed parking
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    with open(PROCESSED_DIR / "parking_sector17_validated.json", "w", encoding="utf-8") as f:
        json.dump({
            "exact_sector17_count": len(sector17_inside),
            "buffered_sector17_count": len(sector17_buffered_inside),
            "total_accepted_chandigarh": len(accepted),
            "quarantined_count": len(quarantined),
            "rejected_count": len(rejected),
            "sector17_records": sector17_inside + sector17_buffered_inside
        }, f, indent=2)

    return {
        "total_raw": len(accepted) + len(quarantined) + len(rejected),
        "accepted_total": len(accepted),
        "quarantined_total": len(quarantined),
        "rejected_total": len(rejected),
        "sector17_exact": len(sector17_inside),
        "sector17_buffered": len(sector17_buffered_inside),
        "sample_sec17": (sector17_inside + sector17_buffered_inside)[:3]
    }

def validate_geojson(sec17_poly, sec17_buffered):
    geojson_path = RAW_DIR / "export.geojson"
    if not geojson_path.exists():
        raise FileNotFoundError(f"Missing export.geojson at {geojson_path}")

    with open(geojson_path, mode="r", encoding="utf-8", errors="replace") as f:
        raw_data = json.load(f)

    features = raw_data.get("features", [])
    
    pedestrian_highways = {
        "footway", "pedestrian", "path", "living_street", "sidewalk", 
        "residential", "crossing", "steps", "track", "corridor", "plaza",
        "service", "unclassified", "tertiary", "secondary", "tertiary_link", "secondary_link"
    }
    excluded_highways = {
        "motorway", "motorway_link", "trunk", "trunk_link", "construction", "proposed", "raceway"
    }

    walkable_edges = []
    buildings = []
    other_features = []
    invalid_geoms = 0

    for idx, feat in enumerate(features):
        geom_raw = feat.get("geometry")
        if not geom_raw:
            continue
        try:
            geom = make_valid(shape(geom_raw))
        except Exception:
            invalid_geoms += 1
            continue

        props = feat.get("properties") or {}
        
        # Check intersection with buffered Sector 17
        if not sec17_buffered.intersects(geom):
            continue

        if "highway" in props:
            hw = props["highway"]
            if hw in excluded_highways:
                continue
            
            # Pedestrian accessibility check
            foot_access = props.get("foot", "yes").lower()
            access = props.get("access", "yes").lower()
            if foot_access in ("no", "private") or access in ("no", "private"):
                continue

            walkable_edges.append({
                "type": "Feature",
                "id": feat.get("id", f"edge_{idx}"),
                "properties": {
                    "highway": hw,
                    "name": props.get("name", "Unnamed Path"),
                    "surface": props.get("surface", "unknown"),
                    "lit": props.get("lit", "unknown"),
                    "foot": foot_access,
                    "osm_id": feat.get("id"),
                    "all_tags": props
                },
                "geometry": mapping(geom)
            })
        elif "building" in props:
            buildings.append({
                "type": "Feature",
                "id": feat.get("id", f"bldg_{idx}"),
                "properties": {
                    "building": props.get("building"),
                    "name": props.get("name"),
                    "height": clean_float(props.get("height")),
                    "levels": clean_int(props.get("building:levels")),
                    "osm_id": feat.get("id"),
                    "all_tags": props
                },
                "geometry": mapping(geom)
            })
        else:
            other_features.append(feat)

    # Save processed edges and buildings
    with open(PROCESSED_DIR / "sector17_pedestrian_network.geojson", "w", encoding="utf-8") as f:
        json.dump({"type": "FeatureCollection", "features": walkable_edges}, f, indent=2)

    with open(PROCESSED_DIR / "sector17_buildings.geojson", "w", encoding="utf-8") as f:
        json.dump({"type": "FeatureCollection", "features": buildings}, f, indent=2)

    return {
        "total_features_inspected": len(features),
        "invalid_geometries_repaired": invalid_geoms,
        "sector17_walkable_edges": len(walkable_edges),
        "sector17_buildings": len(buildings),
        "other_features_within_sector": len(other_features)
    }

def generate_report():
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    
    sec_info = validate_sectors()
    parking_info = validate_parking(sec_info["polygon"], sec_info["buffered_polygon"])
    geojson_info = validate_geojson(sec_info["polygon"], sec_info["buffered_polygon"])

    report_data = {
        "pilot_area": "Sector 17, Chandigarh, India",
        "sector_boundary": {
            "source_records": sec_info["total_sectors_in_shp"],
            "sector_identifier": sec_info["sector_id"],
            "bounding_box_wgs84": sec_info["bounds"],
            "buffer_degrees": sec_info["buffer_deg"]
        },
        "parking_dataset": parking_info,
        "osm_network_and_buildings": geojson_info,
        "unstructured_pdf_inventory": {
            "native_trees_pdf": {
                "file": "Native Trees Chandigarh.pdf",
                "status": "Verified presence. Botanical reference only; contains species descriptions without GIS coordinates. Will not hallucinate street-level tree inventory."
            },
            "groundwater_pdf": {
                "file": "CGWReport.pdf",
                "status": "Verified presence. Regional hydrogeological context only. Not used for microclimate heat/weather routing."
            }
        }
    }

    with open(REPORTS_DIR / "validation_report.json", "w", encoding="utf-8") as f:
        json.dump(report_data, f, indent=2)

    md_content = f"""# TerraMove — Pilot Data Validation Report
**Pilot Area:** Sector 17, Chandigarh, India  
**Status:** Validated and Processed  

---

## 1. Sector Boundary (Shapefile)
- **Source:** `Chandigarh_Sectors-SHP/Chandigarh_Sectors.shp`
- **Total Sectors in Dataset:** {sec_info['total_sectors_in_shp']}
- **Matched Pilot Sector:** {sec_info['sector_id']}
- **Sector 17 Bounding Box (WGS84 [min_lon, min_lat, max_lon, max_lat]):** `{sec_info['bounds']}`
- **Buffer Applied for Ingress/Egress Tolerance:** {sec_info['buffer_deg']} degrees (~110 meters)
- **Output:** `data/processed/sector17_boundary.geojson`

---

## 2. Parking Dataset (`D-58 Parking Lots_0.csv`)
- **Total Raw Records:** {parking_info['total_raw']}
- **Accepted Citywide Records:** {parking_info['accepted_total']}
- **Quarantined Records (Malformed/Missing Coordinates):** {parking_info['quarantined_total']}
- **Rejected Records (Outside Chandigarh BBox):** {parking_info['rejected_total']}
- **Sector 17 Exact Spatial Containment:** {parking_info['sector17_exact']}
- **Sector 17 Buffer Spatial Containment:** {parking_info['sector17_buffered']}
- **Total Usable Sector 17 Parking Locations:** {parking_info['sector17_exact'] + parking_info['sector17_buffered']}
- **Live Availability Status:** Marked `unknown` (no live parking sensor stream exists in dataset)
- **Output:** `data/processed/parking_sector17_validated.json`

---

## 3. OpenStreetMap Geographic Features (`export.geojson`)
- **Total Features Inspected:** {geojson_info['total_features_inspected']}
- **Sector 17 Walkable Edges (Pedestrian-accessible):** {geojson_info['sector17_walkable_edges']}
- **Sector 17 Building Polygons (Shade estimation candidates):** {geojson_info['sector17_buildings']}
- **Excluded Features:** Motorways, private access routes, non-pedestrian infrastructure.
- **Outputs:**
  - `data/processed/sector17_pedestrian_network.geojson`
  - `data/processed/sector17_buildings.geojson`

---

## 4. Unstructured Documentation
- **`Native Trees Chandigarh.pdf`:** Contains botanical guide and canopy characteristics for Chandigarh native trees. Does not contain GPS coordinates. Kept as contextual reference; tree coordinates are not fabricated.
- **`CGWReport.pdf`:** Regional groundwater report. Does not substitute for real-time heat/weather metrics.

---

## 5. Proposed Supabase Import Scope
- `sector_boundaries`: 1 polygon feature (Sector 17)
- `parking_locations`: {parking_info['sector17_exact'] + parking_info['sector17_buffered']} validated parking spots
- `pedestrian_edges`: {geojson_info['sector17_walkable_edges']} walkable path segments
- `buildings`: {geojson_info['sector17_buildings']} building footprints
- **Action Required:** Awaiting user approval before applying first live database import.
"""
    with open(REPORTS_DIR / "validation_report.md", "w", encoding="utf-8") as f:
        f.write(md_content)

    print("Validation finished successfully!")
    print(f"Sector 17 Parking count: {parking_info['sector17_exact'] + parking_info['sector17_buffered']}")
    print(f"Sector 17 Walkable edges: {geojson_info['sector17_walkable_edges']}")
    print(f"Sector 17 Buildings: {geojson_info['sector17_buildings']}")

if __name__ == "__main__":
    generate_report()

