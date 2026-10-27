from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel, Field

class ReservationCreateRequest(BaseModel):
    facility_id: str = Field(..., description="ID of the parking facility, e.g. parking_244 or UUID")
    start_time: datetime = Field(..., description="Reservation start timestamp (ISO 8601 UTC)")
    duration_minutes: int = Field(60, ge=15, le=1440, description="Duration in minutes (15m to 24h)")
    user_session_id: str = Field(..., min_length=3, description="Client session reference or user identifier")
    vehicle_plate: Optional[str] = Field(None, max_length=20, description="Optional vehicle registration plate")
    user_contact: Optional[str] = Field(None, max_length=50, description="Optional phone or email for notification")

class ReservationResponse(BaseModel):
    booking_id: str
    facility_id: str
    facility_name: str
    facility_address: Optional[str] = None
    start_time: datetime
    end_time: datetime
    duration_minutes: int
    status: str
    created_at: datetime
    user_session_id: str
    vehicle_plate: Optional[str] = None
    slot_scope: str = "facility_level"
    disclaimer: str

class ReservationCancelResponse(BaseModel):
    booking_id: str
    status: str
    cancelled_at: datetime
    message: str

class OperatorOccupancyRequest(BaseModel):
    facility_id: str = Field(..., description="ID of the parking facility")
    physical_status: str = Field(..., description="Physical status: available, occupied, maintenance, unknown")
    occupied_spaces: Optional[int] = Field(None, ge=0, description="Number of physically occupied bays if known")
    total_capacity: Optional[int] = Field(None, ge=0, description="Total capacity observed")
    notes: Optional[str] = Field(None, max_length=500, description="Optional operator observation note")
    operator_id: Optional[str] = Field("staff_on_duty", max_length=100, description="Authorized operator identity")

class OperatorOccupancyResponse(BaseModel):
    facility_id: str
    facility_name: str
    physical_status: str
    occupied_spaces: Optional[int] = None
    source: str
    operator_id: Optional[str] = None
    recorded_at: datetime
    data_freshness: str
    message: str

class ParkingAlternativeItem(BaseModel):
    id: str
    name: str
    address: str
    latitude: float
    longitude: float
    distance_to_dest_m: float
    distance_type: str
    walking_time_to_dest_min: float
    capacity_four_wheeler: Optional[int] = None
    capacity_two_wheeler: Optional[int] = None
    total_recorded_capacity: Optional[int] = None
    availability_status: str
    is_confirmed_available: bool
    data_freshness: str

class ParkingReservationConflictResponse(BaseModel):
    detail: str
    requested_facility_id: str
    requested_facility_name: str
    conflict_reason: str
    alternatives: List[ParkingAlternativeItem]

class ParkingLotDetail(BaseModel):
    id: str
    name: str
    address: str
    latitude: float
    longitude: float
    distance_to_dest_m: float
    distance_type: str
    walking_time_to_dest_min: float
    capacity_four_wheeler: Optional[int] = None
    capacity_two_wheeler: Optional[int] = None
    total_recorded_capacity: Optional[int] = None
    availability_status: str  # 'available' | 'reserved' | 'occupied' | 'maintenance' | 'unknown' | 'stale'
    physical_occupancy_status: str
    physical_occupied_spaces: Optional[int] = None
    active_reservations_count: int = 0
    data_freshness: str
    last_updated_at: Optional[str] = None
    update_source: str
    live_sensor_connected: bool
    availability_disclaimer: str

class ParkingListResponse(BaseModel):
    count: int
    total_available_records: int
    pilot_area: str
    data_source: str
    parking_lots: List[ParkingLotDetail]
    disclaimer: str
    active_reservations_total: int = 0
