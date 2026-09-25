import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { useSpeech, primeSpeech } from '../hooks/useSpeech';
import { allowsUnreviewedSpeech } from '../config';
import { TourContext } from './tourContext';
import { TOUR_STEPS } from './steps';
import TourOverlay from './TourOverlay';

const VOICE_KEY = 'tour.voice';
const DONE_PAUSE_MS = 900; // a finished task shows "Done" briefly before the tour moves on

function readVoicePreference() {
  try {
    return localStorage.getItem(VOICE_KEY) !== 'off';
  } catch {
    return true;
  }
}

const taskKind = (step) => (typeof step.task === 'function' ? 'state' : step.task || null);

/**
 * The welcome tour. It starts after every sign-in (not when a page reload only restores the session) and can be replayed from the Dashboard.
 * At most steps the person does the task themselves (upload the photos, run the assessment, open the report...); the tour waits for it and moves on.
 * Each popup is read aloud in the chosen language. The tour text holds no health information, so online voices may be used; Hindi, Kannada and
 * Tamil narration are unreviewed drafts and follow the same switch as "Listen to the result" (VITE_ALLOW_UNREVIEWED_SPEECH).
 * `session` is the scan session (photos and result), which some steps wait on.
 */
export default function TourProvider({ session, children }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage || 'en';
  const { loginCount } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [active, setActive] = useState(false);
  const [index, setIndex] = useState(0);
  const [doneAtStart, setDoneAtStart] = useState(false); // a state task that was already done when the step opened is shown as a normal step
  const [completed, setCompleted] = useState(false);
  const [voiceOn, setVoiceOn] = useState(readVoicePreference);
  const speech = useSpeech({ allowNetwork: true });
  const { listen, stop: stopSpeech } = speech;
  const arrived = useRef(false); // has the person been on this step's page yet
  const timer = useRef(null);
  const ctx = useMemo(() => ({ session }), [session]);
  const ctxRef = useRef(ctx);
  useEffect(() => {
    ctxRef.current = ctx;
  }, [ctx]);

  const goTo = useCallback((i, direction = 1) => {
    let next = i;
    while (TOUR_STEPS[next]?.when && !TOUR_STEPS[next].when(ctxRef.current)) next += direction;
    clearTimeout(timer.current);
    arrived.current = false;
    const step = TOUR_STEPS[next];
    setIndex(next);
    setCompleted(false);
    setDoneAtStart(taskKind(step) === 'state' && step.task(ctxRef.current));
  }, []);

  const start = useCallback(() => {
    setActive(true);
    goTo(0);
  }, [goTo]);

  const stop = useCallback(() => {
    clearTimeout(timer.current);
    setActive(false);
    stopSpeech();
  }, [stopSpeech]);

  const advance = useCallback(() => (index + 1 < TOUR_STEPS.length ? goTo(index + 1) : stop()), [index, goTo, stop]);

  const complete = useCallback(
    (pause = DONE_PAUSE_MS) => {
      setCompleted(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(advance, pause);
    },
    [advance],
  );
  useEffect(() => () => clearTimeout(timer.current), []);

  // A new sign-in starts the tour; a remount of the signed-in app (or a restored session, loginCount 0) does not start it again.
  const startedFor = useRef(0);
  useEffect(() => {
    if (loginCount > startedFor.current) {
      startedFor.current = loginCount;
      start();
    }
  }, [loginCount, start]);

  const step = TOUR_STEPS[index];
  const kind = doneAtStart ? null : taskKind(step);

  // Keep the person on the step's page. Leaving it is the task on 'leave' steps; otherwise the tour brings them back.
  useEffect(() => {
    if (!active || completed) return; // (state tasks never leave the page, so `completed` covers every case that does)
    if (pathname === step.route) {
      arrived.current = true;
      return;
    }
    if (arrived.current && kind === 'leave') complete(0);
    else navigate(step.route);
  }, [active, completed, pathname, step, kind, navigate, complete]);

  // 'click' tasks: a tap anywhere inside the spotlighted element.
  useEffect(() => {
    if (!active || completed || kind !== 'click') return undefined;
    const onClick = (e) => {
      if (e.target instanceof Element && e.target.closest(`[data-tour="${step.target}"]`)) complete();
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [active, completed, kind, step, complete]);

  // State tasks: wait for the app to get there (photos accepted, result back), show Done, then move on.
  const stateDone = active && kind === 'state' && step.task(ctx);
  useEffect(() => {
    if (!stateDone) return undefined;
    const id = setTimeout(advance, DONE_PAUSE_MS);
    return () => clearTimeout(id);
  }, [stateDone, advance]);
  const done = completed || stateDone;

  const reviewed = lang === 'en' || allowsUnreviewedSpeech(lang);

  // Read the current popup aloud. The language step and a muted or unreviewed language stay silent.
  useEffect(() => {
    if (!active || step.key === 'language' || !voiceOn || !reviewed) {
      stopSpeech();
      return;
    }
    const sentences = [t(`tour.steps.${step.key}.title`), t(`tour.steps.${step.key}.text`)];
    if (kind) sentences.push(t(`tour.steps.${step.key}.task`));
    listen({ lang, prepare: async () => ({ sentences, lang }) });
    // `kind` is left out on purpose: a task finishing must not start the popup again
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, step, voiceOn, reviewed, lang, t, listen, stopSpeech]);

  const chooseLanguage = (code) => {
    primeSpeech(); // inside the tap: lets the browser speak the next popups
    i18n.changeLanguage(code);
    goTo(1);
  };

  const toggleVoice = () => {
    const next = !voiceOn;
    if (next) primeSpeech();
    setVoiceOn(next);
    try {
      localStorage.setItem(VOICE_KEY, next ? 'on' : 'off');
    } catch {
      /* the preference just is not remembered */
    }
  };

  // Why the popup is not being read aloud, if it should be.
  let voiceNote = null;
  if (voiceOn && step.key !== 'language') {
    if (!reviewed) voiceNote = 'notReviewed';
    else if (speech.problem === 'unsupported') voiceNote = 'unsupported';
    else if (speech.problem) voiceNote = 'noVoice';
  }

  // Step numbers count only the steps this person will see.
  const shownSteps = TOUR_STEPS.filter((s, i) => i > 0 && (!s.when || s.when(ctx)));
  const position = shownSteps.indexOf(step) + 1;

  const value = useMemo(() => ({ active, start, stop }), [active, start, stop]);

  return (
    <TourContext.Provider value={value}>
      {children}
      {active && (
        <TourOverlay
          key={index} // a fresh spotlight search per step
          step={step}
          position={position}
          total={shownSteps.length}
          last={index + 1 === TOUR_STEPS.length}
          task={kind}
          completed={done}
          ready={step.route === pathname}
          voiceOn={voiceOn}
          voiceNote={voiceNote}
          onToggleVoice={toggleVoice}
          onChooseLanguage={chooseLanguage}
          onBack={() => goTo(Math.max(1, index - 1), -1)}
          onNext={advance}
          onSkip={stop}
        />
      )}
    </TourContext.Provider>
  );
}
