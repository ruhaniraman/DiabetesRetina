import { SPEECH } from '../clinicalText';

/** "Stage 2 - Moderate" reads better aloud as "Stage 2, Moderate" (an engine may say "dash"). */
export const spokenGrade = (label) => String(label || '').replace(/\s+[-–]\s+/g, ', ');

/**
 * The sentences read aloud, in English, from a real assessment. Every sentence comes from the wording the app already shows (the server's summary,
 * the grade labels and quality warnings) plus the few fixed lines in clinicalText.js (SPEECH). Percentages are left out on purpose: they are hard to
 * hear and the raw numbers are over-confident. Nothing is added or removed to soften or strengthen the result.
 */
export function buildSpokenScript(assessment) {
  if (!assessment) return [];
  const eye = (name, grade, flagged) => `${name}: ${spokenGrade(grade)}. ${flagged ? SPEECH.flagged : SPEECH.notFlagged}`;
  return [
    SPEECH.intro,
    assessment.overallSummary,
    eye(SPEECH.left, assessment.leftGrade, assessment.leftReferable),
    eye(SPEECH.right, assessment.rightGrade, assessment.rightReferable),
    ...(assessment.qualityWarnings || []).map((w) => `${SPEECH.photos} ${w}`),
  ].filter(Boolean);
}
