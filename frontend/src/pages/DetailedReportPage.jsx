import { useRef, useState } from 'react';
import { FiArrowLeft, FiLayers, FiCheckCircle, FiEye, FiInfo } from 'react-icons/fi';
import Disclaimer from '../components/Disclaimer';
import { downloadReportPdf, fetchHeatmap } from '../api/ml';
import { saveBlob } from '../utils/download';
import { bannerConfig, reportThemes } from '../utils/drStyles';
import { LESION_OVERLAY_ENABLED } from '../config';
import { CONFIDENCE, HEATMAP_BELOW_NOTE, HEATMAP_EMPTY_NOTE, HEATMAP_NOTE, PDF_NEEDS_ASSESSMENT, PDF_NEEDS_PHOTOS, PDF_PRIVACY_NOTE, REPORT_LABELS, STAGE_NOTE, TRIAGE, basisText } from '../clinicalText';

const LESION_ROWS = [
  ['microaneurysms', 'Microaneurysm-like spots'],
  ['hemorrhages', 'Hemorrhage-like regions'],
  ['exudates', 'Exudate-like regions'],
];

const percent = (p) => (typeof p === 'number' ? `${Math.round(p * 100)}%` : null);

export default function DetailedReportPage({ patient, session, onBack }) {
  const [selectedEye, setSelectedEye] = useState('OS');
  const [viewMode, setViewMode] = useState('original');
  // eye -> { status: 'loading' | 'success' | 'error', url, error }. Reset per eye image (keyed by object URL).
  const [heatmaps, setHeatmaps] = useState({});
  const requested = useRef(new Set());
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

  const hasPhotos = Boolean(session.left.file && session.right.file);
  const canDownload = Boolean(assessment) && hasPhotos;

  const downloadPdf = async () => {
    setPdf({ status: 'working', error: '' });
    try {
      const blob = await downloadReportPdf(session.left.file, session.right.file, patient);
      saveBlob(blob, 'retina-rescue-report.pdf');
      setPdf({ status: 'idle', error: '' });
    } catch (err) {
      setPdf({ status: 'error', error: err.message || 'The report could not be created.' });
    }
  };

  const chooseView = (mode) => {
    setViewMode(mode);
    if (mode === 'heatmap') loadHeatmap(selectedEye, scan);
  };
  const chooseEye = (eye) => {
    setSelectedEye(eye);
    if (viewMode === 'heatmap') loadHeatmap(eye, eye === 'OS' ? session.left : session.right);
  };

  const overall = assessment?.overallRisk || 'Pending';
  const theme = reportThemes[overall] || reportThemes.Pending;
  const banner = bannerConfig[overall] || bannerConfig.Pending;
  const riskLevel = banner.title.replace('Overall Assessment: ', '');

  const thresholdPercent = percent(assessment?.referralThreshold);
  // `referable` comes from the backend (threshold rule). Older saved data without it falls back to the grade.
  const referable = assessment ? (assessment.referable ?? ['Moderate', 'Severe', 'Proliferate_DR'].includes(overall)) : false;
  let triage;
  if (!assessment) triage = { ...TRIAGE.none, basis: basisText(null) };
  else if (referable) triage = { ...TRIAGE.referral, basis: basisText(thresholdPercent, assessment?.referralThresholdSource) };
  else if (overall === 'No_DR') triage = { ...TRIAGE.noReferral, basis: basisText(thresholdPercent, assessment?.referralThresholdSource) };
  else triage = { ...TRIAGE.followUp, basis: basisText(thresholdPercent, assessment?.referralThresholdSource) };

  const candidateCount = (s) => (s.mask.counts ? Object.values(s.mask.counts).reduce((a, b) => a + b, 0) : null);

  return (
    <div className="min-h-screen bg-[#f1f3f7] text-slate-800 font-sans p-3 md:p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-2 print:hidden">
        <div className="flex items-center gap-3">
          <button type="button" onClick={onBack} aria-label="Back to dashboard" className="p-3 bg-white border border-slate-200/80 rounded-2xl text-slate-700 hover:bg-slate-50 transition cursor-pointer shadow-sm">
            <FiArrowLeft className="text-lg" />
          </button>
          <div>
            <span className="text-[10px] font-extrabold tracking-wider text-slate-400 uppercase block">{REPORT_LABELS.eyebrow}</span>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Detailed Retinal Analysis</h1>
          </div>
        </div>
        <button type="button" onClick={onBack} className="bg-slate-900 text-white px-5 py-2.5 rounded-2xl text-xs font-bold hover:bg-slate-800 transition cursor-pointer shadow-sm self-start sm:self-auto">
          Return to Dashboard
        </button>
      </div>

      {/* Patient + summary */}
      <div className={`rounded-[2.5rem] p-6 md:p-8 shadow-sm space-y-6 relative overflow-hidden bg-gradient-to-br ${theme.gradient} border ${theme.border}`}>
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 relative z-10">
          <div className="space-y-2 flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <span className={`${theme.badge} text-white font-black text-[9px] uppercase tracking-wider px-2.5 py-0.5 rounded-full shadow-sm`}>{triage.priority}</span>
              <span className="text-[9px] font-mono font-bold text-slate-400 uppercase tracking-widest">{triage.basis}</span>
            </div>
            <h2 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight uppercase">{triage.title}</h2>
            <p className="text-xs font-medium text-slate-500">{triage.sub}</p>
            {patient.fullName && <p className="text-xs font-bold text-slate-700">Patient: {patient.fullName}</p>}
          </div>

          <div className="md:border-l-2 border-white/50 md:pl-8 text-left md:text-right flex flex-col justify-center min-w-[220px]">
            <span className="text-[9px] font-mono font-bold text-slate-400 uppercase tracking-widest mb-1 block">{REPORT_LABELS.severity}</span>
            <span className={`text-xl md:text-2xl font-black ${theme.text}`}>{assessment ? riskLevel : REPORT_LABELS.notAssessed}</span>
          </div>
        </div>

        <div className="relative z-10">
          <h3 className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">{REPORT_LABELS.rationaleHeading}:</h3>
          <div className="bg-white/85 backdrop-blur-sm border border-black/5 rounded-2xl p-5 text-xs font-medium text-slate-700 leading-relaxed shadow-sm space-y-2">
            {assessment ? (
              <>
                <p className="font-semibold text-slate-900">
                  Left eye (OS): {assessment.leftGrade}
                  {assessment.leftConfidenceBand && ` (${assessment.leftConfidenceBand} ${CONFIDENCE.label})`}. Right eye (OD): {assessment.rightGrade}
                  {assessment.rightConfidenceBand && ` (${assessment.rightConfidenceBand} ${CONFIDENCE.label})`}.
                </p>
                {percent(assessment.leftReferableProbability) && (
                  <p>
                    Referral score: left {percent(assessment.leftReferableProbability)}, right {percent(assessment.rightReferableProbability)}
                    {' '}(an eye is flagged for referral at {percent(assessment.referralThreshold)} or more).
                  </p>
                )}
                <p>{assessment.overallSummary}</p>
                <p className="text-[11px] text-slate-500">{CONFIDENCE.note}</p>
                <p className="text-[11px] text-slate-500">{STAGE_NOTE}</p>
              </>
            ) : (
              <p>No assessment has been run for this session.</p>
            )}
          </div>
        </div>
      </div>

      {/* Viewer */}
      <div className="bg-white border border-slate-100 rounded-[2.5rem] p-6 shadow-sm space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4 print:hidden">
          <div className="flex bg-slate-100 p-1 rounded-2xl text-xs font-extrabold" role="group" aria-label="Eye">
            {[['OS', 'Left Eye (OS)'], ['OD', 'Right Eye (OD)']].map(([eye, label]) => (
              <button key={eye} type="button" aria-pressed={selectedEye === eye} onClick={() => chooseEye(eye)} className={`px-5 py-2 rounded-xl transition cursor-pointer ${selectedEye === eye ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}>
                {label}
              </button>
            ))}
          </div>

          <div className="flex bg-slate-100 p-1 rounded-2xl text-xs font-extrabold self-start md:self-auto" role="group" aria-label="View">
            <button type="button" aria-pressed={viewMode === 'original'} onClick={() => chooseView('original')} className={`px-3.5 py-2 rounded-xl transition cursor-pointer ${viewMode === 'original' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>Original Photo</button>
            <button type="button" aria-pressed={viewMode === 'heatmap'} onClick={() => chooseView('heatmap')} className={`px-3.5 py-2 rounded-xl transition cursor-pointer ${viewMode === 'heatmap' ? 'bg-amber-500 text-white shadow-sm' : 'text-slate-500'}`}>AI Heatmap</button>
            {LESION_OVERLAY_ENABLED && (
              <button type="button" aria-pressed={viewMode === 'overlay'} onClick={() => chooseView('overlay')} className={`px-3.5 py-2 rounded-xl transition cursor-pointer ${viewMode === 'overlay' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500'}`}>Experimental overlay</button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-[#0b1329] rounded-[2rem] p-4 min-h-[380px] flex flex-col items-center justify-center text-center relative overflow-hidden border border-slate-800">
            {scan.imageUrl ? (
              <>
                {viewMode === 'original' && <img src={scan.imageUrl} alt="Retinal scan" className="absolute inset-0 w-full h-full object-contain z-10" />}

                {viewMode === 'overlay' && (
                  <>
                    <img src={scan.imageUrl} alt="Retinal scan" className="absolute inset-0 w-full h-full object-contain z-10" />
                    {scan.mask.status === 'success' && scan.mask.url && (
                      <img src={scan.mask.url} alt="Lesion overlay mask" className="absolute inset-0 w-full h-full object-contain z-20 opacity-85 pointer-events-none" />
                    )}
                    {scan.mask.status !== 'success' && (
                      <div className="absolute inset-x-0 bottom-0 z-30 bg-slate-900/85 text-slate-200 text-xs font-semibold p-3">
                        {scan.mask.status === 'loading' ? 'Lesion overlay is still being generated…' : scan.mask.error || 'Lesion overlay is unavailable for this image.'}
                      </div>
                    )}
                  </>
                )}

                {viewMode === 'heatmap' && (
                  <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#0b1329]">
                    {heatmap?.status === 'success' ? (
                      <>
                        <img src={heatmap.url} alt="Heatmap of the regions that raised the referral score" className="w-full h-full object-contain" />
                        <div className="absolute inset-x-0 bottom-0 bg-slate-900/85 text-slate-200 text-[11px] font-semibold p-2.5">
                          {heatmap.empty ? HEATMAP_EMPTY_NOTE : HEATMAP_NOTE}
                          {!heatmap.empty && assessment && !eyeFlagged && <span className="block mt-1">{HEATMAP_BELOW_NOTE}</span>}
                        </div>
                      </>
                    ) : heatmap?.status === 'error' ? (
                      <div className="text-center p-6 space-y-3">
                        <span className="text-amber-400 font-bold text-sm block">Heatmap unavailable</span>
                        <p className="text-xs text-slate-300 max-w-sm">{heatmap.error}</p>
                        <button type="button" onClick={() => loadHeatmap(selectedEye, scan)} className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-bold cursor-pointer">Retry</button>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center space-y-2">
                        <span className="w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full animate-spin"></span>
                        <span className="text-white text-xs font-bold animate-pulse">Running Grad-CAM…</span>
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
                <span className="text-white font-extrabold text-base">Oculus {selectedEye === 'OS' ? 'Sinister (Left Eye)' : 'Dexter (Right Eye)'} — No Image Uploaded</span>
                <p className="text-xs text-slate-400 max-w-md">Please upload fundus scans on the dashboard to review analysis views.</p>
              </div>
            )}

            <div className="absolute top-4 left-4 bg-white/10 backdrop-blur-md px-3 py-1 rounded-xl text-[10px] font-bold text-white uppercase z-40">{viewMode} Mode</div>
          </div>

          <div className="space-y-4 flex flex-col justify-between">
            <div className="space-y-3">
              <h3 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <FiLayers className="text-amber-600" /> Model findings ({selectedEye})
              </h3>

              {eyeGrade && (
                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 text-xs flex justify-between items-center">
                  <span className="font-bold text-slate-900">Model grade</span>
                  <span className="font-black text-slate-900">
                    {eyeGrade}
                    {eyeConfidence && <span className="text-slate-500 font-semibold"> · {eyeConfidence} {CONFIDENCE.label}</span>}
                  </span>
                </div>
              )}
              {eyeReferral && (
                <div className={`p-3 rounded-2xl border text-xs flex justify-between items-center ${eyeFlagged ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200'}`}>
                  <span className="font-bold text-slate-900">Referral score</span>
                  <span className="font-black text-slate-900">
                    {eyeReferral}
                    <span className="text-slate-500 font-semibold"> · {eyeFlagged ? 'flagged' : 'not flagged'}</span>
                  </span>
                </div>
              )}

              {LESION_OVERLAY_ENABLED && (
                <>
              {scan.mask.status === 'success' ? (
                <div className="space-y-2 text-xs">
                  {LESION_ROWS.map(([key, label]) => (
                    <div key={key} className="bg-amber-50 p-3 rounded-2xl border border-amber-100 flex justify-between items-center">
                      <span className="font-bold text-amber-950">{label}</span>
                      <span className="font-black text-amber-900 bg-amber-200/60 px-2 py-1 rounded-lg">{scan.mask.counts[key]}</span>
                    </div>
                  ))}
                  {candidateCount(scan) === 0 && (
                    <div className="flex items-center gap-2 font-bold text-emerald-800 text-[11px] pt-1">
                      <FiCheckCircle /> No candidate regions were marked.
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 text-xs text-slate-600">
                  {!scan.file
                    ? 'No image uploaded for this eye.'
                    : scan.mask.status === 'loading'
                      ? 'Lesion analysis is still running…'
                      : scan.mask.status === 'error'
                        ? `Lesion analysis failed: ${scan.mask.error}`
                        : 'Lesion analysis was not run (image did not pass the quality check).'}
                </div>
              )}

              <p className="flex gap-1.5 text-[11px] text-slate-500 leading-snug">
                <FiInfo className="shrink-0 mt-0.5" aria-hidden="true" />
                EXPERIMENTAL. These regions come from a simple image-processing pass, not the neural network. Validation found they are drawn on healthy eyes as often as on diseased ones and miss real lesions, so they are not findings and must not be used clinically (see validation/LESIONS.md).
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
                className="w-full bg-slate-900 hover:bg-slate-800 disabled:opacity-50 disabled:hover:bg-slate-900 disabled:cursor-not-allowed text-white font-bold py-3.5 rounded-2xl shadow-sm transition text-xs uppercase tracking-wider cursor-pointer"
              >
                {pdf.status === 'working' ? 'Preparing report…' : 'Download PDF Report'}
              </button>
              <p className="text-[11px] text-slate-500 leading-snug">
                {!assessment ? PDF_NEEDS_ASSESSMENT : !hasPhotos ? PDF_NEEDS_PHOTOS : PDF_PRIVACY_NOTE}
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

      <Disclaimer className="px-2" />
    </div>
  );
}
