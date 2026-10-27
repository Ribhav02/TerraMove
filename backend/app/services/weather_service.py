import time
import httpx
from typing import Dict, Any, Optional
from ai_logic.heat_exposure import calculate_noaa_heat_index

# Default coordinates: Sector 17 Plaza, Chandigarh
DEFAULT_CHANDIGARH_LAT = 30.7410
DEFAULT_CHANDIGARH_LON = 76.7820

class WeatherService:
    """
    Integrates with Open-Meteo for live weather observations and microclimate heat metrics.
    Features in-memory TTL caching, fallback handling, and NOAA heat index calculation.
    """

    def __init__(self, cache_ttl_seconds: int = 600):
        self.cache_ttl = cache_ttl_seconds
        self._cache: Dict[str, Dict[str, Any]] = {}

    def _cache_key(self, lat: float, lon: float) -> str:
        # Cache key rounded to ~1km grid
        return f"{round(lat, 2)}_{round(lon, 2)}"

    async def get_current_weather(self, lat: float = DEFAULT_CHANDIGARH_LAT, lon: float = DEFAULT_CHANDIGARH_LON) -> Dict[str, Any]:
        key = self._cache_key(lat, lon)
        now = time.time()

        if key in self._cache:
            entry = self._cache[key]
            if now - entry["timestamp"] < self.cache_ttl:
                cached_data = dict(entry["data"])
                cached_data["cached"] = True
                cached_data["cache_age_seconds"] = int(now - entry["timestamp"])
                return cached_data

        url = "https://api.open-meteo.com/v1/forecast"
        params = {
            "latitude": lat,
            "longitude": lon,
            "current": "temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m,uv_index",
            "timezone": "auto"
        }

        try:
            async with httpx.AsyncClient(timeout=6.0) as client:
                resp = await client.get(url, params=params)
                if resp.status_code == 200:
                    payload = resp.json()
                    curr = payload.get("current", {})

                    temp_c = curr.get("temperature_2m")
                    humidity = curr.get("relative_humidity_2m")
                    apparent_temp_c = curr.get("apparent_temperature")
                    uv_index = curr.get("uv_index")
                    wind_kmh = curr.get("wind_speed_10m")
                    is_day = curr.get("is_day") == 1
                    weather_code = curr.get("weather_code")
                    precipitation = curr.get("precipitation") or 0.0

                    # Calculate NOAA Heat Index if conditions permit
                    noaa_hi = calculate_noaa_heat_index(temp_c, humidity)

                    # Generate honest weather alerts based on real observations
                    weather_alerts = []
                    is_raining = precipitation > 0.0 or (weather_code is not None and weather_code in (51, 53, 55, 61, 63, 65, 80, 81, 82, 95, 96, 99))
                    if is_raining:
                        weather_alerts.append({
                            "type": "rain_alert",
                            "severity": "moderate",
                            "title": "Atmospheric Rain Observed",
                            "message": f"Precipitation detected ({precipitation:.1f} mm). Note: Atmospheric weather model observation only; on-ground puddle depth and footpath water logging are unmonitored."
                        })

                    if (temp_c is not None and temp_c >= 37.0) or (noaa_hi is not None and noaa_hi >= 38.0):
                        weather_alerts.append({
                            "type": "extreme_heat",
                            "severity": "high",
                            "title": "Extreme Heat Advisory",
                            "message": f"High ambient temperature ({temp_c}°C, Heat Index {noaa_hi}°C). Shaded building arcades strongly recommended to reduce solar radiation exposure."
                        })

                    if uv_index is not None and uv_index >= 7.0:
                        weather_alerts.append({
                            "type": "high_uv",
                            "severity": "moderate",
                            "title": "High Solar UV Index",
                            "message": f"UV Index {uv_index} (Very High). Walking along shaded Sector 17 verandas reduces direct UV exposure."
                        })

                    result = {
                        "status": "live",
                        "source": "Open-Meteo Free Weather API",
                        "timestamp_utc": curr.get("time"),
                        "retrieved_at_unix": int(now),
                        "latitude": lat,
                        "longitude": lon,
                        "temperature_c": temp_c,
                        "humidity_percent": humidity,
                        "apparent_temperature_c": apparent_temp_c,
                        "precipitation_mm": precipitation,
                        "noaa_heat_index_c": noaa_hi,
                        "uv_index": uv_index,
                        "wind_speed_kmh": wind_kmh,
                        "is_day": is_day,
                        "weather_code": weather_code,
                        "weather_alerts": weather_alerts,
                        "observation_disclosure": "Meteorological data reflects atmospheric station observations; local footpath puddles and surface conditions are unmonitored.",
                        "cached": False,
                        "units": {
                            "temperature": "°C",
                            "humidity": "%",
                            "precipitation": "mm",
                            "wind_speed": "km/h",
                            "uv_index": "index (0-12)"
                        }
                    }

                    # Store in cache
                    self._cache[key] = {
                        "timestamp": now,
                        "data": result
                    }
                    return result
                else:
                    return self._fallback_response(lat, lon, f"Open-Meteo returned status {resp.status_code}")

        except httpx.TimeoutException:
            return self._fallback_response(lat, lon, "Weather API request timed out (6.0s limit)")
        except Exception as e:
            return self._fallback_response(lat, lon, f"Weather API connection error: {str(e)}")

    def _fallback_response(self, lat: float, lon: float, error_detail: str) -> Dict[str, Any]:
        """
        Graceful fallback when API is unreachable without fabricating live measurements.
        """
        key = self._cache_key(lat, lon)
        if key in self._cache:
            entry = self._cache[key]
            stale = dict(entry["data"])
            stale["status"] = "stale_cache"
            stale["warning"] = f"Live update failed: {error_detail}. Returning previous cached reading."
            return stale

        # Transparent fallback with explicit status
        return {
            "status": "unavailable",
            "source": "Fallback baseline model",
            "retrieved_at_unix": int(time.time()),
            "latitude": lat,
            "longitude": lon,
            "temperature_c": 31.0,  # seasonal average
            "humidity_percent": 50.0,
            "apparent_temperature_c": 33.0,
            "precipitation_mm": 0.0,
            "noaa_heat_index_c": calculate_noaa_heat_index(31.0, 50.0),
            "uv_index": 6.0,
            "wind_speed_kmh": 10.0,
            "is_day": True,
            "cached": False,
            "warning": f"Live weather feed temporarily unavailable ({error_detail}). Microclimate estimates using seasonal baseline.",
            "weather_alerts": [{
                "type": "feed_offline",
                "severity": "low",
                "title": "Live Weather Offline",
                "message": f"Unable to reach live weather station. Displaying seasonal averages ({error_detail})."
            }],
            "observation_disclosure": "Baseline seasonal model only; do not rely for severe weather planning.",
            "units": {
                "temperature": "°C",
                "humidity": "%",
                "precipitation": "mm",
                "wind_speed": "km/h",
                "uv_index": "index (0-12)"
            }
        }

