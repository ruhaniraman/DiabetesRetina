import { describe, it, expect } from 'vitest';
import * as text from './clinicalText';

// Same guard rails as backend/tests/test_clinical_text.py. They do not make the wording clinically correct (only a
// clinician can); they stop specific risky phrasing creeping back in unnoticed.
const BANNED = [
  /\bclear\b/i, /\bnormal\b/i, /\bhealthy\b/i, /\bsafe\b/i, /\bguarantee/i, /\bno action\b/i, /\broutine\b/i,
  /no urgent referral/i, /\bcleared\b/i, /\brequired\b/i, /\bmust\b/i, /\byou have\b/i, /\bcure/i, /\bdiagnostic\b/i,
];
const TIMINGS = [/\bannual/i, /\b\d+\s*[-to]*\s*\d*\s*(day|week|month|year)s?\b/i, /\bevery (year|month|\d)/i];

// Every string reachable from the module's exports.
function strings(value, path = []) {
  if (typeof value === 'string') return [[path.join('.'), value]];
  if (typeof value === 'function') return [];
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([k, v]) => strings(v, [...path, k]));
  return [];
}
const ALL = Object.entries(text).flatMap(([name, value]) => strings(value, [name]));
// basisText is a function; include its output.
ALL.push(['HEATMAP_EMPTY_NOTE', text.HEATMAP_EMPTY_NOTE], ['basisText(20%)', text.basisText('20%')], ['basisText(null)', text.basisText(null)], ['basisText(site)', text.basisText('36%', 'site')]);

describe('clinical wording guard rails', () => {
  it('finds a meaningful number of strings to check', () => {
    expect(ALL.length).toBeGreaterThan(30);
  });

  it.each(ALL)('%s has no reassuring, diagnostic or prescriptive wording', (_name, value) => {
    for (const pattern of BANNED) expect(value, `${pattern} in: ${value}`).not.toMatch(pattern);
  });

  it.each(ALL)('%s gives no unapproved clinical timing', (_name, value) => {
    for (const pattern of TIMINGS) expect(value, `${pattern} in: ${value}`).not.toMatch(pattern);
  });

  it('a no-referral result says it does not rule out disease', () => {
    expect(text.TRIAGE.noReferral.sub).toMatch(/does not rule out disease/);
  });

  it('referral and follow-up outcomes recommend, and defer intervals to a professional', () => {
    expect(text.TRIAGE.referral.sub).toMatch(/recommended/);
    expect(text.TRIAGE.followUp.sub).toMatch(/recommended/);
    expect(text.TRIAGE.followUp.sub).toMatch(/ask them how often/);
  });

  it('the disclaimer says the tool can miss disease and has not been clinically validated', () => {
    expect(text.DISCLAIMER).toMatch(/can miss disease/);
    expect(text.DISCLAIMER).toMatch(/not been clinically validated/);
  });

  it('no grade is labelled "clear"', () => {
    expect(text.BANNER_TEXT.No_DR.badgeText).toMatch(/No DR detected/);
    expect(text.BANNER_TEXT.No_DR.title).toMatch(/No DR detected/);
  });
});
