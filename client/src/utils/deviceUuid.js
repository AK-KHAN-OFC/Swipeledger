/**
 * Device UUID utility — cookie-primary, localStorage fallback.
 *
 * Why cookie-primary (not localStorage):
 *   On iOS, when a PWA is added to the home screen, it may run in a separate
 *   browsing context. Cookies are reliably shared between Safari and the
 *   PWA home-screen context; localStorage is not consistently shared on
 *   older iOS versions. Cookie storage prevents the device from appearing
 *   as "new" each time the PWA is launched, which would consume device limit slots.
 *
 * The device UUID is NOT a secret. It identifies the device; authentication
 * is handled by the session/token system. The cookie is NOT httpOnly.
 */

const COOKIE_NAME = 'swipeledger_did';
const STORAGE_KEY = 'swipeledger_did';
const COOKIE_MAX_AGE = 365 * 24 * 60 * 60; // 1 year in seconds

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidUuid(value) {
  return typeof value === 'string' && UUID_V4_REGEX.test(value);
}

function readCookie(name) {
  const prefix = `${name}=`;
  for (const part of document.cookie.split(';')) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) {
      return trimmed.slice(prefix.length);
    }
  }
  return null;
}

function writeCookie(name, value) {
  const isSecure = window.location.protocol === 'https:';
  const secure = isSecure ? '; Secure' : '';
  document.cookie =
    `${name}=${value}; Path=/; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}${secure}`;
}

function readStorage() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStorage(value) {
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // localStorage may be blocked (private mode, storage quota exceeded)
  }
}

function generate() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // RFC 4122 v4 fallback for environments without crypto.randomUUID
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/**
 * Get the current device UUID.
 * Priority: cookie → localStorage → generate new.
 * On generation, writes to both stores.
 */
export function getDeviceUUID() {
  // 1. Cookie (primary)
  const cookieVal = readCookie(COOKIE_NAME);
  if (isValidUuid(cookieVal)) return cookieVal;

  // 2. localStorage (fallback)
  const storageVal = readStorage();
  if (isValidUuid(storageVal)) {
    writeCookie(COOKIE_NAME, storageVal); // restore cookie
    return storageVal;
  }

  // 3. Generate new
  const uuid = generate();
  writeCookie(COOKIE_NAME, uuid);
  writeStorage(uuid);
  return uuid;
}

/**
 * Write a UUID to both cookie and localStorage.
 * Used for testing or manual override scenarios.
 */
export function setDeviceUUID(uuid) {
  writeCookie(COOKIE_NAME, uuid);
  writeStorage(uuid);
}

/**
 * Clear the device UUID from both stores.
 * After this, the next getDeviceUUID() call will generate a new UUID,
 * which will appear as a new device to the server.
 */
export function clearDeviceUUID() {
  document.cookie = `${COOKIE_NAME}=; Path=/; Max-Age=0`;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
