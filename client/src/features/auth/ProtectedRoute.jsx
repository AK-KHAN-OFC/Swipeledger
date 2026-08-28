import { useEffect, useState, useCallback } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import useAuthStore from '../../store/authStore';
import { refreshClient } from '../../services/api/client';
import { getDeviceUUID } from '../../utils/deviceUuid';
import Spinner from '../../components/ui/Spinner';
import { Button } from '../../components/ui/Button';

/**
 * Guards authenticated routes.
 *
 * STATUS MACHINE
 * ─────────────
 * 'checking'       — initial state; silent refresh in progress
 * 'authenticated'  — refresh succeeded (or token already in memory)
 * 'unauthenticated'— server returned 401/403; send user to /login
 * 'network_error'  — network or 5xx error; show retry UI instead of
 *                    forcing re-login (Render cold-start, brief outage)
 *
 * ROOT CAUSE FIXES
 * ────────────────
 * 1. refreshClient is used directly (no 401 interceptor).
 *    The previous code called authApi.refresh() which routes through
 *    apiClient. When that refresh failed with 401, the 401 interceptor
 *    kicked in and attempted a second refresh via refreshClient — both
 *    failed, clearAuth() was called, and the user was logged out even
 *    if the failure was temporary. Using refreshClient here bypasses
 *    the interceptor entirely.
 *
 * 2. Network errors are distinguished from auth failures.
 *    Previously any exception (network timeout, Render cold-start, 5xx)
 *    fell through the single .catch() and was treated as "not logged in",
 *    redirecting to /login unnecessarily. Now only genuine 401/403 responses
 *    cause re-login; network errors show a retry button instead.
 *
 * 3. The /account fetch after refresh also uses refreshClient (no interceptors)
 *    with the just-issued access token passed as an explicit header, preventing
 *    any interceptor involvement during the bootstrap sequence.
 */
export default function ProtectedRoute({ children }) {
  const { isAuthenticated, setAuth } = useAuthStore();
  const location = useLocation();

  // Start 'checking' if not yet authenticated; skip the refresh if we already have a token.
  const [status, setStatus] = useState(isAuthenticated ? 'authenticated' : 'checking');

  const doRefresh = useCallback(async () => {
    setStatus('checking');
    try {
      const deviceId = getDeviceUUID();

      // ── Step 1: exchange the httpOnly refresh cookie for a new access token ──
      // Uses refreshClient (no interceptors) so a 401 here does NOT trigger
      // another refresh attempt. A 401 here means the session is truly expired.
      const refreshRes = await refreshClient.post('/auth/refresh', null, {
        headers: { 'X-Device-ID': deviceId },
      });
      const { accessToken } = refreshRes.data.data;

      // ── Step 2: fetch account data with the new token ─────────────────────
      // Also via refreshClient to stay outside the interceptor chain.
      const accRes = await refreshClient.get('/account', {
        headers: {
          Authorization:  `Bearer ${accessToken}`,
          'X-Device-ID':  deviceId,
        },
      });
      const account = accRes.data.data;

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
    } catch (err) {
      const httpStatus = err?.response?.status;

      if (httpStatus === 401 || httpStatus === 403) {
        // Session genuinely invalid or expired → require login
        setStatus('unauthenticated');
      } else {
        // No response (network error, timeout) or 5xx → connectivity issue.
        // Do NOT redirect to login — the session may still be valid.
        // Show a retry UI so the user can try again without losing their session.
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

  // Covers both explicit 'unauthenticated' and the edge case where isAuthenticated
  // is still false after status transitions (e.g. store update races).
  if (!isAuthenticated || status === 'unauthenticated') {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}
