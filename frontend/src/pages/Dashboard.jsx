import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiEye, FiAlertTriangle, FiLogOut, FiRefreshCw, FiPlay, FiArrowRight, FiUser, FiX, FiEdit2, FiDroplet, FiHeart, FiActivity, FiClock, FiMap, FiCheckSquare, FiAward, FiHelpCircle } from 'react-icons/fi';
import Logo from '../components/Logo';
import HeroBand, { cardClass } from '../components/HeroBand';
import ListenToReport from '../components/ListenToReport';
import LanguageSwitcher from '../components/LanguageSwitcher';
import EyePanel from '../components/EyePanel';
import Disclaimer from '../components/Disclaimer';
import ExamHistory from '../components/ExamHistory';
import DeleteAccount from '../components/DeleteAccount';
import { useResultSummary } from '../hooks/useResultSummary';
import { useMessages } from '../messages';
import { bannerConfig, getTagColors } from '../utils/drStyles';
import { calcAge, formatDob } from '../utils/patient';
import { LESION_OVERLAY_ENABLED } from '../config';
import { formatBytes, secondsOn2G } from '../utils/compressImage';



// What to show in an eye's status tag, in order of precedence.
function eyeTag(scan, grade, running, t, localizeGrade) {
  if (running) return { label: t('dash.processing'), cls: getTagColors() };
  if (grade) return { label: localizeGrade(grade), cls: getTagColors(grade) };
  const labels = {
    idle: t('dash.awaitingUpload'),
    checking: t('dash.checking'),
    accepted: t('dash.ready'),
    rejected: t('dash.rejected'),
    error: t('dash.qualityFailed'),
  };
  return { label: labels[scan.quality.status], cls: getTagColors() };
}

function runHint(session, t) {
  const { left, right, running } = session;
  if (running) return '';
  if (!left.file || !right.file) return t('dash.hintUpload');
  if (left.quality.status === 'checking' || right.quality.status === 'checking') return t('dash.hintWaiting');
  if (left.quality.status !== 'accepted' || right.quality.status !== 'accepted') {
    return t('dash.hintBoth');
  }
  return '';
}

// The referral threshold can flag an eye whose most likely stage is below Stage 2; say so next to the stage tag.
const understated = (flagged, label) => Boolean(flagged) && /Stage [01]/.test(label || '');

const dash = (value, suffix = '') => (value === '' || value == null ? '—' : `${value}${suffix}`);

export default function Dashboard({ user, patient, session, history, onEditPatient, onViewDetailedReport, onOpenDistrictPlanner, onOpenReview, onOpenEvidence, onStartTour, onLogout, onDeleteAccount }) {
  const { t, i18n } = useTranslation();
  const { grade, tm } = useMessages();
  const lang = i18n.resolvedLanguage || 'en';
  const [fullscreenImage, setFullscreenImage] = useState(null);

  const { left, right, assessment, running, error, canRun, runAssessment } = session;

  const overallRisk = assessment?.overallRisk || 'Pending';
  const bannerKey = bannerConfig[overallRisk] ? overallRisk : 'Pending';
  const activeBanner = bannerConfig[bannerKey];
  const summary = useResultSummary(assessment, lang);

  const displayName = patient.fullName || user?.fullName || '';
  const age = calcAge(patient.dob);
  const identityLine = [age != null && t('dash.years', { n: age }), patient.gender && t(`patient.genders.${patient.gender}`, { defaultValue: patient.gender }), patient.dob && t('dash.dob', { date: formatDob(patient.dob) })]
    .filter(Boolean)
    .join(' • ');

  const leftTag = eyeTag(left, assessment?.leftGrade, running, t, grade);
  const rightTag = eyeTag(right, assessment?.rightGrade, running, t, grade);
  const hint = runHint(session, t);

  const initials = (displayName || '?').trim().split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toUpperCase();
  const RiskIcon = bannerKey === 'Pending' || bannerKey === 'No_DR' ? FiEye : FiAlertTriangle;

  return (
    <div className="min-h-screen bg-[#eef1f6] text-slate-800 font-sans antialiased">
      <HeroBand className="pb-28 sm:pb-32">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-5">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white shadow-lg shadow-black/20 shrink-0">
                <Logo className="w-8 h-6" />
              </div>
              <div>
                <span className="block text-lg font-extrabold leading-none tracking-tight text-white">{t('common.brand')}</span>
                <span className="mt-1 block text-[10px] font-black uppercase tracking-[0.2em] text-amber-400">{t('common.portal')}</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2.5 self-start sm:self-auto">
              <div className="flex items-center gap-2.5">
              {onOpenReview && session.assessment && (
                <button
                  type="button"
                  onClick={onOpenReview}
                  data-tour="review-button"
                  title="30-second specialist review"
                  className="flex items-center gap-2 rounded-xl border border-amber-300/40 bg-amber-500/20 px-3 py-2 text-xs font-bold text-amber-100 hover:bg-amber-500/30 transition cursor-pointer"
                >
                  <FiCheckSquare aria-hidden="true" /> <span className="hidden md:inline">Specialist review</span>
                </button>
              )}
              {onOpenEvidence && (
                <button
                  type="button"
                  onClick={onOpenEvidence}
                  data-tour="evidence-button"
                  title="Evidence: requirements vs measured results"
                  className="flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-xs font-bold text-white hover:bg-white/20 transition cursor-pointer"
                >
                  <FiAward aria-hidden="true" /> <span className="hidden md:inline">Evidence</span>
                </button>
              )}
              {onOpenDistrictPlanner && (
                <button
                  type="button"
                  onClick={onOpenDistrictPlanner}
                  data-tour="district-button"
                  title="District Planner (Stage 5)"
                  className="flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-xs font-bold text-white hover:bg-white/20 transition cursor-pointer"
                >
                  <FiMap aria-hidden="true" /> <span className="hidden md:inline">District Planner</span>
                </button>
              )}
              </div>
              {onStartTour && (
                <button
                  type="button"
                  onClick={onStartTour}
                  title={t('tour.replayTitle')}
                  data-tour="replay"
                  className="flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-xs font-bold text-white hover:bg-white/20 transition cursor-pointer"
                >
                  <FiHelpCircle aria-hidden="true" /> <span className="hidden md:inline">{t('tour.replay')}</span>
                </button>
              )}
              <div data-tour="language">
                <LanguageSwitcher />
              </div>
              <div className="flex items-center gap-2.5" data-tour="account">
              <DeleteAccount onDelete={onDeleteAccount} />
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
            </div>
          </header>

          <div className="pt-4 sm:pt-6">
            <span className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-amber-400/90">{t('portalSub')}</span>
            <h1 data-tour="welcome" className="mt-2 font-welcome text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight leading-tight text-white">
              {t('welcomePatient', { name: displayName })}
            </h1>
            {identityLine && <p className="mt-2 text-sm font-medium text-slate-300">{identityLine}</p>}
          </div>
        </div>
      </HeroBand>

      <main className="relative -mt-20 sm:-mt-24 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pb-12 flex flex-col gap-6">
        {/* Risk banner: reflects only a real backend result */}
        <section data-tour="banner" className={`${cardClass} overflow-hidden border-l-[6px] p-5 md:p-7 space-y-5 shadow-[0_20px_50px_-24px_rgba(15,23,42,0.35)] ${activeBanner.accent}`}>
          <div className="flex items-start gap-4 md:gap-5">
            <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-white shadow-lg ${activeBanner.iconBg}`}>
              <RiskIcon className="text-2xl" aria-hidden="true" />
            </div>
            <div className="min-w-0 space-y-2">
              <span className={`inline-block rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider text-white ${activeBanner.badge}`}>
                {t(`clinical.banner.${bannerKey}.badge`)}
              </span>
              <h2 className="text-lg md:text-xl font-extrabold text-slate-900 tracking-tight">{t(`clinical.banner.${bannerKey}.title`)}</h2>
            </div>
          </div>

          <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 md:p-5 space-y-2">
            <p className="max-w-4xl text-sm leading-relaxed text-slate-700 font-medium">{summary.text}</p>
            {summary.notice && <p className="text-[11px] text-slate-500 font-semibold">{summary.notice}</p>}
          </div>

          {assessment && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                [t('leftEyeLabel'), leftTag, assessment.leftReferable],
                [t('rightEyeLabel'), rightTag, assessment.rightReferable],
              ].map(([label, tag, flagged]) => (
                <div key={label} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
                  <div className="min-w-0">
                    <span className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500">{label}</span>
                    <span className={`mt-1.5 inline-block rounded-full border px-3 py-1 text-[11px] font-bold ${tag.cls}`}>{tag.label}</span>
                  </div>
                  {flagged && (
                    <span className="shrink-0 rounded-full border border-amber-300 bg-amber-100 px-2.5 py-1 text-[10px] font-extrabold uppercase text-amber-900">
                      {t('clinical.referralChipLabel')}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {assessment && <ListenToReport assessment={assessment} compact />}
        </section>

        {assessment && assessment.saved === false && (
          <div role="status" className="bg-amber-50 border border-amber-200 text-amber-900 rounded-2xl px-5 py-3 text-xs font-semibold">
            {t('dash.notSaved')}
          </div>
        )}

        {error && (
          <div role="alert" className="bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl px-5 py-4 text-sm font-semibold">
            {t('dash.assessError', { error: tm(error) })}
          </div>
        )}

        <div className="flex flex-col lg:flex-row gap-6 items-stretch">
          <div className={`${cardClass} flex-1 p-5 sm:p-7 flex flex-col justify-between space-y-6`}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-100">
              <div className="flex items-center gap-3.5">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 ring-1 ring-amber-200/70">
                  <FiEye className="text-xl" aria-hidden="true" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base tracking-tight">{t('dualCardTitle')}</h3>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">{t('dash.cardSub')}</p>
                </div>
              </div>
              <div className="flex flex-col items-start sm:items-end gap-1.5" data-tour="run">
                <button
                  type="button"
                  onClick={runAssessment}
                  disabled={!canRun}
                  className="px-5 py-3 rounded-2xl text-xs font-bold bg-gradient-to-r from-[#0d1424] to-[#1e293b] hover:from-[#16223b] hover:to-[#26344f] disabled:opacity-45 disabled:cursor-not-allowed text-white flex items-center gap-2 transition cursor-pointer shadow-lg shadow-slate-900/20 enabled:hover:-translate-y-px enabled:active:translate-y-0"
                >
                  {running ? <FiRefreshCw className="animate-spin text-sm" /> : <FiPlay className="text-xs fill-current text-amber-400" />}
                  <span>{running ? t('dash.assessing') : t('dash.run')}</span>
                </button>
                {hint && <span className="text-[11px] text-slate-500 font-medium">{hint}</span>}
              </div>
            </div>

            <div data-tour="low-bandwidth" className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5">
              <label className="flex items-center gap-2 text-xs font-bold text-slate-800 cursor-pointer">
                <input type="checkbox" checked={session.lowBandwidth} onChange={(e) => session.setLowBandwidth(e.target.checked)} className="h-4 w-4 accent-blue-600" />
                {t('dash.lowBandwidth')}
              </label>
              <span className="text-[11px] text-slate-500">{t('dash.lowBandwidthHint')}</span>
              {[['left', t('leftEyeLabel')], ['right', t('rightEyeLabel')]].map(([eye, label]) =>
                session.transfer?.[eye] ? (
                  <span key={eye} className="text-[11px] font-semibold text-slate-600">
                    {label}:{' '}
                    {t('dash.transfer', {
                      sent: formatBytes(session.transfer[eye].sentBytes),
                      original: formatBytes(session.transfer[eye].originalBytes),
                      seconds: Math.round(secondsOn2G(session.transfer[eye].sentBytes)),
                    })}
                  </span>
                ) : null,
              )}
            </div>

            <div data-tour="eyes" className="grid grid-cols-1 md:grid-cols-2 gap-5 flex-1">
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

            {LESION_OVERLAY_ENABLED && (left.viewMode === 'mapped' || right.viewMode === 'mapped') && (
              <div className="mt-2 bg-slate-50 border border-slate-200/90 rounded-2xl p-4 flex flex-wrap items-center justify-center gap-6">
                <span className="text-xs font-black text-slate-800 uppercase tracking-wider mr-2">{t('dash.highlights')}</span>
                {/* Colours match stage2_structure/dl/lesionOverlayToFile.m */}
                {[
                  ['bg-rose-500 border-rose-300', t('dash.hemorrhage')],
                  ['bg-emerald-400 border-emerald-300', t('dash.exudate')],
                  ['bg-violet-400 border-violet-300', t('dash.softExudate')],
                  ['bg-amber-400 border-amber-300', t('dash.microaneurysm')],
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

          <aside className={`${cardClass} w-full lg:w-[26rem] p-5 sm:p-7 flex flex-col justify-between shrink-0 space-y-6`}>
            <div className="space-y-6">
              <div data-tour="profile">
                <div className="flex items-center justify-between mb-4 gap-2">
                  <h2 className="text-base font-extrabold text-slate-900 tracking-tight">{t('recordsTitle')}</h2>
                  {patient.bloodGroup && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-3 py-1 text-[11px] font-bold text-rose-700 border border-rose-200">
                      <FiDroplet aria-hidden="true" />
                      {t('dash.bloodGroup', { group: patient.bloodGroup })}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3.5 rounded-2xl bg-slate-50 border border-slate-200 p-3.5">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#0d1424] to-[#334155] text-sm font-extrabold text-white shadow-md">
                    {initials === '?' ? <FiUser /> : initials}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-slate-900 truncate">{displayName}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{identityLine || t('dash.profileIncomplete')}</p>
                  </div>
                  <button
                    type="button"
                    onClick={onEditPatient}
                    data-tour="profile-edit"
                    aria-label={t('dash.editProfile')}
                    className="p-2.5 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-white transition cursor-pointer"
                  >
                    <FiEdit2 />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Vital icon={FiDroplet} tone="bg-sky-100 text-sky-700" label={t('hba1c')} value={dash(patient.hba1c, '%')} />
                <Vital
                  icon={FiHeart}
                  tone="bg-rose-100 text-rose-700"
                  label={t('dash.bloodPressure')}
                  value={patient.systolicBP && patient.diastolicBP ? `${patient.systolicBP}/${patient.diastolicBP}` : '—'}
                />
                <Vital icon={FiActivity} tone="bg-amber-100 text-amber-700" label={t('dash.fastingSugar')} value={dash(patient.fastingSugar)} unit={patient.fastingSugar ? 'mg/dL' : ''} />
                <Vital icon={FiClock} tone="bg-violet-100 text-violet-700" label={t('dash.duration')} value={dash(patient.diabetesDuration)} unit={patient.diabetesDuration ? t('dash.yrs') : ''} />
              </div>

              <div data-tour="history">
                <ExamHistory history={history} />
              </div>
            </div>

            <button
              type="button"
              onClick={onViewDetailedReport}
              data-tour="report-button"
              className="group w-full rounded-2xl bg-gradient-to-r from-[#0d1424] to-[#1e293b] py-4 text-xs font-bold uppercase tracking-wider text-white shadow-lg shadow-slate-900/20 transition hover:from-[#16223b] hover:to-[#26344f] flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>{t('detailedReportBtn')}</span>
              <FiArrowRight className="text-sm text-amber-400 transition-transform group-hover:translate-x-0.5" />
            </button>
          </aside>
        </div>
      </main>

      {fullscreenImage && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4 sm:p-8"
          role="dialog"
          aria-modal="true"
          aria-label={t('dash.fullscreen')}
          onClick={() => setFullscreenImage(null)}
          onKeyDown={(e) => e.key === 'Escape' && setFullscreenImage(null)}
        >
          <div className="relative max-w-5xl w-full h-full flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              autoFocus
              aria-label={t('dash.closeFullscreen')}
              onClick={() => setFullscreenImage(null)}
              className="absolute top-4 right-4 z-10 p-3 bg-white/10 hover:bg-white/20 text-white rounded-full transition cursor-pointer"
            >
              <FiX className="text-xl" />
            </button>
            <img src={fullscreenImage} alt={t('dash.fullscreen')} className="max-h-[90vh] max-w-full object-contain rounded-2xl shadow-2xl border border-slate-800" />
          </div>
        </div>
      )}
    </div>
  );
}

function Vital({ icon: Icon, tone, label, value, unit }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3 border border-slate-200">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tone}`}>
        <Icon aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <span className="block truncate text-[10px] font-extrabold uppercase tracking-wider text-slate-500">{label}</span>
        <p className="mt-0.5 text-sm font-bold text-slate-900">
          {value} {unit && <span className="text-[10px] font-medium text-slate-500">{unit}</span>}
        </p>
      </div>
    </div>
  );
}
