import pytest
import math
from shapely.geometry import Point, LineString, Polygon

from ai_logic.heat_exposure import calculate_noaa_heat_index, HeatExposureService
from ai_logic.shade_estimator import ShadeEstimator
from ai_logic.pedestrian_graph import PedestrianGraph, haversine_distance_m
from ai_logic.parking_ranker import ParkingRanker
from backend.app.config import settings

def test_haversine_distance():
    # Distance between two known points in Chandigarh (approx 1.1 km)
    # Sector 17 Plaza (30.7410, 76.7820) to Sector 17 ISBT (30.7350, 76.7800)
    d = haversine_distance_m(76.7820, 30.7410, 76.7800, 30.7350)
    assert 600 < d < 900
    assert haversine_distance_m(76.7820, 30.7410, 76.7820, 30.7410) == 0.0

def test_noaa_heat_index_rothfusz():
    # Hot and humid: 35°C (95°F) and 60% RH -> Significant heat index
    hi = calculate_noaa_heat_index(35.0, 60.0)
    assert hi is not None
    assert hi > 35.0  # Heat index should exceed dry air temperature
    assert 40.0 < hi < 55.0

def test_noaa_heat_index_low_temp_fallback():
    # Cool temperature where heat index is not applicable
    hi = calculate_noaa_heat_index(22.0, 50.0)
    # Simple formula or low temp should return reasonable value
    assert hi is not None
    assert 20.0 <= hi <= 25.0

def test_noaa_heat_index_missing_inputs():
    assert calculate_noaa_heat_index(None, 60.0) is None
    assert calculate_noaa_heat_index(35.0, None) is None

def test_heat_exposure_service_scoring():
    res = HeatExposureService.evaluate_route_heat(
        temp_c=36.0,
        humidity=55.0,
        apparent_temp_c=42.0,
        uv_index=8.5,
        wind_speed_kmh=12.0,
        duration_minutes=15.0,
        shade_score=75.0,
        weather_source="Open-Meteo"
    )
    assert 0 <= res["heat_exposure_score"] <= 100
    assert res["category"] in ("Low", "Moderate", "High", "Extreme")
    assert "disclaimer" in res
    assert res["effective_temp_c"] is not None

def test_heat_exposure_service_weather_unavailable():
    res = HeatExposureService.evaluate_route_heat(
        temp_c=None,
        humidity=None,
        apparent_temp_c=None,
        uv_index=None,
        wind_speed_kmh=None,
        duration_minutes=10.0,
        shade_score=30.0,
        weather_source="fallback"
    )
    assert 0 <= res["heat_exposure_score"] <= 100
    assert res["metric_used"] == "Default Baseline (Weather Unavailable)"

def test_shade_estimator_solar_position():
    estimator = ShadeEstimator()
    # Solar noon in Chandigarh
    noon = estimator.calculate_solar_position(hour=12.5)
    assert noon["elevation_deg"] > 40.0 # High sun angle
    # Midnight
    night = estimator.calculate_solar_position(hour=0.0)
    assert night["elevation_deg"] == 0.0

def test_shade_estimator_night_full_shade():
    estimator = ShadeEstimator()
    test_line = LineString([(76.7800, 30.7400), (76.7810, 30.7400)])
    res = estimator.estimate_edge_shade(test_line, hour=23.0)
    assert res["shade_score"] == 100
    assert res["confidence"] == "night_time"

def test_pedestrian_graph_construction_and_weights():
    assert settings.PEDESTRIAN_NETWORK_PATH.exists(), "Pedestrian network GeoJSON must exist"
    graph = PedestrianGraph(settings.PEDESTRIAN_NETWORK_PATH)
    assert len(graph.graph.nodes()) > 50
    assert len(graph.graph.edges()) > 50

    # Ensure all edge weights are strictly nonnegative
    for u, v, data in graph.graph.edges(data=True):
        assert data["cost_fastest"] >= 0
        assert data["cost_shadiest"] >= 0
        assert data["cost_balanced"] >= 0
        assert data["length_m"] > 0

def test_pedestrian_graph_snapping_and_routing():
    graph = PedestrianGraph(settings.PEDESTRIAN_NETWORK_PATH)
    
    # Pick two points near Sector 17 Plaza
    start_lat, start_lon = 30.7400, 76.7800
    dest_lat, dest_lon = 30.7420, 76.7830

    route_fastest = graph.find_route(start_lat, start_lon, dest_lat, dest_lon, preference="fastest")
    assert route_fastest["route_found"] is True
    assert route_fastest["distance_m"] > 0
    assert route_fastest["duration_minutes"] > 0
    assert len(route_fastest["coordinates"]) >= 2
    assert 0 <= route_fastest["shade_score"] <= 100

def test_snapping_far_out_of_bounds_raises_error():
    graph = PedestrianGraph(settings.PEDESTRIAN_NETWORK_PATH)
    # Point in Mumbai (far away)
    with pytest.raises(ValueError) as excinfo:
        graph.snap_to_nearest_node(19.0760, 72.8777, max_snap_dist_m=200.0)
    assert "away from the nearest walkable path" in str(excinfo.value)

def test_parking_ranker_unknown_status():
    assert settings.PARKING_PATH.exists(), "Validated parking JSON must exist"
    ranker = ParkingRanker(settings.PARKING_PATH)
    assert len(ranker.facilities) == 23

    ranked = ranker.rank_for_destination(30.7410, 76.7820, limit=5)
    assert len(ranked) == 5
    for p in ranked:
        assert p["availability_status"] == "unknown"
        assert p["live_sensor_connected"] is False
        assert p["distance_to_dest_m"] >= 0
        assert "capacity_four_wheeler" in p

