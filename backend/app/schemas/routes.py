from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field, model_validator

class LatLon(BaseModel):
    lat: float = Field(..., ge=-90.0, le=90.0, description="Latitude")
    lon: float = Field(..., ge=-180.0, le=180.0, description="Longitude")

class RouteCompareRequest(BaseModel):
    start_lat: float = Field(..., ge=30.50, le=31.00, description="Start latitude within Chandigarh pilot area")
    start_lon: float = Field(..., ge=76.50, le=77.10, description="Start longitude within Chandigarh pilot area")
    dest_lat: float = Field(..., ge=30.50, le=31.00, description="Destination latitude within Chandigarh pilot area")
    dest_lon: float = Field(..., ge=76.50, le=77.10, description="Destination longitude within Chandigarh pilot area")
    time_of_day_hour: Optional[float] = Field(14.0, ge=0.0, le=24.0, description="Departure hour (0-24) for solar shadow simulation")
    preferences: Optional[List[str]] = Field(["fastest", "shadiest", "balanced"], description="Route preferences to compute")
    include_nearby_parking: Optional[bool] = Field(True, description="Whether to include ranked parking near destination")
    accessibility_mode: Optional[bool] = Field(False, description="Prioritize step-free, paved, and wheelchair-accessible paths")
    avoid_hazards: Optional[bool] = Field(False, description="Penalize corridors near verified citizen hazard reports")

    model_config = {
        "populate_by_name": True,
        "extra": "ignore"
    }

    @model_validator(mode="before")
    @classmethod
    def normalize_keys(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if "startLat" in data and "start_lat" not in data:
                data["start_lat"] = data["startLat"]
            if "startLon" in data and "start_lon" not in data:
                data["start_lon"] = data["startLon"]
            if "destLat" in data and "dest_lat" not in data:
                data["dest_lat"] = data["destLat"]
            if "destLon" in data and "dest_lon" not in data:
                data["dest_lon"] = data["destLon"]
            if "origin_lat" in data and "start_lat" not in data:
                data["start_lat"] = data["origin_lat"]
            if "origin_lon" in data and "start_lon" not in data:
                data["start_lon"] = data["origin_lon"]
            if "destination_lat" in data and "dest_lat" not in data:
                data["dest_lat"] = data["destination_lat"]
            if "destination_lon" in data and "dest_lon" not in data:
                data["dest_lon"] = data["destination_lon"]
        return data

class RouteStep(BaseModel):
    instruction: str
    distance_m: float
    duration_sec: float
    shade_score: int

class RouteAlternative(BaseModel):
    preference: str # "fastest", "shadiest", "balanced", "accessible"
    distance_m: float
    duration_minutes: float
    shade_score: int # 0-100
    accessibility_score: Optional[int] = 70
    step_free: Optional[bool] = True
    paved_percentage: Optional[float] = 60.0
    accessibility_notes: Optional[List[str]] = []
    synthetic_crossings: Optional[int] = 0
    heat_score: int # 0-100
    heat_category: str # Low, Moderate, High, Extreme
    heat_color: str
    advisory: str
    effective_temp_c: float
    metric_used: str
    hazard_warnings: Optional[List[Dict[str, Any]]] = []
    safety_advisory: Optional[str] = None
    coordinates: List[List[float]] # [[lon, lat], ...]
    steps: List[RouteStep]
    disclaimer: str

class ParkingItem(BaseModel):
    id: str
    name: str
    address: str
    latitude: float
    longitude: float
    distance_to_dest_m: float
    distance_type: Optional[str] = "straight_line"
    walking_time_to_dest_min: float
    capacity_four_wheeler: Optional[int] = None
    capacity_two_wheeler: Optional[int] = None
    total_recorded_capacity: Optional[int] = None
    in_sector17_exact: bool
    availability_status: str
    live_sensor_connected: bool
    availability_disclaimer: str

class RouteCompareResponse(BaseModel):
    routes: List[RouteAlternative]
    weather_summary: Dict[str, Any]
    nearby_parking: List[ParkingItem]
    route_count: int
    note: Optional[str] = None
    data_source: Optional[str] = None

