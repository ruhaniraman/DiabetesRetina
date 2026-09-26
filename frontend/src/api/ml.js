import { ML_API_URL } from '../config';
import { ApiError, REQUEST_HEADERS } from './auth';

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

async function mlRequest(path, { formData, json, method = 'POST' } = {}) {
  const headers = { ...REQUEST_HEADERS };
  if (json) headers['Content-Type'] = 'application/json';

  let res;
  try {
    res = await fetch(`${ML_API_URL}${path}`, {
      method,
      headers,
      credentials: 'include',
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
/** Stage 1 enhancement for viewing (illumination normalisation + CLAHE + denoising); grading always uses the original. */
export const fetchEnhanced = (file) => mlRequest('/stage1-enhance', { formData: singleFile(file) });
/** Stage 2 anatomy: vessels, optic disc and fovea (with the macula zone) as a transparent overlay, plus the measurements. */
export const fetchAnatomy = (file) => mlRequest('/stage2-anatomy', { formData: singleFile(file) });
/** Stage 5: district plans from optimiseDistrictResources.m, each confirmed by a year simulated in DistrictScreening.slx. */
export const fetchSimulation = () => mlRequest('/simulation', { method: 'GET' });
/** Stage 5: simulate a working year of one scenario ({ overrides, resources }) in DistrictScreening.slx. */
export const runSimulation = (scenario) => mlRequest('/simulation/run', { json: scenario });

/**
 * The PDF report for both eyes. The server grades the two photographs again, draws the heatmaps and returns the PDF; it keeps neither the
 * photographs nor the report. `patient` ({ fullName, dob }) is optional and is printed on the report only.
 */
export async function downloadReportPdf(leftFile, rightFile, patient) {
  const fd = new FormData();
  fd.append('leftEye', leftFile);
  fd.append('rightEye', rightFile);
  if (patient?.fullName) fd.append('patientName', patient.fullName);
  if (patient?.dob) fd.append('patientDob', patient.dob);

  let res;
  try {
    res = await fetch(`${ML_API_URL}/report-pdf`, { method: 'POST', headers: { ...REQUEST_HEADERS }, credentials: 'include', body: fd });
  } catch {
    throw new ApiError('Cannot reach the analysis server. Check that the backend is running.', 0);
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && unauthorizedHandler) unauthorizedHandler();
    throw new ApiError(detailMessage(data, `The report could not be created (${res.status}).`), res.status, data);
  }
  return res.blob();
}

/** Grade both eyes. The result is saved to the exam history with its detailed PDF, which prints `patient` ({ fullName, dob }) when given. */
export function assessEyes(leftFile, rightFile, patient) {
  const fd = new FormData();
  fd.append('leftEye', leftFile);
  fd.append('rightEye', rightFile);
  if (patient?.fullName) fd.append('patientName', patient.fullName);
  if (patient?.dob) fd.append('patientDob', patient.dob);
  return mlRequest('/stage3-assessment', { formData: fd });
}

export async function translateText(text, targetLang) {
  const data = await mlRequest('/translate-dynamic', { json: { text, targetLang } });
  return data.translatedText || text;
}
