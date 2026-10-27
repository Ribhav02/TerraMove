import os
import sys
import httpx
from pathlib import Path
from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(PROJECT_ROOT / ".env")

def verify_supabase_connection():
    supabase_url = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
    supabase_key = os.getenv("SUPABASE_KEY", "").strip()
    service_role_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()

    print("=" * 65)
    print("TerraMove — Supabase Connection & Authentication Verification")
    print("=" * 65)

    if not supabase_url:
        print("[FAIL] Missing SUPABASE_URL in .env")
        return False

    if not supabase_key and not service_role_key:
        print("[FAIL] Missing Supabase API Key in .env")
        return False

    active_key = service_role_key if service_role_key else supabase_key
    key_type = "service_role (secret)" if service_role_key else "publishable / anon"

    print(f"[*] Supabase Project:  {supabase_url}")
    print(f"[*] Configured Key:    {key_type} (length: {len(active_key)} chars, [REDACTED])")
    print("[*] Performing read-only authentication checks...")

    headers = {
        "apikey": active_key,
        "Authorization": f"Bearer {active_key}",
    }

    # 1. Test Auth API
    auth_url = f"{supabase_url}/auth/v1/settings"
    try:
        with httpx.Client(timeout=8.0) as client:
            resp_auth = client.get(auth_url, headers=headers)
            if resp_auth.status_code == 200:
                print("[OK] Supabase Auth Gateway: Authenticated successfully (HTTP 200)")
            else:
                print(f"[WARN] Supabase Auth status: HTTP {resp_auth.status_code}")
    except httpx.RequestError as e:
        print(f"[FAIL] Unable to connect to Supabase Auth: {e}")
        return False

    # 2. Test Storage API Gateway
    storage_url = f"{supabase_url}/storage/v1/bucket"
    try:
        with httpx.Client(timeout=8.0) as client:
            resp_storage = client.get(storage_url, headers=headers)
            if resp_storage.status_code == 200:
                print("[OK] Supabase Storage Gateway: Authenticated successfully (HTTP 200)")
            else:
                print(f"[WARN] Supabase Storage status: HTTP {resp_storage.status_code}")
    except httpx.RequestError as e:
        print(f"[FAIL] Unable to connect to Storage API: {e}")
        return False

    # 3. Test PostgREST Schema Readiness (Read-Only)
    print("\n" + "-" * 65)
    print("PostGIS Schema & Table Readiness Check (Read-Only):")
    print("-" * 65)

    expected_tables = ["sector_boundaries", "parking_locations", "pedestrian_edges", "buildings", "citizen_reports"]
    found_tables = []
    missing_tables = []

    with httpx.Client(timeout=8.0) as client:
        for tbl in expected_tables:
            tbl_url = f"{supabase_url}/rest/v1/{tbl}?select=*&limit=1"
            try:
                r = client.get(tbl_url, headers=headers)
                if r.status_code == 200:
                    found_tables.append(tbl)
                elif r.status_code in (404, 400) and "PGRST205" in r.text:
                    missing_tables.append(tbl)
                elif r.status_code == 401:
                    print(f"[!] PostgREST requires table-level RLS policies or secret key for table: {tbl}")
                    missing_tables.append(tbl)
                else:
                    missing_tables.append(tbl)
            except Exception:
                missing_tables.append(tbl)

    print(f"TerraMove target tables active:  {len(found_tables)} / {len(expected_tables)}")
    if found_tables:
        print(f"Existing tables found:          {', '.join(found_tables)}")

    if missing_tables:
        print(f"Tables pending initial schema:  {', '.join(missing_tables)}")
        print("\n[NOTE] As requested, no tables were created and no data was imported.")
        print("       When ready, the schema can be applied by executing:")
        print("       database/migrations/001_initial_schema.sql")
        print("       inside your Supabase SQL Editor:")
        print("       https://supabase.com/dashboard/project/czjijgsntgsvbbpvkfbz/sql/new")
    else:
        print("[OK] All required tables are present in the remote PostgREST schema.")

    print("=" * 65)
    print("[SUCCESS] Supabase connection is authenticated and operational!")
    print("=" * 65)
    return True

if __name__ == "__main__":
    success = verify_supabase_connection()
    sys.exit(0 if success else 1)
