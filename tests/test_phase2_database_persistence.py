"""
TerraMove Phase 2: Database Persistence & Exclusion Constraint Test Suite
Authoritative PostgreSQL / Supabase Integration Testing

Includes both:
- Part A: Unit Contract Tests (Mocks) to test network failures and table missing error mappings
- Part B: Live Supabase Integration Tests (Real Database) to verify actual PostgreSQL constraints and persistence
"""

import os
import sys
import uuid
import random
from datetime import datetime, timezone, timedelta
from unittest.mock import MagicMock
import httpx
import pytest

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from backend.app.config import settings
from backend.app.services.supabase_service import (
    SupabaseService,
    DatabaseTableMissingException,
    DatabaseExclusionConflictException,
    DatabaseOperationException
)
from backend.app.services.parking_service import ParkingService, ParkingConflictException

BACKEND_BASE = f"http://127.0.0.1:8000{settings.API_V1_STR}"
OPERATOR_SECRET = (settings.OPERATOR_SECRET_KEY or os.getenv("OPERATOR_SECRET_KEY", "")).strip()


# =====================================================================
# PART A: MOCK-BASED CONTRACT & RESILIENCE TESTS (UNIT TESTS)
# =====================================================================

def test_mock_missing_table_handling():
    """
    [MOCK] Verifies that when a table is missing, DatabaseTableMissingException is raised
    and the service does NOT silently fall back to local disk storage (Requirement 8).
    """
    print("\n[MOCK] TEST 1: Missing Table Detection on Mocked Supabase (Requirement 8)")
    mock_supabase = MagicMock(spec=SupabaseService)
    mock_supabase.is_configured = True
    mock_supabase.fetch_parking_locations.return_value = (
        [{"id": "fac_uuid_1", "source_row": 244, "name": "Chandigarh", "latitude": 30.74, "longitude": 76.78}],
        "supabase_postgis"
    )
    mock_supabase.fetch_latest_occupancy_records.return_value = {}
    mock_supabase.fetch_active_reservations.return_value = []
    mock_supabase.insert_parking_reservation.side_effect = DatabaseTableMissingException(
        "parking_reservations", "Table public.parking_reservations does not exist."
    )

    service = ParkingService(supabase_service=mock_supabase)
    service._reservations.clear()
    start_time = datetime.now(timezone.utc) + timedelta(hours=2)

    with pytest.raises(DatabaseTableMissingException) as exc_info:
        service.create_reservation(
            facility_id="parking_244",
            start_time=start_time,
            duration_minutes=60,
            user_session_id="test_missing_user"
        )

    assert "parking_reservations" in str(exc_info.value)
    assert len(service._reservations) == 0
    print("[MOCK OK] Missing table raises DatabaseTableMissingException; zero silent fallback.")


def test_mock_database_failure_no_silent_fallback():
    """
    [MOCK] Verifies that when database network fails or RLS denies access,
    the service raises DatabaseOperationException rather than silently writing to disk.
    """
    print("\n[MOCK] TEST 2: Database Operation Failure Handling (No Silent Fallback)")
    mock_supabase = MagicMock(spec=SupabaseService)
    mock_supabase.is_configured = True
    mock_supabase.fetch_parking_locations.return_value = (
        [{"id": "fac_uuid_1", "source_row": 244, "name": "Chandigarh", "latitude": 30.74, "longitude": 76.78}],
        "supabase_postgis"
    )
    mock_supabase.fetch_latest_occupancy_records.return_value = {}
    mock_supabase.fetch_active_reservations.return_value = []
    mock_supabase.insert_parking_reservation.side_effect = DatabaseOperationException(
        "Database connection error: Network unreachable"
    )

    service = ParkingService(supabase_service=mock_supabase)
    service._reservations.clear()
    start_time = datetime.now(timezone.utc) + timedelta(hours=3)

    with pytest.raises(DatabaseOperationException) as exc_info:
        service.create_reservation(
            facility_id="parking_244",
            start_time=start_time,
            duration_minutes=60,
            user_session_id="test_fail_user"
        )

    assert "Database connection error" in str(exc_info.value)
    assert len(service._reservations) == 0
    print("[MOCK OK] Database failures fail safely; local storage is not silently used.")


def test_mock_exclusion_constraint_mapping():
    """
    [MOCK] Verifies that when Supabase PostgreSQL raises 23P01 (exclusion constraint violation),
    the service maps it to ParkingConflictException with nearest available alternatives.
    """
    print("\n[MOCK] TEST 3: PostgreSQL Exclusion Constraint (23P01) -> 409 Mapping")
    mock_supabase = MagicMock(spec=SupabaseService)
    mock_supabase.is_configured = True
    mock_supabase.fetch_parking_locations.return_value = (
        [
            {"id": "fac_uuid_1", "source_row": 244, "name": "Chandigarh", "latitude": 30.7410, "longitude": 76.7820, "total_capacity": 200},
            {"id": "fac_uuid_2", "source_row": 235, "name": "Sector 17 East", "latitude": 30.7420, "longitude": 76.7830, "total_capacity": 100}
        ],
        "supabase_postgis"
    )
    mock_supabase.fetch_latest_occupancy_records.return_value = {}
    mock_supabase.fetch_active_reservations.return_value = []
    mock_supabase.insert_parking_reservation.side_effect = DatabaseExclusionConflictException(
        message="Database exclusion constraint violation: Overlapping confirmed reservation exists.",
        details='Key conflicts with "uq_no_overlapping_confirmed_reservations".'
    )

    service = ParkingService(supabase_service=mock_supabase)
    start_time = datetime.now(timezone.utc) + timedelta(hours=2)

    with pytest.raises(ParkingConflictException) as exc_info:
        service.create_reservation(
            facility_id="parking_244",
            start_time=start_time,
            duration_minutes=60,
            user_session_id="test_concurrent_user"
        )

    conflict = exc_info.value
    assert "PostgreSQL exclusion constraint violation" in conflict.message
    assert len(conflict.alternatives) > 0
    assert conflict.facility_id == "parking_244"
    print(f"[MOCK OK] 23P01 converted to conflict with {len(conflict.alternatives)} alternatives.")


# =====================================================================
# PART B: REAL SUPABASE DATABASE INTEGRATION TESTS (LIVE POSTGRESQL)
# =====================================================================

def test_real_db_suite():
    """
    [REAL DATABASE - SUPABASE] Full end-to-end integration test against live Supabase PostgreSQL.
    Verifies:
    1. Table existence and RLS
    2. Reservation creation in real database
    3. PostgreSQL exclusion constraint rejection (23P01 -> HTTP 409)
    4. Retrieval of reservations for session
    5. Cancellation of reservation releasing time slot
    6. Operator occupancy update with authentication
    7. Priority of physical occupancy over cancellation (Requirement 8)
    8. Safe cleanup of test records
    """
    print("\n" + "=" * 70)
    print("[REAL DATABASE - SUPABASE] Executing Live PostgreSQL Integration Tests")
    print("=" * 70)

    s = SupabaseService()
    if not s.is_configured:
        pytest.skip("Supabase is not configured on backend; skipping live database tests.")

    headers = s._get_headers()
    target_facility = "parking_230"
    test_session = f"test_suite_{uuid.uuid4().hex[:8]}"
    random_days = random.randint(500, 900)
    start_time = datetime.now(timezone.utc) + timedelta(days=random_days)
    duration = 60

    try:
        with httpx.Client(timeout=15.0) as client:
            # 1. Verify tables exist in Supabase PostgREST
            print("\n[REAL DB] 1. Verifying tables exist in Supabase...")
            r_res_tbl = httpx.get(f"{s.url}/rest/v1/parking_reservations?limit=1", headers=headers)
            assert r_res_tbl.status_code == 200, f"parking_reservations query failed: {r_res_tbl.text}"
            r_occ_tbl = httpx.get(f"{s.url}/rest/v1/parking_occupancy_records?limit=1", headers=headers)
            assert r_occ_tbl.status_code == 200, f"parking_occupancy_records query failed: {r_occ_tbl.text}"
            print("[REAL DB OK] Both 'parking_reservations' and 'parking_occupancy_records' exist and respond HTTP 200.")

            # 2. Real Reservation Creation via FastAPI -> Supabase
            print("\n[REAL DB] 2. Creating real reservation via API in Supabase...")
            payload = {
                "facility_id": target_facility,
                "start_time": start_time.isoformat(),
                "duration_minutes": duration,
                "user_session_id": test_session,
                "vehicle_plate": "CH-01-TEST-1",
                "user_contact": "+91 98765 43210"
            }
            r1 = client.post(f"{BACKEND_BASE}/parking/reservations", json=payload)
            assert r1.status_code == 201, f"Failed: {r1.text}"
            booking_1 = r1.json()
            b1_id = booking_1["booking_id"]
            assert booking_1["status"] == "confirmed"
            print(f"[REAL DB OK] Reservation persisted in Supabase: ID={b1_id}, status={booking_1['status']}")

            # 3. Real Exclusion Constraint Rejection (23P01 -> HTTP 409)
            print("\n[REAL DB] 3. Verifying PostgreSQL exclusion constraint (23P01) rejects overlapping booking...")
            overlap_start = start_time + timedelta(minutes=30)
            payload_conflict = {
                "facility_id": target_facility,
                "start_time": overlap_start.isoformat(),
                "duration_minutes": duration,
                "user_session_id": f"{test_session}_alt",
                "vehicle_plate": "CH-01-TEST-2"
            }
            r2 = client.post(f"{BACKEND_BASE}/parking/reservations", json=payload_conflict)
            assert r2.status_code == 409, f"Expected 409, got {r2.status_code}: {r2.text}"
            conflict_json = r2.json()
            assert "PostgreSQL exclusion constraint violation" in conflict_json["detail"]
            assert len(conflict_json.get("alternatives", [])) > 0
            print(f"[REAL DB OK] Overlapping booking rejected by PostgreSQL exclusion constraint (HTTP 409).")
            print(f"            Top alternative: {conflict_json['alternatives'][0]['name']} ({conflict_json['alternatives'][0]['distance_to_dest_m']}m walk)")

            # 4. List user reservations from real Supabase table
            print("\n[REAL DB] 4. Retrieving user reservations from Supabase...")
            r_list = client.get(f"{BACKEND_BASE}/parking/reservations?session_id={test_session}")
            assert r_list.status_code == 200
            user_bookings = r_list.json()["reservations"]
            assert len(user_bookings) >= 1
            assert user_bookings[0]["booking_id"] == b1_id
            print(f"[REAL DB OK] Retrieved {len(user_bookings)} booking(s) directly from Supabase.")

            # 5. Cancel reservation in Supabase
            print("\n[REAL DB] 5. Cancelling reservation in Supabase...")
            r_cancel = client.post(f"{BACKEND_BASE}/parking/reservations/{b1_id}/cancel")
            assert r_cancel.status_code == 200
            assert r_cancel.json()["status"] == "cancelled"
            print(f"[REAL DB OK] Reservation cancelled in Supabase; status updated to 'cancelled'.")

            # 6. Operator occupancy update with security check
            print("\n[REAL DB] 6. Testing operator occupancy update and authentication...")
            op_payload = {
                "facility_id": target_facility,
                "physical_status": "occupied",
                "occupied_spaces": 150,
                "notes": f"Automated test run {test_session}"
            }
            # Unauthorized request
            r_bad = client.post(
                f"{BACKEND_BASE}/parking/operator/occupancy",
                json=op_payload,
                headers={"X-Operator-Token": "bad_token"}
            )
            assert r_bad.status_code == 401
            print("[REAL DB OK] Unauthorized operator token rejected with HTTP 401.")

            # Authorized request
            r_good = client.post(
                f"{BACKEND_BASE}/parking/operator/occupancy",
                json=op_payload,
                headers={"X-Operator-Token": OPERATOR_SECRET}
            )
            assert r_good.status_code == 200
            assert r_good.json()["physical_status"] == "occupied"
            print("[REAL DB OK] Authorized operator occupancy recorded in Supabase.")

            # 7. Priority of physical occupancy over cancellation (Requirement 8)
            print("\n[REAL DB] 7. Verifying physical ground reality overrides booking status...")
            r_detail = client.get(f"{BACKEND_BASE}/parking/{target_facility}")
            assert r_detail.status_code == 200
            detail_data = r_detail.json()
            assert detail_data["availability_status"] == "occupied"
            assert detail_data["physical_occupancy"]["physical_status"] == "occupied"
            print("[REAL DB OK] Physically occupied facility remains 'occupied' even with 0 active bookings.")

    finally:
        # Safe cleanup: only test records created with our session or test note
        print("\n[CLEANUP] Safely removing test records from Supabase...")
        httpx.delete(f"{s.url}/rest/v1/parking_reservations?user_session_id=like.{test_session}*", headers=headers)
        httpx.delete(f"{s.url}/rest/v1/parking_occupancy_records?notes=like.*{test_session}*", headers=headers)
        print("[CLEANUP OK] Real Supabase database test records safely cleaned up.")


def main():
    print("======================================================================")
    print("TerraMove Phase 2: Database Persistence & Exclusion Verification Suite")
    print("======================================================================")
    try:
        # Part A: Mocks for error contract handling
        test_mock_missing_table_handling()
        test_mock_database_failure_no_silent_fallback()
        test_mock_exclusion_constraint_mapping()

        # Part B: Real Supabase Database Integration Tests
        test_real_db_suite()

        print("\n======================================================================")
        print("ALL TESTS (MOCK CONTRACTS + REAL SUPABASE DATABASE) PASSED! [OK]")
        print("======================================================================")
        return 0
    except Exception as e:
        print(f"\n[FAIL] Test failure: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())
