import { useTranslation } from 'react-i18next';
import { buildTranslatedScript, draftNotice, isReviewed } from '../speech/translations';

/**
 * The sentence(s) that say what the screening found, in the chosen language.
 * In English this is the server's own wording. In Hindi, Kannada and Tamil it is chosen from the fixed sentences in speech/translations.json (the same ones the Listen
 * button reads), never machine-translated: the machine translator mistranslated safety-critical sentences, and has no Kannada or Tamil model at all.
 * `notice` says what the reader should know about the words shown (they are drafts no doctor has checked yet, or this result has no fixed sentence and stays in English).
 */
export function useResultSummary(assessment, lang) {
  const { t } = useTranslation();
  if (!assessment) return { text: t('clinical.idleNote'), notice: null };
  if (lang === 'en') return { text: assessment.overallSummary, notice: null };
  const fixed = buildTranslatedScript(lang, assessment)?.[1]; // [intro, summary + disclaimer, left eye, right eye, ...]
  if (!fixed) return { text: assessment.overallSummary, notice: t('clinical.englishOnly') };
  return { text: fixed, notice: isReviewed(lang) ? null : draftNotice(lang) };
}
