/**
 * Auth store using Zustand.
 *
 * SECURITY: The access token is held in memory ONLY.
 * It is NEVER written to localStorage or sessionStorage.
 * On page refresh, the app calls /auth/refresh (via the httpOnly cookie)
 * to silently restore the session without exposing the token to storage APIs.
 */

import { create } from 'zustand';

const useAuthStore = create((set) => ({
  // Auth state
  accessToken: null,
  accountId: null,
  username: null,
  accountCode: null,
  businessName: null,
  deviceLimit: 3,
  isAuthenticated: false,

  /** Set full auth state after login or successful refresh. */
  setAuth: ({ accessToken, account }) =>
    set({
      accessToken,
      accountId: account.accountId,
      username: account.username,
      accountCode: account.accountCode,
      businessName: account.businessName,
      deviceLimit: account.deviceLimit ?? 3,
      isAuthenticated: true,
    }),

  /** Update only the access token (after silent refresh). */
  setAccessToken: (accessToken) => set({ accessToken }),

  /** Clear all auth state on logout or refresh failure. */
  clearAuth: () =>
    set({
      accessToken: null,
      accountId: null,
      username: null,
      accountCode: null,
      businessName: null,
      deviceLimit: 3,
      isAuthenticated: false,
    }),
}));

export default useAuthStore;
