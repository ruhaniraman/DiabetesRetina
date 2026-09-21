// Every piece of clinical wording the web app shows, in one place.
//
// None of this wording has been reviewed by a clinician. Keeping it here means a reviewer can read, change and sign it
// off in one sitting (docs/CLINICAL_REVIEW.md is generated from this file), and src/clinicalText.test.js guards against
// risky phrasing creeping back in. The backend's wording lives in backend/clinical_text.py and the Stage 4 PDF wording in
// stage4_explainability/report/formatReportText.m.
//
// Principles (a clinician should confirm or overrule them):
//   * Never reassure: "nothing found" must say it does not rule out disease.
//   * Recommend, do not instruct ("is recommended", never "is required").
//   * No clinical timings (screening intervals) that nobody qualified has approved.
//   * Say "detected/flagged by the screening model", never "you have".
//   * The exact stage is less reliable than the referral decision, and the text says so where it matters.

export const DISCLAIMER =
  'Screening aid only. Results are produced by automated image analysis and are not a medical diagnosis, and the tool can miss disease. ' +
  'It has not been clinically validated. Always have a qualified eye-care professional review the findings before making any treatment decision.';

// Overall banner per grade (keys are the backend's grade names). "Clear" is avoided on purpose: it reads as "healthy".
export const BANNER_TEXT = {
  No_DR: { badgeText: 'Stage 0 · No DR detected', title: 'Overall Assessment: Stage 0 – No DR detected' },
  Mild: { badgeText: 'Stage 1 Risk', title: 'Overall Assessment: Stage 1 – Mild' },
  Moderate: { badgeText: 'Stage 2 Risk', title: 'Overall Assessment: Stage 2 – Moderate' },
  Severe: { badgeText: 'Stage 3 Risk', title: 'Overall Assessment: Stage 3 – Severe' },
  Proliferate_DR: { badgeText: 'Stage 4 Risk', title: 'Overall Assessment: Stage 4 – Proliferative' },
  Pending: { badgeText: 'Pending', title: 'Overall Assessment: Awaiting Scan Data' },
};

export const IDLE_NOTE = 'Upload fundus images for both eyes and run the AI assessment to see the screening result.';

// Report page: what the result means for the patient, by outcome.
export const TRIAGE = {
  none: {
    title: 'No Assessment Yet',
    priority: 'Not assessed',
    sub: 'Upload both fundus images on the dashboard and run the AI assessment. Nothing on this page should be read as a result until then.',
  },
  noReferral: {
    title: 'No Referral Flagged',
    priority: 'No referral flagged',
    sub: 'The screening model did not flag diabetic retinopathy in either eye. This does not rule out disease: the tool can miss it. Continue regular eye screening as advised by your eye-care professional.',
  },
  followUp: {
    title: 'Follow-up Recommended',
    priority: 'Follow-up recommended',
    sub: 'The screening model detected mild changes. Follow-up with an eye-care professional is recommended; ask them how often you should be screened.',
  },
  referral: {
    title: 'Specialist Review Recommended',
    priority: 'Referral flagged',
    sub: 'The screening model flagged possible diabetic retinopathy in at least one eye. Review by an eye-care professional is recommended; this result cannot be acted on automatically.',
  },
};

export const basisText = (thresholdPercent, source) =>
  thresholdPercent
    ? `Basis: referral score compared with a ${thresholdPercent} threshold${source === 'site' ? ' set by this site' : ''}`
    : 'Basis: model grade';

export const REPORT_LABELS = {
  eyebrow: 'RETINARESCUE • SCREENING REPORT',
  severity: 'Estimated DR severity',
  notAssessed: 'Not assessed',
  rationaleHeading: 'How this result was reached',
};

// Confidence is shown as a band, not a percentage: the model's raw probabilities are over-confident (in testing, the
// "Moderate" band claims about 81% but is right about 75% of the time). See validation/REPORT.md.
export const CONFIDENCE = {
  label: 'confidence',
  note:
    'Lower confidence means the grade is less likely to be right. In testing, the referral decision was wrong in about 1% of high-confidence ' +
    'results and about 15% of the rest.',
};

export const STAGE_NOTE =
  'The referral decision is the more reliable output. On held-out test images it found about 95% of referable cases, while the exact stage ' +
  'matched the reference grade about 78% of the time. Results depend on the camera and population: on a second public dataset it flagged many more eyes that had no disease ' +
  '(see validation/REPORT.md).';

export const REFERRAL_CHIP = {
  label: 'Referral flagged',
  hint: "The most likely stage is lower, but the screening model's referral threshold was reached",
};

export const HEATMAP_NOTE =
  "Shows the regions that raised this eye's referral score, on a coarse grid. A rough guide, not a lesion detection: warm colours do not by themselves mean disease, " +
  'and disease can be present outside them.';

export const HEATMAP_BELOW_NOTE =
  "This eye's referral score is below the threshold, so it was not flagged. The map shows where the score was relatively highest, not a finding.";

export const HEATMAP_EMPTY_NOTE = "No region raised this eye's referral score, so nothing is highlighted. That does not rule out disease.";

export const PDF_PRIVACY_NOTE =
  "The PDF prints the patient's name and date of birth from their profile. To create it, the photographs are sent to the server again; the server does not keep the photographs or the report file.";

export const TRANSLATION_NOTICE = 'Machine-translated and not clinically reviewed. If anything is unclear, the English text is authoritative.';

export const LOGIN_HERO = {
  text: 'AI-assisted retinal screening to help catch diabetic eye disease early.',
  subtitle: 'Sign in to access your screening dashboard & reports.',
};
