import os
import sys
import json
import uuid
import httpx
from pathlib import Path
from shapely.geometry import shape, LineString
import shapely.wkt
from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parent.parent
PROCESSED_DIR = PROJECT_ROOT / "data" / "processed"
REPORTS_DIR = PROJECT_ROOT / "data" / "reports"

load_dotenv(PROJECT_ROOT / ".env", override=True)

def to_ewkt(geom_dict, srid=4326) -> str:
    """Serializes GeoJSON geometry dict to PostGIS EWKT with SRID=4326."""
    s = shape(geom_dict)
    return f"SRID={srid};{shapely.wkt.dumps(s)}"

def to_ewkt_linestring(geom_dict, srid=4326) -> str:
    """Ensures geometry is converted to a valid 2D LineString for pedestrian_edges."""
    s = shape(geom_dict)
    if s.geom_type == "Polygon":
        # Extract the exterior boundary loop as a LineString
        s = LineString(s.exterior.coords)
    elif s.geom_type == "MultiLineString":
        coords = []
        for line in s.geoms:
            coords.extend(line.coords)
        s = LineString(coords)
    return f"SRID={srid};{shapely.wkt.dumps(s)}"

def haversine_length_m(coords) -> float:
    """Computes approximate length in meters for coordinate vertices."""
    import math
    if len(coords) < 2:
        return 0.0
    R = 6371000.0
    total = 0.0
    for i in range(len(coords) - 1):
        lon1, lat1 = coords[i][0], coords[i][1]
        lon2, lat2 = coords[i + 1][0], coords[i + 1][1]
        phi1, phi2 = math.radians(lat1), math.radians(lat2)
        dphi = math.radians(lat2 - lat1)
        dlam = math.radians(lon2 - lon1)
        a = math.sin(dphi / 2.0) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2.0) ** 2
        c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
        total += R * c
    return total

def import_all_data(dry_run: bool = False):
    supabase_url = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
    service_role_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    supabase_key = os.getenv("SUPABASE_KEY", "").strip()

    # Prioritize service_role key for admin data pipeline imports
    active_key = service_role_key if service_role_key else supabase_key
    key_type = "SERVICE_ROLE" if service_role_key else ("PUBLISHABLE/ANON" if supabase_key else "NONE")

    if not supabase_url or not active_key:
        print("[FAIL] Missing SUPABASE_URL or API key in .env")
        return False, {"error": "Missing credentials"}

    headers = {
        "apikey": active_key,
        "Authorization": f"Bearer {active_key}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
    }

    print("=" * 70)
    print("TerraMove — PostGIS Data Import Pipeline")
    print("=" * 70)
    print(f"[*] Target Supabase: {supabase_url}")
    print(f"[*] Credential Role: {key_type}")
    print(f"[*] Execution Mode : {'DRY RUN (Validation only)' if dry_run else 'LIVE DATABASE INSERT'}")
    print("=" * 70)

    summary = {
        "sector_boundaries": {"staged": 0, "inserted": 0, "errors": []},
        "parking_locations": {"staged": 0, "inserted": 0, "errors": []},
        "pedestrian_edges": {"staged": 0, "inserted": 0, "errors": []},
        "buildings": {"staged": 0, "inserted": 0, "errors": []},
        "citizen_reports": {"staged": 0, "inserted": 0, "note": "Kept empty by design"}
    }

    with httpx.Client(timeout=45.0) as client:
        # Clean up any transient test probes if present
        if not dry_run:
            client.delete(f"{supabase_url}/rest/v1/sector_boundaries?sector_name=like.Test%20Probe*", headers=headers)

        # -------------------------------------------------------------
        # 1. Sector Boundaries
        # -------------------------------------------------------------
        boundary_path = PROCESSED_DIR / "sector17_boundary.geojson"
        if boundary_path.exists():
            with open(boundary_path, "r", encoding="utf-8") as f:
                b_data = json.load(f)
            features = b_data.get("features", [])
            summary["sector_boundaries"]["staged"] = len(features)
            rows = []
            for feat in features:
                props = feat.get("properties", {})
                attrs = props.get("attributes", {})
                rows.append({
                    "sector_name": str(props.get("sector", "Sector 17")),
                    "ward_name": str(attrs.get("Ward_name", "3")),
                    "zone_name": str(attrs.get("Zone_name", "2")),
                    "area_sqkm": float(attrs.get("Area", 1.1374)),
                    "source_id": str(props.get("identifier", "17")),
                    "pilot_area": True,
                    "geom": to_ewkt(feat["geometry"])
                })

            if not dry_run and rows:
                r = client.post(
                    f"{supabase_url}/rest/v1/sector_boundaries?on_conflict=sector_name",
                    headers={**headers, "Prefer": "resolution=merge-duplicates"},
                    json=rows
                )
                if r.status_code in (200, 201):
                    summary["sector_boundaries"]["inserted"] = len(rows)
                    print(f"  [+] sector_boundaries: {len(rows)} records upserted (HTTP {r.status_code})")
                else:
                    summary["sector_boundaries"]["errors"].append(f"HTTP {r.status_code}: {r.text}")
                    print(f"  [-] sector_boundaries failed: HTTP {r.status_code} - {r.text}")

        # -------------------------------------------------------------
        # 2. Parking Locations
        # -------------------------------------------------------------
        parking_path = PROCESSED_DIR / "parking_sector17_validated.json"
        if parking_path.exists():
            with open(parking_path, "r", encoding="utf-8") as f:
                p_data = json.load(f)
            records = p_data.get("sector17_records", [])
            summary["parking_locations"]["staged"] = len(records)
            p_rows = []
            for p in records:
                pt_geom = {"type": "Point", "coordinates": [p["longitude"], p["latitude"]]}
                caps = p.get("capacities", {})
                c_four = caps.get("No. of  4 wheeler parking ") or 0
                c_two = caps.get("No. of  2 wheeler parking ") or 0
                total_cap = p.get("total_capacity_recorded") or (c_four + c_two)

                p_rows.append({
                    "source_row": int(p["source_row"]),
                    "name": str(p["name"])[:255],
                    "address": str(p.get("raw", {}).get("parking address ", "")).strip() or "Sector 17, Chandigarh",
                    "capacity_four_wheeler": int(c_four),
                    "capacity_two_wheeler": int(c_two),
                    "total_capacity": int(total_cap),
                    "availability_status": "unknown",
                    "is_simulated": False,
                    "in_sector17_exact": bool(p.get("in_sector17_exact", True)),
                    "in_sector17_buffered": bool(p.get("in_sector17_buffered", False)),
                    "geom": to_ewkt(pt_geom)
                })

            if not dry_run and p_rows:
                r = client.post(
                    f"{supabase_url}/rest/v1/parking_locations?on_conflict=source_row",
                    headers={**headers, "Prefer": "resolution=merge-duplicates"},
                    json=p_rows
                )
                if r.status_code in (200, 201):
                    summary["parking_locations"]["inserted"] = len(p_rows)
                    print(f"  [+] parking_locations: {len(p_rows)} records upserted (HTTP {r.status_code})")
                else:
                    summary["parking_locations"]["errors"].append(f"HTTP {r.status_code}: {r.text}")
                    print(f"  [-] parking_locations failed: HTTP {r.status_code} - {r.text}")

        # -------------------------------------------------------------
        # 3. Pedestrian Edges (osm_id NOT unique; multiple segments share way ID)
        # -------------------------------------------------------------
        edges_path = PROCESSED_DIR / "sector17_pedestrian_network.geojson"
        if edges_path.exists():
            with open(edges_path, "r", encoding="utf-8") as f:
                e_data = json.load(f)
            features = e_data.get("features", [])
            summary["pedestrian_edges"]["staged"] = len(features)
            e_rows = []
            for feat in features:
                props = feat.get("properties", {})
                coords = feat.get("geometry", {}).get("coordinates", [])
                
                # Extract coordinates safely whether LineString or Polygon
                if feat["geometry"]["type"] == "LineString":
                    l_coords = coords
                elif feat["geometry"]["type"] == "Polygon" and coords:
                    l_coords = coords[0]
                else:
                    l_coords = []

                length_m = haversine_length_m(l_coords)
                walk_sec = length_m / 1.3
                feat_id = str(feat.get("id") or props.get("osm_id") or f"edge_{len(e_rows)}")
                deterministic_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"terramove_edge_{feat_id}"))

                e_rows.append({
                    "id": deterministic_id,
                    "osm_id": feat_id[:100],
                    "highway_type": str(props.get("highway", "footway"))[:100],
                    "street_name": str(props.get("name") or "Walkable Path")[:255],
                    "surface": str(props.get("surface", "unknown"))[:100],
                    "foot_access": str(props.get("foot", "yes"))[:50],
                    "length_meters": round(max(0.5, length_m), 2),
                    "walk_time_seconds": round(max(0.5, walk_sec), 2),
                    "shade_score": int(props.get("shade_score", 35)),
                    "geom": to_ewkt_linestring(feat["geometry"])
                })

            if not dry_run and e_rows:
                # Chunk in batches of 100 for reliable network payloads with primary key upsert
                batch_size = 100
                total_inserted = 0
                has_error = False
                for i in range(0, len(e_rows), batch_size):
                    batch = e_rows[i:i + batch_size]
                    r = client.post(
                        f"{supabase_url}/rest/v1/pedestrian_edges?on_conflict=id",
                        headers={**headers, "Prefer": "resolution=merge-duplicates"},
                        json=batch
                    )
                    if r.status_code in (200, 201):
                        total_inserted += len(batch)
                    else:
                        has_error = True
                        summary["pedestrian_edges"]["errors"].append(f"Batch {i//batch_size} HTTP {r.status_code}: {r.text}")
                        print(f"  [-] pedestrian_edges batch {i//batch_size} failed: HTTP {r.status_code} - {r.text}")
                summary["pedestrian_edges"]["inserted"] = total_inserted
                if not has_error:
                    print(f"  [+] pedestrian_edges: {total_inserted} records upserted across {len(e_rows)//batch_size + 1} batches")

        # -------------------------------------------------------------
        # 4. Building Footprints
        # -------------------------------------------------------------
        bldg_path = PROCESSED_DIR / "sector17_buildings.geojson"
        if bldg_path.exists():
            with open(bldg_path, "r", encoding="utf-8") as f:
                b_data = json.load(f)
            features = b_data.get("features", [])
            summary["buildings"]["staged"] = len(features)
            b_rows = []
            for feat in features:
                props = feat.get("properties", {})
                h = props.get("height")
                lvl = props.get("levels")

                if h and float(h) > 0:
                    est_h = float(h)
                    quality = "measured_tag"
                elif lvl and int(lvl) > 0:
                    est_h = float(lvl) * 3.5
                    quality = "estimated_from_levels"
                else:
                    est_h = 14.0
                    quality = "sector17_commercial_baseline"

                b_rows.append({
                    "osm_id": str(feat.get("id") or props.get("osm_id")),
                    "building_type": str(props.get("building", "yes"))[:100],
                    "building_name": str(props.get("name"))[:255] if props.get("name") else None,
                    "height_meters": round(est_h, 2),
                    "levels": int(lvl) if lvl else 3,
                    "height_quality": quality[:50],
                    "geom": to_ewkt(feat["geometry"])
                })

            if not dry_run and b_rows:
                batch_size = 100
                total_inserted = 0
                has_error = False
                for i in range(0, len(b_rows), batch_size):
                    batch = b_rows[i:i + batch_size]
                    r = client.post(
                        f"{supabase_url}/rest/v1/buildings?on_conflict=osm_id",
                        headers={**headers, "Prefer": "resolution=merge-duplicates"},
                        json=batch
                    )
                    if r.status_code in (200, 201):
                        total_inserted += len(batch)
                    else:
                        has_error = True
                        summary["buildings"]["errors"].append(f"Batch {i//batch_size} HTTP {r.status_code}: {r.text}")
                        print(f"  [-] buildings batch {i//batch_size} failed: HTTP {r.status_code} - {r.text}")
                summary["buildings"]["inserted"] = total_inserted
                if not has_error:
                    print(f"  [+] buildings: {total_inserted} records upserted across {len(b_rows)//batch_size + 1} batches")

    return True, summary

def query_supabase_counts():
    """Queries and returns live table row counts from Supabase."""
    supabase_url = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
    service_role_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    supabase_key = os.getenv("SUPABASE_KEY", "").strip()
    active_key = service_role_key if service_role_key else supabase_key

    if not supabase_url or not active_key:
        return {}

    headers = {
        "apikey": active_key,
        "Authorization": f"Bearer {active_key}",
        "Range": "0-0",
        "Prefer": "count=exact"
    }
    counts = {}
    tables = ["sector_boundaries", "parking_locations", "pedestrian_edges", "buildings", "citizen_reports"]
    with httpx.Client(timeout=15.0) as client:
        for t in tables:
            try:
                r = client.get(f"{supabase_url}/rest/v1/{t}?select=count", headers=headers)
                cr = r.headers.get("content-range")
                if cr and "/" in cr:
                    counts[t] = int(cr.split("/")[-1])
                elif r.status_code == 200:
                    data = r.json()
                    counts[t] = data[0].get("count", 0) if data else 0
                else:
                    counts[t] = f"Error (HTTP {r.status_code})"
            except Exception as e:
                counts[t] = f"Query failed: {str(e)}"
    return counts

if __name__ == "__main__":
    dry = "--dry-run" in sys.argv
    success, res = import_all_data(dry_run=dry)
    print("\nLive Table Counts in Supabase:")
    live = query_supabase_counts()
    for tbl, cnt in live.items():
        print(f"  {tbl:22}: {cnt}")
    
    # Save report
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    report_file = REPORTS_DIR / "phase2_supabase_import_report.json"
    with open(report_file, "w", encoding="utf-8") as f:
        json.dump({
            "status": "success" if success else "partial_or_failed",
            "import_summary": res,
            "live_counts": live,
            "dry_run": dry
        }, f, indent=2)
    print(f"\nReport written to: {report_file}")
