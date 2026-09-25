import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiSquare, FiVolume2 } from 'react-icons/fi';
import { ALLOW_NETWORK_VOICES, allowsUnreviewedSpeech } from '../config';
import { LANGUAGES } from '../languages';
import { useSpeech } from '../hooks/useSpeech';
import { buildSpokenScript } from '../speech/reportScript';
import { buildTranslatedScript, draftNotice, isReviewed } from '../speech/translations';

const PROBLEM_KEYS = { unsupported: 'listenUnsupported', 'no-voice': 'listenNoVoice', 'online-only': 'listenOnlineOnly', error: 'listenError', 'not-reviewed': 'listenNotReviewed' };

/**
 * A big "listen" button that reads the result aloud, for people who cannot read it. Uses the phone's own voices. In Hindi and Kannada it reads fixed sentences
 * (never machine translation), and only once a qualified person has reviewed them (see src/speech/translations.js). Nothing plays until the person taps.
 */
export default function ListenToReport({ assessment, compact = false }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage || 'en';
  const languageName = LANGUAGES.find((l) => l.code === lang)?.name || lang;
  const { status, problem, notice, reading, listen, stop, fail } = useSpeech({ allowNetwork: ALLOW_NETWORK_VOICES });
  const [showText, setShowText] = useState(!compact);
  // The language the button was last tapped in. A problem or notice is about that language, so it is hidden once the language changes.
  const [tappedIn, setTappedIn] = useState(null);
  const current = tappedIn === lang;
  const script = useMemo(() => buildSpokenScript(assessment), [assessment]);
  const isEnglish = lang === 'en';
  const fixed = useMemo(() => (isEnglish ? null : buildTranslatedScript(lang, assessment)), [isEnglish, lang, assessment]);
  const allowed = isEnglish || isReviewed(lang) || allowsUnreviewedSpeech(lang);
  // The sentences for this language: reviewed ones as they are; unreviewed drafts (only when a deployment allows them) announce that first.
  const localScript = fixed && allowed ? (isReviewed(lang) ? fixed : [draftNotice(lang), ...fixed]) : null;

  if (!assessment) return null;

  const english = async () => ({ sentences: script, lang: 'en' });
  const englishInstead = async () => ({ sentences: script, lang: 'en', fellBack: true });

  const start = () => {
    setTappedIn(lang);
    if (isEnglish) return listen({ lang: 'en', prepare: english });
    if (!allowed) return fail('not-reviewed');                                            // the sentences are waiting for review
    if (!localScript) return listen({ lang: 'en', prepare: englishInstead });              // this particular result has no fixed sentence: say so, read English
    return listen({ lang, prepare: async () => ({ sentences: localScript, lang }) });
  };
  // The words are always visible (so a helper or clinician can read along and check what was heard). While reading, they are the words actually being spoken.
  const shown = status === 'speaking' && reading.sentences.length ? reading.sentences : localScript || script;
  const busy = status !== 'idle';

  return (
    <section aria-label={t('listen')} className={`${compact ? 'mt-3' : 'mt-4'} space-y-2 print:hidden`}>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={busy ? stop : start}
          className="inline-flex items-center gap-3 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-bold px-5 py-3.5 text-sm shadow-sm transition cursor-pointer"
        >
          {busy ? <FiSquare className="text-xl" aria-hidden="true" /> : <FiVolume2 className="text-xl" aria-hidden="true" />}
          {busy ? t('listenStop') : t('listen')}
        </button>
        <div className="flex items-center bg-white border border-slate-200/90 rounded-xl p-1 text-xs font-semibold" role="group" aria-label="Language">
          {LANGUAGES.map(({ code, label }) => (
            <button
              key={code}
              type="button"
              aria-pressed={lang === code}
              onClick={() => {
                stop();
                i18n.changeLanguage(code);
              }}
              className={`px-2.5 py-1 rounded-lg cursor-pointer ${lang === code ? 'bg-slate-100 text-slate-900 font-bold' : 'text-slate-500'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <p role="status" className="text-[11px] text-slate-500 font-semibold min-h-4">
        {status === 'preparing' && t('listenPreparing')}
        {status === 'speaking' && t('listenSpeaking')}
        {current && notice === 'translation-failed' && ` ${t('listenTranslationFailed')}`}
      </p>

      <div className="rounded-xl bg-white/80 border border-slate-200/90 px-4 py-3">
        <button
          type="button"
          aria-expanded={showText}
          onClick={() => setShowText((v) => !v)}
          className="text-[11px] font-bold text-slate-600 underline underline-offset-2 cursor-pointer"
        >
          {t('listenShowText')}
        </button>
        {showText && (
          <ol className="mt-2 space-y-1.5 text-xs leading-relaxed text-slate-700 list-none p-0">
            {shown.map((sentence, i) => (
              <li
                key={`${i}-${sentence.slice(0, 20)}`}
                aria-current={status === 'speaking' && reading.index === i ? 'true' : undefined}
                className={`rounded-md px-2 py-1 ${status === 'speaking' && reading.index === i ? 'bg-amber-100 font-bold text-slate-900' : ''}`}
              >
                {sentence}
              </li>
            ))}
          </ol>
        )}
      </div>

      {current && problem && (
        <div role="alert" className="rounded-xl bg-amber-50 border border-amber-200 text-amber-900 px-4 py-3 text-xs font-semibold space-y-2">
          <p>{t(PROBLEM_KEYS[problem], { language: languageName })}</p>
          {(problem === 'no-voice' || problem === 'online-only' || problem === 'not-reviewed') && lang !== 'en' && (
            <button
              type="button"
              onClick={() => {
                setTappedIn(lang);
                listen({ lang: 'en', prepare: english });
              }}
              className="rounded-lg bg-slate-900 text-white px-3 py-1.5 font-bold cursor-pointer"
            >
              {t('listenEnglish')}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
