import { useEffect, useState, useCallback } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import useAuthStore, {
  readStoredAccessToken,
  removeStoredAccessToken,
} from '../../store/authStore';
import { refreshClient } from '../../services/api/client';
import { getDeviceUUID } from '../../utils/deviceUuid';
import Spinner from '../../components/ui/Spinner';
import { Button } from '../../components/ui/Button';

/**
 * Guards all authenticated routes.
 *
 * ── STATUS MACHINE ────────────────────────────────────────────────────────────
 *   'checking'        — bootstrap in progress
 *   'authenticated'   — session confirmed
 *   'unauthenticated' — genuine 401/403 from server → send to /login
 *   'network_error'   — no response (offline, Render cold-start) → retry UI
 *
 * ── TWO-PHASE SESSION RESTORATION ────────────────────────────────────────────
 *
 * PHASE 1 — localStorage access token
 *   localStorage is reliably flushed to SQLite on every write in Android
 *   WebView, so it survives process kills. Read the stored access token and
 *   verify it against /account. If the server accepts it → authenticated
 *   immediately, no extra round-trip needed.
 *
 *   On any HTTP error from /account: clear the stale token and fall through
 *   to Phase 2 (cookie refresh). On a network error: show the retry UI —
 *   do NOT redirect to /login, the session may still be valid.
 *
 * PHASE 2 — httpOnly cookie refresh
 *   Attempt a cookie-based refresh. If the cookie persisted in the Android
 *   WebView's CookieManager (which is not guaranteed for third-party cookies
 *   across process kills), this succeeds and the new access token is stored
 *   back to localStorage for the NEXT cold start.
 *
 *   401/403 → unauthenticated (session truly expired or cookie absent).
 *   Network error → retry UI.
 *
 * ── WHY refreshClient (NOT apiClient) ────────────────────────────────────────
 *   apiClient has the 401 interceptor. If the refresh itself returns 401, the
 *   interceptor fires a second refresh attempt, then calls clearAuth() and
 *   window.location.href='/login'. Using refreshClient bypasses the interceptor
 *   entirely — a 401 here is caught by our own catch block and handled cleanly.
 */
export default function ProtectedRoute({ children }) {
  const { isAuthenticated, setAuth } = useAuthStore();
  const location = useLocation();

  const [status, setStatus] = useState(
    isAuthenticated ? 'authenticated' : 'checking',
  );

  const doRefresh = useCallback(async () => {
    setStatus('checking');
    const deviceId = getDeviceUUID();

    // ── Phase 1: stored access token (localStorage, reliable across kills) ──

    const storedToken = readStoredAccessToken();

    if (storedToken) {
      try {
        const accRes = await refreshClient.get('/account', {
          headers: {
            Authorization: `Bearer ${storedToken}`,
            'X-Device-ID': deviceId,
          },
        });
        const account = accRes.data.data;

        setAuth({
          accessToken: storedToken,
          account: {
            accountId:    account.accountId,
            accountCode:  account.accountCode,
            username:     account.username,
            businessName: account.businessName,
            deviceLimit:  account.deviceLimit,
          },
        });
        setStatus('authenticated');
        return; // ← done; no cookie refresh needed
      } catch (ph1Err) {
        // Always clear the rejected stored token regardless of error type
        removeStoredAccessToken();

        if (!ph1Err?.response) {
          // Server unreachable — show retry, do NOT force re-login
          setStatus('network_error');
          return;
        }
        // HTTP error (almost always 401 — token expired since last cold start)
        // Fall through to Phase 2.
      }
    }

    // ── Phase 2: httpOnly cookie refresh (may or may not have persisted) ────

    try {
      const refreshRes = await refreshClient.post('/auth/refresh', null, {
        headers: { 'X-Device-ID': deviceId },
      });
      const { accessToken } = refreshRes.data.data;

      // /account call with the freshly issued token
      const accRes = await refreshClient.get('/account', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'X-Device-ID': deviceId,
        },
      });
      const account = accRes.data.data;

      // setAuth persists the new token to localStorage for the next cold start
      setAuth({
        accessToken,
        account: {
          accountId:    account.accountId,
          accountCode:  account.accountCode,
          username:     account.username,
          businessName: account.businessName,
          deviceLimit:  account.deviceLimit,
        },
      });
      setStatus('authenticated');
    } catch (ph2Err) {
      const httpStatus = ph2Err?.response?.status;
      if (httpStatus === 401 || httpStatus === 403) {
        // Refresh cookie absent or session expired → user must log in
        setStatus('unauthenticated');
      } else {
        // Network or 5xx → offline or Render cold-start → retry
        setStatus('network_error');
      }
    }
  }, [setAuth]);

  useEffect(() => {
    if (!isAuthenticated) {
      doRefresh();
    } else {
      setStatus('authenticated');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────

  if (status === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Spinner size="lg" />
      </div>
    );
  }

  if (status === 'network_error') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 gap-3 px-6 text-center">
        <p className="text-3xl">📡</p>
        <p className="text-gray-800 font-semibold">Connection failed</p>
        <p className="text-gray-500 text-sm">
          Check your internet connection and try again.
        </p>
        <Button size="sm" onClick={doRefresh} className="mt-2">
          Retry
        </Button>
      </div>
    );
  }

  if (!isAuthenticated || status === 'unauthenticated') {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}
