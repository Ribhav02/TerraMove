import json
import csv
import sys
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent / "data" / "raw"

def inspect_parking_csv():
    csv_path = DATA_DIR / "D-58 Parking Lots_0.csv"
    if not csv_path.exists():
        return {"error": f"File not found: {csv_path}"}
    
    rows = []
    with open(csv_path, mode="r", encoding="utf-8-sig", errors="replace") as f:
        reader = csv.reader(f)
        header = next(reader, None)
        for idx, r in enumerate(reader):
            rows.append((idx + 1, r))

    return {
        "file": csv_path.name,
        "total_rows": len(rows),
        "header": header,
        "sample_rows": rows[:5]
    }

def inspect_geojson():
    geojson_path = DATA_DIR / "export.geojson"
    if not geojson_path.exists():
        return {"error": f"File not found: {geojson_path}"}
    
    with open(geojson_path, mode="r", encoding="utf-8", errors="replace") as f:
        data = json.load(f)
    
    features = data.get("features", [])
    geom_types = {}
    tags_highway = {}
    tags_building = {}
    sample_tags = []

    for f in features:
        geom = f.get("geometry", {})
        gtype = geom.get("type", "Unknown")
        geom_types[gtype] = geom_types.get(gtype, 0) + 1

        props = f.get("properties", {})
        if "highway" in props:
            hw = props["highway"]
            tags_highway[hw] = tags_highway.get(hw, 0) + 1
        if "building" in props:
            bd = props["building"]
            tags_building[bd] = tags_building.get(bd, 0) + 1
        
        if len(sample_tags) < 5 and props:
            sample_tags.append(props)

    return {
        "file": geojson_path.name,
        "type": data.get("type"),
        "feature_count": len(features),
        "geom_types": geom_types,
        "highway_distribution": tags_highway,
        "building_distribution": tags_building,
        "sample_tags": sample_tags
    }

def inspect_shp_companion_files():
    shp_dir = DATA_DIR / "Chandigarh_Sectors-SHP"
    files = list(shp_dir.glob("*")) if shp_dir.exists() else []
    
    prj_content = ""
    prj_file = shp_dir / "Chandigarh_Sectors.prj"
    if prj_file.exists():
        prj_content = prj_file.read_text(encoding="utf-8", errors="replace")

    return {
        "directory": str(shp_dir),
        "files": [f.name for f in files],
        "prj_content": prj_content
    }

if __name__ == "__main__":
    report = {
        "parking": inspect_parking_csv(),
        "geojson": inspect_geojson(),
        "shapefile": inspect_shp_companion_files()
    }
    print(json.dumps(report, indent=2))

