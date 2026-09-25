import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiArrowLeft, FiLayers, FiEye, FiInfo } from 'react-icons/fi';
import Disclaimer from '../components/Disclaimer';
import LanguageSwitcher from '../components/LanguageSwitcher';
import HeroBand, { cardClass } from '../components/HeroBand';
import ListenToReport from '../components/ListenToReport';
import { downloadReportPdf, fetchAnatomy, fetchEnhanced, fetchHeatmap } from '../api/ml';
import { saveBlob } from '../utils/download';
import { bannerConfig, reportThemes } from '../utils/drStyles';
import { LESION_OVERLAY_ENABLED } from '../config';
import { useResultSummary } from '../hooks/useResultSummary';
import { useMessages } from '../messages';

const LESION_ROWS = ['microaneurysms', 'hemorrhages', 'exudates', 'softExudates'];

const percent = (p) => (typeof p === 'number' ? `${Math.round(p * 100)}%` : null);

export default function DetailedReportPage({ patient, session, onBack }) {
  const { t, i18n } = useTranslation();
  const { grade, tm } = useMessages();
  const lang = i18n.resolvedLanguage || 'en';
  const [selectedEye, setSelectedEye] = useState('OS');
  const [viewMode, setViewMode] = useState('original');
  // eye -> { status: 'loading' | 'success' | 'error', url, error }. Reset per eye image (keyed by object URL).
  const [heatmaps, setHeatmaps] = useState({});
  const requested = useRef(new Set());
  // Extra views fetched on demand, per eye image: 'anatomy' (vessels, disc, fovea) and 'enhanced' (Stage 1, display only).
  // `${view}:${eye}:${imageUrl}` -> { status, url, ...result }
  const [extraViews, setExtraViews] = useState({});
  const requestedViews = useRef(new Set());
  // Download of the PDF report: idle | working | error
  const [pdf, setPdf] = useState({ status: 'idle', error: '' });

  const { assessment } = session;
  const scan = selectedEye === 'OS' ? session.left : session.right;
  const eyeGrade = assessment ? (selectedEye === 'OS' ? assessment.leftGrade : assessment.rightGrade) : null;
  const eyeConfidence = assessment ? (selectedEye === 'OS' ? assessment.leftConfidenceBand : assessment.rightConfidenceBand) : null;
  const eyeReferral = assessment ? percent(selectedEye === 'OS' ? assessment.leftReferableProbability : assessment.rightReferableProbability) : null;
  const eyeFlagged = assessment ? Boolean(selectedEye === 'OS' ? assessment.leftReferable : assessment.rightReferable) : false;

  const heatmapKey = scan.imageUrl ? `${selectedEye}:${scan.imageUrl}` : null;
  const heatmap = heatmapKey ? heatmaps[heatmapKey] : null;

  const loadHeatmap = async (eye, eyeScan) => {
    const key = `${eye}:${eyeScan.imageUrl}`;
    if (!eyeScan.file || requested.current.has(key)) return;
    requested.current.add(key);
    setHeatmaps((h) => ({ ...h, [key]: { status: 'loading' } }));
    try {
      const result = await fetchHeatmap(eyeScan.file);
      setHeatmaps((h) => ({ ...h, [key]: { status: 'success', url: result.heatmapUrl, empty: Boolean(result.empty) } }));
    } catch (err) {
      requested.current.delete(key); // allow retry
      setHeatmaps((h) => ({ ...h, [key]: { status: 'error', error: err.message } }));
    }
  };

  const VIEW_FETCHERS = {
    anatomy: [fetchAnatomy, (r) => r.overlayUrl],
    enhanced: [fetchEnhanced, (r) => r.imageUrl],
  };
  const loadView = async (view, eye, eyeScan) => {
    const key = `${view}:${eye}:${eyeScan.imageUrl}`;
    if (!VIEW_FETCHERS[view] || !eyeScan.file || requestedViews.current.has(key)) return;
    requestedViews.current.add(key);
    const [fetcher, urlOf] = VIEW_FETCHERS[view];
    setExtraViews((v) => ({ ...v, [key]: { status: 'loading' } }));
    try {
      const result = await fetcher(eyeScan.file);
      setExtraViews((v) => ({ ...v, [key]: { ...result, status: 'success', url: urlOf(result) } }));
    } catch (err) {
      requestedViews.current.delete(key); // allow retry
      setExtraViews((v) => ({ ...v, [key]: { status: 'error', error: err.message } }));
    }
  };
  const anatomyView = heatmapKey ? extraViews[`anatomy:${heatmapKey}`] : null;
  const enhancedView = heatmapKey ? extraViews[`enhanced:${heatmapKey}`] : null;

  const hasPhotos = Boolean(session.left.file && session.right.file);
  const canDownload = Boolean(assessment) && hasPhotos;

  const downloadPdf = async () => {
    setPdf({ status: 'working', error: '' });
    try {
      const blob = await downloadReportPdf(session.left.file, session.right.file, patient);
      saveBlob(blob, 'retina-rescue-report.pdf');
      setPdf({ status: 'idle', error: '' });
    } catch (err) {
      setPdf({ status: 'error', error: tm(err.message) || t('report.pdfFailed') });
    }
  };

  const chooseView = (mode) => {
    setViewMode(mode);
    if (mode === 'heatmap') loadHeatmap(selectedEye, scan);
    loadView(mode, selectedEye, scan);
  };
  const chooseEye = (eye) => {
    setSelectedEye(eye);
    if (viewMode === 'heatmap') loadHeatmap(eye, eye === 'OS' ? session.left : session.right);
    loadView(viewMode, eye, eye === 'OS' ? session.left : session.right);
  };

  const overall = assessment?.overallRisk || 'Pending';
  const theme = reportThemes[overall] || reportThemes.Pending;
  const riskLevel = t(`clinical.riskLevel.${bannerConfig[overall] ? overall : 'Pending'}`);
  const summary = useResultSummary(assessment, lang);

  const thresholdPercent = percent(assessment?.referralThreshold);
  // `referable` comes from the backend (threshold rule). Older saved data without it falls back to the grade.
  const referable = assessment ? (assessment.referable ?? ['Moderate', 'Severe', 'Proliferate_DR'].includes(overall)) : false;
  const basisText = (threshold, source) => (threshold ? t(source === 'site' ? 'clinical.basisScoreSite' : 'clinical.basisScore', { threshold }) : t('clinical.basisGrade'));
  const triageCase = !assessment ? 'none' : referable ? 'referral' : overall === 'No_DR' ? 'noReferral' : 'followUp';
  const triage = {
    title: t(`clinical.triage.${triageCase}.title`),
    priority: t(`clinical.triage.${triageCase}.priority`),
    sub: t(`clinical.triage.${triageCase}.sub`),
    basis: assessment ? basisText(thresholdPercent, assessment?.referralThresholdSource) : basisText(null),
  };
  const withConfidence = (label, band) => (band ? t('report.withConfidence', { grade: grade(label), band: t(`bands.${band}`, { defaultValue: band }), label: t('clinical.confidenceLabel') }) : grade(label));

  const eyeProbability = assessment ? (selectedEye === 'OS' ? assessment.leftReferableProbability : assessment.rightReferableProbability) : null;
  const referralThreshold = assessment?.referralThreshold;

  const candidateCount = (s) => (s.mask.counts ? Object.values(s.mask.counts).reduce((a, b) => a + b, 0) : null);

  return (
    <div className="min-h-screen bg-[#eef1f6] text-slate-800 font-sans antialiased">
      <HeroBand className="pb-24 sm:pb-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col sm:flex-row sm:items-center justify-between gap-5">
          <div className="flex items-center gap-4">
            <button type="button" onClick={onBack} aria-label={t('report.back')} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#1e293b] text-white ring-1 ring-slate-600 shadow-lg shadow-black/20 transition hover:bg-[#2a3a57] cursor-pointer">
              <FiArrowLeft className="text-lg" />
            </button>
            <div>
              <span className="block text-[10px] font-extrabold uppercase tracking-[0.2em] text-amber-400">{t('clinical.eyebrow')}</span>
              <h1 className="mt-1 font-welcome text-2xl sm:text-3xl font-bold tracking-tight text-white">{t('report.title')}</h1>
            </div>
          </div>
          <div className="flex items-center gap-3 self-start sm:self-auto">
            <LanguageSwitcher />
            <button type="button" onClick={onBack} className="rounded-2xl bg-white px-5 py-2.5 text-xs font-bold text-slate-900 shadow-lg shadow-black/10 transition hover:bg-slate-100 cursor-pointer">
              {t('report.returnBtn')}
            </button>
          </div>
        </div>
      </HeroBand>

      <main className="relative -mt-16 sm:-mt-20 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pb-12 space-y-6">

      {/* Patient + summary */}
      <div className={`${cardClass} border-l-[6px] ${theme.accent} p-6 md:p-8 shadow-[0_20px_50px_-24px_rgba(15,23,42,0.35)] space-y-6 relative overflow-hidden`}>
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 relative z-10">
          <div className="space-y-2 flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <span className={`${theme.badge} text-white font-black text-[10px] uppercase tracking-wider px-3 py-1 rounded-full shadow-sm`}>{triage.priority}</span>
              <span className="text-[9px] font-mono font-bold text-slate-400 uppercase tracking-widest">{triage.basis}</span>
            </div>
            <h2 className="font-welcome text-2xl md:text-3xl font-bold text-slate-900 tracking-tight uppercase">{triage.title}</h2>
            <p className="max-w-2xl text-sm leading-relaxed font-medium text-slate-600">{triage.sub}</p>
            {patient.fullName && <p className="text-xs font-bold text-slate-700">{t('report.patient', { name: patient.fullName })}</p>}
          </div>

          <div className={`rounded-2xl border p-5 text-left md:text-right flex flex-col justify-center min-w-[240px] ${theme.soft}`}>
            <span className="text-[9px] font-mono font-bold text-slate-400 uppercase tracking-widest mb-1 block">{t('clinical.severity')}</span>
            <span className={`text-xl md:text-2xl font-black ${theme.text}`}>{assessment ? riskLevel : t('clinical.notAssessed')}</span>
          </div>
        </div>

        {assessment && (
          <div className="relative z-10 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              [t('leftEyeLabel'), assessment.leftGrade, assessment.leftReferableProbability, assessment.leftReferable],
              [t('rightEyeLabel'), assessment.rightGrade, assessment.rightReferableProbability, assessment.rightReferable],
            ].map(([label, eyeGradeLabel, probability, flagged]) => (
              <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">{label}</span>
                  <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase ${flagged ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-slate-100 text-slate-600 border border-slate-200'}`}>
                    {flagged ? t('report.flagged') : t('report.notFlagged')}
                  </span>
                </div>
                <p className="mt-2 text-base font-extrabold tracking-tight text-slate-900">{grade(eyeGradeLabel)}</p>
                {percent(probability) && <p className="mt-0.5 text-xs font-semibold text-slate-500">{percent(probability)}</p>}
              </div>
            ))}
          </div>
        )}

        <div className="relative z-10">
          <h3 className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">{t('clinical.rationale')}:</h3>
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 md:p-6 text-[13px] font-medium text-slate-700 leading-relaxed space-y-2.5">
            {assessment ? (
              <>
                <p className="font-semibold text-slate-900">
                  {t('report.gradeLine', {
                    leftLabel: t('report.leftOs'),
                    left: withConfidence(assessment.leftGrade, assessment.leftConfidenceBand),
                    rightLabel: t('report.rightOd'),
                    right: withConfidence(assessment.rightGrade, assessment.rightConfidenceBand),
                  })}
                </p>
                {percent(assessment.leftReferableProbability) && (
                  <p>
                    {t('report.referralLine', { left: percent(assessment.leftReferableProbability), right: percent(assessment.rightReferableProbability), threshold: percent(assessment.referralThreshold) })}
                  </p>
                )}
                <p>{summary.text}</p>
                {summary.notice && <p className="text-[11px] text-slate-500 font-semibold">{summary.notice}</p>}
                <ListenToReport assessment={assessment} />
                <p className="text-[11px] text-slate-500">{t('clinical.confidenceNote')}</p>
                <p className="text-[11px] text-slate-500">{t('clinical.stageNote')}</p>
              </>
            ) : (
              <p>{t('report.noAssessment')}</p>
            )}
          </div>
        </div>
      </div>

      {/* Viewer */}
      <div className={`${cardClass} p-5 md:p-7 space-y-6`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4 print:hidden">
          <div className="flex bg-slate-100 p-1 rounded-2xl text-xs font-extrabold" role="group" aria-label={t('report.eyeGroup')}>
            {[['OS', t('leftEyeLabel')], ['OD', t('rightEyeLabel')]].map(([eye, label]) => (
              <button key={eye} type="button" aria-pressed={selectedEye === eye} onClick={() => chooseEye(eye)} className={`px-5 py-2 rounded-xl transition cursor-pointer ${selectedEye === eye ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}>
                {label}
              </button>
            ))}
          </div>

          <div className="flex bg-slate-100 p-1 rounded-2xl text-xs font-extrabold self-start md:self-auto" role="group" aria-label={t('report.viewGroup')}>
            <button type="button" aria-pressed={viewMode === 'original'} onClick={() => chooseView('original')} className={`px-3.5 py-2 rounded-xl transition cursor-pointer ${viewMode === 'original' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>{t('report.originalPhoto')}</button>
            <button type="button" aria-pressed={viewMode === 'heatmap'} onClick={() => chooseView('heatmap')} className={`px-3.5 py-2 rounded-xl transition cursor-pointer ${viewMode === 'heatmap' ? 'bg-amber-500 text-white shadow-sm' : 'text-slate-500'}`}>{t('aiView')}</button>
            <button type="button" aria-pressed={viewMode === 'enhanced'} onClick={() => chooseView('enhanced')} className={`px-3.5 py-2 rounded-xl transition cursor-pointer ${viewMode === 'enhanced' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500'}`}>{t('report.enhancedBtn')}</button>
            <button type="button" aria-pressed={viewMode === 'anatomy'} onClick={() => chooseView('anatomy')} className={`px-3.5 py-2 rounded-xl transition cursor-pointer ${viewMode === 'anatomy' ? 'bg-cyan-600 text-white shadow-sm' : 'text-slate-500'}`}>{t('report.anatomyBtn')}</button>
            {LESION_OVERLAY_ENABLED && (
              <button type="button" aria-pressed={viewMode === 'overlay'} onClick={() => chooseView('overlay')} className={`px-3.5 py-2 rounded-xl transition cursor-pointer ${viewMode === 'overlay' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500'}`}>{t('report.overlayBtn')}</button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-[radial-gradient(ellipse_at_center,#16223b_0%,#0b1329_70%)] rounded-3xl p-4 min-h-[380px] sm:min-h-[460px] flex flex-col items-center justify-center text-center relative overflow-hidden ring-1 ring-slate-800 shadow-inner">
            {scan.imageUrl ? (
              <>
                {viewMode === 'original' && <img src={scan.imageUrl} alt={t('report.scanAlt')} className="absolute inset-0 w-full h-full object-contain z-10" />}

                {viewMode === 'overlay' && (
                  <>
                    <img src={scan.imageUrl} alt={t('report.scanAlt')} className="absolute inset-0 w-full h-full object-contain z-10" />
                    {scan.mask.status === 'success' && scan.mask.url && (
                      <img src={scan.mask.url} alt={t('report.maskAlt')} className="absolute inset-0 w-full h-full object-contain z-20 opacity-85 pointer-events-none" />
                    )}
                    {scan.mask.status !== 'success' && (
                      <div className="absolute inset-x-0 bottom-0 z-30 bg-slate-900 text-slate-200 text-xs font-semibold p-3">
                        {scan.mask.status === 'loading' ? t('report.overlayLoading') : tm(scan.mask.error) || t('report.overlayUnavailable')}
                      </div>
                    )}
                  </>
                )}

                {viewMode === 'enhanced' && (
                  <>
                    <img src={enhancedView?.status === 'success' ? enhancedView.url : scan.imageUrl} alt={t('report.scanAlt')} className="absolute inset-0 w-full h-full object-contain z-10" />
                    <div className="absolute inset-x-0 bottom-0 z-30 bg-slate-900 text-slate-200 text-[11px] font-semibold p-2.5">
                      {enhancedView?.status === 'success'
                        ? t('report.enhancedNote')
                        : enhancedView?.status === 'error'
                          ? tm(enhancedView.error) || t('report.enhancedUnavailable')
                          : t('report.enhancedLoading')}
                    </div>
                  </>
                )}

                {viewMode === 'anatomy' && (
                  <>
                    <img src={scan.imageUrl} alt={t('report.scanAlt')} className="absolute inset-0 w-full h-full object-contain z-10" />
                    {anatomyView?.status === 'success' && (
                      <img src={anatomyView.url} alt={t('report.anatomyTitle')} className="absolute inset-0 w-full h-full object-contain z-20 pointer-events-none" />
                    )}
                    <div className="absolute inset-x-0 bottom-0 z-30 bg-slate-900 text-slate-200 text-[11px] font-semibold p-2.5">
                      {anatomyView?.status === 'success'
                        ? t('report.anatomyLegend')
                        : anatomyView?.status === 'error'
                          ? tm(anatomyView.error) || t('report.anatomyUnavailable')
                          : t('report.anatomyLoading')}
                    </div>
                  </>
                )}

                {viewMode === 'heatmap' && (
                  <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#0b1329]">
                    {heatmap?.status === 'success' ? (
                      <>
                        <img src={heatmap.url} alt={t('report.heatmapAlt')} className="w-full h-full object-contain" />
                        <div className="absolute inset-x-0 bottom-0 bg-slate-900 text-slate-200 text-[11px] font-semibold p-2.5">
                          {heatmap.empty ? t('clinical.heatmapEmpty') : t('clinical.heatmapNote')}
                          {!heatmap.empty && assessment && !eyeFlagged && <span className="block mt-1">{t('clinical.heatmapBelow')}</span>}
                        </div>
                      </>
                    ) : heatmap?.status === 'error' ? (
                      <div className="text-center p-6 space-y-3">
                        <span className="text-amber-400 font-bold text-sm block">{t('report.heatmapUnavailable')}</span>
                        <p className="text-xs text-slate-300 max-w-sm">{tm(heatmap.error)}</p>
                        <button type="button" onClick={() => loadHeatmap(selectedEye, scan)} className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-bold cursor-pointer">{t('report.retry')}</button>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center space-y-2">
                        <span className="w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full animate-spin"></span>
                        <span className="text-white text-xs font-bold animate-pulse">{t('report.running')}</span>
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-col items-center justify-center space-y-3 z-10">
                <div className="w-20 h-20 rounded-full bg-white/10 flex items-center justify-center text-4xl text-amber-400 backdrop-blur-md">
                  <FiEye />
                </div>
                <span className="text-white font-extrabold text-base">{selectedEye === 'OS' ? t('report.noImageLeft') : t('report.noImageRight')}</span>
                <p className="text-xs text-slate-400 max-w-md">{t('report.uploadPrompt')}</p>
              </div>
            )}

            <div className="absolute top-4 left-4 bg-slate-900 ring-1 ring-white/15 px-3 py-1.5 rounded-xl text-[10px] font-bold tracking-wider text-white uppercase z-40">{t(`report.mode${viewMode.charAt(0).toUpperCase()}${viewMode.slice(1)}`)}</div>
          </div>

          <div className="space-y-4 flex flex-col justify-between">
            <div className="space-y-3">
              <h3 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <FiLayers className="text-amber-600" /> {t('report.findings', { eye: selectedEye })}
              </h3>

              {eyeGrade && (
                <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 text-xs flex justify-between items-center gap-3">
                  <span className="font-bold text-slate-900">{t('report.modelGrade')}</span>
                  <span className="font-black text-slate-900">
                    {grade(eyeGrade)}
                    {eyeConfidence && <span className="text-slate-500 font-semibold"> · {t(`bands.${eyeConfidence}`, { defaultValue: eyeConfidence })} {t('clinical.confidenceLabel')}</span>}
                  </span>
                </div>
              )}
              {eyeReferral && (
                <div className={`p-3.5 rounded-2xl border text-xs ${eyeFlagged ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200'}`}>
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-slate-900">{t('report.referralScore')}</span>
                    <span className="font-black text-slate-900">
                      {eyeReferral}
                      <span className="text-slate-500 font-semibold"> · {eyeFlagged ? t('report.flagged') : t('report.notFlagged')}</span>
                    </span>
                  </div>
                  {typeof eyeProbability === 'number' && (
                    <div aria-hidden="true" className="relative mt-3 h-2 rounded-full bg-slate-200/90">
                      <div className={`h-full rounded-full ${eyeFlagged ? 'bg-amber-500' : 'bg-slate-500'}`} style={{ width: `${Math.min(100, Math.round(eyeProbability * 100))}%` }} />
                      {typeof referralThreshold === 'number' && (
                        <div className="absolute -top-1 h-4 w-0.5 rounded bg-slate-900" style={{ left: `${Math.min(100, Math.round(referralThreshold * 100))}%` }} />
                      )}
                    </div>
                  )}
                </div>
              )}

              {anatomyView?.status === 'success' && (
                <div className="bg-cyan-50 p-3.5 rounded-2xl border border-cyan-200 text-xs space-y-1">
                  <p className="font-bold text-slate-900">{t('report.anatomyTitle')}</p>
                  <p className="text-slate-700">{t('report.anatomyVessels', { pct: anatomyView.vesselDensity.toFixed(1) })}</p>
                  <p className="text-slate-700">
                    {anatomyView.foveaSource === 'detected'
                      ? t('report.anatomyFoveaDetected', { pct: Math.round(100 * (anatomyView.foveaConfidence ?? 0)) })
                      : t('report.anatomyFoveaEstimated')}
                  </p>
                </div>
              )}

              {LESION_OVERLAY_ENABLED && (
                <>
              {scan.mask.status === 'success' ? (
                <div className="space-y-2 text-xs">
                  {LESION_ROWS.map((key) => (
                    <div key={key} className="bg-amber-50 p-3 rounded-2xl border border-amber-100 flex justify-between items-center">
                      <span className="font-bold text-amber-950">{t(`report.${key}`)}</span>
                      <span className="font-black text-amber-900 bg-amber-200/60 px-2 py-1 rounded-lg">{scan.mask.counts[key] ?? 0}</span>
                    </div>
                  ))}
                  {candidateCount(scan) === 0 && (
                    <p className="font-semibold text-slate-600 text-[11px] pt-1">{t('clinical.lesionNoneNote')}</p>
                  )}
                  {scan.mask.evidence && candidateCount(scan) > 0 && (
                    <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 text-[11px] text-slate-700 space-y-1">
                      <p className="font-bold text-slate-900">{t('report.evidenceTitle')}</p>
                      <ul className="list-disc pl-4 space-y-1">
                        {scan.mask.evidence.onlyMA && <li>{t('report.evidenceOnlyMA')}</li>}
                        {scan.mask.evidence.heQuadrants > 0 && (
                          <li>{t('report.evidenceHemorrhages', { quadrants: scan.mask.evidence.heQuadrants, with20: scan.mask.evidence.heQuadrantsWith20 })}</li>
                        )}
                        {scan.mask.evidence.exNearFovea && <li>{t('report.evidenceExudatesNearFovea')}</li>}
                        <li>{t('report.evidenceNotAssessed')}</li>
                      </ul>
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 text-xs text-slate-600">
                  {!scan.file
                    ? t('report.noImageEye')
                    : scan.mask.status === 'loading'
                      ? t('report.lesionRunning')
                      : scan.mask.status === 'error'
                        ? t('report.lesionFailed', { error: tm(scan.mask.error) })
                        : t('report.lesionNotRun')}
                </div>
              )}

              <p className="flex gap-1.5 text-[11px] text-slate-500 leading-snug">
                <FiInfo className="shrink-0 mt-0.5" aria-hidden="true" />
                {t('clinical.lesionNote')}
              </p>
                </>
              )}
            </div>

            {/* The report button takes the place the print button had. It is always shown; it is disabled, with the reason, until a report can be made. */}
            <div className="space-y-1.5 print:hidden">
              <button
                type="button"
                disabled={!canDownload || pdf.status === 'working'}
                onClick={downloadPdf}
                className="w-full bg-gradient-to-r from-[#0d1424] to-[#1e293b] hover:from-[#16223b] hover:to-[#26344f] disabled:opacity-45 disabled:cursor-not-allowed text-white font-bold py-4 rounded-2xl shadow-lg shadow-slate-900/20 transition text-xs uppercase tracking-wider cursor-pointer"
              >
                {pdf.status === 'working' ? t('report.preparing') : t('report.download')}
              </button>
              <p className="text-[11px] text-slate-500 leading-snug">
                {!assessment ? t('clinical.pdfNeedsAssessment') : !hasPhotos ? t('clinical.pdfNeedsPhotos') : t('clinical.pdfPrivacy')}
              </p>
              {pdf.status === 'error' && (
                <p role="alert" className="text-[11px] font-semibold text-rose-600">
                  {pdf.error}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      <Disclaimer />
      </main>
    </div>
  );
}
