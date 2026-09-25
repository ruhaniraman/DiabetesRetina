import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import i18n from '../i18n';
import en from '../locales/en.json';
import hi from '../locales/hi.json';
import { AuthContext } from '../auth/authContext';
import { installFakeSpeech, makeVoice, removeFakeSpeech } from '../test/fakeSpeech';
import TourProvider from './TourProvider';
import { useTour } from './tourContext';
import { TOUR_STEPS, CHOOSE_LANGUAGE } from './steps';

const flags = vi.hoisted(() => ({ allowUnreviewed: [] }));
vi.mock('../config', async (importOriginal) => ({
  ...(await importOriginal()),
  allowsUnreviewedSpeech: (lang) => flags.allowUnreviewed.includes(lang),
}));

const NO_PHOTOS = { left: { quality: { status: 'idle' } }, right: { quality: { status: 'idle' } }, assessment: null };
const PHOTOS = { left: { quality: { status: 'accepted' } }, right: { quality: { status: 'accepted' } }, assessment: null };
const ASSESSED = { ...PHOTOS, assessment: { overallRisk: 'Moderate' } };

// Stand-in pages: each carries the data-tour targets its steps point at, with a button inside that does the step's task the way the real page would.
const ROUTES = [...new Set(TOUR_STEPS.map((s) => s.route))];
function Page({ setSession }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const tour = useTour();
  const act = {
    leave: () => navigate(pathname === '/' ? '/elsewhere' : '/'),
    eyes: () => setSession(PHOTOS),
    run: () => setSession(ASSESSED),
  };
  return (
    <div>
      <p>page {pathname}</p>
      {TOUR_STEPS.filter((s) => s.route === pathname).map((s) => (
        <div key={s.key} data-tour={s.target}>
          <button type="button" onClick={s.task === 'leave' ? act.leave : act[s.key]}>
            do {s.key}
          </button>
        </div>
      ))}
      <button type="button" onClick={tour.start}>
        replay tour
      </button>
    </div>
  );
}

function Harness({ loginCount, initialSession }) {
  const [session, setSession] = useState(initialSession);
  return (
    <AuthContext.Provider value={{ loginCount }}>
      <TourProvider session={session}>
        <Routes>
          {ROUTES.map((route) => (
            <Route key={route} path={route} element={<Page setSession={setSession} />} />
          ))}
          <Route path="*" element={<p>somewhere else</p>} />
        </Routes>
      </TourProvider>
    </AuthContext.Provider>
  );
}

function renderTour({ loginCount = 1, path = '/', session = NO_PHOTOS } = {}) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Harness loginCount={loginCount} initialSession={session} />
    </MemoryRouter>,
  );
}

const spokenTexts = (synth) => synth.spoken.map((u) => u.text).join(' ');
const heading = (key, locale = en) => screen.findByRole('heading', { name: locale.tour.steps[key].title });

describe('the welcome tour', () => {
  let synth;
  beforeEach(async () => {
    flags.allowUnreviewed = [];
    localStorage.clear();
    await i18n.changeLanguage('en');
    synth = installFakeSpeech({ voices: [makeVoice('en-IN'), makeVoice('hi-IN')] });
  });
  afterEach(async () => {
    removeFakeSpeech();
    await i18n.changeLanguage('en');
  });

  it('starts after a sign-in by asking for the language in all four scripts', async () => {
    renderTour();
    const dialog = await screen.findByRole('dialog');
    for (const prompt of Object.values(CHOOSE_LANGUAGE)) expect(dialog).toHaveTextContent(prompt);
    for (const name of ['English', 'हिंदी', 'ಕನ್ನಡ', 'தமிழ்']) expect(screen.getByRole('button', { name })).toBeInTheDocument();
    expect(synth.spoken).toHaveLength(0); // nothing is read before a language is picked
  });

  it('does not start when the session was only restored on page load', async () => {
    renderTour({ loginCount: 0 });
    await screen.findByText('page /');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('waits for the person to do each task, on every page, and reads each popup aloud', async () => {
    const user = userEvent.setup();
    renderTour({ path: '/report' });
    await user.click(await screen.findByRole('button', { name: 'English' }));

    for (const step of TOUR_STEPS.slice(1)) {
      const text = en.tour.steps[step.key];
      expect(await heading(step.key)).toBeInTheDocument();
      expect(screen.getByText(`page ${step.route}`)).toBeInTheDocument();
      await waitFor(() => expect(spokenTexts(synth)).toContain(text.text));
      if (step.task) {
        expect(screen.getByText(text.task)).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: en.tour.next })).not.toBeInTheDocument(); // the task moves the tour on, not Next
        await user.click(screen.getByRole('button', { name: `do ${step.key}` }));
      } else {
        expect(text.task).toBeUndefined();
        await user.click(screen.getByRole('button', { name: step === TOUR_STEPS.at(-1) ? en.tour.finish : en.tour.next }));
      }
    }
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  }, 60000);

  it('shows Done when a task is finished, then moves on by itself', async () => {
    const user = userEvent.setup();
    renderTour();
    await user.click(await screen.findByRole('button', { name: 'English' }));
    await user.click(screen.getByRole('button', { name: en.tour.next }));
    expect(await heading('profile')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'do profile' }));
    expect(await screen.findByText(en.tour.done)).toBeInTheDocument();
    expect(await heading('patient')).toBeInTheDocument();
    expect(screen.getByText('page /patient-details')).toBeInTheDocument();
  });

  it('keeps waiting until both photos are accepted, and a task can be skipped', async () => {
    const user = userEvent.setup();
    renderTour();
    await user.click(await screen.findByRole('button', { name: 'English' }));
    await user.click(screen.getByRole('button', { name: en.tour.next }));
    for (const key of ['profile', 'patient', 'lowBandwidth']) {
      expect(await heading(key)).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: en.tour.skipStep }));
    }
    expect(await heading('eyes')).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 1200));
    expect(screen.getByRole('heading', { name: en.tour.steps.eyes.title })).toBeInTheDocument(); // still waiting
    await user.click(screen.getByRole('button', { name: 'do eyes' }));
    expect(await heading('run')).toBeInTheDocument();
  });

  it('treats a task that is already done as a normal step, and leaves out specialist review until there is a result', async () => {
    const user = userEvent.setup();
    renderTour({ session: PHOTOS });
    await user.click(await screen.findByRole('button', { name: 'English' }));
    await user.click(screen.getByRole('button', { name: en.tour.next }));
    for (const key of ['profile', 'patient', 'lowBandwidth']) {
      expect(await heading(key)).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: en.tour.skipStep }));
    }
    expect(await heading('eyes')).toBeInTheDocument();
    expect(screen.queryByText(en.tour.steps.eyes.task)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: en.tour.next }));
    expect(await heading('run')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: en.tour.skipStep }));
    for (const key of ['banner', 'history']) {
      expect(await heading(key)).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: en.tour.next }));
    }
    for (const key of ['openReport', 'reportViews', 'reportPdf', 'reportBack']) {
      if (key === 'reportViews') {
        expect(await heading('reportSummary')).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: en.tour.next }));
      }
      expect(await heading(key)).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: en.tour.skipStep }));
    }
    expect(await heading('openDistrict')).toBeInTheDocument(); // no result, so no specialist review steps
  });

  it('brings the person back to the step page if they wander off', async () => {
    const user = userEvent.setup();
    renderTour();
    await user.click(await screen.findByRole('button', { name: 'English' }));
    expect(await heading('welcome')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: en.tour.next }));
    expect(await heading('profile')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'do profile' }));
    expect(await heading('patient')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: en.tour.back }));
    expect(await heading('profile')).toBeInTheDocument();
    expect(screen.getByText('page /')).toBeInTheDocument();
  });

  it('switches the whole site to the chosen language and reads the tour in it when that language is switched on', async () => {
    flags.allowUnreviewed = ['hi'];
    const user = userEvent.setup();
    renderTour();
    await user.click(await screen.findByRole('button', { name: 'हिंदी' }));
    expect(i18n.resolvedLanguage).toBe('hi');
    expect(await heading('welcome', hi)).toBeInTheDocument();
    await waitFor(() => expect(spokenTexts(synth)).toContain(hi.tour.steps.welcome.text));
    expect(synth.spoken.at(-1).lang).toBe('hi-IN');
  });

  it('shows unreviewed narration as text only, and says why', async () => {
    const user = userEvent.setup();
    renderTour();
    await user.click(await screen.findByRole('button', { name: 'हिंदी' }));
    expect(await heading('welcome', hi)).toBeInTheDocument();
    expect(screen.getByText(hi.tour.notReviewed.replaceAll('{{language}}', 'हिंदी'))).toBeInTheDocument();
    expect(synth.spoken).toHaveLength(0);
  });

  it('says so when the device has no voice for the language', async () => {
    removeFakeSpeech();
    synth = installFakeSpeech({ voices: [makeVoice('en-IN')] });
    flags.allowUnreviewed = ['ta'];
    const user = userEvent.setup();
    renderTour();
    await user.click(await screen.findByRole('button', { name: 'தமிழ்' }));
    expect(await screen.findByText(i18n.t('tour.noVoice', { language: 'தமிழ்' }))).toBeInTheDocument();
  });

  it('can be muted, and remembers that', async () => {
    const user = userEvent.setup();
    renderTour();
    await user.click(await screen.findByRole('button', { name: 'English' }));
    await waitFor(() => expect(synth.spoken.length).toBeGreaterThan(0));
    await user.click(screen.getByRole('button', { name: en.tour.voiceOff }));
    expect(localStorage.getItem('tour.voice')).toBe('off');
    const before = synth.spoken.length;
    await user.click(screen.getByRole('button', { name: en.tour.next }));
    expect(await heading('profile')).toBeInTheDocument();
    expect(synth.spoken).toHaveLength(before);
  });

  it('closes on Skip tour and on Escape, and can be replayed', async () => {
    const user = userEvent.setup();
    renderTour();
    await user.click(await screen.findByRole('button', { name: en.tour.skip }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'replay tour' }));
    await user.click(await screen.findByRole('button', { name: 'English' }));
    expect(await heading('welcome')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('still shows the popup when the element it points at is not on the page', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      render(
        <AuthContext.Provider value={{ loginCount: 1 }}>
          <MemoryRouter>
            <TourProvider session={NO_PHOTOS}>
              <p>an empty page</p>
            </TourProvider>
          </MemoryRouter>
        </AuthContext.Provider>,
      );
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      await act(async () => vi.advanceTimersByTime(3500));
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
