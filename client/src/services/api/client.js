/**
 * Centralized API client with singleton refresh-in-flight guard.
 *
 * Refresh guard design:
 *   If N requests simultaneously receive 401 (expired access token),
 *   exactly ONE /auth/refresh call is made. All N requests queue on the
 *   same promise and retry with the new token when it resolves.
 *   If the refresh fails, all queued requests reject together and the
 *   user is redirected to /login exactly once.
 *
 * Two axios instances are used:
 *   - apiClient: has the 401 interceptor + retry logic
 *   - refreshClient: no interceptors, used exclusively for /auth/refresh
 *     to prevent the refresh call from triggering another refresh attempt.
 */

import axios from 'axios';
import { getDeviceUUID } from '../../utils/deviceUuid';
import useAuthStore from '../../store/authStore';

const BASE_URL = import.meta.env.VITE_API_URL || '/api/v1';

// ── Refresh client (no interceptors) ─────────────────────────────────────────
const refreshClient = axios.create({
  baseURL: BASE_URL,
  withCredentials: true, // must send the httpOnly refresh cookie
});

// ── Main API client ───────────────────────────────────────────────────────────
const apiClient = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

// ── Singleton refresh promise ─────────────────────────────────────────────────
let refreshPromise = null;

// ── Request interceptor — attach auth headers ─────────────────────────────────
apiClient.interceptors.request.use((config) => {
  const { accessToken } = useAuthStore.getState();
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }

  const deviceId = getDeviceUUID();
  config.headers['X-Device-ID'] = deviceId;

  return config;
});

// ── Response interceptor — handle 401 with refresh guard ──────────────────────
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Only attempt refresh on 401, and only once per request
    if (error.response?.status === 401 && !originalRequest._retried) {
      originalRequest._retried = true;

      try {
        if (!refreshPromise) {
          refreshPromise = refreshClient
            .post('/auth/refresh', null, {
              headers: { 'X-Device-ID': getDeviceUUID() },
            })
            .then((res) => {
              const token = res.data?.data?.accessToken;
              useAuthStore.getState().setAccessToken(token);
              return token;
            })
            .finally(() => {
              refreshPromise = null;
            });
        }

        // All concurrent 401s wait on the same promise
        const newToken = await refreshPromise;
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return apiClient(originalRequest);
      } catch {
        // Refresh failed — clear auth and redirect to login
        refreshPromise = null;
        useAuthStore.getState().clearAuth();
        window.location.href = '/login';
        return Promise.reject(error);
      }
    }

    return Promise.reject(error);
  },
);

export default apiClient;
export { refreshClient };

/**
 * Extract a consistent error message from an axios error response.
 */
export function getApiError(error) {
  return (
    error?.response?.data?.error?.message ||
    error?.message ||
    'An unexpected error occurred.'
  );
}

/**
 * Extract the error code from an axios error response.
 */
export function getApiErrorCode(error) {
  return error?.response?.data?.error?.code || 'INTERNAL_ERROR';
}
