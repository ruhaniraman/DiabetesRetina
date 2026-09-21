// Two backends: the Node auth-server and the Python ML backend.
// VITE_API_URL is kept as the auth-server variable for backwards compatibility.
export const AUTH_API_URL = import.meta.env.VITE_AUTH_API_URL || import.meta.env.VITE_API_URL || 'http://localhost:4000/api';
export const ML_API_URL = import.meta.env.VITE_ML_API_URL || 'http://localhost:5000/api';

// Must match MAX_UPLOAD_MB on the ML backend.
export const MAX_UPLOAD_MB = 15;

// The Stage 2 lesion overlay is EXPERIMENTAL and off by default. validation/LESIONS.md shows it does not detect lesions:
// it paints about 2.7% of every retina (healthy or not) and misses annotated lesions on real ground truth.
// Turn it on only for research (VITE_ENABLE_LESION_OVERLAY=true, and ENABLE_LESION_OVERLAY=true on the backend).
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
