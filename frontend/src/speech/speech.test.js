import { describe, it, expect } from 'vitest';
import { pickVoice } from './voices';
import { splitForSpeech } from './chunk';
import { buildSpokenScript, spokenGrade } from './reportScript';
import { makeVoice } from '../test/fakeSpeech';

describe('pickVoice', () => {
  it('prefers a voice that runs on the device over an online one', () => {
    const voices = [makeVoice('hi-IN', { local: false, name: 'online' }), makeVoice('hi-IN', { local: true, name: 'device' })];
    const { voice, kind } = pickVoice(voices, 'hi');
    expect(voice.name).toBe('device');
    expect(kind).toBe('local');
  });

  it('does NOT use an online voice by default, because the result is health information, and says only online voices exist', () => {
    const voices = [makeVoice('kn-IN', { local: false })];
    expect(pickVoice(voices, 'kn')).toEqual({ voice: null, kind: null, networkOnly: true });
    expect(pickVoice(voices, 'kn', { allowNetwork: true }).kind).toBe('network');
  });

  it('reports a missing language as missing, not as "online only"', () => {
    expect(pickVoice([makeVoice('en-US')], 'kn')).toEqual({ voice: null, kind: null, networkOnly: false });
  });

  it('understands the underscore form some phones report and prefers the regional voice, then the default', () => {
    const voices = [makeVoice('en_US', { name: 'us' }), makeVoice('en_IN', { name: 'india' }), makeVoice('en-GB', { name: 'gb', isDefault: true })];
    expect(pickVoice(voices, 'en').voice.name).toBe('india');
    expect(pickVoice([makeVoice('hi_IN', { name: 'a' }), makeVoice('hi_IN', { name: 'b', isDefault: true })], 'hi').voice.name).toBe('b');
  });

  it('never picks a voice of another language just because the prefix looks similar', () => {
    expect(pickVoice([makeVoice('hil-PH')], 'hi').voice).toBeNull();
  });
});

describe('splitForSpeech', () => {
  it('speaks one sentence at a time, including after the Hindi full stop', () => {
    expect(splitForSpeech('First one. Second one? Third.')).toEqual(['First one.', 'Second one?', 'Third.']);
    expect(splitForSpeech('पहला वाक्य। दूसरा वाक्य।')).toEqual(['पहला वाक्य।', 'दूसरा वाक्य।']);
  });

  it('breaks a very long sentence at a comma or space instead of cutting a word', () => {
    const long = `${'word '.repeat(60).trim()}, and more words after the comma to make it long enough ${'x '.repeat(30)}`;
    const parts = splitForSpeech(long, 100);
    expect(parts.length).toBeGreaterThan(2);
    expect(parts.every((p) => p.length <= 105)).toBe(true);
    expect(parts.join(' ').replace(/\s+/g, ' ')).toContain('word word word');
  });

  it('returns nothing for empty text', () => {
    expect(splitForSpeech('')).toEqual([]);
    expect(splitForSpeech(null)).toEqual([]);
  });
});

const assessment = (over = {}) => ({
  overallSummary: 'The screening model detected signs consistent with moderate retinopathy (Stage 2) in the left eye. Referral to an eye specialist is recommended. This is an automated screening aid, not a diagnosis, and it can miss disease.',
  leftGrade: 'Stage 2 - Moderate',
  rightGrade: 'Stage 0 - No DR detected',
  leftReferable: true,
  rightReferable: false,
  leftReferableProbability: 0.83,
  rightReferableProbability: 0.04,
  qualityWarnings: [],
  ...over,
});

describe('buildSpokenScript', () => {
  it('reads the result the app shows: an introduction, the summary, each eye and whether it was flagged', () => {
    const script = buildSpokenScript(assessment());
    expect(script[0]).toBe('This is your diabetic retinopathy screening result.');
    expect(script[1]).toMatch(/Referral to an eye specialist is recommended/);
    expect(script).toContain('Left eye: Stage 2, Moderate. Referral recommended.');
    expect(script).toContain('Right eye: Stage 0, No DR detected. No referral flagged.');
  });

  it('keeps the "this is not a diagnosis and can miss disease" sentence, and adds no reassurance', () => {
    const spoken = buildSpokenScript(assessment()).join(' ');
    expect(spoken).toMatch(/not a diagnosis/);
    expect(spoken).toMatch(/can miss disease/);
    for (const banned of [/\bclear\b/i, /\bnormal\b/i, /\bhealthy\b/i, /\bsafe\b/i, /\bno need\b/i, /\bnothing wrong\b/i]) expect(spoken).not.toMatch(banned);
  });

  it('leaves out percentages and raw scores: they are hard to hear and over-confident', () => {
    expect(buildSpokenScript(assessment()).join(' ')).not.toMatch(/%|\d\.\d/);
  });

  it('reads photograph-quality warnings aloud, because they change how much to trust the result', () => {
    const script = buildSpokenScript(assessment({ qualityWarnings: ['Left eye: Image is slightly soft; results may be less reliable.'] }));
    expect(script).toContain('About the photographs: Left eye: Image is slightly soft; results may be less reliable.');
  });

  it('says nothing when there is no assessment', () => {
    expect(buildSpokenScript(null)).toEqual([]);
  });

  it('turns the grade label into something a voice reads naturally', () => {
    expect(spokenGrade('Stage 4 - Proliferative')).toBe('Stage 4, Proliferative');
  });
});
