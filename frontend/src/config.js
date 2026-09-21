// Two backends: the Node auth-server and the Python ML backend.
// VITE_API_URL is kept as the auth-server variable for backwards compatibility.
export const AUTH_API_URL = import.meta.env.VITE_AUTH_API_URL || import.meta.env.VITE_API_URL || 'http://localhost:4000/api';
export const ML_API_URL = import.meta.env.VITE_ML_API_URL || 'http://localhost:5000/api';

// Must match MAX_UPLOAD_MB on the ML backend.
export const MAX_UPLOAD_MB = 15;

// The Stage 2 lesion overlay is EXPERIMENTAL and off by default. validation/LESIONS.md shows it does not detect lesions:
// it paints about 2.7% of every retina (healthy or not) and misses annotated lesions on real ground truth.
// Turn it on only for research (VITE_ENABLE_LESION_OVERLAY=true, and ENABLE_LESION_OVERLAY=true on the backend).
export const LESION_OVERLAY_ENABLED = import.meta.env.VITE_ENABLE_LESION_OVERLAY === 'true';
