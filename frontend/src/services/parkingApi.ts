import { fetchJson } from './api';
import type { ParkingItem, ReservationItem, ParkingAlternativeItem, RouteAlternative, WeatherData } from '../types';

export interface ParkingResponse {
  count: number;
  total_available_records: number;
  pilot_area: string;
  parking_lots: ParkingItem[];
  active_reservations_total?: number;
  disclaimer: string;
}

export interface ReservationParams {
  facility_id: string;
  start_time: string; // ISO 8601 UTC
  duration_minutes: number;
  user_session_id: string;
  vehicle_plate?: string;
  user_contact?: string;
}

export interface ParkingNavigateResponse {
  origin_parking: {
    id: string;
    name: string;
    address: string;
    latitude: number;
    longitude: number;
  };
  destination: {
    latitude: number;
    longitude: number;
  };
  routes: RouteAlternative[];
  weather_summary: WeatherData;
  disclaimer: string;
}

export async function fetchParking(
  lat?: number,
  lon?: number,
  limit = 25,
  simulate = false,
  startTime?: string,
  durationMinutes: number = 60
): Promise<ParkingResponse> {
  const query = new URLSearchParams();
  if (lat !== undefined) query.append('lat', lat.toString());
  if (lon !== undefined) query.append('lon', lon.toString());
  query.append('limit', limit.toString());
  if (simulate) query.append('simulate', 'true');
  if (startTime) query.append('start_time', startTime);
  if (durationMinutes) query.append('duration_minutes', durationMinutes.toString());

  return fetchJson<ParkingResponse>(`/parking?${query.toString()}`);
}

export async function createReservation(params: ReservationParams): Promise<ReservationItem> {
  return fetchJson<ReservationItem>('/parking/reservations', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export async function cancelReservation(bookingId: string, sessionId?: string): Promise<{ booking_id: string; status: string; message: string }> {
  const query = sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : '';
  return fetchJson<{ booking_id: string; status: string; message: string }>(`/parking/reservations/${bookingId}/cancel${query}`, {
    method: 'POST',
  });
}

export async function fetchUserReservations(sessionId: string): Promise<{ user_session_id: string; count: number; reservations: ReservationItem[] }> {
  return fetchJson<{ user_session_id: string; count: number; reservations: ReservationItem[] }>(`/parking/reservations?session_id=${encodeURIComponent(sessionId)}`);
}

export async function updateOperatorOccupancy(
  facilityId: string,
  physicalStatus: string,
  operatorToken: string,
  occupiedSpaces?: number,
  totalCapacity?: number,
  notes?: string,
  operatorId: string = 'staff_on_duty'
): Promise<any> {
  return fetchJson<any>('/parking/operator/occupancy', {
    method: 'POST',
    headers: {
      'X-Operator-Token': operatorToken,
    },
    body: JSON.stringify({
      facility_id: facilityId,
      physical_status: physicalStatus,
      occupied_spaces: occupiedSpaces,
      total_capacity: totalCapacity,
      notes,
      operator_id: operatorId,
    }),
  });
}

export async function fetchParkingAlternatives(
  facilityId: string,
  destLat?: number,
  destLon?: number,
  limit = 5
): Promise<{ requested_facility_id: string; requested_facility_name: string; count: number; alternatives: ParkingAlternativeItem[] }> {
  const query = new URLSearchParams();
  if (destLat !== undefined) query.append('dest_lat', destLat.toString());
  if (destLon !== undefined) query.append('dest_lon', destLon.toString());
  query.append('limit', limit.toString());

  return fetchJson<{ requested_facility_id: string; requested_facility_name: string; count: number; alternatives: ParkingAlternativeItem[] }>(
    `/parking/${facilityId}/alternatives?${query.toString()}`
  );
}

export async function fetchParkingWalkingRoute(
  facilityId: string,
  destLat: number,
  destLon: number,
  accessibilityMode: boolean = false
): Promise<ParkingNavigateResponse> {
  const query = new URLSearchParams({
    dest_lat: destLat.toString(),
    dest_lon: destLon.toString(),
    accessibility_mode: accessibilityMode ? 'true' : 'false',
  });
  return fetchJson<ParkingNavigateResponse>(`/parking/${facilityId}/navigate?${query.toString()}`);
}
