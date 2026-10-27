export interface RouteStep {
  instruction: string;
  distance_m: number;
  duration_sec: number;
  shade_score: number;
}

export interface RouteAlternative {
  preference: 'fastest' | 'shadiest' | 'balanced' | 'accessible' | string;
  distance_m: number;
  duration_minutes: number;
  shade_score: number;
  accessibility_score?: number;
  step_free?: boolean;
  paved_percentage?: number;
  accessibility_notes?: string[];
  synthetic_crossings?: number;
  hazard_warnings?: RouteHazardWarning[];
  safety_advisory?: string | null;
  heat_score: number;
  heat_category: 'Low' | 'Moderate' | 'High' | 'Extreme' | string;
  heat_color: string;
  advisory: string;
  effective_temp_c: number;
  metric_used: string;
  coordinates: [number, number][]; // [lon, lat]
  steps: RouteStep[];
  disclaimer: string;
}

export interface ParkingItem {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  distance_to_dest_m: number;
  distance_type?: 'pedestrian_network' | 'straight_line' | string;
  walking_time_to_dest_min: number;
  capacity_four_wheeler: number | null;
  capacity_two_wheeler: number | null;
  total_recorded_capacity: number | null;
  in_sector17_exact: boolean;
  availability_status: 'available' | 'reserved' | 'occupied' | 'maintenance' | 'unknown' | 'stale' | 'simulated' | string;
  physical_occupancy_status?: string;
  physical_occupied_spaces?: number | null;
  active_reservations_count?: number;
  data_freshness?: string;
  last_updated_at?: string | null;
  update_source?: string;
  live_sensor_connected: boolean;
  availability_disclaimer: string;
  simulated_available_spaces?: number;
}

export interface ReservationItem {
  booking_id: string;
  facility_id: string;
  facility_name: string;
  facility_address?: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  status: 'confirmed' | 'cancelled' | 'expired' | string;
  user_session_id: string;
  vehicle_plate?: string;
  user_contact?: string;
  created_at: string;
  slot_scope?: string;
  disclaimer: string;
}

export interface ParkingAlternativeItem {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  distance_to_dest_m: number;
  distance_type: string;
  walking_time_to_dest_min: number;
  capacity_four_wheeler?: number | null;
  capacity_two_wheeler?: number | null;
  total_recorded_capacity?: number | null;
  availability_status: string;
  is_confirmed_available: boolean;
  data_freshness: string;
}

export interface ReservationConflictData {
  detail: string;
  requested_facility_id: string;
  requested_facility_name: string;
  conflict_reason: string;
  alternatives: ParkingAlternativeItem[];
}

export interface WeatherAlert {
  type: string;
  severity: 'low' | 'moderate' | 'high' | string;
  title: string;
  message: string;
}

export interface WeatherData {
  status: 'live' | 'stale_cache' | 'unavailable' | string;
  source: string;
  timestamp_utc?: string;
  retrieved_at_unix: number;
  latitude: number;
  longitude: number;
  temperature_c: number;
  humidity_percent: number;
  apparent_temperature_c: number;
  precipitation_mm?: number;
  noaa_heat_index_c?: number | null;
  uv_index?: number | null;
  wind_speed_kmh?: number | null;
  is_day?: boolean;
  cached?: boolean;
  cache_age_seconds?: number;
  warning?: string;
  weather_alerts?: WeatherAlert[];
  observation_disclosure?: string;
  units: {
    temperature: string;
    humidity: string;
    wind_speed: string;
    uv_index: string;
    precipitation?: string;
  };
}

export interface RouteHazardWarning {
  report_id: string;
  category: string;
  category_display: string;
  title: string;
  severity: string;
  latitude: number;
  longitude: number;
  distance_to_route_m: number;
  warning_message: string;
}

export interface CitizenReportItem {
  id: string;
  category: string;
  category_display: string;
  title: string;
  description?: string | null;
  severity: 'low' | 'moderate' | 'high' | 'severe' | string;
  status: 'submitted' | 'under_review' | 'verified' | 'resolved' | 'rejected' | string;
  latitude: number;
  longitude: number;
  is_gps_location: boolean;
  photo_url?: string | null;
  created_at: string;
  updated_at?: string | null;
  moderator_notes?: string | null;
  moderated_at?: string | null;
  is_verified_hazard: boolean;
  disclaimer: string;
}

export interface HazardMarkerItem {
  id: string;
  category: string;
  category_display: string;
  title: string;
  severity: string;
  status: string;
  latitude: number;
  longitude: number;
  photo_url?: string | null;
  created_at: string;
  is_active_hazard: boolean;
}

export interface ReportListResponse {
  count: number;
  total: number;
  pilot_area: string;
  reports: CitizenReportItem[];
  verified_hazards_count: number;
}


export interface DestinationItem {
  id: string;
  name: string;
  category: string;
  lat: number;
  lon: number;
  description: string;
}

export interface DestinationSearchResponse {
  query: string;
  language_hint?: string;
  match_count: number;
  is_ambiguous: boolean;
  top_match?: DestinationItem | null;
  candidates: DestinationItem[];
  note: string;
}

export interface RouteCompareResponse {
  routes: RouteAlternative[];
  weather_summary: WeatherData;
  nearby_parking: ParkingItem[];
  route_count: number;
  note?: string | null;
  data_source?: string;
}

export interface HealthStatus {
  status: string;
  service: string;
  pilot_area: string;
  version: string;
  data_status: {
    sector_boundary: string;
    pedestrian_network: string;
    parking_records: string;
    buildings: string;
  };
}

export interface RouteHazardWarning {
  report_id: string;
  category: string;
  category_display: string;
  title: string;
  severity: string;
  latitude: number;
  longitude: number;
  distance_to_route_m: number;
  warning_message: string;
}

export interface CitizenReportItem {
  id: string;
  category: string;
  category_display: string;
  title: string;
  description?: string | null;
  severity: 'low' | 'moderate' | 'high' | 'severe' | string;
  status: 'submitted' | 'under_review' | 'verified' | 'resolved' | 'rejected' | string;
  latitude: number;
  longitude: number;
  is_gps_location: boolean;
  photo_url?: string | null;
  created_at: string;
  updated_at?: string | null;
  moderator_notes?: string | null;
  moderated_at?: string | null;
  is_verified_hazard: boolean;
  disclaimer: string;
}

export interface HazardMarkerItem {
  id: string;
  category: string;
  category_display: string;
  title: string;
  severity: string;
  status: string;
  latitude: number;
  longitude: number;
  photo_url?: string | null;
  created_at: string;
  is_active_hazard: boolean;
}

export interface ReportListResponse {
  count: number;
  total: number;
  pilot_area: string;
  reports: CitizenReportItem[];
  verified_hazards_count: number;
}

