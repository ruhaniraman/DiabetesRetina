import { useCallback, useEffect, useRef, useState } from 'react';
import { FiArrowLeft, FiClock, FiCheck, FiRotateCcw, FiAlertTriangle } from 'react-icons/fi';
import HeroBand, { cardClass } from '../components/HeroBand';
import Logo from '../components/Logo';
import { fetchHeatmap } from '../api/ml';
import { LESION_OVERLAY_ENABLED } from '../config';
import { DECISIONS, appendLog, clearLog, readLog, summarise } from '../utils/reviewLog';

/*
 * The 30-second specialist review (problem statement, explainability: "annotated reports an ophthalmologist can review in under
 * 30 s"). Everything needed for the referral decision on one screen: both eyes' Grad-CAM, grade with calibrated confidence, the
 * referral score against the threshold, and the lesion evidence against ICDR criteria. A timer runs from opening the case; each
 * decision is logged with its time, so the review time is measured, not assumed. For ophthalmologists, so English only.
 */

const STAGE_NAMES = { No_DR: 'No DR', Mild: 'Mild NPDR', Moderate: 'Moderate NPDR', Severe: 'Severe NPDR', Proliferate_DR: 'Proliferative DR' };
const percent = (p) => (typeof p === 'number' ? `${Math.round(p * 100)}%` : '—');

function useStopwatch(running) {
  const [seconds, setSeconds] = useState(0);
  const start = useRef(null); // set when the timer first runs
  useEffect(() => {
    if (!running) return undefined;
    if (start.current == null) start.current = Date.now();
    const id = setInterval(() => setSeconds((Date.now() - start.current) / 1000), 200);
    return () => clearInterval(id);
  }, [running]);
  const reset = () => {
    start.current = Date.now();
    setSeconds(0);
  };
  return [seconds, reset, () => (start.current == null ? 0 : (Date.now() - start.current) / 1000)];
}

function EyeColumn({ label, scan, grade, band, probability, flagged, threshold, pdr, onSettled }) {
  // Result for the photo it was made from; any other photo shows as loading until its own result arrives.
  const [result, setResult] = useState({ file: null });
  useEffect(() => {
    if (!scan.file) return undefined;
    let live = true;
    fetchHeatmap(scan.file)
      .then((r) => live && setResult({ file: scan.file, status: 'success', url: r.heatmapUrl, empty: r.empty }))
      .catch((e) => live && setResult({ file: scan.file, status: 'error', error: e.message }));
    return () => {
      live = false;
    };
  }, [scan.file]);
  const heat = result.file === scan.file ? result : { status: 'loading' };
  const settled = heat.status === 'success' || heat.status === 'error';
  useEffect(() => {
    if (settled) onSettled?.();
  }, [settled, onSettled]);

  const ev = scan.mask?.evidence;
  const counts = scan.mask?.counts;
  return (
    <section className={`${cardClass} p-4 space-y-3`} aria-label={label}>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-900">{label}</h2>
        <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase ${flagged ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'}`}>
          {flagged ? 'AI: refer' : 'AI: routine'}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <figure className="aspect-square rounded-lg bg-slate-900 overflow-hidden">
          {scan.imageUrl && <img src={scan.imageUrl} alt={`${label} photograph`} className="w-full h-full object-contain" />}
        </figure>
        <figure className="aspect-square rounded-lg bg-slate-900 overflow-hidden flex items-center justify-center">
          {heat.status === 'success' ? (
            <img src={heat.url} alt={`${label} Grad-CAM of the referral score`} className="w-full h-full object-contain" />
          ) : (
            <span className="text-[11px] font-semibold text-slate-300 p-3 text-center">{heat.status === 'error' ? heat.error : 'Grad-CAM…'}</span>
          )}
        </figure>
      </div>
      <dl className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-xl bg-slate-50 border border-slate-200 p-2.5">
          <dt className="text-[10px] font-bold uppercase text-slate-500">AI grade</dt>
          <dd className="font-semibold text-slate-900">{STAGE_NAMES[grade] || grade || '—'}</dd>
          <dd className="text-slate-500">{band ? `${band} confidence (calibrated)` : ''}</dd>
        </div>
        <div className="rounded-xl bg-slate-50 border border-slate-200 p-2.5">
          <dt className="text-[10px] font-bold uppercase text-slate-500">Referral score</dt>
          <dd className="font-semibold text-slate-900">
            {percent(probability)} <span className="font-semibold text-slate-500">vs {percent(threshold)}</span>
          </dd>
          {typeof probability === 'number' && (
            <dd aria-hidden="true" className="relative mt-2 h-1.5 rounded-full bg-slate-200">
              <div className={`h-full rounded-full ${flagged ? 'bg-amber-500' : 'bg-slate-500'}`} style={{ width: `${Math.min(100, probability * 100)}%` }} />
              {typeof threshold === 'number' && <div className="absolute -top-1 h-3.5 w-0.5 bg-slate-900" style={{ left: `${Math.min(100, threshold * 100)}%` }} />}
            </dd>
          )}
        </div>
      </dl>
      {typeof pdr === 'number' && (
        <p className="rounded-xl border bg-slate-50 border-slate-200 p-2.5 text-[11px] text-slate-600">
          <b>Proliferative DR (new vessels) probability: {percent(pdr)}</b> · calibrated CNN output, AUC 0.91 for PDR on both test sets. Confirm new
          vessels clinically.
        </p>
      )}
      {LESION_OVERLAY_ENABLED && counts && (
        <div className="rounded-xl bg-amber-50 border border-amber-100 p-2.5 text-[11px] text-amber-950 space-y-1">
          <p className="font-bold">
            Possible lesions: MA {counts.microaneurysms} · HE {counts.hemorrhages} · EX {counts.exudates} · SE {counts.softExudates}
          </p>
          {ev && (
            <ul className="list-disc pl-4">
              {ev.onlyMA && <li>Microaneurysms only (ICDR mild NPDR pattern)</li>}
              {ev.heQuadrants > 0 && <li>Haemorrhages in {ev.heQuadrants} quadrant(s); {ev.heQuadrantsWith20} with 20 or more (4-2-1 rule)</li>}
              {ev.exNearFovea && <li>Hard exudates within 1 disc diameter of the fovea ({ev.foveaFrom === 'detected' ? 'detected' : 'estimated'} fovea)</li>}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

export default function SpecialistReviewPage({ session, onBack }) {
  const { assessment, left, right } = session;
  const [decided, setDecided] = useState(null);
  const [log, setLog] = useState(() => readLog());
  // The clock starts once both eyes' Grad-CAM are on screen, so the server's drawing time is not counted as review time.
  const [settledEyes, setSettledEyes] = useState({ left: false, right: false });
  const settleLeft = useCallback(() => setSettledEyes((s) => (s.left ? s : { ...s, left: true })), []);
  const settleRight = useCallback(() => setSettledEyes((s) => (s.right ? s : { ...s, right: true })), []);
  const ready = settledEyes.left && settledEyes.right;
  const [seconds, resetTimer, elapsed] = useStopwatch(Boolean(assessment) && ready && !decided);
  const stats = summarise(log);

  const decide = (decision) => {
    const secs = Math.round(elapsed() * 10) / 10;
    const entry = { decision, seconds: secs, aiReferable: Boolean(assessment.referable), at: new Date().toISOString() };
    setLog(appendLog(entry));
    setDecided(entry);
  };
  const again = () => {
    setDecided(null);
    resetTimer();
  };

  const shown = decided ? decided.seconds : seconds;
  const timerTone = shown > 30 ? 'text-rose-400' : shown > 25 ? 'text-amber-300' : 'text-emerald-300';

  return (
    <div className="min-h-screen bg-[#eef1f6] text-slate-800 font-sans antialiased">
      <HeroBand className="pb-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <header data-tour="review" className="flex items-center justify-between gap-4 py-5">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-white shadow-sm shrink-0">
                <Logo className="w-8 h-6" />
              </div>
              <div>
                <span className="block text-lg font-semibold tracking-tight text-white">30-second specialist review</span>
                <span className="block text-[10px] font-bold uppercase tracking-wider text-sky-300">Tele-ophthalmology</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className={`flex items-center gap-2 rounded-lg bg-black/30 px-4 py-2 font-mono text-2xl font-bold tabular-nums ${timerTone}`} role="timer" aria-label="Review time">
                <FiClock aria-hidden="true" className="text-lg" /> {assessment && !ready ? 'loading' : `${shown.toFixed(1)} s`}
              </div>
              <button type="button" onClick={onBack} className="flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold text-white hover:bg-white/20 cursor-pointer">
                <FiArrowLeft aria-hidden="true" /> Back
              </button>
            </div>
          </header>
        </div>
      </HeroBand>

      <main className="relative -mt-16 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pb-12 space-y-5">
        {!assessment ? (
          <section className={`${cardClass} p-6 flex items-center gap-3 text-slate-700`}>
            <FiAlertTriangle className="text-amber-600" aria-hidden="true" /> No case to review yet: upload both eyes and run the assessment first.
          </section>
        ) : (
          <>
            <section className={`${cardClass} p-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm`}>
              <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase text-white ${assessment.referable ? 'bg-amber-600' : 'bg-emerald-600'}`}>
                {assessment.referable ? 'AI recommends referral' : 'AI: routine rescreen'}
              </span>
              <span className="font-semibold text-slate-700">Patient-level grade: {STAGE_NAMES[assessment.overallRisk] || assessment.overallRisk}</span>
              {assessment.escalated && <span className="text-xs font-semibold text-amber-800">Raised to Moderate by the referral threshold</span>}
              {assessment.qualityWarnings?.length > 0 && <span className="text-xs font-semibold text-slate-500">Quality: {assessment.qualityWarnings.join('; ')}</span>}
            </section>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <EyeColumn label="Left eye (OS)" scan={left} grade={assessment.leftGrade} band={assessment.leftConfidenceBand} probability={assessment.leftReferableProbability} flagged={assessment.leftReferable} threshold={assessment.referralThreshold} pdr={assessment.leftProliferativeProbability} onSettled={settleLeft} />
              <EyeColumn label="Right eye (OD)" scan={right} grade={assessment.rightGrade} band={assessment.rightConfidenceBand} probability={assessment.rightReferableProbability} flagged={assessment.rightReferable} threshold={assessment.referralThreshold} pdr={assessment.rightProliferativeProbability} onSettled={settleRight} />
            </div>

            <section className={`${cardClass} p-4 space-y-3`} aria-label="Decision">
              {decided ? (
                <div className="flex flex-wrap items-center gap-4">
                  <FiCheck className="text-2xl text-emerald-600" aria-hidden="true" />
                  <p className="text-sm font-bold text-slate-900">
                    {DECISIONS[decided.decision].label} · reviewed in {decided.seconds.toFixed(1)} s {decided.seconds <= 30 ? '(within the 30 s target)' : ''}
                  </p>
                  <button type="button" onClick={again} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold hover:bg-slate-50 cursor-pointer">
                    <FiRotateCcw aria-hidden="true" /> Review again
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {Object.entries(DECISIONS).map(([key, d]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => decide(key)}
                      disabled={!ready}
                      className={`disabled:opacity-40 disabled:cursor-wait rounded-xl px-4 py-3 text-xs font-semibold uppercase tracking-wide shadow-sm cursor-pointer transition ${
                        d.agrees ? 'bg-slate-900 text-white hover:bg-slate-700' : 'bg-white border border-slate-300 text-slate-800 hover:bg-slate-50'
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              )}
            </section>
          </>
        )}

        <section className={`${cardClass} p-4 flex flex-wrap items-center gap-x-8 gap-y-2 text-sm`} aria-label="Your review log">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Your review log (this browser)</span>
          <span><b>{stats.count}</b> cases</span>
          <span>median <b>{stats.medianSeconds == null ? '—' : `${stats.medianSeconds.toFixed(1)} s`}</b></span>
          <span><b>{stats.within30 == null ? '—' : percent(stats.within30)}</b> within 30 s</span>
          <span><b>{stats.agreement == null ? '—' : percent(stats.agreement)}</b> agreed with the AI</span>
          {stats.count > 0 && (
            <button type="button" onClick={() => { clearLog(); setLog([]); }} className="ml-auto text-xs font-semibold text-slate-500 hover:text-rose-600 cursor-pointer">
              Clear log
            </button>
          )}
        </section>
      </main>
    </div>
  );
}
