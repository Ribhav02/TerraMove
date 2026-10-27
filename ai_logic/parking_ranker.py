import json
from pathlib import Path
from typing import Dict, Any, List, Optional
from ai_logic.pedestrian_graph import haversine_distance_m

class ParkingRanker:
    """
    Ranks validated parking facilities in and around Sector 17 by distance to target.
    Supports Supabase PostGIS records, local fallback, and pedestrian network path distances.
    """

    def __init__(
        self,
        parking_json_path: Optional[Path] = None,
        parking_records: Optional[List[Dict[str, Any]]] = None,
        pedestrian_graph: Optional[Any] = None
    ):
        self.facilities: List[Dict[str, Any]] = []
        self.pedestrian_graph = pedestrian_graph
        self.data_source = "none"

        if parking_records:
            self._load_from_records(parking_records)
            self.data_source = "supabase_postgis"
        elif parking_json_path and parking_json_path.exists():
            self._load_from_file(parking_json_path)
            self.data_source = "local_json"

    def _load_from_records(self, records: List[Dict[str, Any]]):
        for p in records:
            geom = p.get("geom") or {}
            coords = geom.get("coordinates")
            if coords and len(coords) >= 2:
                lon, lat = coords[0], coords[1]
            else:
                lat = p.get("latitude")
                lon = p.get("longitude")

            if lat is None or lon is None:
                continue

            self.facilities.append({
                "id": f"parking_{p.get('source_row')}",
                "db_id": p.get("id"),
                "source_row": p.get("source_row", 0),
                "name": p.get("name") or "Sector 17 Parking",
                "address": p.get("address") or "Sector 17, Chandigarh",
                "latitude": float(lat),
                "longitude": float(lon),
                "capacity_four_wheeler": p.get("capacity_four_wheeler"),
                "capacity_two_wheeler": p.get("capacity_two_wheeler"),
                "total_capacity": p.get("total_capacity") or (
                    (p.get("capacity_four_wheeler") or 0) + (p.get("capacity_two_wheeler") or 0)
                ),
                "in_sector17_exact": p.get("in_sector17_exact", True),
                "in_sector17_buffered": p.get("in_sector17_buffered", False)
            })

    def _load_from_file(self, parking_json_path: Path):
        with open(parking_json_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            records = data.get("sector17_records", [])
        
        for p in records:
            caps = p.get("capacities", {})
            four_w = caps.get("No. of  4 wheeler parking ")
            two_w = caps.get("No. of  2 wheeler parking ")
            total_cap = p.get("total_capacity_recorded")

            self.facilities.append({
                "id": f"parking_{p.get('source_row')}",
                "db_id": None,
                "source_row": p.get("source_row", 0),
                "name": p.get("name", "Chandigarh Parking"),
                "address": p.get("raw", {}).get("parking address ", "").strip() or "Sector 17, Chandigarh",
                "latitude": float(p["latitude"]),
                "longitude": float(p["longitude"]),
                "capacity_four_wheeler": four_w,
                "capacity_two_wheeler": two_w,
                "total_capacity": total_cap,
                "in_sector17_exact": p.get("in_sector17_exact", True),
                "in_sector17_buffered": p.get("in_sector17_buffered", False)
            })

    def rank_for_destination(
        self,
        dest_lat: float,
        dest_lon: float,
        limit: int = 10,
        include_simulated_occupancy: bool = False
    ) -> List[Dict[str, Any]]:
        """
        Ranks parking spots relative to target coordinates.
        Uses pedestrian network routing distance when available, otherwise straight-line Haversine.
        """
        results = []

        for p in self.facilities:
            p_lat = p["latitude"]
            p_lon = p["longitude"]
            dist_type = "straight_line"

            # Check if network walk distance is computable
            dist_m = None
            if self.pedestrian_graph:
                try:
                    # Attempt quick shortest path along network
                    net_route = self.pedestrian_graph.find_route(
                        start_lat=dest_lat,
                        start_lon=dest_lon,
                        dest_lat=p_lat,
                        dest_lon=p_lon,
                        preference="fastest"
                    )
                    dist_m = net_route["distance_m"]
                    dist_type = "pedestrian_network"
                except Exception:
                    pass

            if dist_m is None:
                dist_m = haversine_distance_m(dest_lon, dest_lat, p_lon, p_lat)
                dist_type = "straight_line"

            walk_min = round(dist_m / (1.3 * 60.0), 1)

            item = {
                "id": f"parking_{p['source_row']}",
                "name": p["name"],
                "address": p["address"],
                "latitude": p_lat,
                "longitude": p_lon,
                "distance_to_dest_m": round(dist_m, 1),
                "distance_type": dist_type,
                "walking_time_to_dest_min": walk_min,
                "capacity_four_wheeler": p.get("capacity_four_wheeler"),
                "capacity_two_wheeler": p.get("capacity_two_wheeler"),
                "total_recorded_capacity": p.get("total_capacity"),
                "in_sector17_exact": p.get("in_sector17_exact", True),
                "in_sector17_buffered": p.get("in_sector17_buffered", False),
                "availability_status": "unknown",
                "live_sensor_connected": False,
                "availability_disclaimer": "Total recorded capacity only. Live occupancy sensors not deployed."
            }

            if include_simulated_occupancy:
                # Deterministic simulation for demo preview only
                seed_val = (p["source_row"] * 37) % 100
                total_cap = p.get("total_capacity") or 50
                item["simulated_available_spaces"] = int(round(total_cap * (seed_val / 100.0)))
                item["availability_status"] = "simulated"
                item["is_simulated"] = True

            results.append(item)

        results.sort(key=lambda x: x["distance_to_dest_m"])
        return results[:limit]

