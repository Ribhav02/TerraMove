/**
 * TerraMove Client API Service
 * Manages API endpoint resolution and network requests.
 * Normalizes base URLs to guarantee /api/v1 is included exactly once.
 */

export function getApiBaseUrl(): string {
  const envUrl = (
    import.meta.env.VITE_API_BASE_URL ||
    import.meta.env.VITE_BACKEND_URL ||
    import.meta.env.VITE_API_URL ||
    ''
  ).trim();

  // If no environment variable is provided:
  if (!envUrl) {
    // In production build (e.g. Vercel), default to the live Render backend
    return import.meta.env.PROD
      ? 'https://terramove.onrender.com/api/v1'
      : '/api/v1';
  }

  // Strip trailing slashes
  const clean = envUrl.replace(/\/+$/, '');

  // If already ending with /api/v1, use as-is
  if (clean.endsWith('/api/v1')) {
    return clean;
  }
  // If ending with /api, append /v1
  if (clean.endsWith('/api')) {
    return `${clean}/v1`;
  }
  // Otherwise append /api/v1 (e.g. "https://terramove.onrender.com" -> "https://terramove.onrender.com/api/v1")
  return `${clean}/api/v1`;
}

export function getDirectBackendUrl(): string {
  const envUrl = (
    import.meta.env.VITE_BACKEND_URL ||
    import.meta.env.VITE_API_BASE_URL ||
    ''
  ).trim();

  if (envUrl) {
    const clean = envUrl.replace(/\/+$/, '');
    if (clean.endsWith('/api/v1')) return clean;
    if (clean.endsWith('/api')) return `${clean}/v1`;
    return `${clean}/api/v1`;
  }

  return import.meta.env.PROD
    ? 'https://terramove.onrender.com/api/v1'
    : 'http://127.0.0.1:8001/api/v1';
}

/**
 * Builds a clean, fully-qualified request URL for any endpoint.
 * Prevents double-prefixing (e.g., will never produce /api/v1/api/v1/health).
 */
export function buildApiUrl(endpoint: string, base: string = getApiBaseUrl()): string {
  const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;

  // If the caller already passed a path starting with '/api/v1/', strip the duplicate prefix
  if (normalizedEndpoint.startsWith('/api/v1/')) {
    return `${base}${normalizedEndpoint.slice(7)}`;
  }
  if (normalizedEndpoint === '/api/v1') {
    return base;
  }

  return `${base}${normalizedEndpoint}`;
}

export async function fetchJson<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const primaryUrl = buildApiUrl(endpoint);
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
    const baseUrl = getApiBaseUrl();
    // If using relative /api/v1 proxy in dev and it fails, attempt direct backend fallback
    if (!baseUrl.startsWith('http')) {
      const fallbackUrl = buildApiUrl(endpoint, getDirectBackendUrl());
      try {
        response = await fetch(fallbackUrl, {
          headers: {
            'Content-Type': 'application/json',
            ...options?.headers,
          },
          ...options,
        });
      } catch (fallbackErr: any) {
        throw new Error(`Cannot connect to TerraMove AI Engine at ${fallbackUrl}. Ensure the backend service is running.`);
      }
    } else {
      throw new Error(`Cannot connect to TerraMove AI Engine at ${primaryUrl}. Ensure the backend service is running.`);
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
