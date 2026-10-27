import pytest
from fastapi.testclient import TestClient
from backend.app.main import app

client = TestClient(app)

def test_api_health():
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["pilot_area"] == "Sector 17, Chandigarh, India"
    assert data["data_status"]["pedestrian_network"] == "loaded"

def test_api_sectors():
    response = client.get("/api/v1/sectors")
    assert response.status_code == 200
    data = response.json()
    assert data["pilot_sector"] == "Sector 17"
    assert "geojson" in data

def test_api_parking():
    response = client.get("/api/v1/parking?limit=10")
    assert response.status_code == 200
    data = response.json()
    assert data["count"] <= 10
    assert len(data["parking_lots"]) > 0
    first = data["parking_lots"][0]
    assert first["availability_status"] == "unknown"

def test_api_weather():
    response = client.get("/api/v1/weather/current")
    assert response.status_code == 200
    data = response.json()
    assert data["temperature_c"] is not None
    assert "units" in data

def test_api_routes_compare():
    payload = {
        "start_lat": 30.7400,
        "start_lon": 76.7800,
        "dest_lat": 30.7420,
        "dest_lon": 76.7830,
        "time_of_day_hour": 14.0,
        "preferences": ["fastest", "shadiest", "balanced"],
        "include_nearby_parking": True
    }
    response = client.post("/api/v1/routes/compare", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert len(data["routes"]) >= 1
    fastest = data["routes"][0]
    assert fastest["distance_m"] > 0
    assert fastest["duration_minutes"] > 0
    assert 0 <= fastest["shade_score"] <= 100
    assert 0 <= fastest["heat_score"] <= 100
    assert "weather_summary" in data
    assert "nearby_parking" in data
    assert len(data["nearby_parking"]) > 0

def test_api_routes_out_of_bounds_validation():
    # Attempting start point outside Chandigarh
    payload = {
        "start_lat": 28.6139, # New Delhi
        "start_lon": 77.2090,
        "dest_lat": 30.7420,
        "dest_lon": 76.7830
    }
    response = client.post("/api/v1/routes/compare", json=payload)
    # Pydantic validation should reject lat < 30.65
    assert response.status_code == 422

