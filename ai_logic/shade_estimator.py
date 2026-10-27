import math
import json
from pathlib import Path
from typing import Dict, Any, List, Optional
from shapely.geometry import shape, Point, LineString, Polygon, MultiPolygon
from shapely import affinity
from shapely.ops import unary_union
from shapely.strtree import STRtree

class ShadeEstimator:
    """
    Estimates pedestrian route shade using building footprints,
    Sector 17 covered arcades, building heights, and solar position angles.
    """

    def __init__(self, buildings_geojson_path: Optional[Path] = None, buildings_records: Optional[List[Dict[str, Any]]] = None):
        self.buildings = []
        self.building_polygons = []
        self.spatial_tree: Optional[STRtree] = None
        self.data_source = "none"

        if buildings_records:
            self._load_from_records(buildings_records)
            self.data_source = "supabase_postgis"
        elif buildings_geojson_path and buildings_geojson_path.exists():
            self._load_buildings(buildings_geojson_path)
            self.data_source = "local_geojson"

    def _load_from_records(self, records: List[Dict[str, Any]]):
        for rec in records:
            geom_raw = rec.get("geom") or rec.get("geometry")
            if not geom_raw:
                continue
            try:
                geom = shape(geom_raw)
            except Exception:
                continue

            est_height = float(rec.get("height_meters") or 14.0)
            quality = rec.get("height_quality") or "sector17_commercial_baseline"
            b_name = rec.get("building_name")

            self.buildings.append({
                "id": rec.get("osm_id") or rec.get("id"),
                "geometry": geom,
                "height": est_height,
                "height_quality": quality,
                "name": b_name
            })
            self.building_polygons.append(geom)

        if self.building_polygons:
            self.spatial_tree = STRtree(self.building_polygons)

    def _load_buildings(self, path: Path):
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        for feat in data.get("features", []):
            geom_raw = feat.get("geometry")
            if not geom_raw:
                continue
            geom = shape(geom_raw)
            props = feat.get("properties") or {}
            
            # Determine height: height tag > levels * 3.5m > default 14m (4-storey Sector 17 commercial blocks)
            height = props.get("height")
            levels = props.get("levels")
            if height and height > 0:
                est_height = float(height)
                height_quality = "measured_tag"
            elif levels and levels > 0:
                est_height = float(levels) * 3.5
                height_quality = "estimated_from_levels"
            else:
                est_height = 14.0  # standard ~4-storey commercial block in Sector 17
                height_quality = "sector17_commercial_baseline"

            self.buildings.append({
                "id": feat.get("id"),
                "geometry": geom,
                "height": est_height,
                "height_quality": height_quality,
                "name": props.get("name")
            })
            self.building_polygons.append(geom)

        if self.building_polygons:
            self.spatial_tree = STRtree(self.building_polygons)

    def calculate_solar_position(self, hour: float, day_of_year: int = 150, lat: float = 30.74, lon: float = 76.78) -> Dict[str, float]:
        """
        Calculates solar elevation (altitude) and azimuth angle for given hour (0-24)
        at Chandigarh coordinates (default ~30.74° N, 76.78° E).
        """
        # Solar declination approximation
        declination = 23.45 * math.sin(math.radians((360 / 365) * (day_of_year - 81)))
        
        # Local solar time approximation (IST is UTC+5.5 -> 82.5° E meridian, Chandigarh is 76.78° E)
        time_diff_hours = (lon - 82.5) / 15.0
        solar_time = hour + time_diff_hours
        
        # Hour angle: 15 degrees per hour from solar noon (12:00)
        hour_angle = (solar_time - 12.0) * 15.0
        
        lat_rad = math.radians(lat)
        dec_rad = math.radians(declination)
        ha_rad = math.radians(hour_angle)
        
        # Elevation angle (alpha)
        sin_elev = math.sin(lat_rad) * math.sin(dec_rad) + math.cos(lat_rad) * math.cos(dec_rad) * math.cos(ha_rad)
        sin_elev = max(-1.0, min(1.0, sin_elev))
        elevation_deg = math.degrees(math.asin(sin_elev))
        
        # Azimuth angle (from North, clockwise)
        if elevation_deg > 0:
            cos_az = (math.sin(dec_rad) - math.sin(lat_rad) * sin_elev) / (math.cos(lat_rad) * math.cos(math.radians(elevation_deg)))
            cos_az = max(-1.0, min(1.0, cos_az))
            azimuth_deg = math.degrees(math.acos(cos_az))
            if hour_angle > 0:  # Afternoon (sun in West)
                azimuth_deg = 360.0 - azimuth_deg
        else:
            elevation_deg = 0.0
            azimuth_deg = 180.0

        return {
            "elevation_deg": round(elevation_deg, 2),
            "azimuth_deg": round(azimuth_deg, 2)
        }

    def estimate_edge_shade(self, line_geom: LineString, hour: float = 14.0, highway_type: str = "footway") -> Dict[str, Any]:
        """
        Estimates the shade fraction (0.0 to 1.0) and shade score (0-100) for a walkable edge.
        Considers proximity to buildings, building height, covered shopping arcades,
        urban street canyons, and solar shadow projection.
        """
        if not line_geom or line_geom.length == 0:
            return {
                "shade_fraction": 0.25,
                "shade_score": 25,
                "confidence": "baseline_heuristic",
                "details": "Invalid or zero-length geometry"
            }

        solar = self.calculate_solar_position(hour)
        elevation = solar["elevation_deg"]
        azimuth = solar["azimuth_deg"]

        # Night time (no sun) -> shade is technically 100% (zero direct solar radiation load)
        if elevation <= 2.0:
            return {
                "shade_fraction": 1.0,
                "shade_score": 100,
                "confidence": "night_time",
                "solar_elevation": elevation,
                "solar_azimuth": azimuth,
                "details": "Night or twilight; minimal solar radiation"
            }

        if not self.buildings:
            return {
                "shade_fraction": 0.25,
                "shade_score": 25,
                "confidence": "baseline_heuristic",
                "solar_elevation": elevation,
                "solar_azimuth": azimuth,
                "details": "Default urban corridor estimate (no building data loaded)"
            }

        # Query nearby buildings via spatial index (buffer ~35m ~ 0.00035 degrees)
        edge_buffer = line_geom.buffer(0.00035)
        if self.spatial_tree is not None:
            indices = self.spatial_tree.query(edge_buffer)
            nearby = [self.buildings[i] for i in indices]
        else:
            nearby = [b for b in self.buildings if edge_buffer.intersects(b["geometry"])]

        if not nearby:
            # Broad open street / perimeter road with minimal structural shading
            return {
                "shade_fraction": 0.15,
                "shade_score": 15,
                "confidence": "open_space",
                "solar_elevation": elevation,
                "solar_azimuth": azimuth,
                "details": "Wide open thoroughfare with minimal structural shading"
            }

        # Calculate distance to nearest building
        min_dist_m = min(b["geometry"].distance(line_geom) * 111000.0 for b in nearby)

        # Sector 17 commercial arcade & building proximity baseline:
        # Footways right under or flanking the verandahs (< 6m) receive deep structural shade.
        if min_dist_m < 6.0:
            base_shade = 0.68
        elif min_dist_m < 15.0:
            base_shade = 0.48
        elif min_dist_m < 25.0:
            base_shade = 0.32
        else:
            base_shade = 0.20

        # Urban street canyon bonus: pedestrian paths flanked by 2+ or 4+ commercial blocks
        canyon_bonus = 0.15 if len(nearby) >= 4 else (0.08 if len(nearby) >= 2 else 0.0)

        # Arterial perimeter roads (Himalaya Marg, Jan Marg, Madhya Marg) have wide right-of-ways
        if highway_type in ("primary", "secondary", "trunk"):
            base_shade = min(base_shade, 0.20)
            canyon_bonus = 0.0

        # Calculate shadow length multiplier: L = H / tan(elevation)
        tan_elev = max(0.1, math.tan(math.radians(elevation)))
        shadow_bearing = (azimuth + 180.0) % 360.0
        shadow_bearing_rad = math.radians(shadow_bearing)

        # Project building shadow polygons and check intersection with edge
        shadow_polygons = []
        for b in nearby[:12]:  # Evaluate up to 12 nearest buildings
            h = b["height"]
            shadow_dist_m = min(80.0, h / tan_elev)
            shadow_dist_deg = shadow_dist_m / 111000.0
            
            dx = shadow_dist_deg * math.sin(shadow_bearing_rad)
            dy = shadow_dist_deg * math.cos(shadow_bearing_rad)
            
            poly = b["geometry"]
            try:
                translated = affinity.translate(poly, xoff=dx, yoff=dy)
                shadow_hull = unary_union([poly, translated]).convex_hull
                shadow_polygons.append(shadow_hull)
            except Exception:
                continue

        raw_frac = 0.0
        if shadow_polygons:
            combined_shadow = unary_union(shadow_polygons)
            intersection = line_geom.intersection(combined_shadow)
            shaded_length = intersection.length if hasattr(intersection, "length") else 0.0
            raw_frac = shaded_length / line_geom.length if line_geom.length > 0 else 0.0

        # Integrate projected shadow coverage with structural arcade/canyon protection
        combined_shade = min(0.95, max(0.15, raw_frac * 0.40 + base_shade + canyon_bonus))
        shade_score = int(round(combined_shade * 100))

        return {
            "shade_fraction": round(combined_shade, 2),
            "shade_score": shade_score,
            "confidence": "modeled_geometry",
            "solar_elevation": elevation,
            "solar_azimuth": azimuth,
            "details": f"Modeled shadow & covered arcade from {len(nearby)} adjacent structures at {hour:02.0f}:00"
        }
