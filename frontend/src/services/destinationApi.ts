import { fetchJson } from './api';
import type { DestinationSearchResponse, DestinationItem } from '../types';

export async function searchDestinations(
  query: string,
  lang: 'en' | 'hi' = 'en'
): Promise<DestinationSearchResponse> {
  const params = new URLSearchParams({
    q: query,
    lang
  });
  return fetchJson<DestinationSearchResponse>(`/destinations/search?${params.toString()}`);
}

export async function listDestinations(): Promise<{ destinations: DestinationItem[] }> {
  return fetchJson<{ destinations: DestinationItem[] }>('/destinations/list');
}

