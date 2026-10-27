from fastapi import APIRouter, HTTPException
from backend.app.services.supabase_service import SupabaseService

router = APIRouter()
_supabase_service = SupabaseService()

@router.get("/sectors")
async def get_sectors():
    try:
        boundary_feature, source = _supabase_service.fetch_sector_boundary()
        if boundary_feature.get("type") == "Feature":
            geojson = {
                "type": "FeatureCollection",
                "features": [boundary_feature]
            }
        else:
            geojson = boundary_feature

        return {
            "pilot_sector": "Sector 17",
            "city": "Chandigarh",
            "country": "India",
            "center": [30.7410, 76.7820],
            "data_source": source,
            "geojson": geojson
        }
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Sector 17 boundary data not found: {str(e)}")
