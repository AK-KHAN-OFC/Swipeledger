import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import useAuthStore from '../../store/authStore';
import { authApi } from '../../services/api/auth.api';
import Spinner from '../../components/ui/Spinner';

/**
 * Guards authenticated routes.
 *
 * On mount (or page refresh):
 *  - If accessToken is in memory: render children immediately.
 *  - If not: attempt a silent refresh via the httpOnly cookie.
 *      Success → store new token, render children.
 *      Failure → redirect to /login.
 *
 * This means users who refresh the page are not immediately sent to
 * the login screen — the refresh cookie silently restores their session.
 */
export default function ProtectedRoute({ children }) {
  const { isAuthenticated, setAuth } = useAuthStore();
  const location = useLocation();
  const [checking, setChecking] = useState(!isAuthenticated);

  useEffect(() => {
    if (isAuthenticated) {
      setChecking(false);
      return;
    }

    let cancelled = false;

    authApi
      .refresh()
      .then((res) => {
        if (cancelled) return;
        const { accessToken } = res.data.data;
        // Fetch account details after refresh to populate the store
        return import('../../services/api/client').then(({ default: apiClient }) =>
          apiClient.get('/account').then((accRes) => {
            if (cancelled) return;
            const account = accRes.data.data;
            setAuth({
              accessToken,
              account: {
                accountId: account.accountId,
                accountCode: account.accountCode,
                username: account.username,
                businessName: account.businessName,
                deviceLimit: account.deviceLimit,
              },
            });
          }),
        );
      })
      .catch(() => {
        // Refresh failed — will redirect to login below
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });

    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}
