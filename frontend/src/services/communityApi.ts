import { fetchJson } from './api';
import type {
  CitizenReportItem,
  ReportListResponse,
  HazardMarkerItem
} from '../types';

export interface ReportSubmitData {
  category: string;
  title: string;
  description?: string;
  latitude: number;
  longitude: number;
  severity?: string;
  is_gps_location?: boolean;
  photo_url?: string;
  user_session_id?: string;
}

export async function submitCitizenReport(data: ReportSubmitData): Promise<CitizenReportItem> {
  return fetchJson<CitizenReportItem>('/community/reports', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function uploadReportPhoto(file: File): Promise<{ photo_url: string; filename: string }> {
  const formData = new FormData();
  formData.append('file', file);

  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';
  const DIRECT_BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://127.0.0.1:8001/api/v1';

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/community/upload-photo`, {
      method: 'POST',
      body: formData,
    });
  } catch {
    response = await fetch(`${DIRECT_BACKEND_URL}/community/upload-photo`, {
      method: 'POST',
      body: formData,
    });
  }

  if (!response.ok) {
    let errMsg = `Upload error: ${response.status} ${response.statusText}`;
    try {
      const err = await response.json();
      if (err.detail) errMsg = typeof err.detail === 'string' ? err.detail : JSON.stringify(err.detail);
    } catch {
      // fallback
    }
    throw new Error(errMsg);
  }

  return response.json();
}

export async function fetchCitizenReports(filters?: {
  status?: string;
  category?: string;
  verified_only?: boolean;
  limit?: number;
  offset?: number;
}): Promise<ReportListResponse> {
  const params = new URLSearchParams();
  if (filters?.status && filters.status !== 'all') params.append('status', filters.status);
  if (filters?.category && filters.category !== 'all') params.append('category', filters.category);
  if (filters?.verified_only) params.append('verified_only', 'true');
  if (filters?.limit) params.append('limit', filters.limit.toString());
  if (filters?.offset) params.append('offset', filters.offset.toString());

  const query = params.toString() ? `?${params.toString()}` : '';
  return fetchJson<ReportListResponse>(`/community/reports${query}`);
}

export async function fetchActiveHazards(): Promise<HazardMarkerItem[]> {
  return fetchJson<HazardMarkerItem[]>('/community/hazards');
}

export async function getCitizenReport(id: string): Promise<CitizenReportItem> {
  return fetchJson<CitizenReportItem>(`/community/reports/${id}`);
}

export async function moderateCitizenReport(
  reportId: string,
  newStatus: string,
  notes?: string,
  moderatorToken?: string
): Promise<CitizenReportItem> {
  return fetchJson<CitizenReportItem>(`/community/reports/${reportId}/moderate`, {
    method: 'POST',
    headers: {
      'X-Moderator-Token': moderatorToken || '',
    },
    body: JSON.stringify({
      status: newStatus,
      moderator_notes: notes || null,
    }),
  });
}

