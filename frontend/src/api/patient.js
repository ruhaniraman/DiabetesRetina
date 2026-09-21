import { request } from './auth';

// Patient profile + exam history, stored server-side (encrypted) by the auth-server.
export const getProfile = () => request('/patient/profile', { auth: true });
export const saveProfile = (profile) => request('/patient/profile', { method: 'PUT', body: profile, auth: true });
export const listExams = () => request('/patient/exams', { auth: true });
export const deleteExam = (id) => request(`/patient/exams/${id}`, { method: 'DELETE', auth: true });
export const deleteAllHealthData = () => request('/patient/data', { method: 'DELETE', auth: true });
