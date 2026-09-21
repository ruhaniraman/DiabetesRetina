import { request } from './auth';

// Patient profile + exam history, stored server-side (encrypted) by the auth-server.
export const getProfile = () => request('/patient/profile');
export const saveProfile = (profile) => request('/patient/profile', { method: 'PUT', body: profile });
export const listExams = () => request('/patient/exams');
export const deleteExam = (id) => request(`/patient/exams/${id}`, { method: 'DELETE' });
export const deleteAllHealthData = () => request('/patient/data', { method: 'DELETE' });
