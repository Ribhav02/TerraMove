import json
from pathlib import Path
from typing import Dict, Any, List, Optional

from backend.app.config import settings
from ai_logic.shade_estimator import ShadeEstimator
from ai_logic.pedestrian_graph import PedestrianGraph
from ai_logic.heat_exposure import HeatExposureService
from ai_logic.parking_ranker import ParkingRanker
from backend.app.services.weather_service import WeatherService
from backend.app.services.supabase_service import SupabaseService
from backend.app.services.community_service import CommunityService

class RoutingService:
    """
    Coordinates pedestrian routing, shade modeling, heat exposure evaluation,
    and parking ranking for Sector 17, Chandigarh using live Supabase PostGIS data.
    """

    def __init__(self, supabase_service: Optional[SupabaseService] = None):
        self.supabase_service = supabase_service or SupabaseService()
        self.community_service = CommunityService(supabase_service=self.supabase_service)
        self.weather_service = WeatherService(cache_ttl_seconds=600)
        self.data_sources: Dict[str, str] = {}
        self.load_data()

    def load_data(self, force_refresh: bool = False):
        """
        Loads network layers from Supabase PostGIS with intelligent fallback.
        Caches the built graph in memory for sub-10ms navigation lookups.
        """
        # 1. Buildings (for shade simulation)
        bldg_records, bldg_src = self.supabase_service.fetch_buildings(force_refresh=force_refresh)
        if bldg_src == "supabase_postgis":
            self.shade_estimator = ShadeEstimator(buildings_records=bldg_records)
        else:
            self.shade_estimator = ShadeEstimator(settings.BUILDINGS_PATH)

        # 2. Pedestrian Graph
        edges_records, edges_src = self.supabase_service.fetch_pedestrian_edges(force_refresh=force_refresh)
        if edges_src == "supabase_postgis":
            self.graph = PedestrianGraph(edges_records=edges_records, shade_estimator=self.shade_estimator)
        else:
            self.graph = PedestrianGraph(settings.PEDESTRIAN_NETWORK_PATH, self.shade_estimator)

        # 3. Parking Locations
        parking_records, parking_src = self.supabase_service.fetch_parking_locations(force_refresh=force_refresh)
        if parking_src == "supabase_postgis":
            self.parking_ranker = ParkingRanker(parking_records=parking_records, pedestrian_graph=self.graph)
        else:
            self.parking_ranker = ParkingRanker(settings.PARKING_PATH, pedestrian_graph=self.graph)

        self.data_sources = {
            "buildings": bldg_src,
            "pedestrian_edges": edges_src,
            "parking_locations": parking_src
        }

    async def compare_routes(
        self,
        start_lat: float,
        start_lon: float,
        dest_lat: float,
        dest_lon: float,
        departure_hour: float = 14.0,
        preferences: Optional[List[str]] = None,
        include_parking: bool = True
    ) -> Dict[str, Any]:
        if preferences is None or not preferences:
            preferences = ["fastest", "shadiest", "balanced"]

        # Fetch live weather for destination
        weather = await self.weather_service.get_current_weather(lat=dest_lat, lon=dest_lon)
        
        temp_c = weather.get("temperature_c")
        humidity = weather.get("humidity_percent")
        apparent_temp_c = weather.get("apparent_temperature_c")
        uv_index = weather.get("uv_index")
        wind_kmh = weather.get("wind_speed_kmh")
        weather_source = weather.get("source", "Open-Meteo")

        routes = []
        unique_paths = set()
        last_error = None

        for pref in preferences:
            try:
                route_res = self.graph.find_route(
                    start_lat=start_lat,
                    start_lon=start_lon,
                    dest_lat=dest_lat,
                    dest_lon=dest_lon,
                    preference=pref,
                    departure_hour=departure_hour
                )
            except Exception as e:
                last_error = e
                continue

            # Evaluate heat exposure for this route
            heat_res = HeatExposureService.evaluate_route_heat(
                temp_c=temp_c,
                humidity=humidity,
                apparent_temp_c=apparent_temp_c,
                uv_index=uv_index,
                wind_speed_kmh=wind_kmh,
                duration_minutes=route_res["duration_minutes"],
                shade_score=route_res["shade_score"],
                weather_source=weather_source
            )

            path_key = tuple((p[0], p[1]) for p in route_res["coordinates"][:10])
            unique_paths.add(path_key)

            # Check proximity to verified active community hazards (threshold 25.0 meters)
            hazard_warnings = []
            safety_advisory = None
            try:
                hazard_warnings = self.community_service.check_route_hazards(
                    route_coords=route_res["coordinates"],
                    threshold_meters=25.0
                )
                if hazard_warnings:
                    safety_advisory = (
                        f"Safety Notice: {len(hazard_warnings)} verified community hazard(s) "
                        f"detected within 25m of this walking corridor. Exercise caution."
                    )
            except Exception as he:
                pass

            routes.append({
                "preference": pref,
                "distance_m": route_res["distance_m"],
                "duration_minutes": route_res["duration_minutes"],
                "shade_score": route_res["shade_score"],
                "accessibility_score": route_res.get("accessibility_score", 70),
                "step_free": route_res.get("step_free", True),
                "paved_percentage": route_res.get("paved_percentage", 60.0),
                "accessibility_notes": route_res.get("accessibility_notes", []),
                "synthetic_crossings": route_res.get("synthetic_crossings", 0),
                "hazard_warnings": hazard_warnings,
                "safety_advisory": safety_advisory,
                "heat_score": heat_res["heat_exposure_score"],
                "heat_category": heat_res["category"],
                "heat_color": heat_res["color_code"],
                "advisory": heat_res["advisory"],
                "effective_temp_c": heat_res["effective_temp_c"],
                "metric_used": heat_res["metric_used"],
                "coordinates": route_res["coordinates"],
                "steps": route_res["steps"],
                "disclaimer": heat_res["disclaimer"]
            })

        if not routes and last_error:
            raise last_error

        # Rank nearby parking
        parking_list = []
        if include_parking:
            parking_list = self.parking_ranker.rank_for_destination(
                dest_lat=dest_lat,
                dest_lon=dest_lon,
                limit=8,
                include_simulated_occupancy=False
            )

        notes = []
        if len(routes) > 1 and len(unique_paths) == 1:
            notes.append(
                "The available pedestrian paths in this corridor are linear; "
                "consequently, alternative routing strategies follow the same physical corridor."
            )
        notes.append(
            "Safety Disclosure: Lighting coverage is not available in Sector 17 OpenStreetMap datasets. "
            "Safety assessments are strictly grounded in verified citizen hazard reports."
        )
        note = " | ".join(notes)

        return {
            "routes": routes,
            "weather_summary": weather,
            "nearby_parking": parking_list,
            "route_count": len(routes),
            "note": note,
            "data_source": self.data_sources.get("pedestrian_edges", "supabase_postgis")
        }
