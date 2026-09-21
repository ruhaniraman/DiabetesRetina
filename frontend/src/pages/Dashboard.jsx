import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiEye, FiGlobe, FiAlertTriangle, FiLogOut, FiRefreshCw, FiPlay, FiArrowRight, FiUser, FiX, FiEdit2 } from 'react-icons/fi';
import Logo from '../components/Logo';
import EyePanel from '../components/EyePanel';
import Disclaimer from '../components/Disclaimer';
import ExamHistory from '../components/ExamHistory';
import { useTranslatedText } from '../hooks/useTranslatedText';
import { bannerConfig, getTagColors } from '../utils/drStyles';
import { calcAge, formatDob } from '../utils/patient';

const LANGUAGES = [
  { code: 'en', label: 'EN' },
  { code: 'hi', label: 'हिंदी' },
  { code: 'kn', label: 'ಕನ್ನಡ' },
];

const IDLE_NOTE = 'Upload fundus images for both eyes and run the AI assessment to generate clinical insights.';

// What to show in an eye's status tag, in order of precedence.
function eyeTag(scan, grade, running) {
  if (running) return { label: 'Processing…', cls: getTagColors() };
  if (grade) return { label: grade, cls: getTagColors(grade) };
  const labels = {
    idle: 'Awaiting Upload',
    checking: 'Checking quality…',
    accepted: 'Ready for assessment',
    rejected: 'Image rejected',
    error: 'Quality check failed',
  };
  return { label: labels[scan.quality.status], cls: getTagColors() };
}

function runHint(session) {
  const { left, right, running } = session;
  if (running) return '';
  if (!left.file || !right.file) return 'Upload both eye images to enable the assessment.';
  if (left.quality.status === 'checking' || right.quality.status === 'checking') return 'Waiting for the image quality check…';
  if (left.quality.status !== 'accepted' || right.quality.status !== 'accepted') {
    return 'Both images must pass the quality check. Replace any rejected image.';
  }
  return '';
}

// The referral threshold can flag an eye whose most likely stage is below Stage 2; say so next to the stage tag.
const understated = (flagged, label) => Boolean(flagged) && /Stage [01]/.test(label || '');

const dash = (value, suffix = '') => (value === '' || value == null ? '—' : `${value}${suffix}`);

export default function Dashboard({ user, patient, session, history, onEditPatient, onViewDetailedReport, onLogout }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage || 'en';
  const [fullscreenImage, setFullscreenImage] = useState(null);

  const { left, right, assessment, running, error, canRun, runAssessment } = session;

  const overallRisk = assessment?.overallRisk || 'Pending';
  const activeBanner = bannerConfig[overallRisk] || bannerConfig.Pending;
  const note = useTranslatedText(assessment?.overallSummary || IDLE_NOTE, lang);

  const displayName = patient.fullName || user?.fullName || '';
  const age = calcAge(patient.dob);
  const identityLine = [age != null && `${age} Yrs`, patient.gender, patient.dob && `DOB: ${formatDob(patient.dob)}`]
    .filter(Boolean)
    .join(' • ');

  const leftTag = eyeTag(left, assessment?.leftGrade, running);
  const rightTag = eyeTag(right, assessment?.rightGrade, running);
  const hint = runHint(session);

  return (
    <div className="min-h-screen bg-slate-100/80 text-slate-800 font-['Plus_Jakarta_Sans',sans-serif] p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto antialiased">
      <main className="flex flex-col gap-6">
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-1 px-1">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-slate-900 rounded-2xl shadow-sm text-white flex items-center justify-center shrink-0">
              <Logo />
            </div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-['Outfit',sans-serif] font-bold text-slate-900 tracking-tight leading-none">
              {t('welcomePatient', { name: displayName })}
            </h1>
          </div>
          <div className="flex items-center gap-2.5 self-start sm:self-auto">
            <div className="flex items-center bg-white border border-slate-200/90 rounded-xl p-1 text-xs font-semibold shadow-2xs" role="group" aria-label="Language">
              <FiGlobe className="ml-2 mr-1.5 text-slate-400" aria-hidden="true" />
              {LANGUAGES.map(({ code, label }) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => i18n.changeLanguage(code)}
                  aria-pressed={lang === code}
                  className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${lang === code ? 'bg-slate-100 text-slate-900 font-bold' : 'text-slate-500'}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={onLogout}
              title={t('logout')}
              aria-label={t('logout')}
              className="p-2.5 rounded-xl text-slate-500 hover:text-rose-600 hover:bg-rose-50 border border-slate-200/90 bg-white shadow-2xs transition cursor-pointer"
            >
              <FiLogOut className="text-base" />
            </button>
          </div>
        </header>

        {/* Risk banner: reflects only a real backend result */}
        <div className={`relative overflow-hidden bg-white border-l-4 rounded-2xl p-5 md:p-6 shadow-xs transition-colors duration-500 bg-gradient-to-r border ${activeBanner.gradient}`}>
          <div className="flex items-start gap-4 relative z-10">
            <div className={`p-3 text-white rounded-xl shadow-sm flex items-center justify-center shrink-0 ${activeBanner.iconBg}`}>
              <FiAlertTriangle className="text-2xl" />
            </div>
            <div className="space-y-2">
              <span className={`inline-block px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider text-white ${activeBanner.badge}`}>
                {activeBanner.badgeText}
              </span>
              <h2 className="text-base md:text-lg font-bold text-slate-900 tracking-tight">{activeBanner.title}</h2>
              <p className="text-xs md:text-sm text-slate-600 font-medium">{note}</p>
            </div>
          </div>
        </div>

        {assessment && assessment.saved === false && (
          <div role="status" className="bg-amber-50 border border-amber-200 text-amber-900 rounded-2xl px-5 py-3 text-xs font-semibold">
            This result could not be saved to your exam history. It is still shown here, but it will be gone when you leave this session.
          </div>
        )}

        {error && (
          <div role="alert" className="bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl px-5 py-4 text-sm font-semibold">
            The assessment could not be completed: {error} No result has been produced. Please try again.
          </div>
        )}

        <div className="flex flex-col lg:flex-row gap-6 items-stretch">
          <div className="flex-1 bg-white border border-slate-200/90 rounded-2xl p-5 sm:p-6 shadow-xs flex flex-col justify-between space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
              <div>
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-amber-50 rounded-lg border border-amber-200/60 text-amber-600">
                    <FiEye className="text-base" />
                  </div>
                  <h3 className="font-bold text-slate-900 text-base tracking-tight">{t('dualCardTitle')}</h3>
                </div>
                <p className="text-xs text-slate-500 font-medium mt-1">Stage 1 Quality Assessment & Stage 2 Lesion Workstation</p>
              </div>
              <div className="flex flex-col items-start sm:items-end gap-1">
                <button
                  type="button"
                  onClick={runAssessment}
                  disabled={!canRun}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed text-white flex items-center gap-2 transition cursor-pointer shadow-xs"
                >
                  {running ? <FiRefreshCw className="animate-spin text-sm" /> : <FiPlay className="text-xs fill-current text-amber-400" />}
                  <span>{running ? 'Assessing…' : 'Run AI Assessment'}</span>
                </button>
                {hint && <span className="text-[11px] text-slate-500 font-medium">{hint}</span>}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 flex-1">
              <EyePanel
                title={t('leftEyeLabel')}
                inputId="upload-left-eye"
                scan={left}
                tagLabel={leftTag.label}
                tagClass={leftTag.cls}
                referralFlagged={understated(assessment?.leftReferable, assessment?.leftGrade)}
                onUpload={left.upload}
                onExpand={setFullscreenImage}
              />
              <EyePanel
                title={t('rightEyeLabel')}
                inputId="upload-right-eye"
                scan={right}
                tagLabel={rightTag.label}
                tagClass={rightTag.cls}
                referralFlagged={understated(assessment?.rightReferable, assessment?.rightGrade)}
                onUpload={right.upload}
                onExpand={setFullscreenImage}
              />
            </div>

            {(left.viewMode === 'mapped' || right.viewMode === 'mapped') && (
              <div className="mt-2 bg-slate-50 border border-slate-200/90 rounded-xl p-4 flex flex-wrap items-center justify-center gap-6 shadow-xs">
                <span className="text-xs font-black text-slate-800 uppercase tracking-wider mr-2">Candidate regions:</span>
                {[
                  ['bg-rose-500 border-rose-300', 'Hemorrhage'],
                  ['bg-emerald-400 border-emerald-300', 'Hard Exudate'],
                  ['bg-amber-400 border-amber-300', 'Microaneurysm'],
                ].map(([dot, name]) => (
                  <div key={name} className="flex items-center gap-2 text-[11px] font-extrabold text-slate-600 uppercase">
                    <span className={`w-3 h-3 rounded-full shadow-sm border ${dot}`}></span>
                    {name}
                  </div>
                ))}
              </div>
            )}

            <Disclaimer />
          </div>

          <aside className="w-full lg:w-96 bg-white rounded-2xl p-5 sm:p-6 border border-slate-200/90 flex flex-col justify-between shrink-0 shadow-xs space-y-6">
            <div className="space-y-5">
              <div className="pb-4 border-b border-slate-100">
                <div className="flex items-center justify-between mb-3 gap-2">
                  <h2 className="text-base font-extrabold text-slate-900 tracking-tight">{t('recordsTitle')}</h2>
                  {patient.bloodGroup && (
                    <span className="text-[11px] font-bold text-slate-900 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200/80">Blood Group: {patient.bloodGroup}</span>
                  )}
                </div>
                <div className="flex items-center gap-3.5 bg-slate-50/90 p-3.5 rounded-2xl border border-slate-200/70">
                  <div className="w-11 h-11 rounded-xl bg-slate-900 text-white flex items-center justify-center font-bold shrink-0">
                    <FiUser />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-slate-900 truncate">{displayName}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{identityLine || 'Profile incomplete'}</p>
                  </div>
                  <button
                    type="button"
                    onClick={onEditPatient}
                    aria-label="Edit patient profile"
                    className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200/70 transition cursor-pointer"
                  >
                    <FiEdit2 />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Vital label={t('hba1c')} value={dash(patient.hba1c, '%')} />
                <Vital
                  label="Blood Pressure"
                  value={patient.systolicBP && patient.diastolicBP ? `${patient.systolicBP}/${patient.diastolicBP}` : '—'}
                />
                <Vital label="Fasting Sugar" value={dash(patient.fastingSugar)} unit={patient.fastingSugar ? 'mg/dL' : ''} />
                <Vital label="Diabetes Duration" value={dash(patient.diabetesDuration)} unit={patient.diabetesDuration ? 'Yrs' : ''} />
              </div>

              <ExamHistory history={history} />
            </div>

            <button
              type="button"
              onClick={onViewDetailedReport}
              className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3.5 rounded-xl shadow-xs transition flex items-center justify-center gap-2 text-xs uppercase tracking-wider cursor-pointer mt-4"
            >
              <span>{t('detailedReportBtn')}</span>
              <FiArrowRight className="text-sm" />
            </button>
          </aside>
        </div>
      </main>

      {fullscreenImage && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4 sm:p-8"
          role="dialog"
          aria-modal="true"
          aria-label="Fullscreen scan"
          onClick={() => setFullscreenImage(null)}
          onKeyDown={(e) => e.key === 'Escape' && setFullscreenImage(null)}
        >
          <div className="relative max-w-5xl w-full h-full flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              autoFocus
              aria-label="Close fullscreen"
              onClick={() => setFullscreenImage(null)}
              className="absolute top-4 right-4 z-10 p-3 bg-white/10 hover:bg-white/20 text-white rounded-full transition cursor-pointer"
            >
              <FiX className="text-xl" />
            </button>
            <img src={fullscreenImage} alt="Fullscreen scan" className="max-h-[90vh] max-w-full object-contain rounded-2xl shadow-2xl border border-slate-800" />
          </div>
        </div>
      )}
    </div>
  );
}

function Vital({ label, value, unit }) {
  return (
    <div className="bg-slate-50 border border-slate-200/70 p-3 rounded-xl shadow-2xs">
      <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">{label}</span>
      <p className="text-sm font-bold text-slate-900 mt-0.5">
        {value} {unit && <span className="text-[10px] text-slate-500 font-medium">{unit}</span>}
      </p>
    </div>
  );
}
