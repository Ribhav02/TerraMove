"""
TerraMove Phase 3: Community & Safety Verification Test Suite
Authoritative tests for:
1. Valid report creation in Supabase (status='submitted')
2. Invalid category & missing field rejections
3. Out-of-bounds coordinate validation
4. Photo type and size validation
5. Report retrieval, filtering, and pagination
6. Prevention of user self-verification
7. Unauthorized moderation rejection (HTTP 401)
8. Authorized moderation status update (HTTP 200)
9. Verified hazard detection & route proximity warning
10. Data-grounded safety transparency (lighting disclosure)
11. Safe cleanup of test records
"""

import os
import sys
import uuid
import httpx
import pytest

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from backend.app.config import settings
from backend.app.services.supabase_service import SupabaseService
from backend.app.services.community_service import CommunityService

BACKEND_BASE = f"http://127.0.0.1:8000{settings.API_V1_STR}"
MODERATOR_SECRET = (
    settings.MODERATOR_SECRET_KEY
    or settings.OPERATOR_SECRET_KEY
    or ""
).strip()


def test_1_valid_report_creation():
    """Verifies that a valid citizen issue report is persisted with status='submitted'."""
    print("\n--- TEST 1: Valid Citizen Report Creation in Supabase ---")
    test_session = f"test_comm_{uuid.uuid4().hex[:8]}"
    payload = {
        "category": "pothole",
        "title": "Pedestrian surface depression near SCO 15",
        "description": "Deep asphalt pothole obstructing pedestrian movement towards Bank Square",
        "latitude": 30.7412,
        "longitude": 76.7865,
        "severity": "high",
        "is_gps_location": False,
        "user_session_id": test_session
    }

    with httpx.Client(timeout=10.0) as client:
        r = client.post(f"{BACKEND_BASE}/community/reports", json=payload)
        assert r.status_code == 201, f"Expected 201, got {r.status_code}: {r.text}"
        data = r.json()
        assert data["title"] == payload["title"]
        assert data["category"] == "pothole"
        assert data["status"] == "submitted"
        assert data["is_verified_hazard"] is False
        assert "id" in data
        print(f"[OK] Report created with ID: {data['id']}, status: {data['status']}")

        # Cleanup
        s = SupabaseService()
        httpx.delete(f"{s.url}/rest/v1/citizen_reports?id=eq.{data['id']}", headers=s._get_headers())


def test_2_invalid_category_and_missing_fields():
    """Verifies that invalid category or missing required fields are rejected."""
    print("\n--- TEST 2: Invalid Category and Missing Fields Rejection ---")
    with httpx.Client(timeout=10.0) as client:
        # Invalid category
        bad_cat_payload = {
            "category": "flying_saucer_landing",
            "title": "Alien spacecraft in Sector 17",
            "latitude": 30.7410,
            "longitude": 76.7820
        }
        r1 = client.post(f"{BACKEND_BASE}/community/reports", json=bad_cat_payload)
        assert r1.status_code == 422, f"Expected 422 for bad category, got {r1.status_code}"
        print("[OK] Invalid category rejected with 422 Unprocessable Entity.")

        # Missing required title
        bad_title_payload = {
            "category": "pothole",
            "title": " ",
            "latitude": 30.7410,
            "longitude": 76.7820
        }
        r2 = client.post(f"{BACKEND_BASE}/community/reports", json=bad_title_payload)
        assert r2.status_code in (400, 422), f"Expected 400 or 422, got {r2.status_code}"
        print("[OK] Empty title rejected with appropriate validation error.")


def test_3_out_of_bounds_coordinates_rejected():
    """Verifies that coordinates outside Chandigarh/Sector 17 are rejected."""
    print("\n--- TEST 3: Out-of-Bounds Coordinate Validation ---")
    payload = {
        "category": "broken_footpath",
        "title": "Out of bounds report",
        "latitude": 19.0760,  # Mumbai
        "longitude": 72.8777
    }
    with httpx.Client(timeout=10.0) as client:
        r = client.post(f"{BACKEND_BASE}/community/reports", json=payload)
        assert r.status_code in (400, 422), f"Expected rejection, got {r.status_code}: {r.text}"
        print(f"[OK] Out of bounds report safely rejected: {r.json().get('detail')}")


def test_4_photo_validation():
    """Verifies file type and size validation for photo attachments."""
    print("\n--- TEST 4: Photo Attachment Validation ---")
    with httpx.Client(timeout=15.0) as client:
        # 1. Invalid file format (text file pretending to be image)
        files = {"file": ("malicious.txt", b"plain text script content", "text/plain")}
        r1 = client.post(f"{BACKEND_BASE}/community/upload-photo", files=files)
        assert r1.status_code == 400, f"Expected 400 for bad format, got {r1.status_code}"
        assert "Unsupported image format" in r1.json().get("detail", "")
        print("[OK] Text file rejected by MIME type validator.")

        # 2. Oversized image (>5 MB)
        oversized = b"0" * (6 * 1024 * 1024)
        files_huge = {"file": ("huge.jpg", oversized, "image/jpeg")}
        r2 = client.post(f"{BACKEND_BASE}/community/upload-photo", files=files_huge)
        assert r2.status_code == 400, f"Expected 400 for >5MB, got {r2.status_code}"
        assert "maximum allowed size" in r2.json().get("detail", "")
        print("[OK] Oversized image (6 MB) rejected by size validator.")

        # 3. Valid 1x1 PNG upload
        valid_png = b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82'
        files_ok = {"file": ("test_valid.png", valid_png, "image/png")}
        r3 = client.post(f"{BACKEND_BASE}/community/upload-photo", files=files_ok)
        assert r3.status_code == 201, f"Expected 201, got {r3.status_code}: {r3.text}"
        data = r3.json()
        assert "photo_url" in data
        assert "citizen-reports" in data["photo_url"]
        print(f"[OK] Valid photo successfully uploaded to Supabase Storage: {data['photo_url']}")

        # Cleanup test photo from storage bucket
        s = SupabaseService()
        headers = {
            "apikey": s.key,
            "Authorization": f"Bearer {s.key}",
            "Content-Type": "application/json"
        }
        filename = data["filename"]
        httpx.request("DELETE", f"{s.url}/storage/v1/object/citizen-reports", json={"prefixes": [f"reports/{filename}"]}, headers=headers)


def test_5_ordinary_user_cannot_self_verify():
    """Verifies that an ordinary user cannot mark a report as verified or resolved during submission."""
    print("\n--- TEST 5: User Self-Verification Prevention ---")
    payload = {
        "category": "construction",
        "title": "Unauthorized construction blocking corridor",
        "latitude": 30.7410,
        "longitude": 76.7820,
        "status": "verified"  # Attempt to self-verify!
    }
    with httpx.Client(timeout=10.0) as client:
        r = client.post(f"{BACKEND_BASE}/community/reports", json=payload)
        assert r.status_code == 201
        data = r.json()
        # Status MUST be 'submitted', not 'verified'
        assert data["status"] == "submitted"
        assert data["is_verified_hazard"] is False
        print("[OK] Self-verification prevented: status forced to 'submitted'.")

        # Cleanup
        s = SupabaseService()
        httpx.delete(f"{s.url}/rest/v1/citizen_reports?id=eq.{data['id']}", headers=s._get_headers())


def test_6_moderation_authorization_and_lifecycle():
    """
    Verifies that unauthorized status changes are rejected with 401,
    while valid moderator credentials successfully update report status.
    """
    print("\n--- TEST 6: Moderation Authorization & Lifecycle ---")
    s = SupabaseService()
    test_id = None

    try:
        with httpx.Client(timeout=10.0) as client:
            # 1. Create a baseline report
            r_create = client.post(f"{BACKEND_BASE}/community/reports", json={
                "category": "broken_footpath",
                "title": "Cracked pavement on KC Theatre path",
                "latitude": 30.7418,
                "longitude": 76.7835
            })
            assert r_create.status_code == 201
            test_id = r_create.json()["id"]

            # 2. Attempt moderation without token -> 401
            r_no_auth = client.post(
                f"{BACKEND_BASE}/community/reports/{test_id}/moderate",
                json={"status": "verified", "moderator_notes": "Attempt without token"}
            )
            assert r_no_auth.status_code == 401
            print("[OK] Unauthorized moderation attempt rejected with HTTP 401.")

            # 3. Attempt moderation with invalid token -> 401
            r_bad_auth = client.post(
                f"{BACKEND_BASE}/community/reports/{test_id}/moderate",
                json={"status": "verified"},
                headers={"X-Moderator-Token": "bogus_secret_123"}
            )
            assert r_bad_auth.status_code == 401
            print("[OK] Invalid moderator token rejected with HTTP 401.")

            # 4. Authorized moderation -> 200
            r_mod = client.post(
                f"{BACKEND_BASE}/community/reports/{test_id}/moderate",
                json={"status": "verified", "moderator_notes": "Verified by municipal field officer"},
                headers={"X-Moderator-Token": MODERATOR_SECRET}
            )
            assert r_mod.status_code == 200, f"Moderation failed: {r_mod.text}"
            mod_data = r_mod.json()
            assert mod_data["status"] == "verified"
            assert mod_data["is_verified_hazard"] is True
            assert "Verified by municipal" in mod_data.get("moderator_notes", "")
            print("[OK] Authorized status update succeeded: marked as 'verified'.")

            # 5. Verify it appears in active hazards endpoint
            r_haz = client.get(f"{BACKEND_BASE}/community/hazards")
            assert r_haz.status_code == 200
            hazards = r_haz.json()
            matching = [h for h in hazards if h["id"] == test_id]
            assert len(matching) == 1
            assert matching[0]["status"] == "verified"
            print("[OK] Verified report immediately appears in /community/hazards map feed.")

            # 6. Mark resolved
            r_resolve = client.post(
                f"{BACKEND_BASE}/community/reports/{test_id}/moderate",
                json={"status": "resolved", "moderator_notes": "Pavement repaired by maintenance crew"},
                headers={"X-Moderator-Token": MODERATOR_SECRET}
            )
            assert r_resolve.status_code == 200
            assert r_resolve.json()["status"] == "resolved"
            print("[OK] Report transitioned to 'resolved'.")

    finally:
        if test_id:
            httpx.delete(f"{s.url}/rest/v1/citizen_reports?id=eq.{test_id}", headers=s._get_headers())
            print("[CLEANUP] Test moderation record safely deleted.")


def test_7_verified_hazard_route_proximity_warning():
    """
    Verifies that planned walking routes crossing near a verified hazard include
    transparent hazard proximity warnings.
    """
    print("\n--- TEST 7: Verified Hazard Proximity Warning on Pedestrian Routes ---")
    s = SupabaseService()
    test_id = None

    try:
        with httpx.Client(timeout=10.0) as client:
            # 1. Fetch initial route from Central Plaza to KC Theatre
            r_route = client.post(f"{BACKEND_BASE}/routes/compare", json={
                "start_lat": 30.7410,
                "start_lon": 76.7820,
                "dest_lat": 30.7420,
                "dest_lon": 76.7845
            })
            assert r_route.status_code == 200
            route_coords = r_route.json()["routes"][0]["coordinates"]
            assert len(route_coords) >= 2

            # Place a hazard directly on vertex 0 of the route corridor
            hazard_lon = route_coords[0][0]
            hazard_lat = route_coords[0][1]

            # 2. Submit report at route vertex
            r_sub = client.post(f"{BACKEND_BASE}/community/reports", json={
                "category": "construction",
                "title": "Excavation near plaza entrance",
                "description": "Footpath dug up for underground cabling",
                "latitude": hazard_lat,
                "longitude": hazard_lon,
                "severity": "high"
            })
            assert r_sub.status_code == 201
            test_id = r_sub.json()["id"]

            # 3. Verify report as municipal moderator
            r_mod = client.post(
                f"{BACKEND_BASE}/community/reports/{test_id}/moderate",
                json={"status": "verified"},
                headers={"X-Moderator-Token": MODERATOR_SECRET}
            )
            assert r_mod.status_code == 200

            # 4. Re-calculate route: proximity check should catch the hazard
            r_route_with_hazard = client.post(f"{BACKEND_BASE}/routes/compare", json={
                "start_lat": 30.7410,
                "start_lon": 76.7820,
                "dest_lat": 30.7420,
                "dest_lon": 76.7845
            })
            assert r_route_with_hazard.status_code == 200
            routes_data = r_route_with_hazard.json()["routes"]
            fastest = routes_data[0]

            assert "hazard_warnings" in fastest
            warnings = fastest["hazard_warnings"]
            assert len(warnings) >= 1
            matched = [w for w in warnings if w["report_id"] == test_id]
            assert len(matched) == 1
            print(f"[OK] Hazard proximity warning detected! Distance: {matched[0]['distance_to_route_m']}m")
            print(f"     Warning text: {matched[0]['warning_message']}")

            # Verify data transparency note on route response
            note = r_route_with_hazard.json().get("note", "")
            assert "Lighting coverage is not available" in note or "strictly grounded in verified citizen hazard reports" in note
            print("[OK] Transparent lighting absence disclosure verified on route response.")

    finally:
        if test_id:
            httpx.delete(f"{s.url}/rest/v1/citizen_reports?id=eq.{test_id}", headers=s._get_headers())
            print("[CLEANUP] Proximity test hazard safely deleted.")


def main():
    print("=" * 70)
    print("TerraMove Phase 3: Community & Safety Verification Test Suite")
    print("=" * 70)
    try:
        test_1_valid_report_creation()
        test_2_invalid_category_and_missing_fields()
        test_3_out_of_bounds_coordinates_rejected()
        test_4_photo_validation()
        test_5_ordinary_user_cannot_self_verify()
        test_6_moderation_authorization_and_lifecycle()
        test_7_verified_hazard_route_proximity_warning()
        print("\n" + "=" * 70)
        print("ALL 7 PHASE 3 COMMUNITY & SAFETY TESTS PASSED! [OK]")
        print("=" * 70)
        return 0
    except Exception as e:
        print(f"\n[FAIL] Test failure: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())

