import math
from typing import Dict, Any, Optional

def calculate_noaa_heat_index(temp_c: float, humidity: float) -> Optional[float]:
    """
    Computes NOAA Heat Index using the Rothfusz regression equation in Celsius.
    Standard formula applies when T >= 26.7°C (80°F) and RH >= 40%.
    Returns temperature in Celsius or None if conditions not applicable.
    """
    if temp_c is None or humidity is None:
        return None

    # Convert to Fahrenheit
    T = (temp_c * 9.0 / 5.0) + 32.0
    RH = humidity

    # Simple formula first
    hi_simple = 0.5 * (T + 61.0 + ((T - 68.0) * 1.2) + (RH * 0.094))
    if hi_simple < 80.0:
        return round((hi_simple - 32.0) * 5.0 / 9.0, 1)

    # Rothfusz regression
    c1 = -42.379
    c2 = 2.04901523
    c3 = 10.14333127
    c4 = -0.22475541
    c5 = -0.00683783
    c6 = -0.05481717
    c7 = 0.00122874
    c8 = 0.00085282
    c9 = -0.00000199

    hi = (c1 + (c2 * T) + (c3 * RH) + (c4 * T * RH) +
          (c5 * T * T) + (c6 * RH * RH) + (c7 * T * T * RH) +
          (c8 * T * RH * RH) + (c9 * T * T * RH * RH))

    # Adjustments
    if RH < 13.0 and 80.0 <= T <= 112.0:
        adj = ((13.0 - RH) / 4.0) * math.sqrt((17.0 - abs(T - 95.0)) / 17.0)
        hi -= adj
    elif RH > 85.0 and 80.0 <= T <= 87.0:
        adj = ((RH - 85.0) / 10.0) * ((87.0 - T) / 5.0)
        hi += adj

    # Convert back to Celsius
    hi_c = (hi - 32.0) * 5.0 / 9.0
    return round(hi_c, 1)

class HeatExposureService:
    """
    Computes route heat-exposure scores combining weather observations,
    route walking duration, and estimated shade coverage.
    """

    @staticmethod
    def evaluate_route_heat(
        temp_c: Optional[float],
        humidity: Optional[float],
        apparent_temp_c: Optional[float],
        uv_index: Optional[float],
        wind_speed_kmh: Optional[float],
        duration_minutes: float,
        shade_score: float, # 0-100
        weather_source: str = "open-meteo"
    ) -> Dict[str, Any]:
        """
        Calculates heat exposure index (0-100) and risk category.
        """
        # Determine effective thermal metric
        hi_calculated = None
        if temp_c is not None and humidity is not None and temp_c >= 26.0:
            hi_calculated = calculate_noaa_heat_index(temp_c, humidity)

        # Select representative thermal metric
        if hi_calculated is not None:
            thermal_metric_name = "NOAA Heat Index (Rothfusz Calculated)"
            effective_temp = hi_calculated
        elif apparent_temp_c is not None:
            thermal_metric_name = "Apparent Temperature (Open-Meteo)"
            effective_temp = apparent_temp_c
        elif temp_c is not None:
            thermal_metric_name = "Air Temperature (Fallback)"
            effective_temp = temp_c
        else:
            effective_temp = 28.0  # reasonable Chandigarh seasonal baseline
            thermal_metric_name = "Default Baseline (Weather Unavailable)"

        # Base thermal score: 20°C -> 15, 30°C -> 45, 40°C -> 85, 45°C -> 100
        base_score = max(0.0, min(100.0, (effective_temp - 18.0) * 3.5))

        # Solar radiation factor from UV index (0 to 12)
        uv_factor = 0.0
        if uv_index is not None and uv_index > 0:
            uv_factor = min(25.0, uv_index * 2.2)
        else:
            uv_factor = 5.0  # nominal daytime diffuse solar factor

        # Duration factor: longer exposure increases cumulative thermal strain
        # e.g., 5 min walk = 0.9x, 15 min = 1.0x, 30 min = 1.25x
        duration_mult = 1.0 + (max(0.0, duration_minutes - 10.0) * 0.015)

        # Shade relief: high shade reduces radiant solar load by up to 40%
        shade_fraction = max(0.0, min(1.0, shade_score / 100.0))
        effective_solar_factor = uv_factor * (1.0 - 0.70 * shade_fraction)
        shade_cooling_relief = base_score * (0.25 * shade_fraction)

        raw_heat_score = ((base_score - shade_cooling_relief) + effective_solar_factor) * duration_mult
        heat_score = int(round(max(0.0, min(100.0, raw_heat_score))))

        # Qualitative risk category
        if heat_score < 30:
            category = "Low"
            color = "#10B981" # Emerald
            advice = "Comfortable walking conditions; minimal heat strain."
        elif heat_score < 55:
            category = "Moderate"
            color = "#F59E0B" # Amber
            advice = "Mild thermal strain; shaded paths recommended during peak midday."
        elif heat_score < 80:
            category = "High"
            color = "#F97316" # Orange
            advice = "Elevated heat stress; seek shade, carry water, and minimize brisk walking."
        else:
            category = "Extreme"
            color = "#EF4444" # Red
            advice = "Severe thermal exposure; prioritize shadiest routes and take cooling pauses."

        return {
            "heat_exposure_score": heat_score,
            "category": category,
            "color_code": color,
            "advisory": advice,
            "metric_used": thermal_metric_name,
            "effective_temp_c": round(effective_temp, 1),
            "noaa_heat_index_c": hi_calculated,
            "apparent_temp_c": apparent_temp_c,
            "air_temp_c": temp_c,
            "humidity_percent": humidity,
            "uv_index": uv_index,
            "wind_speed_kmh": wind_speed_kmh,
            "duration_minutes": round(duration_minutes, 1),
            "shade_relief_applied_percent": int(round(shade_fraction * 100)),
            "weather_source": weather_source,
            "disclaimer": "Model estimate combining ambient microclimate and urban geometry; not an individual medical diagnostic."
        }

