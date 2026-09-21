// A stand-in for the browser's speech engine, so tests can check what would be spoken, with which voice, and stop it part-way.
export function makeVoice(lang, { local = true, name = `${lang} voice`, isDefault = false } = {}) {
  return { lang, name, localService: local, default: isDefault, voiceURI: name };
}

/**
 * Installs window.speechSynthesis and window.SpeechSynthesisUtterance.
 * `autoEnd` true: each utterance ends by itself on the next tick. false: the test ends them with synth.endCurrent().
 */
export function installFakeSpeech({ voices = [], autoEnd = true } = {}) {
  const spoken = [];
  let pending = null;
  class Utterance {
    constructor(text) {
      this.text = text;
      this.volume = 1;
      this.rate = 1;
    }
  }
  const synth = {
    spoken,
    voices,
    cancelled: 0,
    speak(u) {
      if (u.text === '') return; // the silent "unlock" utterance
      spoken.push(u);
      if (autoEnd) setTimeout(() => u.onend?.(), 0);
      else pending = u;
    },
    endCurrent() {
      const u = pending;
      pending = null;
      u?.onend?.();
    },
    cancel() {
      this.cancelled += 1;
      pending = null;
    },
    getVoices() {
      return this.voices;
    },
    addEventListener() {},
    removeEventListener() {},
  };
  window.speechSynthesis = synth;
  window.SpeechSynthesisUtterance = Utterance;
  return synth;
}

export function removeFakeSpeech() {
  delete window.speechSynthesis;
  delete window.SpeechSynthesisUtterance;
}
