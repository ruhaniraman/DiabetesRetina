import data from './translations.json';

// Hindi and Kannada are read aloud from fixed sentences (translations.json), never from machine translation: the machine translator has no Kannada model at all,
// and its Hindi mistranslated safety-critical sentences ("can miss disease" came out as "can remember the disease", "Right eye" as "correct eye").
// A language is only used once `reviewed[lang]` is true, i.e. once a qualified person has checked every sentence (docs/SPOKEN_TRANSLATIONS_FOR_REVIEW.md),
// unless the deployment turns that check off on purpose (VITE_ALLOW_UNREVIEWED_SPEECH, per language, see config.js).

const fill = (template, values) => template.replace(/\{(\w+)\}/g, (whole, key) => (key in values ? values[key] : whole));
const stageNumber = (label) => /Stage (\d)/.exec(String(label || ''))?.[1];

// English quality-warning text -> its key, so the fixed translation can be found.
const WARNING_KEYS = Object.fromEntries(Object.entries(data.en.warnings).map(([key, text]) => [text, key]));

export const isReviewed = (lang) => lang === 'en' || Boolean(data.reviewed?.[lang]);
export const hasLanguage = (lang) => Boolean(data[lang]);
export const draftNotice = (lang) => data[lang]?.draftNotice;

/**
 * The spoken result in `lang`, chosen from the fixed sentences by which summary the server produced (assessment.summaryParts).
 * Returns null when any part cannot be matched to a fixed sentence (an unknown summary, an unexpected warning): the caller then says so and reads English instead.
 * With lang 'en' this reproduces the English the server writes, which a test checks.
 */
export function buildTranslatedScript(lang, assessment) {
  const tr = data[lang];
  const parts = assessment?.summaryParts;
  if (!tr || !parts || parts.kind === 'fallback') return null;

  const unit = (n) => `${n}${tr.percent}`;
  const eyes = parts.eyes?.length ? tr.eyesIn[parts.eyes.length > 1 ? 'both' : parts.eyes[0]] : '';
  let summary;
  if (parts.kind === 'escalated') {
    if (!tr.stageText[parts.worst]) return null;
    summary = fill(tr.summary.escalated, {
      worst: tr.stageText[parts.worst],
      eyes,
      threshold: unit(parts.thresholdPercent),
      scores: parts.scorePercents.map(unit).join(', '),
    });
  } else if (tr.summary[parts.kind]) {
    summary = fill(tr.summary[parts.kind], { eyes });
  } else {
    return null;
  }

  const eyeLine = (name, grade, flagged) => {
    const stage = tr.grades[stageNumber(grade)];
    return stage ? `${name}: ${stage}. ${flagged ? tr.flagged : tr.notFlagged}` : null;
  };
  const left = eyeLine(tr.left, assessment.leftGrade, assessment.leftReferable);
  const right = eyeLine(tr.right, assessment.rightGrade, assessment.rightReferable);
  if (!left || !right) return null;

  const warnings = [];
  for (const warning of assessment.qualityWarnings || []) {
    const match = /^(Left|Right) eye: ([\s\S]+)$/.exec(warning);
    const key = match && WARNING_KEYS[match[2]];
    if (!key) return null;
    warnings.push(`${tr.photos} ${match[1] === 'Left' ? tr.left : tr.right}: ${tr.warnings[key]}`);
  }
  return [tr.intro, `${summary} ${tr.disclaimer}`, left, right, ...warnings];
}
