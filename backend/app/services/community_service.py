import time
import math
import logging
from typing import Dict, Any, List, Optional, Tuple
from shapely.geometry import LineString, Point

from backend.app.config import settings
from backend.app.services.supabase_service import (
    SupabaseService,
    DatabaseOperationException,
    DatabaseTableMissingException
)
from backend.app.schemas.community import (
    ReportCreateRequest,
    CATEGORY_DISPLAY_NAMES
)

logger = logging.getLogger("terramove.community")

# Maximum photo size: 5 MB
MAX_PHOTO_SIZE_BYTES = 5 * 1024 * 1024
ALLOWED_IMAGE_MIME_TYPES = {"image/jpeg", "image/png", "image/webp"}


def get_moderator_secret() -> str:
    """Retrieves server-side moderator secret key without exposing it to clients."""
    return (
        settings.MODERATOR_SECRET_KEY
        or settings.OPERATOR_SECRET_KEY
        or ""
    ).strip()


class CommunityService:
    """
    Domain service for citizen issue reporting, moderation, photo attachment validation,
    and hazard-aware proximity evaluation.
    """

    def __init__(self, supabase_service: Optional[SupabaseService] = None):
        self.supabase_service = supabase_service or SupabaseService()
        # In-memory sliding rate limiter per session: {session_id: [timestamps]}
        self._rate_limits: Dict[str, List[float]] = {}

    def _check_rate_limit(self, session_id: Optional[str], max_requests: int = 10, window_sec: float = 60.0):
        """Simple sliding window rate limiter to prevent report flooding/abuse."""
        if not session_id:
            return
        now = time.time()
        timestamps = self._rate_limits.setdefault(session_id, [])
        # Prune expired timestamps
        self._rate_limits[session_id] = [t for t in timestamps if now - t < window_sec]
        if len(self._rate_limits[session_id]) >= max_requests:
            raise ValueError("Too many reports submitted recently. Please wait a moment before submitting another issue.")
        self._rate_limits[session_id].append(now)

    def validate_and_upload_photo(
        self,
        file_bytes: bytes,
        filename: str,
        content_type: str
    ) -> Dict[str, Any]:
        """
        Validates image attachment type and size, then uploads to Supabase Storage.
        """
        if not file_bytes or len(file_bytes) == 0:
            raise ValueError("Uploaded file is empty.")

        if len(file_bytes) > MAX_PHOTO_SIZE_BYTES:
            raise ValueError(f"Photo exceeds maximum allowed size of 5 MB (received {len(file_bytes) / (1024 * 1024):.2f} MB).")

        normalized_mime = content_type.lower().split(";")[0].strip()
        if normalized_mime not in ALLOWED_IMAGE_MIME_TYPES:
            raise ValueError(f"Unsupported image format '{content_type}'. Allowed formats: JPEG, PNG, WebP.")

        return self.supabase_service.upload_report_photo(
            file_bytes=file_bytes,
            filename=filename,
            content_type=normalized_mime
        )

    def submit_report(self, payload: ReportCreateRequest) -> Dict[str, Any]:
        """
        Validates and persists a citizen issue report.
        Enforces status='submitted' (ordinary users cannot self-verify).
        """
        # 1. Geographic bounds check for Sector 17 / Chandigarh pilot
        if not (30.60 <= payload.latitude <= 30.85 and 76.60 <= payload.longitude <= 76.95):
            raise ValueError(
                f"Coordinates ({payload.latitude:.5f}, {payload.longitude:.5f}) are outside the Chandigarh pilot area. "
                f"Reports must be located within or adjacent to Sector 17."
            )

        # 2. Rate limiting check
        self._check_rate_limit(payload.user_session_id)

        # 3. Prepare storage payload
        db_payload = {
            "category": payload.category,
            "title": payload.title,
            "description": payload.description,
            "latitude": payload.latitude,
            "longitude": payload.longitude,
            "severity": payload.severity,
            "is_gps_location": payload.is_gps_location,
            "photo_url": payload.photo_url,
            "user_session_id": payload.user_session_id
        }

        # 4. Authoritative write to Supabase
        return self.supabase_service.insert_citizen_report(db_payload)

    def list_reports(
        self,
        status: Optional[str] = None,
        category: Optional[str] = None,
        verified_only: bool = False,
        limit: int = 50,
        offset: int = 0
    ) -> Tuple[List[Dict[str, Any]], int]:
        """
        Lists reports with public privacy protection (omitting user session IDs).
        """
        reports, total = self.supabase_service.fetch_citizen_reports(
            status=status,
            category=category,
            verified_only=verified_only,
            limit=limit,
            offset=offset
        )
        return reports, total

    def get_report_by_id(self, report_id: str) -> Optional[Dict[str, Any]]:
        """Retrieves a single report by ID."""
        return self.supabase_service.fetch_citizen_report_by_id(report_id)

    def moderate_report(
        self,
        report_id: str,
        new_status: str,
        moderator_notes: Optional[str] = None,
        auth_token: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Updates report status. Protected by moderator secret key.
        """
        secret = get_moderator_secret()
        if not secret:
            raise PermissionError(
                "Moderation is currently disabled: MODERATOR_SECRET_KEY is not configured on the server."
            )

        if not auth_token or auth_token.strip() != secret:
            raise PermissionError("Invalid or missing moderator credentials. Status update rejected.")

        valid_statuses = {"submitted", "under_review", "verified", "resolved", "rejected"}
        if new_status not in valid_statuses:
            raise ValueError(f"Invalid status '{new_status}'. Allowed: {', '.join(sorted(valid_statuses))}")

        return self.supabase_service.update_citizen_report_status(
            report_id=report_id,
            new_status=new_status,
            moderator_notes=moderator_notes
        )

    def get_hazard_markers(self) -> List[Dict[str, Any]]:
        """
        Retrieves active community hazards for map visualization.
        Excludes rejected and resolved reports.
        """
        reports, _ = self.supabase_service.fetch_citizen_reports(limit=100)
        # Filter for active visible reports (verified, under_review, submitted)
        active = [
            r for r in reports
            if r.get("status") in ("verified", "under_review", "submitted")
        ]
        return active

    def check_route_hazards(
        self,
        route_coords: List[List[float]],
        threshold_meters: float = 25.0
    ) -> List[Dict[str, Any]]:
        """
        Evaluates whether a planned walking route LineString intersects or passes near
        verified community hazards (status = 'verified').
        Threshold: 25.0 meters.
        """
        if not route_coords or len(route_coords) < 2:
            return []

        verified_hazards = self.supabase_service.fetch_verified_hazards()
        if not verified_hazards:
            return []

        # Convert degree coordinates to approximate metric buffer for Sector 17 (~30.74° N)
        # At latitude 30.74°, 1° lat ≈ 110,852m; 1° lon ≈ 95,930m
        meters_per_deg_lat = 110852.0
        meters_per_deg_lon = 95930.0

        # Construct route line in metric space
        try:
            metric_points = [
                (c[0] * meters_per_deg_lon, c[1] * meters_per_deg_lat)
                for c in route_coords
            ]
            route_line = LineString(metric_points)
        except Exception as e:
            logger.warning(f"Could not construct route LineString for hazard proximity: {e}")
            return []

        warnings = []
        for h in verified_hazards:
            try:
                h_lon = float(h.get("longitude", 0.0))
                h_lat = float(h.get("latitude", 0.0))
                h_metric_pt = Point(h_lon * meters_per_deg_lon, h_lat * meters_per_deg_lat)

                dist_m = route_line.distance(h_metric_pt)
                if dist_m <= threshold_meters:
                    cat = h.get("category", "other")
                    cat_display = h.get("category_display") or CATEGORY_DISPLAY_NAMES.get(cat, cat.title())
                    title = h.get("title", f"{cat_display} Notice")
                    warnings.append({
                        "report_id": h.get("id"),
                        "category": cat,
                        "category_display": cat_display,
                        "title": title,
                        "severity": h.get("severity", "moderate"),
                        "latitude": h_lat,
                        "longitude": h_lon,
                        "distance_to_route_m": round(dist_m, 1),
                        "warning_message": (
                            f"Verified hazard near route: {title} ({cat_display}) "
                            f"is located ~{round(dist_m)}m from this walking corridor."
                        )
                    })
            except Exception as e:
                logger.warning(f"Error computing hazard proximity for report {h.get('id')}: {e}")
                continue

        # Sort warnings by proximity to route
        warnings.sort(key=lambda w: w["distance_to_route_m"])
        return warnings

