import React from 'react';
import { Sun, Wind, Droplets, Thermometer, ShieldAlert, RefreshCw, CloudRain, AlertTriangle } from 'lucide-react';
import type { WeatherData } from '../../types';

interface WeatherPanelProps {
  weather: WeatherData | null;
  onRefresh?: () => void;
  isLoading?: boolean;
}

export const WeatherPanel: React.FC<WeatherPanelProps> = ({ weather, onRefresh, isLoading }) => {
  if (!weather) return null;

  const isLive = weather.status === 'live';
  const hasNoaaHi = weather.noaa_heat_index_c !== null && weather.noaa_heat_index_c !== undefined;

  return (
    <div className="weather-card">
      <div className="weather-header">
        <div className="weather-title-area">
          <Thermometer className="weather-header-icon" />
          <div>
            <h3>Microclimate & Live Weather</h3>
            <span className="weather-source">
              Source: {weather.source} {weather.cached && `(Cached ${weather.cache_age_seconds || 0}s ago)`}
            </span>
          </div>
        </div>
        <div className="weather-actions">
          <span className={`status-pill ${isLive ? 'pill-live' : 'pill-fallback'}`}>
            {isLive ? 'Live Feed' : 'Fallback Model'}
          </span>
          {onRefresh && (
            <button
              className="btn-icon-refresh"
              onClick={onRefresh}
              disabled={isLoading}
              title="Refresh weather data"
            >
              <RefreshCw className={`icon-refresh ${isLoading ? 'spinning' : ''}`} />
            </button>
          )}
        </div>
      </div>

      {weather.warning && (
        <div className="weather-warning">
          <ShieldAlert className="warning-icon" />
          <span>{weather.warning}</span>
        </div>
      )}

      {weather.weather_alerts && weather.weather_alerts.length > 0 && (
        <div className="weather-alerts-list" style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {weather.weather_alerts.map((al, idx) => (
            <div
              key={idx}
              style={{
                background: al.severity === 'high' ? '#fef2f2' : '#f0fdf4',
                border: `1px solid ${al.severity === 'high' ? '#fecaca' : '#bbf7d0'}`,
                borderRadius: '6px',
                padding: '6px 10px',
                fontSize: '11px',
                color: al.severity === 'high' ? '#991b1b' : '#166534',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px'
              }}
            >
              <AlertTriangle style={{ width: '14px', height: '14px', flexShrink: 0, marginTop: '2px' }} />
              <div>
                <strong>{al.title}:</strong> {al.message}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="weather-grid">
        <div className="weather-metric">
          <div className="metric-label">
            <Thermometer className="sub-icon" />
            <span>Air Temp</span>
          </div>
          <div className="metric-val">
            {weather.temperature_c !== null ? `${weather.temperature_c}°C` : '--'}
          </div>
        </div>

        <div className="weather-metric">
          <div className="metric-label">
            <Droplets className="sub-icon" />
            <span>Humidity</span>
          </div>
          <div className="metric-val">
            {weather.humidity_percent !== null ? `${weather.humidity_percent}%` : '--'}
          </div>
        </div>

        <div className="weather-metric highlight-metric">
          <div className="metric-label">
            <Sun className="sub-icon" />
            <span>Apparent Temp</span>
          </div>
          <div className="metric-val highlight-val">
            {weather.apparent_temperature_c !== null ? `${weather.apparent_temperature_c}°C` : '--'}
          </div>
          <span className="metric-subtext">Open-Meteo RealFeel</span>
        </div>

        <div className="weather-metric highlight-metric">
          <div className="metric-label">
            <Thermometer className="sub-icon" />
            <span>NOAA Heat Index</span>
          </div>
          <div className="metric-val highlight-val">
            {hasNoaaHi ? `${weather.noaa_heat_index_c}°C` : 'N/A'}
          </div>
          <span className="metric-subtext">Rothfusz Regression</span>
        </div>

        <div className="weather-metric">
          <div className="metric-label">
            <Sun className="sub-icon" />
            <span>UV Index</span>
          </div>
          <div className="metric-val">
            {weather.uv_index !== null ? weather.uv_index : '--'}
          </div>
        </div>

        <div className="weather-metric">
          <div className="metric-label">
            <Wind className="sub-icon" />
            <span>Wind Speed</span>
          </div>
          <div className="metric-val">
            {weather.wind_speed_kmh !== null ? `${weather.wind_speed_kmh} km/h` : '--'}
          </div>
        </div>

        <div className="weather-metric">
          <div className="metric-label">
            <CloudRain className="sub-icon" />
            <span>Precipitation</span>
          </div>
          <div className="metric-val">
            {weather.precipitation_mm !== undefined ? `${weather.precipitation_mm} mm` : '0 mm'}
          </div>
        </div>
      </div>

      {weather.observation_disclosure && (
        <div style={{ marginTop: '8px', fontSize: '10px', color: '#64748b', fontStyle: 'italic', borderTop: '1px solid #f1f5f9', paddingTop: '6px' }}>
          {weather.observation_disclosure}
        </div>
      )}
    </div>
  );
};
