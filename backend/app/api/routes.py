from typing import Optional
from fastapi import APIRouter, HTTPException, Query
from backend.app.schemas.routes import RouteCompareRequest, RouteCompareResponse
from backend.app.services.routing_service import RoutingService

router = APIRouter()
_routing_service: RoutingService = None

def get_routing_service() -> RoutingService:
    global _routing_service
    if _routing_service is None:
        _routing_service = RoutingService()
    return _routing_service

@router.post("/routes/compare", response_model=RouteCompareResponse)
@router.post("/navigation", response_model=RouteCompareResponse)
async def compare_routes(payload: RouteCompareRequest):
    service = get_routing_service()
    try:
        prefs = list(payload.preferences or ["fastest", "shadiest", "balanced"])
        if payload.accessibility_mode and "accessible" not in prefs:
            prefs.append("accessible")

        result = await service.compare_routes(
            start_lat=payload.start_lat,
            start_lon=payload.start_lon,
            dest_lat=payload.dest_lat,
            dest_lon=payload.dest_lon,
            departure_hour=payload.time_of_day_hour or 14.0,
            preferences=prefs,
            include_parking=payload.include_nearby_parking if payload.include_nearby_parking is not None else True
        )
        return result
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Routing error: {str(e)}")

@router.get("/routes/compare", response_model=RouteCompareResponse)
@router.get("/navigation", response_model=RouteCompareResponse)
async def compare_routes_get(
    start_lat: float = Query(..., description="Start latitude"),
    start_lon: float = Query(..., description="Start longitude"),
    dest_lat: float = Query(..., description="Destination latitude"),
    dest_lon: float = Query(..., description="Destination longitude"),
    time_of_day_hour: Optional[float] = Query(14.0, description="Departure hour"),
    include_nearby_parking: bool = Query(True, description="Include nearby parking"),
    accessibility_mode: bool = Query(False, description="Prioritize accessible/step-free route")
):
    service = get_routing_service()
    try:
        prefs = ["fastest", "shadiest", "balanced"]
        if accessibility_mode:
            prefs.append("accessible")

        result = await service.compare_routes(
            start_lat=start_lat,
            start_lon=start_lon,
            dest_lat=dest_lat,
            dest_lon=dest_lon,
            departure_hour=time_of_day_hour or 14.0,
            preferences=prefs,
            include_parking=include_nearby_parking
        )
        return result
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Routing error: {str(e)}")


