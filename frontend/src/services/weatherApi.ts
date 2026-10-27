import { fetchJson } from './api';
import type { WeatherData, HealthStatus } from '../types';

export async function fetchCurrentWeather(lat = 30.7410, lon = 76.7820): Promise<WeatherData> {
  return fetchJson<WeatherData>(`/weather/current?lat=${lat}&lon=${lon}`);
}

export async function fetchHealth(): Promise<HealthStatus> {
  return fetchJson<HealthStatus>('/health');
}

export async function fetchSectorBoundary(): Promise<any> {
  return fetchJson<any>('/sectors');
}

