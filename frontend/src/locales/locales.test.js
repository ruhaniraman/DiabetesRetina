import { describe, it, expect } from 'vitest';
import en from './en.json';
import hi from './hi.json';
import kn from './kn.json';
import ta from './ta.json';
import { BANNER_TEXT, CONFIDENCE, DISCLAIMER, HEATMAP_BELOW_NOTE, HEATMAP_EMPTY_NOTE, HEATMAP_NOTE, IDLE_NOTE, LESION_NONE_NOTE, LESION_NOTE, PDF_NEEDS_ASSESSMENT, PDF_NEEDS_PHOTOS, PDF_PRIVACY_NOTE, REFERRAL_CHIP, REPORT_LABELS, STAGE_NOTE, TRIAGE, basisText } from '../clinicalText';
import { localizeMessage, localizeGrade, localizeStage } from '../messages';
import i18n from '../i18n';

const flat = (obj, prefix = '') =>
  Object.entries(obj).flatMap(([key, value]) => (value && typeof value === 'object' ? flat(value, `${prefix}${key}.`) : [[`${prefix}${key}`, value]]));
const placeholders = (text) => [...String(text).matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();

const source = Object.fromEntries(flat(en));
const SCRIPTS = { hi: /[ऀ-ॿ]/, kn: /[ಀ-೿]/, ta: /[஀-௿]/ };

describe.each([['hi', hi], ['kn', kn], ['ta', ta]])('the %s interface text', (lang, locale) => {
  const own = Object.fromEntries(flat(locale));

  it('has exactly the same keys as English: nothing missing, nothing left over', () => {
    expect(Object.keys(own).sort()).toEqual(Object.keys(source).sort());
  });

  it('keeps every {{blank}} of the English text, and adds none', () => {
    for (const [key, text] of Object.entries(source)) {
      expect(placeholders(own[key]), `${lang} ${key}`).toEqual(placeholders(text));
    }
  });

  it('is not empty and is written in the language, not left in English', () => {
    // Brand names, units and a few technical terms may stay Latin; every sentence-length text must contain the script.
    for (const [key, text] of Object.entries(own)) {
      expect(text.trim().length, `${lang} ${key}`).toBeGreaterThan(0);
      const words = text.replace(/\{\{\w+\}\}/g, ''); // a text that is only blanks and punctuation has no words to check
      if (words.length > 25) expect(words, `${lang} ${key}`).toMatch(SCRIPTS[lang]);
    }
  });
});

describe('the English text', () => {
  it('says exactly what clinicalText.js says (that file is what a clinician reviews and signs off)', () => {
    expect(source['clinical.disclaimer']).toBe(DISCLAIMER);
    expect(source['clinical.idleNote']).toBe(IDLE_NOTE);
    for (const [grade, text] of Object.entries(BANNER_TEXT)) {
      expect(source[`clinical.banner.${grade}.badge`], grade).toBe(text.badgeText);
      expect(source[`clinical.banner.${grade}.title`], grade).toBe(text.title);
      expect(source[`clinical.riskLevel.${grade}`], grade).toBe(text.title.replace('Overall Assessment: ', ''));
    }
    for (const [name, text] of Object.entries(TRIAGE)) {
      for (const field of ['title', 'priority', 'sub']) expect(source[`clinical.triage.${name}.${field}`], `${name}.${field}`).toBe(text[field]);
    }
    expect(source['clinical.eyebrow']).toBe(REPORT_LABELS.eyebrow);
    expect(source['clinical.severity']).toBe(REPORT_LABELS.severity);
    expect(source['clinical.notAssessed']).toBe(REPORT_LABELS.notAssessed);
    expect(source['clinical.rationale']).toBe(REPORT_LABELS.rationaleHeading);
    expect(source['clinical.confidenceLabel']).toBe(CONFIDENCE.label);
    expect(source['clinical.confidenceNote']).toBe(CONFIDENCE.note);
    expect(source['clinical.stageNote']).toBe(STAGE_NOTE);
    expect(source['clinical.referralChipLabel']).toBe(REFERRAL_CHIP.label);
    expect(source['clinical.referralChipHint']).toBe(REFERRAL_CHIP.hint);
    expect(source['clinical.heatmapNote']).toBe(HEATMAP_NOTE);
    expect(source['clinical.lesionNote']).toBe(LESION_NOTE);
    expect(source['clinical.lesionNoneNote']).toBe(LESION_NONE_NOTE);
    expect(source['clinical.heatmapBelow']).toBe(HEATMAP_BELOW_NOTE);
    expect(source['clinical.heatmapEmpty']).toBe(HEATMAP_EMPTY_NOTE);
    expect(source['clinical.pdfPrivacy']).toBe(PDF_PRIVACY_NOTE);
    expect(source['clinical.pdfNeedsAssessment']).toBe(PDF_NEEDS_ASSESSMENT);
    expect(source['clinical.pdfNeedsPhotos']).toBe(PDF_NEEDS_PHOTOS);
    expect(source['clinical.basisGrade']).toBe(basisText(null));
    expect(source['clinical.basisScore'].replace('{{threshold}}', '20%')).toBe(basisText('20%'));
    expect(source['clinical.basisScoreSite'].replace('{{threshold}}', '20%')).toBe(basisText('20%', 'site'));
  });
});

describe('localizeMessage', () => {
  it('translates the exact sentences the servers and form checks use, in every language', async () => {
    for (const lang of ['en', 'hi', 'kn', 'ta']) {
      await i18n.changeLanguage(lang);
      const t = i18n.t.bind(i18n);
      expect(localizeMessage(t, 'Incorrect email or password.')).toBe(t('msg.badLogin'));
      expect(localizeMessage(t, 'Please wait 42s before requesting another code.')).toBe(t('msg.waitCode', { n: '42' }));
      expect(localizeMessage(t, 'Image is dark; results may be less reliable.')).toBe(t('msg.dark_warn'));
    }
    await i18n.changeLanguage('en');
  });

  it('leaves text it does not know exactly as it came, and never invents a translation', async () => {
    await i18n.changeLanguage('hi');
    expect(localizeMessage(i18n.t.bind(i18n), 'Some new server message.')).toBe('Some new server message.');
    expect(localizeMessage(i18n.t.bind(i18n), '')).toBe('');
    expect(localizeMessage(i18n.t.bind(i18n), undefined)).toBeUndefined();
    await i18n.changeLanguage('en');
  });

  it('every sentence it knows has a translation key that exists', () => {
    // The map itself is private; probe it through the English sentences in en.json's msg group.
    const t = (key) => source[key] ?? `MISSING ${key}`;
    for (const text of Object.entries(source).filter(([key]) => key.startsWith('msg.') && !key.includes('{{')).map(([, value]) => value)) {
      const result = localizeMessage(t, text);
      expect(result, text).not.toMatch(/^MISSING /);
    }
  });
});

describe('localizeGrade and localizeStage', () => {
  it('turn the server\'s grade labels into the chosen language, and leave anything else alone', async () => {
    await i18n.changeLanguage('ta');
    const t = i18n.t.bind(i18n);
    expect(localizeGrade(t, 'Stage 2 - Moderate')).toBe(ta.grade['2']);
    expect(localizeStage(t, 'Stage 3 - Severe')).toBe('நிலை 3');
    expect(localizeGrade(t, 'Awaiting Upload')).toBe('Awaiting Upload');
    await i18n.changeLanguage('en');
    expect(localizeGrade(i18n.t.bind(i18n), 'Stage 4 - Proliferative')).toBe('Stage 4 - Proliferative');
  });
});
