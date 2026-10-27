const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';
const DIRECT_BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://127.0.0.1:8001/api/v1';

export async function fetchJson<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const primaryUrl = `${API_BASE_URL}${endpoint}`;
  let response: Response;

  try {
    response = await fetch(primaryUrl, {
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
      ...options,
    });
  } catch (err: any) {
    // If relative /api/v1 proxy fails or in standalone mode, attempt direct backend fallback
    if (!API_BASE_URL.startsWith('http')) {
      try {
        const fallbackUrl = `${DIRECT_BACKEND_URL}${endpoint}`;
        response = await fetch(fallbackUrl, {
          headers: {
            'Content-Type': 'application/json',
            ...options?.headers,
          },
          ...options,
        });
      } catch (fallbackErr: any) {
        throw new Error(`Cannot connect to TerraMove AI Engine at ${DIRECT_BACKEND_URL}. Ensure the backend service is running.`);
      }
    } else {
      throw new Error(`Cannot connect to TerraMove AI Engine at ${API_BASE_URL}. Ensure the backend service is running.`);
    }
  }

  if (!response.ok) {
    let errorMsg = `API error: ${response.status} ${response.statusText}`;
    try {
      const errorData = await response.json();
      if (errorData.detail) {
        errorMsg = typeof errorData.detail === 'string' ? errorData.detail : JSON.stringify(errorData.detail);
      }
    } catch {
      // fallback
    }
    throw new Error(errorMsg);
  }

  return response.json();
}


