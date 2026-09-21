import { AUTH_API_URL as API_URL } from '../config';

export class ApiError extends Error {
  constructor(message, status, data = {}) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

/* ---- Session ----
   The session is an HttpOnly cookie set by the server: page scripts cannot read it, so there is no token to store here.
   Every request sends cookies, and carries a header that a page on another site cannot add (CSRF defence). */
export const REQUEST_HEADERS = { 'X-Requested-With': 'retina-rescue' };
const LEGACY_TOKEN_KEY = 'retina_rescue_token';
/** Older versions kept the token in localStorage; remove it so it does not linger. */
export const forgetLegacyToken = () => {
  try {
    localStorage.removeItem(LEGACY_TOKEN_KEY);
  } catch {
    /* storage unavailable: nothing to remove */
  }
};

/* ---- Core request helper ---- */
export async function request(path, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json', ...REQUEST_HEADERS };

  let res;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      credentials: 'include',
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('Cannot reach the server. Check that the backend is running.', 0);
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.message || 'Something went wrong. Please try again.', res.status, data);
  return data;
}

/* ---- Endpoints ---- */
export const signup = (payload) => request('/auth/signup', { method: 'POST', body: payload });
export const verifyEmail = (payload) => request('/auth/verify-email', { method: 'POST', body: payload });
export const resendCode = (payload) => request('/auth/resend-code', { method: 'POST', body: payload });
export const login = (payload) => request('/auth/login', { method: 'POST', body: payload });
export const fetchMe = () => request('/auth/me');
export const logoutRequest = () => request('/auth/logout', { method: 'POST' });
export const forgotPassword = (payload) => request('/auth/forgot-password', { method: 'POST', body: payload });
export const resetPassword = (payload) => request('/auth/reset-password', { method: 'POST', body: payload });
export const deleteAccountRequest = (password) => request('/auth/account', { method: 'DELETE', body: { password } });
