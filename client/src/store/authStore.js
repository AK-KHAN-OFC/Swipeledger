/**
 * Auth store using Zustand.
 *
 * TOKEN PERSISTENCE — Android / Capacitor
 * ────────────────────────────────────────
 * The access token is stored BOTH in memory (Zustand) AND in localStorage.
 *
 * Why localStorage?
 *   In Android WebView, Zustand (JS memory) is cleared when the app process
 *   is killed (swipe from Recent Apps). The httpOnly refresh cookie from
 *   swipeledger.onrender.com is a third-party cookie for the Capacitor app
 *   running at https://localhost. Android's CookieManager does NOT guarantee
 *   persistence of third-party cookies across process kills unless flush() is
 *   explicitly called — Capacitor does not always call this before kill.
 *
 *   localStorage in Android WebView is backed by a synchronous SQLite write
 *   and IS reliably persisted across process kills.  In Capacitor's closed
 *   WebView environment, no third-party JavaScript can read localStorage, so
 *   the XSS threat that makes httpOnly cookies essential for browsers does not
 *   apply.  The access token is also short-lived (60 min by default), limiting
 *   any exposure window.
 *
 * The refresh cookie remains httpOnly and is still used as a fallback when
 * the stored access token is absent or expired.
 *
 * Security rules that do NOT change:
 *   - Refresh token stays httpOnly (server-set, not accessible to JS)
 *   - Access token in localStorage is cleared on explicit logout
 *   - The stored token is validated (JWT expiry) before use
 *   - Sensitive fields (password, token hashes) are never stored
 */

import { create } from 'zustand';

// ─── localStorage key ─────────────────────────────────────────────────────────

const AT_KEY = 'swipeledger_at';

// ─── JWT expiry helper (client-side; reads exp claim, no verification) ─────────

function parseJwtExpiryMs(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    // URL-safe base64 → standard base64, add padding
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const payload = JSON.parse(atob(padded));
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

// ─── Storage utilities (exported for ProtectedRoute) ──────────────────────────

const EXPIRY_BUFFER_MS = 30_000; // treat token as expired 30 s early

/**
 * Return the stored access token if it exists and has not expired.
 * Returns null and clears storage if absent, malformed, or expired.
 */
export function readStoredAccessToken() {
  try {
    const token = localStorage.getItem(AT_KEY);
    if (!token) return null;

    const expMs = parseJwtExpiryMs(token);
    if (!expMs) {
      localStorage.removeItem(AT_KEY);
      return null;
    }
    if (Date.now() >= expMs - EXPIRY_BUFFER_MS) {
      localStorage.removeItem(AT_KEY); // proactively clear stale token
      return null;
    }
    return token;
  } catch {
    return null; // Private browsing or quota error
  }
}

/** Persist the access token so it survives an Android process kill. */
function storeAccessToken(token) {
  try {
    localStorage.setItem(AT_KEY, token);
  } catch { /* storage unavailable or quota exceeded — silent */ }
}

/** Remove the persisted token (called on logout). */
export function removeStoredAccessToken() {
  try {
    localStorage.removeItem(AT_KEY);
  } catch { /* ignore */ }
}

// ─── Zustand store ─────────────────────────────────────────────────────────────

const useAuthStore = create((set) => ({
  accessToken:  null,
  accountId:    null,
  username:     null,
  accountCode:  null,
  businessName: null,
  deviceLimit:  3,
  isAuthenticated: false,

  /**
   * Set full auth state after login or successful refresh.
   * Also persists the access token to localStorage for Android cold starts.
   */
  setAuth: ({ accessToken, account }) => {
    storeAccessToken(accessToken);
    set({
      accessToken,
      accountId:    account.accountId,
      username:     account.username,
      accountCode:  account.accountCode,
      businessName: account.businessName,
      deviceLimit:  account.deviceLimit ?? 3,
      isAuthenticated: true,
    });
  },

  /**
   * Update only the access token after a silent refresh (401 interceptor).
   * Also persists the new token so the next cold start picks it up.
   */
  setAccessToken: (accessToken) => {
    storeAccessToken(accessToken);
    set({ accessToken });
  },

  /**
   * Clear all auth state on logout or confirmed refresh failure.
   * Removes the persisted token so the next cold start goes to login.
   */
  clearAuth: () => {
    removeStoredAccessToken();
    set({
      accessToken:  null,
      accountId:    null,
      username:     null,
      accountCode:  null,
      businessName: null,
      deviceLimit:  3,
      isAuthenticated: false,
    });
  },
}));

export default useAuthStore;
