// Two backends: the Node auth-server and the Python ML backend.
// VITE_API_URL is kept as the auth-server variable for backwards compatibility.
export const AUTH_API_URL = import.meta.env.VITE_AUTH_API_URL || import.meta.env.VITE_API_URL || 'http://localhost:4000/api';
export const ML_API_URL = import.meta.env.VITE_ML_API_URL || 'http://localhost:5000/api';

// Demo deploy: the web app on Vercel forwards /auth-api and /ml-api through an ngrok tunnel to a laptop (deploy/DEMO_VERCEL_NGROK.md).
export const BEHIND_NGROK = import.meta.env.VITE_BEHIND_NGROK === 'true';

// Must match MAX_UPLOAD_MB on the ML backend.
export const MAX_UPLOAD_MB = 15;

// The Stage 2 lesion overlay (MATLAB lesion network, calibrated v2) is off until its wording has been clinically reviewed. It marks POSSIBLE
// lesions: on held-out test photographs, something in 34% of eyes without retinopathy and 98-100% of eyes with DR
// (validation/results/lesions_dl_Stage2_LesionUNet_v2_calibrated.md). Turn it on with VITE_ENABLE_LESION_OVERLAY=true here and
// ENABLE_LESION_OVERLAY=true on the backend (which needs MATLAB).
// Reading the result aloud uses voices built into the device. Some browsers also offer "online" voices that send the text to a service to be spoken; the result is
// health information, so those are NOT used unless this is set (VITE_ALLOW_NETWORK_VOICES=true). See src/speech/voices.js.
export const ALLOW_NETWORK_VOICES = import.meta.env.VITE_ALLOW_NETWORK_VOICES === 'true';

// Hindi and Kannada speech uses fixed sentences (src/speech/translations.json) that are DRAFTS until a qualified person has reviewed them; speech in a language is off until
// reviewed[lang] is true. VITE_ALLOW_UNREVIEWED_SPEECH turns the drafts on for a demo or pilot that knowingly accepts unreviewed wording (the draft status is announced aloud first):
// a comma-separated list of languages ("hi" or "hi,kn"), or "true" for all of them.
export const parseLanguageList = (value) =>
  String(value || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
const UNREVIEWED_SPEECH = parseLanguageList(import.meta.env.VITE_ALLOW_UNREVIEWED_SPEECH);
export const allowsUnreviewedSpeech = (lang) => UNREVIEWED_SPEECH.includes('true') || UNREVIEWED_SPEECH.includes(lang);

export const LESION_OVERLAY_ENABLED = import.meta.env.VITE_ENABLE_LESION_OVERLAY === 'true';
