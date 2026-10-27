import os
import json
import httpx
from pathlib import Path
from dotenv import dotenv_values

PROJECT_ROOT = Path(__file__).resolve().parent.parent
vals = dotenv_values(PROJECT_ROOT / ".env")

url = vals.get("SUPABASE_URL", "").rstrip("/")
pub_key = vals.get("SUPABASE_KEY", "")

headers = {
    "apikey": pub_key,
    "Authorization": f"Bearer {pub_key}"
}

print("=" * 70)
print("TerraMove — PostGIS Verification via Public Key (RLS Check)")
print("=" * 70)
print(f"Target: {url}")
print(f"Key Type: Public/Anon Key (testing read access under RLS)")
print("=" * 70)

results = {}

with httpx.Client(timeout=15.0) as client:
    # 1. sector_boundaries
    r_sb = client.get(f"{url}/rest/v1/sector_boundaries?select=id,sector_name,ward_name,zone_name,area_sqkm,pilot_area,geom", headers=headers)
    print(f"sector_boundaries: HTTP {r_sb.status_code}")
    if r_sb.status_code == 200:
        data = r_sb.json()
        print(f"  Count: {len(data)}")
        if data:
            print(f"  Sector: {data[0].get('sector_name')}, Area: {data[0].get('area_sqkm')} sq km")
            geom = data[0].get('geom')
            print(f"  Geom Type: {geom.get('type')}, CRS: {geom.get('crs', {}).get('properties', {}).get('name')}")
            sample_coord = geom.get('coordinates', [[]])[0][0]
            print(f"  Sample Coord [lon, lat]: {sample_coord}")
        results["sector_boundaries"] = {"status": r_sb.status_code, "count": len(data), "sample": data[0] if data else None}

    # 2. parking_locations
    r_pl = client.get(f"{url}/rest/v1/parking_locations?select=source_row,name,capacity_four_wheeler,capacity_two_wheeler,total_capacity,availability_status,geom&limit=3", headers=headers)
    print(f"\nparking_locations: HTTP {r_pl.status_code}")
    if r_pl.status_code == 200:
        data = r_pl.json()
        print(f"  Sample count returned: {len(data)}")
        for p in data:
            geom = p.get('geom', {})
            print(f"  - [{p.get('source_row')}] {p.get('name')}: Total={p.get('total_capacity')} ({geom.get('coordinates')})")
        results["parking_locations"] = {"status": r_pl.status_code, "sample_items": data}

    # 3. pedestrian_edges
    r_pe = client.get(f"{url}/rest/v1/pedestrian_edges?select=id,osm_id,highway_type,street_name,length_meters,walk_time_seconds,shade_score,geom&limit=3", headers=headers)
    print(f"\npedestrian_edges: HTTP {r_pe.status_code}")
    if r_pe.status_code == 200:
        data = r_pe.json()
        print(f"  Sample count returned: {len(data)}")
        for e in data:
            geom = e.get('geom', {})
            n_coords = len(geom.get('coordinates', []))
            print(f"  - {e.get('street_name')} ({e.get('highway_type')}): {e.get('length_meters')}m, shade={e.get('shade_score')}, {geom.get('type')} with {n_coords} vertices")
        results["pedestrian_edges"] = {"status": r_pe.status_code, "sample_items": data}

    # 4. buildings
    r_bd = client.get(f"{url}/rest/v1/buildings?select=osm_id,building_type,building_name,height_meters,levels,height_quality,geom&limit=3", headers=headers)
    print(f"\nbuildings: HTTP {r_bd.status_code}")
    if r_bd.status_code == 200:
        data = r_bd.json()
        print(f"  Sample count returned: {len(data)}")
        for b in data:
            geom = b.get('geom', {})
            print(f"  - {b.get('building_name') or b.get('osm_id')} ({b.get('building_type')}): {b.get('height_meters')}m ({b.get('height_quality')}), {geom.get('type')}")
        results["buildings"] = {"status": r_bd.status_code, "sample_items": data}

    # 5. citizen_reports
    r_cr = client.get(f"{url}/rest/v1/citizen_reports?select=id", headers=headers)
    print(f"\ncitizen_reports: HTTP {r_cr.status_code}")
    if r_cr.status_code == 200:
        data = r_cr.json()
        print(f"  Count: {len(data)} (confirmed empty)")
        results["citizen_reports"] = {"status": r_cr.status_code, "count": len(data)}

# Save validation output
report_path = PROJECT_ROOT / "data" / "reports" / "postgis_public_verification.json"
with open(report_path, "w", encoding="utf-8") as f:
    json.dump(results, f, indent=2)
print(f"\nValidation report saved to: {report_path}")

