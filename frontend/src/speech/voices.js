// Choosing a voice for reading the result aloud, using the voices built into the phone or browser (Web Speech API).
//
// PRIVACY: some browsers offer "network" voices that send the text to an online service to be spoken. The result is health information, so only voices that run on
// the device (`localService`) are used unless allowNetwork is set. When a language has only online voices the caller says so instead of quietly using them.

export const LANG_TAGS = { en: ['en-IN', 'en-GB', 'en-US', 'en'], hi: ['hi-IN', 'hi'], kn: ['kn-IN', 'kn'] };

export const speechSupported = () =>
  typeof window !== 'undefined' && 'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance === 'function';

/** Voices are often not ready on first call (they load asynchronously); wait for them, but not forever. */
export function loadVoices(timeoutMs = 1500) {
  return new Promise((resolve) => {
    const synth = window.speechSynthesis;
    const now = synth.getVoices();
    if (now.length) {
      resolve(now);
      return;
    }
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      synth.removeEventListener?.('voiceschanged', finish);
      resolve(synth.getVoices());
    };
    synth.addEventListener?.('voiceschanged', finish);
    setTimeout(finish, timeoutMs);
  });
}

const norm = (tag) => String(tag || '').replace('_', '-').toLowerCase();
const matches = (voice, tag) => norm(voice.lang) === tag.toLowerCase() || norm(voice.lang).startsWith(`${tag.toLowerCase()}-`);

/**
 * Best voice for a language.
 * Returns { voice, kind: 'local' | 'network' | null, networkOnly }. `networkOnly` is true when the language has voices but none run on the device.
 */
export function pickVoice(voices, lang, { allowNetwork = false } = {}) {
  const tags = LANG_TAGS[lang] || [lang];
  const inLanguage = (v) => tags.some((tag) => matches(v, tag));
  const rank = (v) => tags.findIndex((tag) => matches(v, tag)) * 2 + (v.default ? 0 : 1);   // preferred regional tag first, then the default voice
  const best = (list) => [...list].sort((a, b) => rank(a) - rank(b))[0] || null;

  const candidates = voices.filter(inLanguage);
  const local = best(candidates.filter((v) => v.localService));
  if (local) return { voice: local, kind: 'local', networkOnly: false };
  const network = best(candidates.filter((v) => !v.localService));
  if (network && allowNetwork) return { voice: network, kind: 'network', networkOnly: false };
  return { voice: null, kind: null, networkOnly: Boolean(network) };
}
