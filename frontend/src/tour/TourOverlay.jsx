import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiCheckCircle, FiVolume2, FiVolumeX, FiX } from 'react-icons/fi';
import { LANGUAGES } from '../languages';
import { CHOOSE_LANGUAGE } from './steps';

const GAP = 12; // between the spotlight and the popup
const EDGE = 16; // page gutter
const PAD = 6; // spotlight padding around the element
const MIN_ROOM = 180; // the popup needs at least this much height (or width beside the element) to sit there
const WIDTH = 380;
const FIND_MS = 150;
const GIVE_UP_MS = 3000; // an element that has not appeared by then is not on this page: show the popup in the middle instead

/** Watches the step's element: scrolls it into view once and follows it as the page scrolls, resizes or re-renders. */
function useTarget(target, ready) {
  const [state, setState] = useState({ status: 'finding', rect: null });
  useEffect(() => {
    if (!ready) return undefined;
    let scrolled = false;
    const started = Date.now();
    const measure = () => {
      const el = document.querySelector(`[data-tour="${target}"]`);
      if (!el) {
        if (Date.now() - started > GIVE_UP_MS) setState((s) => (s.status === 'missing' ? s : { status: 'missing', rect: null }));
        return;
      }
      if (!scrolled) {
        scrolled = true;
        el.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
      }
      const r = el.getBoundingClientRect();
      const rect = { top: r.top, left: r.left, width: r.width, height: r.height };
      setState((s) =>
        s.rect && s.rect.top === rect.top && s.rect.left === rect.left && s.rect.width === rect.width && s.rect.height === rect.height
          ? s
          : { status: 'found', rect },
      );
    };
    measure();
    const timer = setInterval(measure, FIND_MS);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      clearInterval(timer);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [target, ready]);
  return state;
}

/** Where the popup goes: below or above the element (whichever has more room), beside it when it is too tall for either, else docked to the bottom. */
function popupPosition(rect) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(WIDTH, vw - 2 * EDGE);
  if (!rect) return { width, left: (vw - width) / 2, top: '50%', transform: 'translateY(-50%)' };
  const left = Math.min(Math.max(rect.left + rect.width / 2 - width / 2, EDGE), vw - EDGE - width);
  const below = vh - (rect.top + rect.height + PAD + GAP) - EDGE;
  const above = rect.top - PAD - GAP - EDGE;
  if (Math.max(below, above) >= MIN_ROOM) {
    if (below >= above) return { width, left, top: rect.top + rect.height + PAD + GAP, maxHeight: below };
    return { width, left, bottom: vh - rect.top + PAD + GAP, maxHeight: above };
  }
  const right = vw - (rect.left + rect.width + PAD + GAP) - EDGE;
  const leftRoom = rect.left - PAD - GAP - EDGE;
  const top = Math.min(Math.max(rect.top, EDGE), vh - EDGE - 2 * MIN_ROOM);
  if (right >= width) return { width, left: rect.left + rect.width + PAD + GAP, top, maxHeight: vh - top - EDGE };
  if (leftRoom >= width) return { width, left: rect.left - PAD - GAP - width, top, maxHeight: vh - top - EDGE };
  return { width, left, bottom: EDGE, maxHeight: vh - 2 * EDGE };
}

/** Four panels around the spotlight that catch clicks, leaving the element itself usable (for steps where the person does the task). */
function BlockerWithHole({ rect }) {
  const top = rect.top - PAD;
  const left = rect.left - PAD;
  const bottom = rect.top + rect.height + PAD;
  const right = rect.left + rect.width + PAD;
  const panels = [
    { top: 0, left: 0, right: 0, height: Math.max(0, top) },
    { top: bottom, left: 0, right: 0, bottom: 0 },
    { top, left: 0, width: Math.max(0, left), height: bottom - top },
    { top, left: right, right: 0, height: bottom - top },
  ];
  return panels.map((style, i) => <div key={i} className="fixed z-[60]" style={style} aria-hidden="true" data-testid="tour-blocker" />);
}

export default function TourOverlay({ step, position, total, last, task, completed, ready, voiceOn, voiceNote, onToggleVoice, onChooseLanguage, onBack, onNext, onSkip }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage || 'en';
  const language = LANGUAGES.find((l) => l.code === lang)?.name || lang;
  const { status, rect } = useTarget(step.target, ready);
  const primary = useRef(null);
  const dialog = useRef(null);
  const shown = ready && status !== 'finding';
  const isLanguage = step.key === 'language';
  // A task can only be done on an element that is there; otherwise the step falls back to Next.
  const doing = Boolean(task) && status === 'found';

  useEffect(() => {
    if (!shown) return;
    if (doing) dialog.current?.focus({ preventScroll: true }); // leave the element free to be used; don't put a button under Enter
    else primary.current?.focus({ preventScroll: true });
  }, [shown, doing]);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onSkip();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onSkip]);

  return (
    <>
      {/* Catches clicks so the page underneath is not used mid-tour, except the element the person is asked to use. */}
      {doing && rect && !completed ? <BlockerWithHole rect={rect} /> : <div className="fixed inset-0 z-[60]" aria-hidden="true" data-testid="tour-blocker" />}
      {rect && shown ? (
        <div
          aria-hidden="true"
          className={`fixed z-[61] pointer-events-none rounded-2xl ring-2 transition-all duration-300 ${completed ? 'ring-emerald-400' : 'ring-amber-400'}`}
          style={{ top: rect.top - PAD, left: rect.left - PAD, width: rect.width + 2 * PAD, height: rect.height + 2 * PAD, boxShadow: '0 0 0 9999px rgba(2, 6, 23, 0.62)' }}
        />
      ) : (
        <div aria-hidden="true" className="fixed inset-0 z-[61] pointer-events-none bg-slate-950/60" />
      )}

      {shown && (
        <div
          ref={dialog}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-labelledby="tour-title"
          className="fixed z-[62] overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl shadow-slate-950/40 ring-1 ring-slate-200 font-sans text-slate-800 outline-none"
          style={popupPosition(rect)}
        >
          {isLanguage ? (
            <>
              <div id="tour-title" className="space-y-0.5">
                {LANGUAGES.map(({ code }) => (
                  <p key={code} lang={code} className={code === 'en' ? 'text-base font-extrabold text-slate-900' : 'text-sm font-bold text-slate-600'}>
                    {CHOOSE_LANGUAGE[code]}
                  </p>
                ))}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2.5">
                {LANGUAGES.map(({ code, name }, i) => (
                  <button
                    key={code}
                    ref={i === 0 ? primary : undefined}
                    type="button"
                    lang={code}
                    onClick={() => onChooseLanguage(code)}
                    className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3.5 text-base font-extrabold text-slate-900 transition hover:border-amber-400 hover:bg-amber-50 cursor-pointer"
                  >
                    {name}
                  </button>
                ))}
              </div>
              <button type="button" onClick={onSkip} className="mt-3 w-full text-center text-xs font-bold text-slate-500 hover:text-slate-900 cursor-pointer">
                {t('tour.skip')}
              </button>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-600">{t('tour.progress', { n: position, total })}</span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={onToggleVoice}
                    aria-pressed={voiceOn}
                    title={voiceOn ? t('tour.voiceOff') : t('tour.voiceOn')}
                    aria-label={voiceOn ? t('tour.voiceOff') : t('tour.voiceOn')}
                    className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
                  >
                    {voiceOn ? <FiVolume2 aria-hidden="true" /> : <FiVolumeX aria-hidden="true" />}
                  </button>
                  <button type="button" onClick={onSkip} title={t('tour.skip')} aria-label={t('tour.skip')} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 cursor-pointer">
                    <FiX aria-hidden="true" />
                  </button>
                </div>
              </div>
              <h2 id="tour-title" className="mt-2 text-lg font-extrabold tracking-tight text-slate-900">
                {t(`tour.steps.${step.key}.title`)}
              </h2>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{t(`tour.steps.${step.key}.text`)}</p>
              {doing &&
                (completed ? (
                  <p role="status" className="mt-3 flex items-center gap-2 rounded-2xl bg-emerald-50 px-3.5 py-2.5 text-sm font-bold text-emerald-800 ring-1 ring-emerald-200">
                    <FiCheckCircle aria-hidden="true" /> {t('tour.done')}
                  </p>
                ) : (
                  <p className="mt-3 rounded-2xl bg-amber-50 px-3.5 py-2.5 text-sm font-semibold text-amber-950 ring-1 ring-amber-200">
                    <span className="mr-1.5 font-extrabold uppercase text-[10px] tracking-wider text-amber-700">{t('tour.yourTurn')}</span>
                    {t(`tour.steps.${step.key}.task`)}
                  </p>
                ))}
              {voiceNote && <p className="mt-2 text-[11px] font-semibold text-slate-500">{t(`tour.${voiceNote}`, { language })}</p>}
              <div className="mt-4 flex items-center justify-between gap-3">
                <button type="button" onClick={onSkip} className="text-xs font-bold text-slate-500 hover:text-slate-900 cursor-pointer">
                  {t('tour.skip')}
                </button>
                <div className="flex items-center gap-2">
                  {position > 1 && (
                    <button type="button" onClick={onBack} className="rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer">
                      {t('tour.back')}
                    </button>
                  )}
                  {doing ? (
                    !completed && (
                      <button type="button" onClick={onNext} className="rounded-xl px-3 py-2 text-xs font-bold text-slate-500 underline underline-offset-2 hover:text-slate-900 cursor-pointer">
                        {t('tour.skipStep')}
                      </button>
                    )
                  ) : (
                    <button
                      ref={primary}
                      type="button"
                      onClick={onNext}
                      className="rounded-xl bg-gradient-to-r from-[#0d1424] to-[#1e293b] px-4 py-2 text-xs font-bold text-white shadow-md hover:from-[#16223b] hover:to-[#26344f] cursor-pointer"
                    >
                      {last ? t('tour.finish') : t('tour.next')}
                    </button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
