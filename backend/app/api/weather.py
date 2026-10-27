from typing import Optional
from fastapi import APIRouter, Query
from backend.app.services.weather_service import WeatherService, DEFAULT_CHANDIGARH_LAT, DEFAULT_CHANDIGARH_LON

router = APIRouter()
weather_service = WeatherService(cache_ttl_seconds=600)

@router.get("/weather/current")
async def get_current_weather(
    lat: float = Query(DEFAULT_CHANDIGARH_LAT, ge=30.60, le=30.90),
    lon: float = Query(DEFAULT_CHANDIGARH_LON, ge=76.60, le=76.95)
):
    return await weather_service.get_current_weather(lat=lat, lon=lon)

