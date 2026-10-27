from fastapi import APIRouter
from backend.app.config import settings
from backend.app.services.supabase_service import SupabaseService

router = APIRouter()
_supabase_service = SupabaseService()

@router.get("/health")
async def health_check():
    db_status = await _supabase_service.check_database_status_async()
    db_connected = db_status.get("status") == "connected"

    boundary_exists = settings.SECTOR17_BOUNDARY_PATH.exists() or db_connected
    network_exists = settings.PEDESTRIAN_NETWORK_PATH.exists() or db_connected
    parking_exists = settings.PARKING_PATH.exists() or db_connected
    buildings_exists = settings.BUILDINGS_PATH.exists() or db_connected

    status_str = "loaded (supabase_postgis)" if db_connected else "loaded (local_file)"

    return {
        "status": "healthy",
        "service": "TerraMove AI Mobility Engine",
        "pilot_area": "Sector 17, Chandigarh, India",
        "version": "1.0.0-mvp",
        "database": db_status,
        "data_status": {
            "sector_boundary": status_str if boundary_exists else "missing",
            "pedestrian_network": status_str if network_exists else "missing",
            "parking_records": status_str if parking_exists else "missing",
            "buildings": status_str if buildings_exists else "missing"
        }
    }
