from typing import Optional, List, Literal
from datetime import datetime
from pydantic import BaseModel, Field, model_validator

# Supported categories for Sector 17, Chandigarh
CitizenCategory = Literal[
    "pothole",
    "broken_footpath",
    "broken_sidewalk",
    "construction",
    "streetlight",
    "garbage",
    "unsafe_crossing",
    "extreme_heat",
    "missing_shade",
    "water_station",
    "flooding",
    "other"
]

ReportSeverity = Literal["low", "moderate", "high", "severe"]
ReportStatus = Literal["submitted", "under_review", "verified", "resolved", "rejected"]

CATEGORY_DISPLAY_NAMES = {
    "pothole": "Pothole or Damaged Surface",
    "broken_footpath": "Broken or Obstructed Footpath",
    "broken_sidewalk": "Broken or Obstructed Footpath",
    "construction": "Construction Blocking Route",
    "streetlight": "Streetlight Not Working",
    "garbage": "Garbage / Waste Obstruction",
    "unsafe_crossing": "Unsafe Pedestrian Crossing",
    "extreme_heat": "Severe Solar Exposure",
    "missing_shade": "Missing Canopy / Tree Cover",
    "water_station": "Water Kiosk Issue",
    "flooding": "Waterlogging / Drainage Issue",
    "other": "Other Pedestrian Issue"
}


class ReportCreateRequest(BaseModel):
    category: CitizenCategory = Field(..., description="Issue category")
    title: str = Field(..., min_length=3, max_length=150, description="Short title describing the issue")
    description: Optional[str] = Field(None, max_length=500, description="Optional detailed description")
    latitude: float = Field(..., ge=30.60, le=30.85, description="Latitude within Chandigarh pilot area")
    longitude: float = Field(..., ge=76.60, le=76.95, description="Longitude within Chandigarh pilot area")
    severity: ReportSeverity = Field("moderate", description="Estimated severity")
    is_gps_location: bool = Field(False, description="Whether location was captured via device GPS")
    photo_url: Optional[str] = Field(None, description="Optional URL of attached photo uploaded via storage API")
    user_session_id: Optional[str] = Field(None, description="Client session reference for user tracking")

    model_config = {
        "populate_by_name": True,
        "extra": "ignore"
    }

    @model_validator(mode="before")
    @classmethod
    def sanitize_strings(cls, data: dict) -> dict:
        if isinstance(data, dict):
            if "title" in data and isinstance(data["title"], str):
                data["title"] = data["title"].strip()
            if "description" in data and isinstance(data["description"], str):
                data["description"] = data["description"].strip()
            if "category" in data and isinstance(data["category"], str):
                data["category"] = data["category"].strip().lower()
        return data


class ReportModerateRequest(BaseModel):
    status: ReportStatus = Field(..., description="Target moderation status")
    moderator_notes: Optional[str] = Field(None, max_length=500, description="Optional notes from moderator")


class ReportResponse(BaseModel):
    id: str
    category: str
    category_display: str
    title: str
    description: Optional[str] = None
    severity: str
    status: str
    latitude: float
    longitude: float
    is_gps_location: bool = False
    photo_url: Optional[str] = None
    created_at: str
    updated_at: Optional[str] = None
    moderator_notes: Optional[str] = None
    moderated_at: Optional[str] = None
    is_verified_hazard: bool = False
    disclaimer: str = "Community reports reflect citizen observations and may be pending field verification."


class ReportListResponse(BaseModel):
    count: int
    total: int
    pilot_area: str = "Sector 17, Chandigarh, India"
    reports: List[ReportResponse]
    verified_hazards_count: int = 0


class HazardMarkerItem(BaseModel):
    id: str
    category: str
    category_display: str
    title: str
    severity: str
    status: str
    latitude: float
    longitude: float
    photo_url: Optional[str] = None
    created_at: str
    is_active_hazard: bool = True


class RouteHazardWarning(BaseModel):
    report_id: str
    category: str
    category_display: str
    title: str
    severity: str
    latitude: float
    longitude: float
    distance_to_route_m: float
    warning_message: str


class PhotoUploadResponse(BaseModel):
    photo_url: str
    filename: str
    size_bytes: int
    content_type: str
    message: str = "Photo uploaded successfully to Supabase citizen-reports bucket."

