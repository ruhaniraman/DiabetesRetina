import { useCallback, useEffect, useRef, useState } from 'react';
import { loadVoices, pickVoice, speechSupported } from '../speech/voices';
import { splitForSpeech } from '../speech/chunk';

const RATE = 0.85; // a little slower than normal speech, easier to follow

/**
 * Some browsers only let speech start from a tap, and would refuse it once we have waited for the network (translation). Speaking an empty,
 * silent utterance inside the tap handler "unlocks" speech for the sentences spoken later.
 */
export function primeSpeech() {
  if (!speechSupported()) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const silent = new window.SpeechSynthesisUtterance('');
  silent.volume = 0;
  synth.speak(silent);
}

/**
 * Read text aloud with the device's own voices.
 *   status   'idle' | 'preparing' | 'speaking'
 *   problem  null | 'unsupported' | 'no-voice' | 'online-only' | 'not-reviewed' | 'error'
 *   notice   null | 'translation-failed' (this result has no fixed sentences in the chosen language, so it is read in English)
 *   reading  { sentences, index }: the sentences being read and the one being spoken now (index null when not speaking)
 *   listen({ lang, prepare })  prepare() resolves { sentences, lang, fellBack? } (it may translate); call it from a tap
 *   stop()
 */
export function useSpeech({ allowNetwork = false } = {}) {
  const [status, setStatus] = useState('idle');
  const [problem, setProblem] = useState(null);
  const [notice, setNotice] = useState(null);
  const [reading, setReading] = useState({ sentences: [], index: null }); // what is being read, and which sentence is being spoken now
  const run = useRef(0);

  const stop = useCallback(() => {
    run.current += 1; // anything still waiting (a translation, the next sentence) is dropped
    if (speechSupported()) window.speechSynthesis.cancel();
    setStatus('idle');
    setReading((r) => ({ ...r, index: null }));
  }, []);

  useEffect(
    () => () => {
      run.current += 1;
      if (speechSupported()) window.speechSynthesis.cancel();
    },
    [],
  );

  /** Refuse to speak, with a reason (used when the chosen language is not switched on yet). */
  const fail = useCallback((why) => {
    run.current += 1;
    if (speechSupported()) window.speechSynthesis.cancel();
    setStatus('idle');
    setNotice(null);
    setProblem(why);
  }, []);

  const findVoice = useCallback(
    async (lang) => {
      const voices = await loadVoices();
      const { voice, networkOnly } = pickVoice(voices, lang, { allowNetwork });
      return voice ? { ok: true, voice } : { ok: false, problem: networkOnly ? 'online-only' : 'no-voice' };
    },
    [allowNetwork],
  );

  const listen = useCallback(
    async ({ lang, prepare }) => {
      const id = (run.current += 1);
      const current = () => id === run.current;
      setProblem(null);
      setNotice(null);
      if (!speechSupported()) {
        setProblem('unsupported');
        return;
      }
      primeSpeech(); // first thing, before any await: still inside the tap
      setStatus('preparing');

      let found = await findVoice(lang);
      if (!current()) return;
      if (!found.ok) {
        setProblem(found.problem);
        setStatus('idle');
        return;
      }

      const prepared = await prepare();
      if (!current()) return;
      if (prepared.lang !== lang) {
        // translation failed and the caller fell back to English: it needs an English voice
        found = await findVoice(prepared.lang);
        if (!current()) return;
        if (!found.ok) {
          setProblem(found.problem);
          setStatus('idle');
          return;
        }
      }
      if (prepared.fellBack) setNotice('translation-failed');

      setStatus('speaking');
      const synth = window.speechSynthesis;
      try {
        for (let i = 0; i < prepared.sentences.length; i += 1) {
          if (!current()) return;
          setReading({ sentences: prepared.sentences, index: i });
          for (const chunk of splitForSpeech(prepared.sentences[i])) {
            if (!current()) return;
            await new Promise((resolve, reject) => {
              const utterance = new window.SpeechSynthesisUtterance(chunk);
              utterance.voice = found.voice;
              utterance.lang = found.voice.lang;
              utterance.rate = RATE;
              utterance.onend = () => resolve();
              utterance.onerror = (e) => (e?.error === 'canceled' || e?.error === 'interrupted' ? resolve() : reject(e));
              synth.speak(utterance);
            });
          }
        }
      } catch {
        if (current()) setProblem('error');
      }
      if (current()) {
        setStatus('idle');
        setReading((r) => ({ ...r, index: null }));
      }
    },
    [findVoice],
  );

  return { status, problem, notice, reading, listen, stop, fail };
}
