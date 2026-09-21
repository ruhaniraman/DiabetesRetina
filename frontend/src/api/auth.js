import { AUTH_API_URL as API_URL } from '../config';
const TOKEN_KEY = 'retina_rescue_token';

export class ApiError extends Error {
  constructor(message, status, data = {}) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

/* ---- Token storage ---- */
export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token) => localStorage.setItem(TOKEN_KEY, token);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

/* ---- Core request helper ---- */
async function request(path, { method = 'GET', body, auth = false } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth && getToken()) headers.Authorization = `Bearer ${getToken()}`;

  let res;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
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
export const fetchMe = () => request('/auth/me', { auth: true });
export const logoutRequest = () => request('/auth/logout', { method: 'POST', auth: true });
export const forgotPassword = (payload) => request('/auth/forgot-password', { method: 'POST', body: payload });
export const resetPassword = (payload) => request('/auth/reset-password', { method: 'POST', body: payload });
