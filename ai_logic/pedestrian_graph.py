import json
import math
from pathlib import Path
from typing import Dict, Any, List, Tuple, Optional
import networkx as nx
from shapely.geometry import LineString

from ai_logic.shade_estimator import ShadeEstimator

def haversine_distance_m(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    """Computes distance in meters between two WGS84 points using Haversine formula."""
    R = 6371000.0  # Earth radius in meters
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)

    a = math.sin(dphi / 2.0) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2.0) ** 2
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return R * c

class PedestrianGraph:
    """
    Manages the pedestrian network graph for Sector 17, Chandigarh.
    Supports road-following path calculation, shade-weighted multi-criteria routing,
    and topological connectivity verification.
    """

    def __init__(
        self,
        geojson_path: Optional[Path] = None,
        shade_estimator: Optional[ShadeEstimator] = None,
        edges_records: Optional[List[Dict[str, Any]]] = None
    ):
        self.graph = nx.Graph()
        self.shade_estimator = shade_estimator
        self.nodes_spatial: List[Tuple[Tuple[float, float], float, float]] = []  # [((lon, lat), lon, lat)]
        self._current_hour: float = 14.0
        self.data_source = "none"

        if edges_records:
            self._load_network_records(edges_records)
            self.data_source = "supabase_postgis"
        elif geojson_path and geojson_path.exists():
            self._load_network_file(geojson_path)
            self.data_source = "local_geojson"

    def _round_coord(self, lon: float, lat: float) -> Tuple[float, float]:
        """Round coordinates to 6 decimal places (~11cm precision)."""
        return (round(lon, 6), round(lat, 6))

    def _add_segments(
        self,
        coords: List[List[float]],
        highway: str,
        name: str,
        rec_shade: Optional[int],
        start_edge_id: int,
        surface: str = "unknown",
        is_synthetic: bool = False
    ) -> int:
        edge_id = start_edge_id
        for i in range(len(coords) - 1):
            p1 = self._round_coord(coords[i][0], coords[i][1])
            p2 = self._round_coord(coords[i + 1][0], coords[i + 1][1])

            if p1 == p2:
                continue

            length_m = haversine_distance_m(p1[0], p1[1], p2[0], p2[1])
            if length_m < 0.5:
                continue

            segment_geom = LineString([p1, p2])
            
            # Estimate shade for this segment
            if self.shade_estimator:
                shade_info = self.shade_estimator.estimate_edge_shade(
                    segment_geom, hour=self._current_hour, highway_type=highway
                )
            else:
                s_score = rec_shade if rec_shade is not None else 35
                shade_info = {"shade_fraction": s_score / 100.0, "shade_score": s_score, "confidence": "database_recorded"}

            shade_frac = shade_info.get("shade_fraction", 0.35)
            shade_score = shade_info.get("shade_score", 35)

            # Walking speed ~ 1.3 m/s (~4.7 km/h)
            walk_time_sec = length_m / 1.3
            
            # Fastest: purely minimize walking duration along actual network
            cost_fastest = walk_time_sec
            
            # Shadiest: strong solar radiation avoidance penalty
            cost_shadiest = walk_time_sec * (1.0 + (1.0 - shade_frac) * 8.0)
            
            # Balanced: moderate shade preference balancing extra walking distance with sun relief
            cost_balanced = walk_time_sec * (1.0 + (1.0 - shade_frac) * 3.8)

            # Accessibility: evaluate step-free walkability, confirmed paved surface, and vibration
            surf_clean = str(surface).lower().strip()
            if highway == "steps":
                cost_accessible = walk_time_sec * 60.0  # Impassable for wheelchairs/step-free navigation
                is_step_free = False
                is_paved = False
            elif surf_clean in ("asphalt", "paved", "concrete", "paving_stones"):
                cost_accessible = walk_time_sec * 1.0  # Confirmed smooth paved surface
                is_step_free = True
                is_paved = True
            elif surf_clean in ("unpaved", "dirt", "earth", "gravel", "sand", "ground"):
                cost_accessible = walk_time_sec * 4.5  # Rough surface / high rolling resistance
                is_step_free = False
                is_paved = False
            else:
                # "unknown" or unrecorded municipal tag: apply moderate penalty for uncertainty
                cost_accessible = walk_time_sec * 1.6
                is_step_free = True
                is_paved = False

            self.graph.add_node(p1, lon=p1[0], lat=p1[1])
            self.graph.add_node(p2, lon=p2[0], lat=p2[1])

            self.graph.add_edge(
                p1, p2,
                edge_id=edge_id,
                length_m=round(length_m, 2),
                walk_time_sec=round(walk_time_sec, 2),
                cost_fastest=round(cost_fastest, 2),
                cost_shadiest=round(cost_shadiest, 2),
                cost_balanced=round(cost_balanced, 2),
                cost_accessible=round(cost_accessible, 2),
                shade_fraction=shade_frac,
                shade_score=shade_score,
                highway=highway,
                name=name,
                surface=surface,
                is_synthetic=is_synthetic,
                is_step_free=is_step_free,
                is_paved=is_paved,
                coordinates=[[p1[0], p1[1]], [p2[0], p2[1]]]
            )
            edge_id += 1
        return edge_id

    def _load_network_records(self, records: List[Dict[str, Any]]):
        edge_id = 0
        for rec in records:
            geom_raw = rec.get("geom") or rec.get("geometry")
            if not geom_raw:
                continue
            g_type = geom_raw.get("type")
            coords = geom_raw.get("coordinates", [])

            if g_type == "Polygon" and coords:
                coords = coords[0]  # exterior ring
            elif g_type != "LineString" or len(coords) < 2:
                continue

            props = rec.get("properties") or {}
            highway = rec.get("highway_type") or rec.get("highway") or props.get("highway", "footway")
            name = rec.get("street_name") or rec.get("name") or props.get("name", "Walkable Corridor")
            surface = rec.get("surface") or props.get("surface", "unknown")
            rec_shade = rec.get("shade_score") or props.get("shade_score")

            edge_id = self._add_segments(coords, highway, name, rec_shade, edge_id, surface=surface, is_synthetic=False)

        self._heal_network_connectivity(max_gap_m=65.0)
        self.nodes_spatial = [(n, n[0], n[1]) for n in self.graph.nodes()]

    def _load_network_file(self, geojson_path: Path):
        with open(geojson_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        self._load_network_records(data.get("features", []))

    def _load_network(self, geojson_path: Path):
        self._load_network_file(geojson_path)

    def _heal_network_connectivity(self, max_gap_m: float = 65.0):
        """
        Connects disconnected pedestrian subgraphs across short street crossings (<= 65m)
        to form a fully connected walkable urban network across Sector 17.
        """
        comps = sorted(list(nx.connected_components(self.graph)), key=len, reverse=True)
        if len(comps) <= 1:
            return

        c0 = set(comps[0])
        edge_id = len(self.graph.edges)

        for c in comps[1:]:
            best_dist = float("inf")
            best_pair = None
            for n in c:
                for n0 in c0:
                    d = haversine_distance_m(n[0], n[1], n0[0], n0[1])
                    if d < best_dist:
                        best_dist = d
                        best_pair = (n, n0)

            if best_pair and best_dist <= max_gap_m:
                walk_time = best_dist / 1.3
                self.graph.add_edge(
                    best_pair[0], best_pair[1],
                    edge_id=edge_id,
                    length_m=round(best_dist, 2),
                    walk_time_sec=round(walk_time, 2),
                    cost_fastest=round(walk_time, 2),
                    cost_shadiest=round(walk_time * 2.0, 2),
                    cost_balanced=round(walk_time * 1.5, 2),
                    cost_accessible=round(walk_time * 3.5, 2),  # Cautionary penalty for unverified crossing
                    shade_fraction=0.25,
                    shade_score=25,
                    highway="unverified_crossing",
                    name="Unverified Street Crossing (Gap healed)",
                    surface="unverified",
                    is_synthetic=True,
                    is_step_free=True,
                    is_paved=False,
                    coordinates=[[best_pair[0][0], best_pair[0][1]], [best_pair[1][0], best_pair[1][1]]]
                )
                edge_id += 1
                c0.update(c)

    def reweight_for_hour(self, hour: float):
        """Dynamically reweights all network edges for the specified solar hour."""
        if not self.shade_estimator or abs(self._current_hour - hour) < 0.1:
            return
        self._current_hour = hour

        for u, v, data in self.graph.edges(data=True):
            coords = data["coordinates"]
            segment_geom = LineString(coords)
            hw = data.get("highway", "footway")
            shade_info = self.shade_estimator.estimate_edge_shade(segment_geom, hour=hour, highway_type=hw)
            
            shade_frac = shade_info.get("shade_fraction", 0.35)
            shade_score = shade_info.get("shade_score", 35)
            walk_time_sec = data["walk_time_sec"]

            data["shade_fraction"] = shade_frac
            data["shade_score"] = shade_score
            data["cost_fastest"] = walk_time_sec
            data["cost_shadiest"] = round(walk_time_sec * (1.0 + (1.0 - shade_frac) * 8.0), 2)
            data["cost_balanced"] = round(walk_time_sec * (1.0 + (1.0 - shade_frac) * 3.8), 2)

    def snap_to_nearest_node(self, lat: float, lon: float, max_snap_dist_m: float = 300.0) -> Tuple[Tuple[float, float], float]:
        """
        Finds the nearest graph node to the given coordinates.
        Returns ((node_lon, node_lat), distance_meters).
        Raises ValueError if nearest node exceeds max_snap_dist_m.
        """
        if not self.nodes_spatial:
            raise ValueError("Pedestrian graph has no nodes.")

        best_node = None
        min_dist = float("inf")

        for node, n_lon, n_lat in self.nodes_spatial:
            d = haversine_distance_m(lon, lat, n_lon, n_lat)
            if d < min_dist:
                min_dist = d
                best_node = node

        if min_dist > max_snap_dist_m:
            raise ValueError(
                f"Selected location ({lat:.5f}, {lon:.5f}) is {min_dist:.1f}m away from the nearest walkable path "
                f"(max allowed: {max_snap_dist_m:.0f}m). Please select a point within or near Sector 17."
            )

        return best_node, min_dist

    def snap_to_connected_nodes(
        self,
        start_lat: float,
        start_lon: float,
        dest_lat: float,
        dest_lon: float,
        max_snap_dist_m: float = 300.0
    ) -> Tuple[Tuple[float, float], Tuple[float, float], float, float]:
        """
        Smart topological snapping: finds the nearest node pair for start and destination
        that belong to the same connected component in the pedestrian graph.
        Prevents graph disconnect failures when snapping near isolated fragments.
        """
        if not self.nodes_spatial:
            raise ValueError("Pedestrian graph has no nodes.")

        # Candidate nodes for start sorted by distance
        start_candidates = []
        for node, n_lon, n_lat in self.nodes_spatial:
            d = haversine_distance_m(start_lon, start_lat, n_lon, n_lat)
            if d <= max_snap_dist_m:
                start_candidates.append((d, node))
        start_candidates.sort(key=lambda x: x[0])

        if not start_candidates:
            # Find closest to provide informative error
            closest_dist = min(haversine_distance_m(start_lon, start_lat, n[1], n[2]) for n in self.nodes_spatial)
            raise ValueError(
                f"Start location ({start_lat:.5f}, {start_lon:.5f}) is {closest_dist:.1f}m away from the nearest walkable path "
                f"(max allowed: {max_snap_dist_m:.0f}m). Please select a point within or near Sector 17."
            )

        # Candidate nodes for destination sorted by distance
        dest_candidates = []
        for node, n_lon, n_lat in self.nodes_spatial:
            d = haversine_distance_m(dest_lon, dest_lat, n_lon, n_lat)
            if d <= max_snap_dist_m:
                dest_candidates.append((d, node))
        dest_candidates.sort(key=lambda x: x[0])

        if not dest_candidates:
            closest_dist = min(haversine_distance_m(dest_lon, dest_lat, n[1], n[2]) for n in self.nodes_spatial)
            raise ValueError(
                f"Destination location ({dest_lat:.5f}, {dest_lon:.5f}) is {closest_dist:.1f}m away from the nearest walkable path "
                f"(max allowed: {max_snap_dist_m:.0f}m). Please select a point within or near Sector 17."
            )

        # Map nodes to their connected component index for instant lookups
        connected_components = list(nx.connected_components(self.graph))
        node_to_comp = {}
        for comp_idx, comp_nodes in enumerate(connected_components):
            for n in comp_nodes:
                node_to_comp[n] = comp_idx

        # Group candidates by component to find the minimum access walk
        start_by_comp: Dict[int, Tuple[float, Any]] = {}
        for s_dist, s_node in start_candidates:
            c = node_to_comp.get(s_node)
            if c is not None and (c not in start_by_comp or s_dist < start_by_comp[c][0]):
                start_by_comp[c] = (s_dist, s_node)

        dest_by_comp: Dict[int, Tuple[float, Any]] = {}
        for d_dist, d_node in dest_candidates:
            c = node_to_comp.get(d_node)
            if c is not None and (c not in dest_by_comp or d_dist < dest_by_comp[c][0]):
                dest_by_comp[c] = (d_dist, d_node)

        best_pair = None
        min_total_access = float("inf")

        for comp_id in start_by_comp:
            if comp_id in dest_by_comp:
                s_dist, s_node = start_by_comp[comp_id]
                d_dist, d_node = dest_by_comp[comp_id]
                total_access = s_dist + d_dist
                if total_access < min_total_access:
                    min_total_access = total_access
                    best_pair = (s_node, d_node, s_dist, d_dist)

        if not best_pair:
            raise ValueError(
                f"No connected walkable route exists between start ({start_lat:.5f}, {start_lon:.5f}) "
                f"and destination ({dest_lat:.5f}, {dest_lon:.5f}) within {max_snap_dist_m:.0f}m of the pedestrian network."
            )

        return best_pair

    def find_route(
        self,
        start_lat: float,
        start_lon: float,
        dest_lat: float,
        dest_lon: float,
        preference: str = "fastest",
        departure_hour: float = 14.0
    ) -> Dict[str, Any]:
        """
        Calculates a connected, road-following pedestrian route for the given preference.
        Routes follow real walkable roads and paths (GeoJSON LineString coordinates).
        """
        # Ensure weights reflect the departure hour
        self.reweight_for_hour(departure_hour)

        # Smart snap start and destination to connected network nodes
        start_node, dest_node, snap_start_dist, snap_dest_dist = self.snap_to_connected_nodes(
            start_lat, start_lon, dest_lat, dest_lon
        )

        # Handle same node edge case
        if start_node == dest_node:
            direct_dist = haversine_distance_m(start_lon, start_lat, dest_lon, dest_lat)
            return {
                "route_found": True,
                "preference": preference,
                "distance_m": round(direct_dist, 1),
                "duration_minutes": round(direct_dist / 1.3 / 60.0, 1),
                "shade_score": 50,
                "coordinates": [[start_lon, start_lat], [dest_lon, dest_lat]],
                "snapped_start_dist_m": round(snap_start_dist, 1),
                "snapped_dest_dist_m": round(snap_dest_dist, 1),
                "steps": [{
                    "instruction": f"Arrive at destination ({direct_dist:.0f}m walk)",
                    "distance_m": round(direct_dist, 1),
                    "duration_sec": round(direct_dist / 1.3, 1),
                    "shade_score": 50
                }],
                "node_count": 1,
                "note": "Start and destination are at the same pedestrian network node."
            }

        weight_key = {
            "fastest": "cost_fastest",
            "shadiest": "cost_shadiest",
            "balanced": "cost_balanced",
            "accessible": "cost_accessible"
        }.get(preference.lower(), "cost_fastest")

        try:
            path_nodes = nx.shortest_path(self.graph, source=start_node, target=dest_node, weight=weight_key)
        except nx.NetworkXNoPath:
            raise ValueError("No walkable path found between the snapped network nodes.")

        # Reconstruct road-following coordinates and step statistics
        total_network_dist_m = 0.0
        total_network_dur_sec = 0.0
        total_weighted_shade = 0.0
        paved_dist_m = 0.0
        unpaved_dist_m = 0.0
        synthetic_crossings = 0
        steps_count = 0
        
        coords = []
        steps = []

        # Connect user's exact start pin to the initial road node if offset > 1m
        if snap_start_dist > 1.0:
            coords.append([round(start_lon, 6), round(start_lat, 6)])

        # Follow every vertex along the actual road/path LineString
        for i in range(len(path_nodes) - 1):
            u = path_nodes[i]
            v = path_nodes[i + 1]
            edge_data = self.graph.get_edge_data(u, v)

            e_len = edge_data["length_m"]
            e_dur = edge_data["walk_time_sec"]
            e_shade = edge_data["shade_score"]
            e_name = edge_data["name"]
            e_hw = edge_data["highway"]
            e_paved = edge_data.get("is_paved", False)
            e_synth = edge_data.get("is_synthetic", False)

            total_network_dist_m += e_len
            total_network_dur_sec += e_dur
            total_weighted_shade += (e_shade * e_len)

            if e_paved:
                paved_dist_m += e_len
            if edge_data.get("surface") == "unpaved":
                unpaved_dist_m += e_len
            if e_synth:
                synthetic_crossings += 1
            if e_hw == "steps":
                steps_count += 1

            if not coords or coords[-1] != [u[0], u[1]]:
                coords.append([u[0], u[1]])
            coords.append([v[0], v[1]])

            # Add step detail with honesty regarding synthetic crossings & stairs
            if e_synth:
                step_instr = f"Caution: Unverified street crossing ({e_len:.1f}m)"
            elif e_hw == "steps":
                step_instr = f"Staircase warning: Steps encountered along path ({e_len:.1f}m)"
            else:
                step_instr = f"Walk along {e_name} ({e_hw})"

            steps.append({
                "instruction": step_instr,
                "distance_m": e_len,
                "duration_sec": e_dur,
                "shade_score": e_shade
            })

        # Connect the last road node to user's exact destination pin if offset > 1m
        if snap_dest_dist > 1.0:
            coords.append([round(dest_lon, 6), round(dest_lat, 6)])

        # Total distance and duration include access walk
        access_dist_m = snap_start_dist + snap_dest_dist
        access_dur_sec = access_dist_m / 1.3
        
        total_dist_m = total_network_dist_m + access_dist_m
        total_dur_sec = total_network_dur_sec + access_dur_sec

        avg_shade_score = int(round(total_weighted_shade / total_network_dist_m)) if total_network_dist_m > 0 else 35

        # Calculate honest accessibility metrics
        paved_pct = round((paved_dist_m / total_network_dist_m) * 100.0, 1) if total_network_dist_m > 0 else 0.0
        step_free = (steps_count == 0)

        if not step_free:
            acc_score = max(10, 30 - steps_count * 15)
        else:
            acc_score = int(round(45.0 + 0.55 * paved_pct - synthetic_crossings * 8.0 - unpaved_dist_m * 0.1))
            acc_score = max(15, min(100, acc_score))

        acc_notes = [
            f"{paved_pct}% confirmed paved/asphalt surface ({paved_dist_m:.0f}m / {total_network_dist_m:.0f}m)."
        ]
        if step_free:
            acc_notes.append("Step-free: No staircase segments detected on this route.")
        else:
            acc_notes.append(f"Inaccessible: Contains {steps_count} staircase segment(s).")

        if synthetic_crossings > 0:
            acc_notes.append(f"Caution: Traverses {synthetic_crossings} unverified gap-healed crossing(s).")

        acc_notes.append(
            "Survey Notice: Detailed municipal curb-cut and tactile paving attributes are unrecorded for Sector 17; proceed with caution."
        )

        return {
            "route_found": True,
            "preference": preference,
            "distance_m": round(total_dist_m, 1),
            "duration_minutes": round(total_dur_sec / 60.0, 1),
            "shade_score": avg_shade_score,
            "accessibility_score": acc_score,
            "step_free": step_free,
            "paved_percentage": paved_pct,
            "accessibility_notes": acc_notes,
            "synthetic_crossings": synthetic_crossings,
            "coordinates": coords,
            "snapped_start_dist_m": round(snap_start_dist, 1),
            "snapped_dest_dist_m": round(snap_dest_dist, 1),
            "steps": steps,
            "node_count": len(path_nodes)
        }
