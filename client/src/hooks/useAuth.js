import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../services/api/auth.api';
import useAuthStore from '../store/authStore';
import { getApiErrorCode } from '../services/api/client';

export function useAuth() {
  const navigate = useNavigate();
  const { setAuth, clearAuth, isAuthenticated, username, accountCode, businessName, deviceLimit } =
    useAuthStore();

  const login = useCallback(
    async ({ accountCode: code, username: user, password, deviceName }) => {
      const res = await authApi.login({ accountCode: code, username: user, password, deviceName });
      const { accessToken, account } = res.data.data;
      setAuth({ accessToken, account });
      navigate('/');
      return res.data;
    },
    [setAuth, navigate],
  );

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // Best effort — clear state regardless
    }
    clearAuth();
    navigate('/login', { replace: true });
  }, [clearAuth, navigate]);

  return {
    isAuthenticated,
    username,
    accountCode,
    businessName,
    deviceLimit,
    login,
    logout,
  };
}
