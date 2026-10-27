from typing import Optional, List
from datetime import datetime, timezone
import logging
import httpx
from fastapi import APIRouter, Query, HTTPException, Header, status
from fastapi.responses import JSONResponse

logger = logging.getLogger("terramove.api.parking")

from backend.app.config import settings
from backend.app.services.supabase_service import (
    SupabaseService,
    DatabaseTableMissingException,
    DatabaseOperationException
)
from backend.app.services.routing_service import RoutingService
from backend.app.services.parking_service import (
    ParkingService,
    ParkingConflictException
)
from backend.app.schemas.parking import (
    ReservationCreateRequest,
    ReservationResponse,
    ReservationCancelResponse,
    OperatorOccupancyRequest,
    OperatorOccupancyResponse,
    ParkingAlternativeItem,
    ParkingReservationConflictResponse,
    ParkingLotDetail
)

router = APIRouter()
_parking_service: Optional[ParkingService] = None
_routing_service: Optional[RoutingService] = None

def get_routing_service() -> RoutingService:
    global _routing_service
    if _routing_service is None:
        _routing_service = RoutingService()
    return _routing_service

def get_parking_service() -> ParkingService:
    global _parking_service
    if _parking_service is None:
        r_service = get_routing_service()
        _parking_service = ParkingService(
            supabase_service=r_service.supabase_service,
            pedestrian_graph=r_service.graph
        )
    return _parking_service

@router.get("/parking")
async def get_parking(
    lat: Optional[float] = Query(None, description="Destination latitude to sort by proximity"),
    lon: Optional[float] = Query(None, description="Destination longitude to sort by proximity"),
    limit: int = Query(25, ge=1, le=100),
    simulate: bool = Query(False, description="Toggles simulated occupancy for demo preview"),
    start_time: Optional[datetime] = Query(None, description="Check availability from arrival time"),
    duration_minutes: int = Query(60, ge=15, le=1440, description="Duration in minutes for availability check")
):
    service = get_parking_service()
    dest_lat = lat if lat is not None else settings.DEFAULT_SECTOR_LAT
    dest_lon = lon if lon is not None else settings.DEFAULT_SECTOR_LON

    lots = service.rank_parking_for_display(
        dest_lat=dest_lat,
        dest_lon=dest_lon,
        start_time=start_time,
        duration_minutes=duration_minutes,
        limit=limit
    )

    if simulate:
        for idx, item in enumerate(lots):
            seed = (idx * 37) % 100
            cap = item.get("total_recorded_capacity") or 50
            item["simulated_available_spaces"] = int(round(cap * (seed / 100.0)))
            item["availability_status"] = "simulated"
            item["data_freshness"] = "Demo Simulation Active"

    # Count active confirmed reservations
    now = datetime.now(timezone.utc)
    active_reservations = sum(
        1 for r in service._reservations.values()
        if r.get("status") == "confirmed" and datetime.fromisoformat(r["end_time"]) > now
    )

    return {
        "count": len(lots),
        "total_available_records": len(service._facilities),
        "pilot_area": "Sector 17, Chandigarh",
        "data_source": "supabase_postgis" if service.supabase_service.is_configured else "local_json",
        "parking_lots": lots,
        "active_reservations_total": active_reservations,
        "disclaimer": "Recorded capacity displayed. Live status reflects verified operator observations where available."
    }

@router.post("/parking/reservations", response_model=ReservationResponse, status_code=status.HTTP_201_CREATED)
async def create_parking_reservation(payload: ReservationCreateRequest):
    service = get_parking_service()
    try:
        booking = service.create_reservation(
            facility_id=payload.facility_id,
            start_time=payload.start_time,
            duration_minutes=payload.duration_minutes,
            user_session_id=payload.user_session_id,
            vehicle_plate=payload.vehicle_plate,
            user_contact=payload.user_contact
        )
        return booking
    except ParkingConflictException as ce:
        return JSONResponse(
            status_code=status.HTTP_409_CONFLICT,
            content={
                "detail": ce.message,
                "requested_facility_id": ce.facility_id,
                "requested_facility_name": ce.facility_name,
                "conflict_reason": "Interval unavailable or physical occupancy detected",
                "alternatives": ce.alternatives
            }
        )
    except DatabaseTableMissingException as dtme:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Database migration required: {str(dtme)}"
        )
    except DatabaseOperationException as doe:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Database error: {str(doe)}"
        )
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Reservation error: {str(e)}")

@router.get("/parking/reservations")
async def list_reservations(session_id: str = Query(..., min_length=3, description="Client session reference")):
    service = get_parking_service()
    try:
        bookings = service.list_user_reservations(session_id)
        return {
            "user_session_id": session_id,
            "count": len(bookings),
            "reservations": bookings
        }
    except DatabaseTableMissingException as dtme:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Database migration required: {str(dtme)}"
        )
    except DatabaseOperationException as doe:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Database error: {str(doe)}"
        )

@router.get("/parking/reservations/{booking_id}")
async def get_reservation(booking_id: str):
    service = get_parking_service()
    with service._lock:
        res = service._reservations.get(booking_id)
        if res:
            return res
    clean_id = booking_id.replace("tm_bk_", "").strip()
    if clean_id in service._reservations:
        return service._reservations[clean_id]
    # Check Supabase authoritative store
    if service.supabase_service.is_configured:
        try:
            with httpx.Client(timeout=5.0) as client:
                r = client.get(
                    f"{service.supabase_service.url}/rest/v1/parking_reservations?id=eq.{clean_id}&select=*",
                    headers=service.supabase_service._get_headers()
                )
                if r.status_code == 200:
                    rows = r.json()
                    if rows:
                        row = rows[0]
                        fac = service.get_facility_by_id(row.get("facility_id")) or service.get_facility_by_id(f"parking_{row.get('facility_source_row')}")
                        return {
                            "booking_id": row["id"],
                            "facility_id": f"parking_{row.get('facility_source_row')}",
                            "facility_name": fac.get("name", "Sector 17 Parking") if fac else "Sector 17 Parking",
                            "facility_address": fac.get("address", "Sector 17, Chandigarh") if fac else "Sector 17, Chandigarh",
                            "start_time": row["start_time"],
                            "end_time": row["end_time"],
                            "duration_minutes": 60,
                            "status": row["status"],
                            "user_session_id": row["user_session_id"],
                            "vehicle_plate": row.get("vehicle_plate"),
                            "created_at": row["created_at"],
                            "updated_at": row.get("updated_at", row["created_at"]),
                            "slot_scope": "facility_level",
                            "disclaimer": "Confirmed facility-level reservation enforced by PostgreSQL exclusion constraint."
                        }
        except Exception as e:
            logger.error(f"Error fetching reservation {booking_id} from Supabase: {e}")
    raise HTTPException(status_code=404, detail=f"Reservation '{booking_id}' not found.")

@router.post("/parking/reservations/{booking_id}/cancel", response_model=ReservationCancelResponse)
async def cancel_parking_reservation(
    booking_id: str,
    session_id: Optional[str] = Query(None, description="Optional session reference for verification")
):
    service = get_parking_service()
    try:
        result = service.cancel_reservation(booking_id, user_session_id=session_id)
        return result
    except DatabaseTableMissingException as dtme:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Database migration required: {str(dtme)}"
        )
    except DatabaseOperationException as doe:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Database error: {str(doe)}"
        )
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Cancellation error: {str(e)}")

@router.get("/parking/{facility_id}")
async def get_facility_detail(facility_id: str):
    service = get_parking_service()
    fac = service.get_facility_by_id(facility_id)
    if not fac:
        raise HTTPException(status_code=404, detail=f"Parking facility '{facility_id}' not found.")

    status_val, freshness, active_count = service.evaluate_facility_availability(facility_id)
    occ = service.get_facility_occupancy(facility_id)

    # Filter active confirmed reservations for this facility
    now = datetime.now(timezone.utc)
    active_bookings = [
        {
            "booking_id": r["booking_id"],
            "start_time": r["start_time"],
            "end_time": r["end_time"],
            "status": r["status"]
        }
        for r in service._reservations.values()
        if r.get("facility_id") == facility_id and r.get("status") == "confirmed" and datetime.fromisoformat(r["end_time"]) > now
    ]

    return {
        "facility": {
            "id": facility_id,
            "name": fac.get("name"),
            "address": fac.get("address"),
            "latitude": fac.get("latitude"),
            "longitude": fac.get("longitude"),
            "capacity_four_wheeler": fac.get("capacity_four_wheeler"),
            "capacity_two_wheeler": fac.get("capacity_two_wheeler"),
            "total_recorded_capacity": fac.get("total_capacity")
        },
        "availability_status": status_val,
        "physical_occupancy": occ,
        "data_freshness": freshness,
        "active_reservations": active_bookings,
        "disclaimer": "Facility-level reservations active. Numbered bay assignments require street IoT deployment."
    }

@router.post("/parking/operator/occupancy", response_model=OperatorOccupancyResponse)
async def update_operator_occupancy(
    payload: OperatorOccupancyRequest,
    x_operator_token: Optional[str] = Header(None, alias="X-Operator-Token")
):
    service = get_parking_service()
    try:
        result = service.update_physical_occupancy(
            facility_id=payload.facility_id,
            physical_status=payload.physical_status,
            occupied_spaces=payload.occupied_spaces,
            total_capacity=payload.total_capacity,
            notes=payload.notes,
            operator_id=payload.operator_id or "staff_on_duty",
            auth_token=x_operator_token,
            source="operator_manual"
        )
        return result
    except PermissionError as pe:
        raise HTTPException(status_code=401, detail=str(pe))
    except DatabaseTableMissingException as dtme:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Database migration required: {str(dtme)}"
        )
    except DatabaseOperationException as doe:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Database error: {str(doe)}"
        )
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Operator update error: {str(e)}")

@router.post("/parking/iot/telemetry")
async def ingest_iot_telemetry(
    payload: OperatorOccupancyRequest,
    x_iot_token: Optional[str] = Header(None, alias="X-IoT-Token")
):
    service = get_parking_service()
    try:
        result = service.update_physical_occupancy(
            facility_id=payload.facility_id,
            physical_status=payload.physical_status,
            occupied_spaces=payload.occupied_spaces,
            total_capacity=payload.total_capacity,
            notes=payload.notes,
            operator_id=payload.operator_id or "iot_device_gateway",
            auth_token=x_iot_token,
            source="iot_ultrasonic_sensor"
        )
        return result
    except PermissionError as pe:
        raise HTTPException(status_code=401, detail=str(pe))
    except DatabaseTableMissingException as dtme:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Database migration required: {str(dtme)}"
        )
    except DatabaseOperationException as doe:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Database error: {str(doe)}"
        )
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"IoT ingestion error: {str(e)}")

@router.get("/parking/{facility_id}/alternatives")
async def get_facility_alternatives(
    facility_id: str,
    dest_lat: Optional[float] = Query(None),
    dest_lon: Optional[float] = Query(None),
    limit: int = Query(5, ge=1, le=20)
):
    service = get_parking_service()
    fac = service.get_facility_by_id(facility_id)
    if not fac:
        raise HTTPException(status_code=404, detail=f"Parking facility '{facility_id}' not found.")

    target_lat = dest_lat if dest_lat is not None else fac["latitude"]
    target_lon = dest_lon if dest_lon is not None else fac["longitude"]

    alternatives = service.get_nearest_available_alternatives(
        excluded_facility_id=facility_id,
        dest_lat=target_lat,
        dest_lon=target_lon,
        limit=limit
    )

    return {
        "requested_facility_id": facility_id,
        "requested_facility_name": fac.get("name"),
        "count": len(alternatives),
        "alternatives": alternatives
    }

@router.get("/parking/{facility_id}/navigate")
async def navigate_from_parking(
    facility_id: str,
    dest_lat: float = Query(..., description="Target destination latitude"),
    dest_lon: float = Query(..., description="Target destination longitude"),
    departure_hour: float = Query(14.0, description="Departure time in hours (0-23)"),
    accessibility_mode: bool = Query(False, description="Enable accessibility mode")
):
    """
    Computes road-following pedestrian routes from the selected parking facility to the destination.
    Reuses the existing PedestrianGraph and RoutingService.
    """
    p_service = get_parking_service()
    fac = p_service.get_facility_by_id(facility_id)
    if not fac:
        raise HTTPException(status_code=404, detail=f"Parking facility '{facility_id}' not found.")

    r_service = get_routing_service()
    prefs = ["fastest", "shadiest", "balanced"]
    if accessibility_mode:
        prefs.append("accessible")

    try:
        route_result = await r_service.compare_routes(
            start_lat=fac["latitude"],
            start_lon=fac["longitude"],
            dest_lat=dest_lat,
            dest_lon=dest_lon,
            departure_hour=departure_hour,
            preferences=prefs,
            include_parking=False
        )
        return {
            "origin_parking": {
                "id": facility_id,
                "name": fac.get("name"),
                "address": fac.get("address"),
                "latitude": fac.get("latitude"),
                "longitude": fac.get("longitude")
            },
            "destination": {
                "latitude": dest_lat,
                "longitude": dest_lon
            },
            "routes": route_result.get("routes", []),
            "weather_summary": route_result.get("weather_summary", {}),
            "disclaimer": "Walking route calculated using Sector 17 pedestrian network."
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Navigation from parking failed: {str(e)}")
