// The welcome tour: one entry per popup, in order. `route` is the page the step is shown on, `target` the element's data-tour attribute
// (the spotlight falls back to a centred popup if it is not on the page), `key` the text under tour.steps.<key> in src/locales.
//
// `task` is what the person does before the tour moves on (the popup then shows tour.steps.<key>.task):
//   'click'   a tap inside the spotlighted element
//   'leave'   leaving the step's page (Save/Cancel on a form, Back on a page)
//   (ctx) =>  a check on the app state, e.g. both photos accepted; ctx is { session }
// Steps without a task have a Next button. `when` (ctx => boolean) leaves a step out, e.g. specialist review before there is a result.
// The first step is special: it asks for the language in all four scripts, before anything is read aloud.

const assessed = ({ session }) => Boolean(session?.assessment);
const photosAccepted = ({ session }) => session?.left?.quality?.status === 'accepted' && session?.right?.quality?.status === 'accepted';

export const TOUR_STEPS = [
  { key: 'language', route: '/', target: 'language' },
  { key: 'welcome', route: '/', target: 'welcome' },
  { key: 'profile', route: '/', target: 'profile-edit', task: 'click' },
  { key: 'patient', route: '/patient-details', target: 'patient', task: 'leave' },
  { key: 'lowBandwidth', route: '/', target: 'low-bandwidth', task: 'click' },
  { key: 'eyes', route: '/', target: 'eyes', task: photosAccepted },
  { key: 'run', route: '/', target: 'run', task: assessed },
  { key: 'banner', route: '/', target: 'banner' },
  { key: 'history', route: '/', target: 'history' },
  { key: 'openReport', route: '/', target: 'report-button', task: 'click' },
  { key: 'reportSummary', route: '/report', target: 'report-summary' },
  { key: 'reportViews', route: '/report', target: 'report-views', task: 'click' },
  { key: 'reportPdf', route: '/report', target: 'report-pdf', task: 'click' },
  { key: 'reportBack', route: '/report', target: 'report-header', task: 'leave' },
  { key: 'openReview', route: '/', target: 'review-button', task: 'click', when: assessed },
  { key: 'review', route: '/review', target: 'review', task: 'leave', when: assessed },
  { key: 'openDistrict', route: '/', target: 'district-button', task: 'click' },
  { key: 'district', route: '/district', target: 'district', task: 'leave' },
  { key: 'openEvidence', route: '/', target: 'evidence-button', task: 'click' },
  { key: 'evidence', route: '/evidence', target: 'evidence', task: 'leave' },
  { key: 'account', route: '/', target: 'account' },
  { key: 'replay', route: '/', target: 'replay' },
];

// "Choose your language", each in its own script: shown before a language has been picked, so it cannot come from the locale files.
export const CHOOSE_LANGUAGE = {
  en: 'Choose your language',
  hi: 'अपनी भाषा चुनें',
  kn: 'ನಿಮ್ಮ ಭಾಷೆಯನ್ನು ಆರಿಸಿ',
  ta: 'உங்கள் மொழியைத் தேர்ந்தெடுக்கவும்',
};
