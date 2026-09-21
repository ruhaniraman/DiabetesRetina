import { ML_API_URL } from '../config';
import { ApiError, getToken } from './auth';

let unauthorizedHandler = null;
/** Called when the ML backend says the session is no longer valid. */
export const setUnauthorizedHandler = (fn) => {
  unauthorizedHandler = fn;
};

// FastAPI returns { detail: "text" } or, for validation errors, { detail: [{ msg }] }.
function detailMessage(data, fallback) {
  const d = data?.detail;
  if (typeof d === 'string') return d;
  if (Array.isArray(d) && d[0]?.msg) return d[0].msg;
  return fallback;
}

async function mlRequest(path, { formData, json } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (json) headers['Content-Type'] = 'application/json';

  let res;
  try {
    res = await fetch(`${ML_API_URL}${path}`, {
      method: 'POST',
      headers,
      body: formData ?? JSON.stringify(json),
    });
  } catch {
    throw new ApiError('Cannot reach the analysis server. Check that the backend is running.', 0);
  }

  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && unauthorizedHandler) unauthorizedHandler();
  if (!res.ok) throw new ApiError(detailMessage(data, `Analysis server error (${res.status}).`), res.status, data);
  return data;
}

const singleFile = (file) => {
  const fd = new FormData();
  fd.append('file', file);
  return fd;
};

export const checkQuality = (file) => mlRequest('/stage1-quality', { formData: singleFile(file) });
export const segmentLesions = (file) => mlRequest('/stage2-segmentation', { formData: singleFile(file) });
export const fetchHeatmap = (file) => mlRequest('/stage4-heatmap', { formData: singleFile(file) });

export function assessEyes(leftFile, rightFile) {
  const fd = new FormData();
  fd.append('leftEye', leftFile);
  fd.append('rightEye', rightFile);
  return mlRequest('/stage3-assessment', { formData: fd });
}

export async function translateText(text, targetLang) {
  const data = await mlRequest('/translate-dynamic', { json: { text, targetLang } });
  return data.translatedText || text;
}
