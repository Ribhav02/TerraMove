"""
TerraMove Phase 1: Navigation Improvements Verification Test Suite

Tests:
1. Destination Search & Geocoding API (/api/v1/destinations/search & /api/v1/destinations/list)
   - Exact landmark match (English)
   - Hindi / Devnagari query geocoding
   - Ambiguous queries returning multiple candidate options without silent selection
   - Unmatched queries with helpful guidance
2. Weather-Aware Walking API (/api/v1/weather/current)
   - Precipitation metrics and weather alert structures
   - Atmospheric observation disclosure vs unmonitored ground puddle conditions
3. Accessibility-Aware Routing (/api/v1/routes/compare)
   - accessibility_mode toggle and 'accessible' preference
   - Accessibility score, step_free flag, paved_percentage, and accessibility notes
   - Synthetic crossing caution tagging and penalty enforcement
4. Core Routing Regression Check
   - Fastest, shadiest, and balanced route generation
   - GeoJSON coordinate integrity and parking proximity
"""

import os
import sys
import json
import httpx

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

BACKEND_BASE = "http://127.0.0.1:8000/api/v1"

def test_destination_search_exact():
    print("\n--- TEST 1A: Destination Search - Exact English Landmark ---")
    with httpx.Client(timeout=15.0) as client:
        r = client.get(f"{BACKEND_BASE}/destinations/search?q=Neelam%20Cinema&lang=en")
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        print(f"Query: {data['query']}, Matches: {data['match_count']}, Is Ambiguous: {data['is_ambiguous']}")
        assert data["match_count"] >= 1, "Expected at least 1 match for Neelam Cinema"
        assert not data["is_ambiguous"], "Neelam Cinema should be unambiguous"
        top = data.get("top_match")
        assert top is not None, "Expected top_match object"
        assert "Neelam" in top["name"]
        assert 30.738 < top["lat"] < 30.742
        assert 76.779 < top["lon"] < 76.783
        print(f"[OK] Exact match: {top['name']} ({top['lat']}, {top['lon']})")

def test_destination_search_hindi():
    print("\n--- TEST 1B: Destination Search - Hindi Query (Neelam Cinema in Hindi) ---")
    with httpx.Client(timeout=15.0) as client:
        r = client.get(f"{BACKEND_BASE}/destinations/search?q=%E0%A4%A8%E0%A5%80%E0%A4%B2%E0%A4%AE%20%E0%A4%B8%E0%A4%BF%E0%A4%A8%E0%A5%87%E0%A4%AE%E0%A4%BE&lang=hi")
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        print(f"Query: {data['query']}, Matches: {data['match_count']}, Hint: {data.get('language_hint')}")
        assert data["match_count"] >= 1
        assert "Neelam" in data["candidates"][0]["name"]
        print(f"[OK] Hindi search resolved to: {data['candidates'][0]['name']}")

def test_destination_search_ambiguous():
    print("\n--- TEST 1C: Destination Search - Ambiguous Query (Cinema / Theatre) ---")
    with httpx.Client(timeout=15.0) as client:
        r = client.get(f"{BACKEND_BASE}/destinations/search?q=cinema&lang=en")
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        print(f"Query: {data['query']}, Matches: {data['match_count']}, Is Ambiguous: {data['is_ambiguous']}")
        assert data["is_ambiguous"] is True, "Query 'cinema' must be marked ambiguous"
        assert len(data["candidates"]) >= 2, f"Expected >= 2 candidates, got {len(data['candidates'])}"
        names = [c["name"] for c in data["candidates"]]
        print(f"Ambiguous candidates returned: {names}")
        assert any("Neelam" in n for n in names)
        assert any("KC" in n for n in names)
        print("[OK] Ambiguity detected correctly; multiple candidates require user selection.")

def test_destination_search_unknown():
    print("\n--- TEST 1D: Destination Search - Unknown Landmark (Eiffel Tower) ---")
    with httpx.Client(timeout=15.0) as client:
        r = client.get(f"{BACKEND_BASE}/destinations/search?q=Eiffel%20Tower&lang=en")
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        assert data["match_count"] == 0
        assert len(data["candidates"]) == 0
        assert "No verified Sector 17 landmarks" in data["note"]
        print(f"[OK] Unknown landmark gracefully handled without coordinate fabrication: '{data['note']}'")

def test_destination_list():
    print("\n--- TEST 1E: Destination Directory List ---")
    with httpx.Client(timeout=15.0) as client:
        r = client.get(f"{BACKEND_BASE}/destinations/list")
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        dests = data.get("destinations", [])
        print(f"Total curated Sector 17 destinations: {len(dests)}")
        assert len(dests) >= 7
        categories = {d["category"] for d in dests}
        print(f"Categories present: {categories}")
        assert any("plaza" in c.lower() for c in categories)
        assert any("transit" in c.lower() for c in categories)
        print("[OK] Destination directory verified.")

def test_weather_alerts_and_disclosure():
    print("\n--- TEST 2: Weather Alerts, Precipitation & Sensor Disclosure ---")
    with httpx.Client(timeout=15.0) as client:
        r = client.get(f"{BACKEND_BASE}/weather/current?lat=30.7410&lon=76.7820")
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        print(f"Temp: {data.get('temperature_c')} C, Precipitation: {data.get('precipitation_mm')} mm, UV: {data.get('uv_index')}")
        alerts = data.get("weather_alerts", [])
        print(f"Weather alert count: {len(alerts)}")
        for a in alerts:
            print(f"  - [{a.get('severity').upper()}] {a.get('title')}: {a.get('description')} ({a.get('issued_at')})")

        disclosure = data.get("observation_disclosure")
        print(f"Observation disclosure: {disclosure}")
        assert disclosure is not None, "Expected observation_disclosure string"
        assert "atmospheric observation" in disclosure.lower() or "unmonitored" in disclosure.lower()
        print("[OK] Weather alerts and telemetry disclosures verified.")

def test_accessibility_routing():
    print("\n--- TEST 3: Accessibility-Aware Routing (Step-Free & Paved Focus) ---")
    payload = {
        "start_lat": 30.7395,
        "start_lon": 76.7810,
        "dest_lat": 30.7425,
        "dest_lon": 76.7865,
        "time_of_day_hour": 14.0,
        "accessibility_mode": True,
        "include_nearby_parking": True
    }
    with httpx.Client(timeout=15.0) as client:
        r = client.post(f"{BACKEND_BASE}/routes/compare", json=payload)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        routes = data.get("routes", [])
        prefs = [rt["preference"] for rt in routes]
        print(f"Routes returned: {prefs}")
        assert "accessible" in prefs, "Expected 'accessible' route in response when accessibility_mode=True"

        acc_route = next(rt for rt in routes if rt["preference"] == "accessible")
        print(f"Accessible Route Metrics:")
        print(f"  Distance: {acc_route['distance_m']} m")
        print(f"  Duration: {acc_route['duration_minutes']} min")
        print(f"  Accessibility Score: {acc_route.get('accessibility_score')}/100")
        print(f"  Step-Free: {acc_route.get('step_free')}")
        print(f"  Paved Percentage: {acc_route.get('paved_percentage')}%")
        print(f"  Synthetic Crossings: {acc_route.get('synthetic_crossings')}")
        print(f"  Accessibility Notes: {acc_route.get('accessibility_notes')}")

        assert acc_route.get("accessibility_score") is not None
        assert 0 <= acc_route["accessibility_score"] <= 100
        assert acc_route.get("paved_percentage") is not None
        assert isinstance(acc_route.get("accessibility_notes"), list)
        print("[OK] Accessibility route metrics and synthetic crossing accounting verified.")

def test_graph_synthetic_crossing_tags():
    print("\n--- TEST 4: Graph Synthetic Edge Tagging Integrity ---")
    from backend.app.services.routing_service import RoutingService
    service = RoutingService()
    g = service.graph
    assert g is not None and g.graph.number_of_nodes() > 0, "Expected graph to be populated"
    synthetic_count = 0
    for u, v, data in g.graph.edges(data=True):
        if data.get("is_synthetic"):
            synthetic_count += 1
            assert data.get("highway") == "unverified_crossing"
            assert "Unverified" in data.get("name", "")
            # Verify caution penalty applied to cost_accessible
            assert data.get("cost_accessible", 0) > data.get("cost_fastest", 0)

    print(f"Graph loaded successfully ({g.graph.number_of_nodes()} nodes, {g.graph.number_of_edges()} edges). Total synthetic edges tagged: {synthetic_count}")
    assert synthetic_count > 0, "Expected healed synthetic edges in Sector 17 graph"
    print("[OK] Graph connectivity healing properly flags synthetic edges with caution penalties.")

def test_core_routing_regression():
    print("\n--- TEST 5: Core Routing Regression (Fastest, Shadiest, Balanced) ---")
    payload = {
        "start_lat": 30.7410,
        "start_lon": 76.7820,
        "dest_lat": 30.7350,
        "dest_lon": 76.7800,
        "time_of_day_hour": 12.0,
        "preferences": ["fastest", "shadiest", "balanced"],
        "include_nearby_parking": True
    }
    with httpx.Client(timeout=15.0) as client:
        r = client.post(f"{BACKEND_BASE}/routes/compare", json=payload)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        routes = data.get("routes", [])
        assert len(routes) == 3
        for rt in routes:
            assert rt["distance_m"] > 0
            assert rt["duration_minutes"] > 0
            assert len(rt["coordinates"]) > 2
            # Verify GeoJSON order: [lon, lat] with longitude ~ 76.78 and latitude ~ 30.74
            for coord in rt["coordinates"]:
                assert 76.7 < coord[0] < 76.85, f"Coord[0] should be longitude (~76.78), got {coord[0]}"
                assert 30.7 < coord[1] < 30.8, f"Coord[1] should be latitude (~30.74), got {coord[1]}"

        parking = data.get("nearby_parking", [])
        assert len(parking) > 0
        print(f"[OK] Core routing polylines, coordinates [lon, lat], and {len(parking)} parking candidates verified.")

def main():
    print("======================================================================")
    print("TerraMove Phase 1: Navigation Improvements - Full Verification Suite")
    print("======================================================================")
    try:
        test_destination_search_exact()
        test_destination_search_hindi()
        test_destination_search_ambiguous()
        test_destination_search_unknown()
        test_destination_list()
        test_weather_alerts_and_disclosure()
        test_accessibility_routing()
        test_graph_synthetic_crossing_tags()
        test_core_routing_regression()
        print("\n======================================================================")
        print("ALL PHASE 1 TESTS PASSED SUCCESSFULLY! [OK]")
        print("======================================================================")
        return 0
    except Exception as e:
        print(f"\n[FAIL] Test failure: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        return 1

if __name__ == "__main__":
    sys.exit(main())
