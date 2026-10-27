import { fetchJson } from './api';
import type { RouteCompareResponse } from '../types';

export interface CompareRoutesParams {
  start_lat: number;
  start_lon: number;
  dest_lat: number;
  dest_lon: number;
  time_of_day_hour?: number;
  preferences?: string[];
  include_nearby_parking?: boolean;
  accessibility_mode?: boolean;
}

export async function compareRoutes(params: CompareRoutesParams): Promise<RouteCompareResponse> {
  return fetchJson<RouteCompareResponse>('/routes/compare', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

