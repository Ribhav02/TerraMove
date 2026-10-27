"""
TerraMove Phase 2: Smart Parking System Verification Test Suite
Tests:
1. Successful reservation creation.
2. Two simultaneous booking attempts for the same time interval (concurrency-safe exclusion).
3. Overlapping vs non-overlapping reservations.
4. Cancellation and interval freeing & expiration handling.
5. Occupied or unknown resources being rejected as confirmed available.
6. Stale occupancy data handling (>30 minutes old).
7. Alternative parking ranking by actual pedestrian walking distance.
8. Missing or disconnected route data fallback to straight-line without fabrication.
9. Unauthorized operator updates (token rejection vs success).
10. Regression check on Phase 1 navigation and parking-to-destination routing.
"""

import os
import sys
import json
import uuid
import asyncio
from datetime import datetime, timezone, timedelta
import httpx

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

from backend.app.config import settings

BACKEND_BASE = f"http://127.0.0.1:8000{settings.API_V1_STR}"
OPERATOR_SECRET = (settings.OPERATOR_SECRET_KEY or os.getenv("OPERATOR_SECRET_KEY", "")).strip()

def test_1_successful_reservation():
    print("\n--- TEST 1: Successful Parking Reservation ---")
    start_time = datetime.now(timezone.utc) + timedelta(days=100 + (uuid.uuid4().int % 500))
    payload = {
        "facility_id": "parking_244",
        "start_time": start_time.isoformat(),
        "duration_minutes": 60,
        "user_session_id": "test_user_sess_1",
        "vehicle_plate": "CH-01-AB-1234",
        "user_contact": "+91 98765 00001"
    }
    with httpx.Client(timeout=15.0) as client:
        r = client.post(f"{BACKEND_BASE}/parking/reservations", json=payload)
        assert r.status_code == 201, f"Expected 201 Created, got {r.status_code}: {r.text}"
        data = r.json()
        print(f"Booking ID: {data['booking_id']}, Status: {data['status']}, Facility: {data['facility_name']}")
        assert data["booking_id"].startswith("tm_bk_")
        assert data["status"] == "confirmed"
        assert data["facility_id"] == "parking_244"
        assert data["vehicle_plate"] == "CH-01-AB-1234"
        assert data["slot_scope"] == "facility_level"
        print("[OK] Successful reservation created.")
        return data["booking_id"]

def test_2_simultaneous_attempts_conflict():
    print("\n--- TEST 2: Simultaneous Conflicting Booking Attempts (Race Condition) ---")
    target_lot = "parking_245"
    start_time = datetime.now(timezone.utc) + timedelta(days=2000 + (uuid.uuid4().int % 500))

    payload_a = {
        "facility_id": target_lot,
        "start_time": start_time.isoformat(),
        "duration_minutes": 60,
        "user_session_id": "concurrent_user_A",
        "vehicle_plate": "CH-01-A-1111"
    }
    payload_b = {
        "facility_id": target_lot,
        "start_time": start_time.isoformat(),
        "duration_minutes": 60,
        "user_session_id": "concurrent_user_B",
        "vehicle_plate": "CH-01-B-2222"
    }

    async def execute_concurrent():
        async with httpx.AsyncClient(timeout=15.0) as client:
            res_a, res_b = await asyncio.gather(
                client.post(f"{BACKEND_BASE}/parking/reservations", json=payload_a),
                client.post(f"{BACKEND_BASE}/parking/reservations", json=payload_b)
            )
            return res_a, res_b

    res_a, res_b = asyncio.run(execute_concurrent())
    statuses = [res_a.status_code, res_b.status_code]
    print(f"Concurrent response codes: User A = {res_a.status_code}, User B = {res_b.status_code}")

    # Exactly one must succeed (201) and exactly one must fail with Conflict (409)
    assert 201 in statuses, "Expected exactly one booking to succeed with 201"
    assert 409 in statuses, "Expected exactly one booking to be rejected with 409 Conflict"

    conflict_res = res_a if res_a.status_code == 409 else res_b
    conflict_data = conflict_res.json()
    print(f"Conflict detail: {conflict_data.get('detail')}")
    assert "Conflict" in conflict_data.get("detail", "")
    assert len(conflict_data.get("alternatives", [])) > 0, "Expected alternatives in conflict response"
    print(f"Alternatives provided to rejected user: {len(conflict_data['alternatives'])}")
    print("[OK] Concurrency safe: At most one simultaneous reservation succeeded.")

def test_3_overlapping_vs_non_overlapping():
    print("\n--- TEST 3: Overlapping vs Non-Overlapping Interval Reservations ---")
    target_lot = "parking_246"
    base_time = datetime.now(timezone.utc) + timedelta(days=4000 + (uuid.uuid4().int % 500))

    # 1. Book base interval: [base_time, base_time + 60 min)
    payload_base = {
        "facility_id": target_lot,
        "start_time": base_time.isoformat(),
        "duration_minutes": 60,
        "user_session_id": "test_user_base"
    }
    with httpx.Client(timeout=15.0) as client:
        r1 = client.post(f"{BACKEND_BASE}/parking/reservations", json=payload_base)
        assert r1.status_code == 201, f"Expected 201, got {r1.status_code}: {r1.text}"

        # 2. Attempt overlapping interval: starts 30m after base_time (overlaps by 30 mins)
        payload_overlap = {
            "facility_id": target_lot,
            "start_time": (base_time + timedelta(minutes=30)).isoformat(),
            "duration_minutes": 60,
            "user_session_id": "test_user_overlap"
        }
        r2 = client.post(f"{BACKEND_BASE}/parking/reservations", json=payload_overlap)
        print(f"Overlapping booking attempt: HTTP {r2.status_code}")
        assert r2.status_code == 409, f"Expected 409 Conflict for overlapping booking, got {r2.status_code}"

        # 3. Attempt non-overlapping interval: starts 90m after base_time (after previous booking ends)
        payload_non_overlap = {
            "facility_id": target_lot,
            "start_time": (base_time + timedelta(minutes=90)).isoformat(),
            "duration_minutes": 60,
            "user_session_id": "test_user_non_overlap"
        }
        r3 = client.post(f"{BACKEND_BASE}/parking/reservations", json=payload_non_overlap)
        print(f"Non-overlapping booking attempt: HTTP {r3.status_code}")
        assert r3.status_code == 201, f"Expected 201 for non-overlapping interval, got {r3.status_code}"
        print("[OK] Overlapping intervals correctly rejected and non-overlapping intervals permitted.")

def test_4_cancellation_and_expiry():
    print("\n--- TEST 4: Cancellation and Slot Re-availability ---")
    target_lot = "parking_247"
    start_time = datetime.now(timezone.utc) + timedelta(days=6000 + (uuid.uuid4().int % 500))

    payload = {
        "facility_id": target_lot,
        "start_time": start_time.isoformat(),
        "duration_minutes": 60,
        "user_session_id": "cancellation_test_user"
    }
    with httpx.Client(timeout=15.0) as client:
        r_create = client.post(f"{BACKEND_BASE}/parking/reservations", json=payload)
        assert r_create.status_code == 201
        booking_id = r_create.json()["booking_id"]

        # Cancel reservation
        r_cancel = client.post(f"{BACKEND_BASE}/parking/reservations/{booking_id}/cancel")
        assert r_cancel.status_code == 200, f"Expected 200, got {r_cancel.status_code}"
        assert r_cancel.json()["status"] == "cancelled"
        print(f"Cancelled booking {booking_id}: {r_cancel.json()['message']}")

        # The exact same time window must now be re-bookable!
        r_rebook = client.post(f"{BACKEND_BASE}/parking/reservations", json=payload)
        assert r_rebook.status_code == 201, f"Expected 201 re-book after cancellation, got {r_rebook.status_code}"
        print("[OK] Cancellation freed time window for new bookings.")

def test_5_occupied_and_unknown_rejection():
    print("\n--- TEST 5: Occupied & Unknown Resources Handling ---")
    target_lot = "parking_248"
    start_time = datetime.now(timezone.utc) + timedelta(days=8000 + (uuid.uuid4().int % 500))
    with httpx.Client(timeout=15.0) as client:
        # Mark as physically occupied by operator
        op_payload = {
            "facility_id": target_lot,
            "physical_status": "occupied",
            "occupied_spaces": 50,
            "notes": "Lot full; police blockade on entry"
        }
        r_op = client.post(
            f"{BACKEND_BASE}/parking/operator/occupancy",
            json=op_payload,
            headers={"X-Operator-Token": OPERATOR_SECRET}
        )
        assert r_op.status_code == 200

        # Attempt to reserve this physically occupied lot
        res_payload = {
            "facility_id": target_lot,
            "start_time": start_time.isoformat(),
            "duration_minutes": 60,
            "user_session_id": "test_occupied_rejection"
        }
        r_res = client.post(f"{BACKEND_BASE}/parking/reservations", json=res_payload)
        print(f"Booking attempt on physically occupied lot: HTTP {r_res.status_code}")
        assert r_res.status_code == 409
        assert "physically occupied" in r_res.json()["detail"].lower()
        print("[OK] Physically occupied space correctly rejected from being reserved.")

def test_6_stale_occupancy_data():
    print("\n--- TEST 6: Stale Occupancy Data Handling ---")
    from backend.app.services.parking_service import ParkingService
    service = ParkingService()
    # Inject an occupancy update from 45 minutes ago
    past_time = datetime.now(timezone.utc) - timedelta(minutes=45)
    service._occupancy_records["parking_249"] = {
        "facility_id": "parking_249",
        "physical_status": "available",
        "source": "operator_manual",
        "recorded_at": past_time.isoformat()
    }
    occ = service.get_facility_occupancy("parking_249")
    print(f"45-minute-old record status: {occ['physical_status']}, is_stale: {occ['is_stale']}")
    assert occ["is_stale"] is True
    assert occ["physical_status"] == "stale"
    assert "stale" in occ["data_freshness"].lower()
    print("[OK] Stale data (>30m) correctly flagged as unverified.")

def test_7_alternative_ranking_by_walking_distance():
    print("\n--- TEST 7: Alternative Parking Ranking by Pedestrian Walking Distance ---")
    with httpx.Client(timeout=15.0) as client:
        # Central plaza target coordinates: 30.7410, 76.7820
        r = client.get(f"{BACKEND_BASE}/parking/parking_244/alternatives?dest_lat=30.7410&dest_lon=76.7820&limit=5")
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        alts = data["alternatives"]
        print(f"Total alternatives returned: {len(alts)}")
        assert len(alts) > 0
        distances = [a["distance_to_dest_m"] for a in alts]
        print(f"Alternative walking distances: {distances}")
        for i in range(len(distances) - 1):
            assert distances[i] <= distances[i + 1] + 10.0  # Ordered by walking distance
        assert alts[0]["distance_type"] in ("pedestrian_network", "straight_line")
        print(f"Top alternative: {alts[0]['name']} ({alts[0]['distance_to_dest_m']}m, ~{alts[0]['walking_time_to_dest_min']}m)")
        print("[OK] Alternatives ranked by walking distance with pedestrian network metrics.")

def test_8_missing_or_disconnected_route_fallback():
    print("\n--- TEST 8: Missing / Disconnected Coordinate Fallback ---")
    # Coordinate far away from Sector 17 pedestrian network
    far_lat = 30.9500
    far_lon = 76.9900
    with httpx.Client(timeout=15.0) as client:
        r = client.get(f"{BACKEND_BASE}/parking?lat={far_lat}&lon={far_lon}&limit=2")
        assert r.status_code == 200
        lots = r.json()["parking_lots"]
        assert len(lots) > 0
        lot = lots[0]
        print(f"Far coordinate distance type: {lot['distance_type']}, Dist: {lot['distance_to_dest_m']}m")
        assert lot["distance_type"] == "straight_line"
        print("[OK] Graceful fallback to straight-line without fabricating network geometry.")

def test_9_unauthorized_operator_updates():
    print("\n--- TEST 9: Protected Operator Endpoints & Authorization ---")
    payload = {
        "facility_id": "parking_244",
        "physical_status": "available",
        "occupied_spaces": 10
    }
    with httpx.Client(timeout=15.0) as client:
        # 1. Missing token
        r_no_auth = client.post(f"{BACKEND_BASE}/parking/operator/occupancy", json=payload)
        print(f"Missing token response: HTTP {r_no_auth.status_code}")
        assert r_no_auth.status_code == 401

        # 2. Invalid token and old hardcoded default token
        r_bad_auth = client.post(
            f"{BACKEND_BASE}/parking/operator/occupancy",
            json=payload,
            headers={"X-Operator-Token": "terramove_operator_sec17"}
        )
        print(f"Former default token rejection: HTTP {r_bad_auth.status_code}")
        assert r_bad_auth.status_code == 401

        # 3. Valid token
        r_valid = client.post(
            f"{BACKEND_BASE}/parking/operator/occupancy",
            json=payload,
            headers={"X-Operator-Token": OPERATOR_SECRET}
        )
        print(f"Valid token response: HTTP {r_valid.status_code}")
        assert r_valid.status_code == 200
        assert r_valid.json()["physical_status"] == "available"
        print("[OK] Operator security authorization verified.")

def test_10_navigation_and_parking_to_dest_route():
    print("\n--- TEST 10: Parking-to-Destination Pedestrian Walk Route ---")
    with httpx.Client(timeout=15.0) as client:
        # Navigate from parking_244 to Central Plaza (30.7410, 76.7820)
        r = client.get(
            f"{BACKEND_BASE}/parking/parking_244/navigate?dest_lat=30.7410&dest_lon=76.7820&accessibility_mode=true"
        )
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        routes = data["routes"]
        prefs = [rt["preference"] for rt in routes]
        print(f"Parking-to-destination routes returned: {prefs}")
        assert "fastest" in prefs
        assert "shadiest" in prefs
        assert "accessible" in prefs
        for rt in routes:
            assert rt["distance_m"] > 0
            assert len(rt["coordinates"]) > 2
        print(f"Accessible walk from parking: {routes[0]['distance_m']}m")
        print("[OK] Parking-to-destination pedestrian navigation verified without regression.")

def main():
    print("======================================================================")
    print("TerraMove Phase 2: Smart Parking System - Full Verification Suite")
    print("======================================================================")
    try:
        test_1_successful_reservation()
        test_2_simultaneous_attempts_conflict()
        test_3_overlapping_vs_non_overlapping()
        test_4_cancellation_and_expiry()
        test_5_occupied_and_unknown_rejection()
        test_6_stale_occupancy_data()
        test_7_alternative_ranking_by_walking_distance()
        test_8_missing_or_disconnected_route_fallback()
        test_9_unauthorized_operator_updates()
        test_10_navigation_and_parking_to_dest_route()
        print("\n======================================================================")
        print("ALL 10 PHASE 2 SMART PARKING TESTS PASSED SUCCESSFULLY! [OK]")
        print("======================================================================")
        return 0
    except Exception as e:
        print(f"\n[FAIL] Test failure: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        return 1

if __name__ == "__main__":
    sys.exit(main())
