import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Switches the tests can flip: whether the deployment allows unreviewed drafts, and whether a language has been reviewed.
const flags = vi.hoisted(() => ({ allowUnreviewed: false, reviewed: { hi: false, kn: false } }));
vi.mock('../config', async (importOriginal) => ({
  ...(await importOriginal()),
  get ALLOW_UNREVIEWED_SPEECH() {
    return flags.allowUnreviewed;
  },
}));
vi.mock('../speech/translations', async (importOriginal) => ({
  ...(await importOriginal()),
  isReviewed: (lang) => lang === 'en' || Boolean(flags.reviewed[lang]),
}));

import i18n from '../i18n';
import data from '../speech/translations.json';
import ListenToReport from './ListenToReport';
import { installFakeSpeech, makeVoice, removeFakeSpeech } from '../test/fakeSpeech';

const assessment = {
  overallSummary: 'Referral to an eye specialist is recommended. This is an automated screening aid, not a diagnosis, and it can miss disease.',
  summaryParts: { kind: 'Moderate', eyes: ['left'] },
  leftGrade: 'Stage 2 - Moderate',
  rightGrade: 'Stage 0 - No DR detected',
  leftReferable: true,
  rightReferable: false,
  qualityWarnings: [],
};

const setup = async (props = {}) => {
  render(<ListenToReport assessment={assessment} {...props} />);
  return userEvent.setup({ delay: null });
};
const listenButton = () => screen.getByRole('button', { name: /listen to the result|नतीजा सुनें|ಫಲಿತಾಂಶ ಕೇಳಿ|stop|रोकें|ನಿಲ್ಲಿಸಿ/i });
const spokenText = (synth) => synth.spoken.map((u) => u.text);
const useLanguage = async (lang) => {
  await act(async () => {
    await i18n.changeLanguage(lang);
  });
};

beforeEach(async () => {
  flags.allowUnreviewed = false;
  flags.reviewed = { hi: false, kn: false };
  await useLanguage('en');
});
afterEach(() => removeFakeSpeech());

describe('ListenToReport in English', () => {
  it('shows nothing without an assessment, and never speaks by itself', () => {
    const synth = installFakeSpeech({ voices: [makeVoice('en-IN')] });
    const { container } = render(<ListenToReport assessment={null} />);
    expect(container).toBeEmptyDOMElement();
    render(<ListenToReport assessment={assessment} />);
    expect(synth.spoken).toEqual([]);
  });

  it('reads the result aloud when tapped, slowly, with a voice from the device', async () => {
    const synth = installFakeSpeech({ voices: [makeVoice('en-IN', { name: 'device-english' })] });
    const user = await setup();
    await user.click(listenButton());
    await waitFor(() => expect(synth.spoken.length).toBeGreaterThan(4));
    const spoken = spokenText(synth);
    expect(spoken[0]).toBe('This is your diabetic retinopathy screening result.');
    expect(spoken).toContain('Left eye: Stage 2, Moderate.');
    expect(spoken).toContain('Referral recommended.');
    expect(synth.spoken.every((u) => u.rate < 1 && u.voice.name === 'device-english')).toBe(true);
  });

  it('turns into a Stop button while speaking, and stops without speaking the rest', async () => {
    const synth = installFakeSpeech({ voices: [makeVoice('en-IN')], autoEnd: false });
    const user = await setup();
    await user.click(listenButton());
    await waitFor(() => expect(synth.spoken.length).toBe(1));
    await user.click(screen.getByRole('button', { name: /stop/i }));
    act(() => synth.endCurrent());
    expect(synth.cancelled).toBeGreaterThan(0);
    await waitFor(() => expect(screen.getByRole('button', { name: /listen to the result/i })).toBeInTheDocument());
    expect(synth.spoken.length).toBe(1);
  });

  it('shows the words that will be read, and highlights the sentence being spoken as it moves on', async () => {
    const synth = installFakeSpeech({ voices: [makeVoice('en-IN')], autoEnd: false });
    const user = await setup();
    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('This is your diabetic retinopathy screening result.');
    expect(items.map((li) => li.textContent)).toContain('Left eye: Stage 2, Moderate. Referral recommended.');
    expect(items.some((li) => li.getAttribute('aria-current'))).toBe(false);
    await user.click(listenButton());
    await waitFor(() => expect(synth.spoken.length).toBe(1));
    expect(screen.getAllByRole('listitem')[0]).toHaveAttribute('aria-current', 'true');
    act(() => synth.endCurrent());
    await waitFor(() => expect(screen.getAllByRole('listitem')[1]).toHaveAttribute('aria-current', 'true'));
    expect(screen.getAllByRole('listitem')[0]).not.toHaveAttribute('aria-current');
    await user.click(screen.getByRole('button', { name: /stop/i }));
    await waitFor(() => expect(screen.getAllByRole('listitem').some((li) => li.getAttribute('aria-current'))).toBe(false));
  });

  it('keeps the words hidden by default in the compact (dashboard) version but can show them', async () => {
    installFakeSpeech({ voices: [makeVoice('en-IN')] });
    const user = await setup({ compact: true });
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: /show the words that are read/i }));
    expect(screen.getAllByRole('listitem').length).toBeGreaterThan(3);
  });

  it('tells the user when the browser cannot read aloud at all', async () => {
    removeFakeSpeech();
    const user = await setup();
    await user.click(listenButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(/cannot read text aloud/i);
  });

  it('switching the language stops what is being read', async () => {
    const synth = installFakeSpeech({ voices: [makeVoice('en-IN')], autoEnd: false });
    const user = await setup();
    await user.click(listenButton());
    await waitFor(() => expect(synth.spoken.length).toBe(1));
    const before = synth.cancelled;
    await user.click(screen.getByRole('button', { name: 'हिंदी' }));
    expect(synth.cancelled).toBeGreaterThan(before);
  });
});

describe.each([
  ['hi', 'हिंदी', 'hi-IN'],
  ['kn', 'ಕನ್ನಡ', 'kn-IN'],
])('ListenToReport in %s', (lang, name, voiceTag) => {
  beforeEach(async () => {
    await useLanguage(lang);
  });
  afterEach(async () => {
    await useLanguage('en');
  });

  it('does NOT speak while the sentences are unreviewed drafts: it says so and offers English', async () => {
    const synth = installFakeSpeech({ voices: [makeVoice('en-IN'), makeVoice(voiceTag)] });
    const user = await setup();
    await user.click(listenButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(name);
    expect(synth.spoken).toEqual([]);
    await user.click(screen.getByRole('button', { name: /अंग्रेज़ी में सुनें|ಇಂಗ್ಲಿಷ್‌ನಲ್ಲಿ ಕೇಳಿ/ }));
    await waitFor(() => expect(spokenText(synth)[0]).toBe('This is your diabetic retinopathy screening result.'));
  });

  it('shows English words, not unreviewed drafts, while the language is not switched on', async () => {
    installFakeSpeech({ voices: [makeVoice(voiceTag)] });
    await setup();
    expect(screen.getAllByRole('listitem')[0]).toHaveTextContent('This is your diabetic retinopathy screening result.');
  });

  it('when a deployment allows drafts, announces first that they are drafts, then reads the fixed sentences with a device voice', async () => {
    flags.allowUnreviewed = true;
    const synth = installFakeSpeech({ voices: [makeVoice('en-IN'), makeVoice(voiceTag, { name: 'device-voice' })] });
    const user = await setup();
    await user.click(listenButton());
    await waitFor(() => expect(synth.spoken.length).toBeGreaterThan(4));
    const spoken = spokenText(synth);
    const all = spoken.join(' ');
    expect(all.startsWith(data[lang].draftNotice)).toBe(true); // the draft announcement comes before anything else (one utterance per sentence)
    expect(all.indexOf(data[lang].intro)).toBe(data[lang].draftNotice.length + 1);
    expect(spoken.join(' ')).toContain(data[lang].eyesIn.left);
    expect(synth.spoken.every((u) => u.voice.name === 'device-voice')).toBe(true);
  });

  it('once reviewed, reads the fixed sentences with no draft announcement', async () => {
    flags.reviewed[lang] = true;
    const synth = installFakeSpeech({ voices: [makeVoice(voiceTag)] });
    const user = await setup();
    await user.click(listenButton());
    await waitFor(() => expect(synth.spoken.length).toBeGreaterThan(3));
    expect(spokenText(synth)[0]).toBe(data[lang].intro);
    expect(spokenText(synth)).not.toContain(data[lang].draftNotice);
    expect(screen.getAllByRole('listitem')[0]).toHaveTextContent(data[lang].intro);
  });

  it('never machine-translates: there is no call to a translation service at all', async () => {
    flags.reviewed[lang] = true;
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    installFakeSpeech({ voices: [makeVoice(voiceTag)] });
    const user = await setup();
    await user.click(listenButton());
    await waitFor(() => expect(screen.getByRole('button', { name: /सुनें|ಕೇಳಿ/ })).toBeInTheDocument());
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('reads English, and says so, for a result that has no fixed sentence', async () => {
    flags.reviewed[lang] = true;
    const synth = installFakeSpeech({ voices: [makeVoice('en-IN'), makeVoice(voiceTag)] });
    const user = await setup({ assessment: { ...assessment, summaryParts: { kind: 'fallback', overall: 'Mystery' } } });
    await user.click(listenButton());
    await waitFor(() => expect(synth.spoken.length).toBeGreaterThan(4));
    expect(synth.spoken.every((u) => u.voice.lang === 'en-IN')).toBe(true);
    expect(screen.getByRole('status')).toHaveTextContent(/./);
  });

  it('says when the phone has no voice for the language (and does not speak it in another voice)', async () => {
    flags.reviewed[lang] = true;
    const synth = installFakeSpeech({ voices: [makeVoice('en-IN')] });
    const user = await setup();
    await user.click(listenButton());
    expect(await screen.findByRole('alert')).toHaveTextContent(name);
    expect(synth.spoken).toEqual([]);
  });

  it('refuses an online-only voice, to keep the result private', async () => {
    flags.reviewed[lang] = true;
    const synth = installFakeSpeech({ voices: [makeVoice(voiceTag, { local: false })] });
    const user = await setup();
    await user.click(listenButton());
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(synth.spoken).toEqual([]);
  });
});
