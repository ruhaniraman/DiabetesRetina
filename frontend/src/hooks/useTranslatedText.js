import { useEffect, useState } from 'react';
import { translateText } from '../api/ml';

/** Translates dynamic (backend-generated) text; falls back to the original if translation fails. `translated` is true only when machine translation is showing. */
export function useTranslatedText(text, lang) {
  const [result, setResult] = useState({ key: '', value: '' });
  const key = `${lang}:${text}`;

  useEffect(() => {
    if (!text || lang === 'en') return undefined;
    let cancelled = false;
    translateText(text, lang)
      .then((value) => {
        if (!cancelled) setResult({ key, value });
      })
      .catch(() => {
        /* keep showing the original text */
      });
    return () => {
      cancelled = true;
    };
  }, [text, lang, key]);

  const translated = lang !== 'en' && result.key === key;
  return { text: translated ? result.value : text, translated };
}
