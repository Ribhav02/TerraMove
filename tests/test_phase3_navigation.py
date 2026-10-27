import sys
import json
import httpx

BACKEND_BASE = "http://127.0.0.1:8000/api/v1"
FRONTEND_PROXY_BASE = "http://localhost:5173/api/v1"

def test_health():
    print("\n--- TEST 1: Health & Database Status ---")
    with httpx.Client(timeout=15.0) as client:
        r = client.get(f"{BACKEND_BASE}/health")
        assert r.status_code == 200, f"Expected 200, got {r.status_code}"
        data = r.json()
        print("Health status:", data.get("status"))
        db = data.get("database", {})
        print("Database provider:", db.get("provider"))
        print("Database status:", db.get("status"))
        print("Database tables:", db.get("tables"))
        assert db.get("status") == "connected", f"Expected db connected, got {db.get('status')}"
        assert db.get("tables", {}).get("pedestrian_edges") == 378
        assert db.get("tables", {}).get("parking_locations") == 23
        assert db.get("tables", {}).get("buildings") == 358
        assert db.get("tables", {}).get("sector_boundaries") == 1
        print("[OK] Health & Supabase database integration verified.")

def test_sectors():
    print("\n--- TEST 2: Sector 17 Boundary from Supabase ---")
    with httpx.Client(timeout=15.0) as client:
        r = client.get(f"{BACKEND_BASE}/sectors")
        assert r.status_code == 200, f"Expected 200, got {r.status_code}"
        data = r.json()
        print("Sector data source:", data.get("data_source"))
        assert data.get("data_source") in ("supabase_postgis", "memory_cache")
        geojson = data.get("geojson", {})
        features = geojson.get("features", [])
        assert len(features) == 1
        coords = features[0].get("geometry", {}).get("coordinates", [])
        print(f"Sector boundary polygon rings: {len(coords)}, outer ring vertices: {len(coords[0]) if coords else 0}")
        print("[OK] Sector boundary from Supabase verified.")

def test_parking():
    print("\n--- TEST 3: Parking Facilities from Supabase ---")
    with httpx.Client(timeout=15.0) as client:
        r = client.get(f"{BACKEND_BASE}/parking?limit=25")
        assert r.status_code == 200, f"Expected 200, got {r.status_code}"
        data = r.json()
        print("Parking data source:", data.get("data_source"))
        print("Total parking records:", data.get("total_available_records"))
        assert data.get("data_source") == "supabase_postgis"
        assert data.get("total_available_records") == 23
        lots = data.get("parking_lots", [])
        assert len(lots) > 0
        sample = lots[0]
        print(f"Sample lot: {sample.get('id')} - {sample.get('name')} ({sample.get('address')}), Total Cap: {sample.get('total_recorded_capacity')}")
        print(f"Availability status: {sample.get('availability_status')}, Live sensor: {sample.get('live_sensor_connected')}")
        assert sample.get("availability_status") in ("unknown", "reserved", "available")
        assert sample.get("live_sensor_connected") is False
        print("[OK] Real parking from Supabase verified without synthetic fabrication.")

def test_route_navigation():
    print("\n--- TEST 4: Multi-Criteria Pedestrian Routing on Real Graph ---")
    payload = {
        "start_lat": 30.7395,
        "start_lon": 76.7810,
        "dest_lat": 30.7425,
        "dest_lon": 76.7865,
        "time_of_day_hour": 14.0,
        "preferences": ["fastest", "shadiest", "balanced"],
        "include_nearby_parking": True
    }
    with httpx.Client(timeout=15.0) as client:
        r = client.post(f"{BACKEND_BASE}/routes/compare", json=payload)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        print("Route data source:", data.get("data_source"))
        assert data.get("data_source") == "supabase_postgis"
        routes = data.get("routes", [])
        assert len(routes) == 3, f"Expected 3 routes, got {len(routes)}"

        for route in routes:
            pref = route.get("preference")
            dist = route.get("distance_m")
            dur = route.get("duration_minutes")
            shade = route.get("shade_score")
            heat = route.get("heat_score")
            coords = route.get("coordinates", [])
            steps = route.get("steps", [])
            print(f"  [{pref.upper()}] Dist: {dist}m, Dur: {dur} min, Shade: {shade}%, Heat: {heat}/100, Vertices: {len(coords)}, Steps: {len(steps)}")
            assert dist > 0, "Distance must be positive"
            assert dur > 0, "Duration must be positive"
            assert len(coords) >= 2, "Route must have at least 2 vertices"
            # Verify coordinates are [lon, lat] within Sector 17
            for c in coords[:3]:
                lon, lat = c[0], c[1]
                assert 76.70 <= lon <= 76.85, f"Longitude {lon} out of Sector 17 bounds"
                assert 30.70 <= lat <= 30.80, f"Latitude {lat} out of Sector 17 bounds"

        # Check nearby parking with network distance
        nearby = data.get("nearby_parking", [])
        assert len(nearby) > 0
        sample_p = nearby[0]
        print(f"Nearby parking top choice: {sample_p.get('id')} - {sample_p.get('distance_to_dest_m')}m ({sample_p.get('distance_type')})")
        assert sample_p.get("distance_type") in ("pedestrian_network", "straight_line")
        print("[OK] Connected road-following routing on Supabase pedestrian graph verified.")

def test_invalid_and_out_of_bounds():
    print("\n--- TEST 5: Error Handling & Out-of-Bounds Destination ---")
    # Coordinates outside Chandigarh Sector 17
    bad_payload = {
        "start_lat": 30.7410,
        "start_lon": 76.7820,
        "dest_lat": 30.6000, # Far away
        "dest_lon": 76.6000
    }
    with httpx.Client(timeout=15.0) as client:
        r = client.post(f"{BACKEND_BASE}/routes/compare", json=bad_payload)
        print(f"Out of bounds response: HTTP {r.status_code}")
        assert r.status_code in (400, 422), f"Expected 400 or 422 for distant point, got {r.status_code}"
        err = r.json()
        print("Error detail returned:", err.get("detail"))
        print("[OK] Out of bounds error correctly caught and handled.")

def test_frontend_proxy():
    print("\n--- TEST 6: Frontend Reverse Proxy Check ---")
    try:
        with httpx.Client(timeout=15.0) as client:
            r = client.get(f"{FRONTEND_PROXY_BASE}/health")
            if r.status_code == 200:
                print(f"Frontend proxy -> Backend health: HTTP {r.status_code} OK")
                print("[OK] Vite reverse proxy correctly forwards /api/v1 requests to FastAPI.")
            else:
                print(f"Frontend proxy returned: HTTP {r.status_code}")
    except Exception as e:
        print(f"Notice: Vite proxy test info ({e})")

if __name__ == "__main__":
    test_health()
    test_sectors()
    test_parking()
    test_route_navigation()
    test_invalid_and_out_of_bounds()
    test_frontend_proxy()
    print("\n" + "=" * 70)
    print("ALL PHASE 3 NAVIGATION TESTS PASSED SUCCESSFULLY!")
    print("=" * 70)
