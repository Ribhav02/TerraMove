import os
import json
import uuid
import time
import hmac
import logging
import threading
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List, Optional, Tuple

import httpx

from backend.app.config import settings, PROJECT_ROOT
from backend.app.services.supabase_service import (
    SupabaseService,
    DatabaseTableMissingException,
    DatabaseExclusionConflictException,
    DatabaseOperationException
)
from ai_logic.parking_ranker import ParkingRanker
from ai_logic.pedestrian_graph import haversine_distance_m

logger = logging.getLogger("terramove.parking")

STALE_THRESHOLD_SECONDS = 1800  # 30 minutes threshold for physical occupancy freshness


def get_operator_secret() -> Optional[str]:
    """
    Retrieves the operator secret from backend settings or environment.
    Returns None if not configured. Never falls back to a default secret.
    """
    val = (getattr(settings, "OPERATOR_SECRET_KEY", "") or os.getenv("OPERATOR_SECRET_KEY", "")).strip()
    return val if val else None


def get_iot_secret() -> Optional[str]:
    """
    Retrieves the IoT secret from backend settings or environment.
    Returns None if not configured. Never falls back to a default secret.
    """
    val = (getattr(settings, "IOT_SECRET_KEY", "") or os.getenv("IOT_SECRET_KEY", "")).strip()
    return val if val else None

class ParkingConflictException(Exception):
    def __init__(self, message: str, facility_id: str, facility_name: str, alternatives: List[Dict[str, Any]]):
        super().__init__(message)
        self.message = message
        self.facility_id = facility_id
        self.facility_name = facility_name
        self.alternatives = alternatives

class ParkingService:
    """
    Core management service for Phase 2: Smart Parking System.
    Handles concurrency-safe reservations, physical occupancy tracking,
    operator authorization, nearest alternative ranking, and pedestrian walk routes.
    """

    def __init__(
        self,
        supabase_service: Optional[SupabaseService] = None,
        parking_ranker: Optional[ParkingRanker] = None,
        pedestrian_graph: Optional[Any] = None
    ):
        self.supabase_service = supabase_service or SupabaseService()
        self.pedestrian_graph = pedestrian_graph
        self.parking_ranker = parking_ranker
        self._lock = threading.RLock()

        # Local persistence paths for robust offline/fallback operation
        self._reservations_file = PROJECT_ROOT / "data" / "parking_reservations.json"
        self._occupancy_file = PROJECT_ROOT / "data" / "parking_occupancy.json"

        # In-memory caches / stores
        self._reservations: Dict[str, Dict[str, Any]] = {}  # booking_id -> record
        self._occupancy_records: Dict[str, Dict[str, Any]] = {}  # facility_id -> record
        self._facilities: List[Dict[str, Any]] = []

        self._load_facilities()
        self._load_local_state()

    def _load_facilities(self):
        """Loads parking facility records from Supabase or validated local JSON."""
        records, src = self.supabase_service.fetch_parking_locations()
        self.parking_ranker = ParkingRanker(parking_records=records, pedestrian_graph=self.pedestrian_graph)
        self._facilities = self.parking_ranker.facilities

    def _load_local_state(self):
        """Loads persistent reservation and occupancy state from disk."""
        with self._lock:
            if self._reservations_file.exists():
                try:
                    with open(self._reservations_file, "r", encoding="utf-8") as f:
                        data = json.load(f)
                        self._reservations = {r["booking_id"]: r for r in data}
                except Exception as e:
                    logger.warning(f"Could not load local reservations: {e}")

            if self._occupancy_file.exists():
                try:
                    with open(self._occupancy_file, "r", encoding="utf-8") as f:
                        data = json.load(f)
                        self._occupancy_records = {r["facility_id"]: r for r in data}
                except Exception as e:
                    logger.warning(f"Could not load local occupancy records: {e}")

    def _persist_reservations(self):
        """Persists reservations to local disk for recovery and crash-consistency."""
        try:
            with open(self._reservations_file, "w", encoding="utf-8") as f:
                json.dump(list(self._reservations.values()), f, indent=2, default=str)
        except Exception as e:
            logger.error(f"Failed to persist reservations: {e}")

    def _persist_occupancy(self):
        """Persists physical occupancy records to local disk."""
        try:
            with open(self._occupancy_file, "w", encoding="utf-8") as f:
                json.dump(list(self._occupancy_records.values()), f, indent=2, default=str)
        except Exception as e:
            logger.error(f"Failed to persist occupancy records: {e}")

    def get_facility_by_id(self, facility_id: str) -> Optional[Dict[str, Any]]:
        """Resolves facility by id (e.g. 'parking_244', source_row 244, or Supabase UUID)."""
        target_row = None
        if str(facility_id).startswith("parking_"):
            try:
                target_row = int(str(facility_id).replace("parking_", ""))
            except ValueError:
                pass

        for f in self._facilities:
            fid = f"parking_{f.get('source_row')}"
            db_id = str(f.get("db_id", ""))
            src_str = str(f.get("source_row"))
            if fid == facility_id or src_str == str(facility_id) or (db_id and db_id == str(facility_id)):
                return f
            if target_row is not None and f.get("source_row") == target_row:
                return f
        return None

    def get_facility_uuid(self, facility: Dict[str, Any]) -> str:
        """Returns the authoritative Supabase UUID for the facility."""
        if facility.get("db_id"):
            return str(facility["db_id"])
        if self.supabase_service.is_configured:
            src_row = facility.get("source_row")
            try:
                with httpx.Client(timeout=5.0) as client:
                    r = client.get(
                        f"{self.supabase_service.url}/rest/v1/parking_locations?source_row=eq.{src_row}&select=id",
                        headers=self.supabase_service._get_headers()
                    )
                    if r.status_code == 200:
                        rows = r.json()
                        if rows:
                            facility["db_id"] = rows[0]["id"]
                            return rows[0]["id"]
            except Exception as e:
                logger.warning(f"Could not resolve UUID for source_row {src_row}: {e}")
        # Deterministic UUID based on source_row for testing/offline
        synthetic_uuid = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"terramove.parking.{facility.get('source_row', 0)}"))
        facility["db_id"] = synthetic_uuid
        return synthetic_uuid

    def _expire_past_reservations(self, current_time: datetime):
        """Automatically marks expired reservations as 'expired'."""
        with self._lock:
            for b_id, res in self._reservations.items():
                if res.get("status") == "confirmed":
                    end_dt = datetime.fromisoformat(res["end_time"]) if isinstance(res["end_time"], str) else res["end_time"]
                    if end_dt <= current_time:
                        res["status"] = "expired"
                        res["updated_at"] = current_time.isoformat()

    def get_facility_occupancy(self, facility_id: str) -> Dict[str, Any]:
        """Returns the physical occupancy record and freshness analysis from Supabase."""
        now = datetime.now(timezone.utc)
        facility = self.get_facility_by_id(facility_id)
        fac_uuid = str(facility.get("db_id", "")) if facility else None
        source_row = str(facility.get("source_row", "")) if facility else None

        rec = None
        if self.supabase_service.is_configured:
            try:
                db_occupancy = self.supabase_service.fetch_latest_occupancy_records()
                rec = (
                    db_occupancy.get(facility_id)
                    or (db_occupancy.get(fac_uuid) if fac_uuid else None)
                    or (db_occupancy.get(source_row) if source_row else None)
                )
            except DatabaseTableMissingException:
                rec = None
            except Exception as e:
                logger.warning(f"Failed to query occupancy records from Supabase: {e}")
                rec = None
        else:
            with self._lock:
                rec = (
                    self._occupancy_records.get(facility_id)
                    or (self._occupancy_records.get(fac_uuid) if fac_uuid else None)
                    or (self._occupancy_records.get(source_row) if source_row else None)
                )

        if not rec:
            return {
                "physical_status": "unknown",
                "occupied_spaces": None,
                "data_freshness": "Unmonitored: Ground-level IoT occupancy sensors not deployed.",
                "last_updated_at": None,
                "update_source": "system_baseline",
                "is_stale": True
            }

        rec_time = datetime.fromisoformat(rec["recorded_at"]) if isinstance(rec["recorded_at"], str) else rec["recorded_at"]
        age_sec = (now - rec_time).total_seconds()
        is_stale = age_sec > STALE_THRESHOLD_SECONDS

        if is_stale:
            freshness_text = f"Stale data: Last observed {int(age_sec // 60)}m ago. Ground availability unverified."
            physical_status = "stale"
        else:
            freshness_text = f"Verified: Recorded {int(age_sec // 60)}m ago via {rec.get('source', 'operator_manual')}."
            physical_status = rec.get("physical_status", "unknown")

        return {
            "physical_status": physical_status,
            "occupied_spaces": rec.get("occupied_spaces"),
            "data_freshness": freshness_text,
            "last_updated_at": rec_time.isoformat(),
            "update_source": rec.get("source", "operator_manual"),
            "operator_id": rec.get("operator_id"),
            "is_stale": is_stale,
            "notes": rec.get("notes")
        }

    def evaluate_facility_availability(
        self,
        facility_id: str,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None
    ) -> Tuple[str, str, int]:
        """
        Evaluates unified availability status for a facility.
        Returns: (status, freshness_label, active_reservations_count)
        Status categories: 'available' | 'reserved' | 'occupied' | 'maintenance' | 'unknown' | 'stale'
        """
        now = datetime.now(timezone.utc)
        check_start = start_time or now
        check_end = end_time or (check_start + timedelta(hours=1))

        self._expire_past_reservations(now)
        occ = self.get_facility_occupancy(facility_id)
        phys = occ["physical_status"]

        # 1. Maintenance
        if phys == "maintenance":
            return "maintenance", occ["data_freshness"], 0

        # 2. Physically Occupied (Ground Truth takes precedence - Requirement 9)
        if phys == "occupied":
            return "occupied", occ["data_freshness"], 0

        # 3. Check for conflicting confirmed reservations from Supabase
        active_conflicts = 0
        facility = self.get_facility_by_id(facility_id)
        fac_uuid = str(facility.get("db_id", "")) if facility else None

        if self.supabase_service.is_configured:
            try:
                db_res = self.supabase_service.fetch_active_reservations(fac_uuid)
                for res in db_res:
                    r_start = datetime.fromisoformat(res["start_time"]) if isinstance(res["start_time"], str) else res["start_time"]
                    r_end = datetime.fromisoformat(res["end_time"]) if isinstance(res["end_time"], str) else res["end_time"]
                    if (r_start < check_end) and (r_end > check_start):
                        active_conflicts += 1
            except DatabaseTableMissingException:
                active_conflicts = 0
            except Exception as e:
                logger.warning(f"Failed to query active reservations from Supabase: {e}")
                with self._lock:
                    for res in self._reservations.values():
                        if res.get("status") == "confirmed" and (res.get("facility_id") == facility_id or res.get("facility_id") == fac_uuid):
                            r_start = datetime.fromisoformat(res["start_time"]) if isinstance(res["start_time"], str) else res["start_time"]
                            r_end = datetime.fromisoformat(res["end_time"]) if isinstance(res["end_time"], str) else res["end_time"]
                            if (r_start < check_end) and (r_end > check_start):
                                active_conflicts += 1
        else:
            with self._lock:
                for res in self._reservations.values():
                    if res.get("status") == "confirmed" and (res.get("facility_id") == facility_id or res.get("facility_id") == fac_uuid):
                        r_start = datetime.fromisoformat(res["start_time"]) if isinstance(res["start_time"], str) else res["start_time"]
                        r_end = datetime.fromisoformat(res["end_time"]) if isinstance(res["end_time"], str) else res["end_time"]
                        if (r_start < check_end) and (r_end > check_start):
                            active_conflicts += 1

        if active_conflicts > 0:
            return "reserved", f"Reserved: {active_conflicts} active reservation(s) during this time interval.", active_conflicts

        # 4. Verified Free by Operator
        if phys == "available" and not occ["is_stale"]:
            return "available", occ["data_freshness"], 0

        # 5. Stale reading
        if phys == "stale" or occ["is_stale"]:
            return "unknown", occ["data_freshness"], 0

        # 6. Default unmonitored
        return "unknown", "Unmonitored: Ground-level IoT occupancy sensors not deployed.", 0

    def create_reservation(
        self,
        facility_id: str,
        start_time: datetime,
        duration_minutes: int,
        user_session_id: str,
        vehicle_plate: Optional[str] = None,
        user_contact: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Creates a concurrency-safe reservation for a parking facility.
        Guarantees that at most one conflicting reservation can succeed.
        """
        now = datetime.now(timezone.utc)
        # Ensure timezone-aware UTC
        if start_time.tzinfo is None:
            start_time = start_time.replace(tzinfo=timezone.utc)

        end_time = start_time + timedelta(minutes=duration_minutes)

        if end_time <= start_time:
            raise ValueError("Reservation end time must be after start time.")

        if start_time < (now - timedelta(minutes=10)):
            raise ValueError("Reservation start time cannot be in the past.")

        facility = self.get_facility_by_id(facility_id)
        if not facility:
            raise ValueError(f"Parking facility '{facility_id}' not found.")

        facility_name = facility.get("name", "Sector 17 Parking")
        source_row = facility.get("source_row", 0)

        with self._lock:
            # 1. Expire outdated reservations first
            self._expire_past_reservations(now)

            # 2. Check physical occupancy
            occ = self.get_facility_occupancy(facility_id)
            if occ["physical_status"] == "occupied":
                alternatives = self.get_nearest_available_alternatives(
                    excluded_facility_id=facility_id,
                    dest_lat=facility["latitude"],
                    dest_lon=facility["longitude"],
                    start_time=start_time,
                    end_time=end_time
                )
                raise ParkingConflictException(
                    message=f"Parking facility '{facility_name}' is physically occupied and cannot be booked.",
                    facility_id=facility_id,
                    facility_name=facility_name,
                    alternatives=alternatives
                )

            if occ["physical_status"] == "maintenance":
                alternatives = self.get_nearest_available_alternatives(
                    excluded_facility_id=facility_id,
                    dest_lat=facility["latitude"],
                    dest_lon=facility["longitude"],
                    start_time=start_time,
                    end_time=end_time
                )
                raise ParkingConflictException(
                    message=f"Parking facility '{facility_name}' is currently closed for maintenance.",
                    facility_id=facility_id,
                    facility_name=facility_name,
                    alternatives=alternatives
                )

            # 3. Resolve facility UUID and prepare authoritative database payload
            facility_uuid = self.get_facility_uuid(facility)

            res_uuid = str(uuid.uuid4())
            db_payload = {
                "id": res_uuid,
                "facility_id": facility_uuid,
                "facility_source_row": source_row,
                "user_session_id": user_session_id,
                "vehicle_plate": vehicle_plate.strip().upper() if vehicle_plate else None,
                "user_contact": user_contact.strip() if user_contact else None,
                "start_time": start_time.isoformat(),
                "end_time": end_time.isoformat(),
                "status": "confirmed"
            }

            # 4. Authoritative Write to Supabase (Enforces PostgreSQL exclusion constraint)
            if self.supabase_service.is_configured:
                try:
                    inserted = self.supabase_service.insert_parking_reservation(db_payload)
                except DatabaseExclusionConflictException as ece:
                    # PostgreSQL exclusion constraint (23P01) caught collision!
                    alternatives = self.get_nearest_available_alternatives(
                        excluded_facility_id=facility_id,
                        dest_lat=facility["latitude"],
                        dest_lon=facility["longitude"],
                        start_time=start_time,
                        end_time=end_time
                    )
                    raise ParkingConflictException(
                        message=f"Conflict: Facility '{facility_name}' already has a confirmed reservation between {start_time.strftime('%H:%M')} and {end_time.strftime('%H:%M')} UTC (PostgreSQL exclusion constraint violation).",
                        facility_id=facility_id,
                        facility_name=facility_name,
                        alternatives=alternatives
                    )
                except (DatabaseTableMissingException, DatabaseOperationException) as dbe:
                    # Requirement 8: Do not silently fall back to local disk!
                    logger.error(f"Authoritative Supabase reservation creation failed: {dbe}")
                    raise
            else:
                raise DatabaseOperationException("Supabase is not configured on the backend.")

            booking_id = inserted.get("id", res_uuid)
            booking_record = {
                "booking_id": booking_id,
                "facility_id": facility_id,
                "facility_source_row": source_row,
                "facility_name": facility_name,
                "facility_address": facility.get("address"),
                "start_time": inserted.get("start_time", start_time.isoformat()),
                "end_time": inserted.get("end_time", end_time.isoformat()),
                "duration_minutes": duration_minutes,
                "status": inserted.get("status", "confirmed"),
                "user_session_id": user_session_id,
                "vehicle_plate": inserted.get("vehicle_plate"),
                "user_contact": inserted.get("user_contact"),
                "created_at": inserted.get("created_at", now.isoformat()),
                "updated_at": inserted.get("updated_at", now.isoformat()),
                "slot_scope": "facility_level",
                "disclaimer": "Confirmed facility-level reservation enforced by PostgreSQL exclusion constraint."
            }

            self._reservations[booking_id] = booking_record
            return booking_record

    def cancel_reservation(self, booking_id: str, user_session_id: Optional[str] = None) -> Dict[str, Any]:
        """Cancels an existing reservation in Supabase, releasing the time window immediately."""
        now = datetime.now(timezone.utc)
        clean_id = booking_id.replace("tm_bk_", "").strip()

        if self.supabase_service.is_configured:
            try:
                self.supabase_service.update_reservation_status(clean_id, "cancelled")
            except (DatabaseTableMissingException, DatabaseOperationException, ValueError) as e:
                # Requirement 8: Do not silently fall back to local disk!
                logger.error(f"Authoritative Supabase reservation cancellation failed: {e}")
                raise
        else:
            raise DatabaseOperationException("Supabase is not configured on backend.")

        with self._lock:
            if booking_id in self._reservations:
                self._reservations[booking_id]["status"] = "cancelled"
                self._reservations[booking_id]["updated_at"] = now.isoformat()
            if clean_id in self._reservations:
                self._reservations[clean_id]["status"] = "cancelled"
                self._reservations[clean_id]["updated_at"] = now.isoformat()

        return {
            "booking_id": booking_id,
            "status": "cancelled",
            "cancelled_at": now.isoformat(),
            "message": f"Reservation '{booking_id}' has been successfully cancelled in Supabase. The time slot is now released."
        }

    def list_user_reservations(self, user_session_id: str) -> List[Dict[str, Any]]:
        """Lists all reservations associated with a user session from Supabase."""
        if self.supabase_service.is_configured:
            try:
                rows = self.supabase_service.fetch_user_reservations(user_session_id)
                results = []
                for r in rows:
                    fac = self.get_facility_by_id(r.get("facility_id")) or self.get_facility_by_id(f"parking_{r.get('facility_source_row')}")
                    results.append({
                        "booking_id": r["id"],
                        "facility_id": f"parking_{r.get('facility_source_row')}",
                        "facility_name": fac.get("name", "Sector 17 Parking") if fac else "Sector 17 Parking",
                        "facility_address": fac.get("address", "Sector 17, Chandigarh") if fac else "Sector 17, Chandigarh",
                        "start_time": r["start_time"],
                        "end_time": r["end_time"],
                        "duration_minutes": 60,
                        "status": r["status"],
                        "user_session_id": r["user_session_id"],
                        "vehicle_plate": r.get("vehicle_plate"),
                        "created_at": r["created_at"],
                        "updated_at": r.get("updated_at", r["created_at"]),
                        "slot_scope": "facility_level",
                        "disclaimer": "Confirmed facility-level reservation enforced by PostgreSQL exclusion constraint."
                    })
                return results
            except DatabaseTableMissingException:
                # If migration not applied yet, return empty list gracefully
                return []
            except Exception as e:
                logger.error(f"Failed to fetch user reservations from Supabase: {e}")
                raise DatabaseOperationException(f"Failed to fetch user reservations: {str(e)}")

        now = datetime.now(timezone.utc)
        self._expire_past_reservations(now)
        with self._lock:
            user_bookings = [
                r for r in self._reservations.values()
                if r.get("user_session_id") == user_session_id
            ]
            user_bookings.sort(key=lambda x: x.get("start_time", ""), reverse=True)
            return user_bookings

    def update_physical_occupancy(
        self,
        facility_id: str,
        physical_status: str,
        occupied_spaces: Optional[int] = None,
        total_capacity: Optional[int] = None,
        notes: Optional[str] = None,
        operator_id: Optional[str] = "staff_on_duty",
        auth_token: Optional[str] = None,
        source: str = "operator_manual"
    ) -> Dict[str, Any]:
        """
        Updates physical occupancy (non-app ground truth).
        Protected by operator authentication token.
        """
        # Validate authentication based on ingestion source
        if source.startswith("iot_"):
            iot_secret = get_iot_secret()
            if not iot_secret:
                raise PermissionError(
                    "IoT telemetry updates are disabled: IOT_SECRET_KEY is not configured on the server."
                )
            if not auth_token or not hmac.compare_digest(auth_token, iot_secret):
                raise PermissionError("Unauthorized: Missing or invalid IoT authorization token.")
        else:
            operator_secret = get_operator_secret()
            if not operator_secret:
                raise PermissionError(
                    "Operator occupancy updates are disabled: OPERATOR_SECRET_KEY is not configured on the server."
                )
            if not auth_token or not hmac.compare_digest(auth_token, operator_secret):
                raise PermissionError("Unauthorized: Missing or invalid operator authorization token.")

        valid_statuses = {"available", "occupied", "maintenance", "unknown"}
        if physical_status.lower() not in valid_statuses:
            raise ValueError(f"Invalid physical status '{physical_status}'. Must be one of {valid_statuses}")

        facility = self.get_facility_by_id(facility_id)
        if not facility:
            raise ValueError(f"Parking facility '{facility_id}' not found.")

        facility_uuid = self.get_facility_uuid(facility)
        now = datetime.now(timezone.utc)
        record = {
            "id": str(uuid.uuid4()),
            "facility_id": facility_uuid,
            "facility_source_row": facility.get("source_row", 0),
            "physical_status": physical_status.lower(),
            "occupied_spaces": occupied_spaces,
            "total_capacity": total_capacity or facility.get("total_capacity"),
            "source": source,
            "operator_id": operator_id,
            "notes": notes,
            "recorded_at": now.isoformat()
        }

        # Authoritative write to Supabase (Requires service_role key & passes RLS)
        if self.supabase_service.is_configured:
            try:
                self.supabase_service.insert_occupancy_record(record)
            except (DatabaseTableMissingException, DatabaseOperationException) as e:
                # Requirement 8: Do not silently fall back to local disk!
                logger.error(f"Authoritative Supabase occupancy record failed: {e}")
                raise
        else:
            raise DatabaseOperationException("Supabase is not configured on backend.")

        with self._lock:
            self._occupancy_records[facility_id] = record
            if facility_uuid:
                self._occupancy_records[facility_uuid] = record
            src_str = str(facility.get("source_row", ""))
            if src_str:
                self._occupancy_records[src_str] = record

        return {
            "facility_id": facility_id,
            "facility_name": facility.get("name", "Sector 17 Parking"),
            "physical_status": physical_status.lower(),
            "occupied_spaces": occupied_spaces,
            "source": source,
            "operator_id": operator_id,
            "recorded_at": now.isoformat(),
            "data_freshness": f"Just updated via {source} by {operator_id}.",
            "message": "Physical occupancy status successfully recorded in Supabase."
        }

    def get_nearest_available_alternatives(
        self,
        excluded_facility_id: str,
        dest_lat: float,
        dest_lon: float,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
        limit: int = 5
    ) -> List[Dict[str, Any]]:
        """
        Ranks alternative parking facilities by walking distance when requested facility is unavailable.
        Uses actual pedestrian network routing where available.
        """
        alternatives = []
        for fac in self._facilities:
            f_id = f"parking_{fac.get('source_row')}"
            if f_id == excluded_facility_id:
                continue

            status, freshness, _ = self.evaluate_facility_availability(f_id, start_time, end_time)
            # Exclude full / maintenance / already reserved facilities
            if status in ("occupied", "maintenance", "reserved"):
                continue

            f_lat = fac["latitude"]
            f_lon = fac["longitude"]

            # Calculate walking distance
            dist_m = None
            dist_type = "straight_line"
            if self.pedestrian_graph:
                try:
                    route = self.pedestrian_graph.find_route(
                        start_lat=f_lat,
                        start_lon=f_lon,
                        dest_lat=dest_lat,
                        dest_lon=dest_lon,
                        preference="fastest"
                    )
                    dist_m = route["distance_m"]
                    dist_type = "pedestrian_network"
                except Exception:
                    pass

            if dist_m is None:
                dist_m = haversine_distance_m(dest_lon, dest_lat, f_lon, f_lat)
                dist_type = "straight_line"

            walk_min = round(dist_m / (1.3 * 60.0), 1)

            alternatives.append({
                "id": f_id,
                "name": fac.get("name", "Sector 17 Parking"),
                "address": fac.get("address", "Sector 17, Chandigarh"),
                "latitude": f_lat,
                "longitude": f_lon,
                "distance_to_dest_m": round(dist_m, 1),
                "distance_type": dist_type,
                "walking_time_to_dest_min": walk_min,
                "capacity_four_wheeler": fac.get("capacity_four_wheeler"),
                "capacity_two_wheeler": fac.get("capacity_two_wheeler"),
                "total_recorded_capacity": fac.get("total_capacity"),
                "availability_status": status,
                "is_confirmed_available": status == "available",
                "data_freshness": freshness
            })

        # Rank: confirmed available first, then closest walking distance
        alternatives.sort(key=lambda x: (not x["is_confirmed_available"], x["distance_to_dest_m"]))
        return alternatives[:limit]

    def rank_parking_for_display(
        self,
        dest_lat: float,
        dest_lon: float,
        start_time: Optional[datetime] = None,
        duration_minutes: int = 60,
        limit: int = 25
    ) -> List[Dict[str, Any]]:
        """Produces ranked parking list with unified availability status for UI."""
        start_dt = start_time or datetime.now(timezone.utc)
        end_dt = start_dt + timedelta(minutes=duration_minutes)

        # Batch pre-fetch active reservations & occupancy from Supabase
        if self.supabase_service.is_configured:
            try:
                self.supabase_service.fetch_latest_occupancy_records()
            except Exception:
                pass
            try:
                self.supabase_service.fetch_active_reservations()
            except Exception:
                pass

        items = []
        for fac in self._facilities:
            f_id = f"parking_{fac.get('source_row')}"
            status, freshness, active_count = self.evaluate_facility_availability(f_id, start_dt, end_dt)
            occ = self.get_facility_occupancy(f_id)

            f_lat = fac["latitude"]
            f_lon = fac["longitude"]

            dist_m = None
            dist_type = "straight_line"
            if self.pedestrian_graph:
                try:
                    route = self.pedestrian_graph.find_route(
                        start_lat=f_lat,
                        start_lon=f_lon,
                        dest_lat=dest_lat,
                        dest_lon=dest_lon,
                        preference="fastest"
                    )
                    dist_m = route["distance_m"]
                    dist_type = "pedestrian_network"
                except Exception:
                    pass

            if dist_m is None:
                dist_m = haversine_distance_m(dest_lon, dest_lat, f_lon, f_lat)
                dist_type = "straight_line"

            items.append({
                "id": f_id,
                "name": fac.get("name", "Sector 17 Parking"),
                "address": fac.get("address", "Sector 17, Chandigarh"),
                "latitude": f_lat,
                "longitude": f_lon,
                "distance_to_dest_m": round(dist_m, 1),
                "distance_type": dist_type,
                "walking_time_to_dest_min": round(dist_m / (1.3 * 60.0), 1),
                "capacity_four_wheeler": fac.get("capacity_four_wheeler"),
                "capacity_two_wheeler": fac.get("capacity_two_wheeler"),
                "total_recorded_capacity": fac.get("total_capacity"),
                "availability_status": status,
                "physical_occupancy_status": occ["physical_status"],
                "physical_occupied_spaces": occ["occupied_spaces"],
                "active_reservations_count": active_count,
                "data_freshness": freshness,
                "last_updated_at": occ.get("last_updated_at"),
                "update_source": occ.get("update_source", "system_baseline"),
                "live_sensor_connected": False,
                "availability_disclaimer": "Recorded capacity only. Live sensors unmonitored."
            })

        items.sort(key=lambda x: x["distance_to_dest_m"])
        return items[:limit]
