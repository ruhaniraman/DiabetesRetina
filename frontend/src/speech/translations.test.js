import { describe, it, expect } from 'vitest';
import data from './translations.json';
import { buildTranslatedScript, draftNotice, isReviewed } from './translations';

// Exact output of backend/clinical_text.py (build_summary / summary_parts) for these cases.
const DISCLAIMER = "This is an automated screening aid, not a diagnosis, and it can miss disease: symptoms or a clinician's concern should always prompt review.";
const moderateLeft = {
  summaryParts: { kind: 'Moderate', eyes: ['left'] },
  leftGrade: 'Stage 2 - Moderate',
  rightGrade: 'Stage 0 - No DR detected',
  leftReferable: true,
  rightReferable: false,
  qualityWarnings: [],
};
const severeBoth = { ...moderateLeft, summaryParts: { kind: 'Severe', eyes: ['left', 'right'] }, leftGrade: 'Stage 3 - Severe', rightGrade: 'Stage 3 - Severe', rightReferable: true };
const noDr = { ...moderateLeft, summaryParts: { kind: 'No_DR', eyes: ['left', 'right'] }, leftGrade: 'Stage 0 - No DR detected', leftReferable: false };
const escalated = {
  ...moderateLeft,
  summaryParts: { kind: 'escalated', worst: 'Mild', eyes: ['left', 'right'], thresholdPercent: 20, scorePercents: [35, 31] },
  leftGrade: 'Stage 1 - Mild',
  rightGrade: 'Stage 1 - Mild',
  rightReferable: true,
};

describe('translations.json', () => {
  const shape = (value) => (value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shape(v)])) : 'text');
  const placeholders = (text) => [...String(text).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

  it.each(['hi', 'kn', 'ta'])('%s has exactly the same sentences as the English source', (lang) => {
    expect(shape(data[lang])).toEqual(shape(data.en));
  });

  it.each(['hi', 'kn', 'ta'])('%s keeps every blank ({eyes}, {worst}, ...) of the English sentence, and adds none', (lang) => {
    for (const key of Object.keys(data.en.summary)) {
      expect(placeholders(data[lang].summary[key]), `${lang} summary.${key}`).toEqual(placeholders(data.en.summary[key]));
    }
  });

  it.each(['hi', 'kn', 'ta'])('%s has no empty or untranslated (still English) sentence', (lang) => {
    const flat = (o) => Object.values(o).flatMap((v) => (typeof v === 'object' ? flat(v) : [v]));
    for (const sentence of flat(data[lang])) {
      expect(sentence.trim().length).toBeGreaterThan(0);
      expect(sentence).not.toMatch(/[A-Za-z]{6,} [A-Za-z]{4,} [A-Za-z]{4,}/); // an English phrase left in
    }
  });

  it('Hindi, Kannada and Tamil are NOT reviewed yet: they are drafts, and speech in them stays off until a qualified person signs them off', () => {
    expect(data.reviewed).toEqual({ hi: false, kn: false, ta: false });
    expect(isReviewed('hi')).toBe(false);
    expect(isReviewed('kn')).toBe(false);
    expect(isReviewed('ta')).toBe(false);
    expect(isReviewed('en')).toBe(true);
    expect(draftNotice('hi')).toMatch(/डॉक्टर/);
  });

  it('does not contain the specific mistranslations the machine translator made', () => {
    const hindi = JSON.stringify(data.hi);
    expect(hindi).not.toContain('सही आँख'); // "Right eye" came out as "correct eye"
    expect(hindi).not.toContain('याद कर सकता'); // "can miss disease" came out as "can remember the disease"
    expect(hindi).not.toContain('ध्वज'); // "flagged" came out as "flag"
  });
});

describe('buildTranslatedScript', () => {
  it('reproduces the English the server writes, exactly (so the fixed table cannot drift from the backend)', () => {
    const script = buildTranslatedScript('en', moderateLeft);
    expect(script).toEqual([
      'This is your diabetic retinopathy screening result.',
      `The screening model detected signs consistent with moderate non-proliferative diabetic retinopathy (Stage 2) in the left eye. Referral to an eye specialist is recommended. ${DISCLAIMER}`,
      'Left eye: Stage 2, Moderate. Referral recommended.',
      'Right eye: Stage 0, No DR detected. No referral flagged.',
    ]);
    expect(buildTranslatedScript('en', severeBoth)[1]).toBe(
      `URGENT: the screening model detected signs consistent with severe non-proliferative diabetic retinopathy (Stage 3) in the left and right eyes. Prompt referral to an ophthalmologist is recommended. ${DISCLAIMER}`,
    );
    expect(buildTranslatedScript('en', noDr)[1]).toBe(
      `The screening model did not detect diabetic retinopathy in either eye. This does not rule out disease, because the screening tool can miss it. Continue regular eye screening as advised by your eye-care professional, and seek review sooner if you notice any change in your vision. ${DISCLAIMER}`,
    );
    expect(buildTranslatedScript('en', escalated)[1]).toBe(
      `The most likely grade was mild retinopathy (Stage 1), but the screening model's referral threshold (20%) was reached in the left and right eyes (referral score 35%, 31%). This is treated as referable (Stage 2 or worse) until a clinician reviews it. The exact stage is an estimate; the referral decision is the more reliable result. ${DISCLAIMER}`,
    );
  });

  it('builds the Hindi result from the fixed sentences, with every blank filled', () => {
    for (const a of [moderateLeft, severeBoth, noDr, escalated]) {
      const script = buildTranslatedScript('hi', a);
      expect(script).toHaveLength(4);
      expect(script.join(' ')).not.toMatch(/[{}]/);
    }
    const [intro, summary, left, right] = buildTranslatedScript('hi', moderateLeft);
    expect(intro).toBe(data.hi.intro);
    expect(summary).toContain('बायीं आँख में');
    expect(summary.endsWith(data.hi.disclaimer)).toBe(true);
    expect(left).toBe(`बायीं आँख: ${data.hi.grades['2']}. ${data.hi.flagged}`);
    expect(right).toBe(`दायीं आँख: ${data.hi.grades['0']}. ${data.hi.notFlagged}`);
  });

  it('says which eye, and both, in the wording of the language', () => {
    expect(buildTranslatedScript('hi', severeBoth)[1]).toContain('दोनों आँखों में');
    expect(buildTranslatedScript('kn', moderateLeft)[1]).toContain('ಎಡ ಕಣ್ಣಿನಲ್ಲಿ');
    expect(buildTranslatedScript('kn', severeBoth)[1]).toContain('ಎರಡೂ ಕಣ್ಣುಗಳಲ್ಲಿ');
  });

  it('writes the threshold and scores in the language\'s own unit', () => {
    const [, summary] = buildTranslatedScript('hi', escalated);
    expect(summary).toContain('20 प्रतिशत');
    expect(summary).toContain('35 प्रतिशत, 31 प्रतिशत');
    expect(summary).toContain(data.hi.stageText.Mild);
  });

  it('translates photograph-quality warnings from the fixed table, naming the eye', () => {
    const a = { ...moderateLeft, qualityWarnings: ['Right eye: Image is slightly soft; results may be less reliable.'] };
    const script = buildTranslatedScript('hi', a);
    expect(script).toHaveLength(5);
    expect(script[4]).toBe(`${data.hi.photos} ${data.hi.right}: ${data.hi.warnings.blur_warn}`);
  });

  it('gives up (returns null) rather than guess whenever a part has no fixed sentence', () => {
    expect(buildTranslatedScript('hi', { ...moderateLeft, summaryParts: undefined })).toBeNull(); // an older server
    expect(buildTranslatedScript('hi', { ...moderateLeft, summaryParts: { kind: 'fallback', overall: 'Mystery' } })).toBeNull();
    expect(buildTranslatedScript('hi', { ...moderateLeft, summaryParts: { kind: 'Unknown', eyes: ['left'] } })).toBeNull();
    expect(buildTranslatedScript('hi', { ...moderateLeft, leftGrade: 'Something else' })).toBeNull();
    expect(buildTranslatedScript('hi', { ...moderateLeft, qualityWarnings: ['Left eye: A message nobody translated.'] })).toBeNull();
    expect(buildTranslatedScript('xx', moderateLeft)).toBeNull();
    expect(buildTranslatedScript('hi', null)).toBeNull();
  });
});
