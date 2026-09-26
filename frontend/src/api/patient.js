import { AUTH_API_URL } from '../config';
import { ApiError, REQUEST_HEADERS, request } from './auth';

// Patient profile + exam history, stored server-side (encrypted) by the auth-server.
export const getProfile = () => request('/patient/profile');
export const saveProfile = (profile) => request('/patient/profile', { method: 'PUT', body: profile });
export const listExams = () => request('/patient/exams');
export const deleteExam = (id) => request(`/patient/exams/${id}`, { method: 'DELETE' });
export const deleteAllHealthData = () => request('/patient/data', { method: 'DELETE' });

/** The detailed PDF stored with an exam, as a Blob. */
export async function downloadExamReport(id) {
  let res;
  try {
    res = await fetch(`${AUTH_API_URL}/patient/exams/${id}/report`, { headers: { ...REQUEST_HEADERS }, credentials: 'include' });
  } catch {
    throw new ApiError('Cannot reach the server. Check that the backend is running.', 0);
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(data.message || 'Something went wrong. Please try again.', res.status, data);
  }
  return res.blob();
}
