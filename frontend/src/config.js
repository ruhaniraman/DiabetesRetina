// Two backends: the Node auth-server and the Python ML backend.
// VITE_API_URL is kept as the auth-server variable for backwards compatibility.
export const AUTH_API_URL = import.meta.env.VITE_AUTH_API_URL || import.meta.env.VITE_API_URL || 'http://localhost:4000/api';
export const ML_API_URL = import.meta.env.VITE_ML_API_URL || 'http://localhost:5000/api';

// Must match MAX_UPLOAD_MB on the ML backend.
export const MAX_UPLOAD_MB = 15;
