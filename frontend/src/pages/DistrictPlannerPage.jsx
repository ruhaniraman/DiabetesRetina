import { useEffect, useMemo, useState } from 'react';
import { FiArrowLeft, FiCamera, FiWifi, FiCpu, FiUserCheck, FiAlertTriangle, FiCheckCircle } from 'react-icons/fi';
import HeroBand, { cardClass } from '../components/HeroBand';
import Logo from '../components/Logo';
import { fetchSimulation, runSimulation } from '../api/ml';
import { BASE_PARAMETERS, planDistrict } from '../utils/districtPlan';

/*
 * Stage 5: the District Planner. For district health officers and programme planners, so English only (the patient pages are
 * translated). Top: a what-if estimate using the optimiser's capacity formulas, recomputed as the inputs change. Bottom: the
 * scenarios the backend serves, each confirmed by simulating a working year in Simulink (DistrictScreening.slx).
 */

const CAMERAS = [
  { id: 'aptos', label: 'Validated cameras (APTOS)', sensitivity: 0.969, specificity: 0.883 },
  { id: 'idrid-cal', label: 'New camera, site-calibrated (IDRiD)', sensitivity: 0.891, specificity: 0.744 },
  { id: 'idrid-raw', label: 'New camera, not calibrated (IDRiD)', sensitivity: 0.906, specificity: 0.538 },
];
const PHOTO_FORMATS = [
  { id: 'jpeg', label: 'Camera JPEG (0.40 MB)', imageMB: 0.4 },
  { id: 'png', label: 'Lossless PNG (1.93 MB)', imageMB: 1.93 },
];
const UPLOAD_WINDOWS = [
  { id: '24', label: 'Store and forward, day and night', hours: 24 },
  { id: '7', label: 'Clinic hours only', hours: 7 },
];

const inr = (v) => `₹${Math.round(v).toLocaleString('en-IN')}`;
const pct = (v) => `${Math.round(100 * v)}%`;
const linkName = (mbps) => (mbps <= 0.1 ? '2G-grade' : mbps <= 0.5 ? '3G-grade' : '4G-grade');

function Choice({ label, options, value, onChange }) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            aria-pressed={value === o.id}
            onClick={() => onChange(o.id)}
            className={`rounded-xl border px-3 py-2 text-xs font-semibold transition cursor-pointer ${
              value === o.id ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-blue-300'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function Slider({ id, label, value, display, min, max, step, onChange, note }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</label>
        <span className="text-sm font-extrabold text-slate-900 tabular-nums">{display}</span>
      </div>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-blue-600" />
      {note && <p className="text-[11px] text-slate-500">{note}</p>}
    </div>
  );
}

function Resource({ icon: Icon, label, value, detail, busy }) {
  return (
    <div className={`${cardClass} p-4 space-y-2`}>
      <div className="flex items-center gap-2 text-slate-500">
        <Icon aria-hidden="true" />
        <span className="text-[11px] font-bold uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-3xl font-extrabold text-slate-900 tabular-nums">{value}</div>
      <p className="text-xs text-slate-500">{detail}</p>
      <div className="h-2 rounded-full bg-slate-100 overflow-hidden" title={`${pct(busy)} busy on an average day`}>
        <div className={`h-full rounded-full ${busy > 0.85 ? 'bg-rose-500' : busy > 0.6 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(100, 100 * busy)}%` }} />
      </div>
      <p className="text-[11px] font-semibold text-slate-500">{pct(busy)} busy on an average day</p>
    </div>
  );
}

const STAGE_LABELS = { capture: 'Capture', upload: 'Upload', ai: 'AI grading', review: 'Specialist review' };

/** Daily backlog over the simulated year, in days of work, with the stage's limit as a dashed line. */
function BacklogChart({ series, limit }) {
  const W = 320;
  const H = 64;
  const top = Math.max(limit * 1.25, ...series, 0.1);
  const x = (i) => (i / Math.max(series.length - 1, 1)) * W;
  const y = (v) => H - (v / top) * H;
  const path = series.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-16" role="img" aria-label={`Backlog over the year; worst ${Math.max(...series).toFixed(2)} days, limit ${limit} days`}>
      <line x1="0" x2={W} y1={y(limit)} y2={y(limit)} stroke="#e11d48" strokeDasharray="4 3" strokeWidth="1" />
      <path d={path} fill="none" stroke="#2563eb" strokeWidth="1.5" />
    </svg>
  );
}

function SimulinkResult({ result }) {
  return (
    <div className="space-y-4">
      <div className={`flex items-center gap-2 text-sm font-extrabold ${result.meetsTargets ? 'text-emerald-700' : 'text-rose-700'}`}>
        {result.meetsTargets ? <FiCheckCircle aria-hidden="true" /> : <FiAlertTriangle aria-hidden="true" />}
        {result.meetsTargets ? 'Meets every backlog target over the simulated year' : `Misses targets: ${result.reasons.join('; ')}`}
      </div>
      <p className="text-xs text-slate-600">
        {Math.round(result.patientsScreened).toLocaleString('en-IN')} patients screened and {Math.round(result.casesReviewed).toLocaleString('en-IN')} cases reviewed
        in {result.days} working days.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Object.entries(STAGE_LABELS).map(([key, label]) => {
          const st = result.stages?.[key];
          if (!st) return null;
          return (
            <div key={key} className="rounded-2xl border border-slate-200 p-3">
              <div className="flex justify-between text-xs">
                <span className="font-bold text-slate-800">{label}</span>
                <span className="text-slate-500">
                  {pct(st.utilisation)} busy · worst backlog {st.worstBacklogDays.toFixed(2)} d (limit {st.limitDays} d)
                </span>
              </div>
              <BacklogChart series={st.backlogDays} limit={st.limitDays} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function DistrictPlannerPage({ onBack }) {
  const [patients, setPatients] = useState(100000);
  const [camera, setCamera] = useState('aptos');
  const [reviewSeconds, setReviewSeconds] = useState(30);
  const [format, setFormat] = useState('jpeg');
  const [uploadWindow, setUploadWindow] = useState('24');
  const [retake, setRetake] = useState(0.1);
  const [prevalence, setPrevalence] = useState(0.1);
  const [simulated, setSimulated] = useState({ status: 'loading', plans: [] });

  useEffect(() => {
    let live = true;
    fetchSimulation()
      .then((d) => live && setSimulated({ status: 'ready', plans: d.plans || [], created: d.created }))
      .catch((e) => live && setSimulated({ status: 'error', plans: [], message: e.message }));
    return () => {
      live = false;
    };
  }, []);

  const cam = CAMERAS.find((c) => c.id === camera);
  const params = useMemo(
    () => ({
      ...BASE_PARAMETERS,
      patientsPerYear: patients,
      sensitivity: cam.sensitivity,
      specificity: cam.specificity,
      reviewSecondsPerCase: reviewSeconds,
      imageMB: PHOTO_FORMATS.find((f) => f.id === format).imageMB,
      uploadHoursPerDay: UPLOAD_WINDOWS.find((w) => w.id === uploadWindow).hours,
      retakeRate: retake,
      referablePrevalence: prevalence,
    }),
    [patients, cam, reviewSeconds, format, uploadWindow, retake, prevalence],
  );
  const plan = useMemo(() => planDistrict(params), [params]);
  // Simulink run of the current plan; kept only while the inputs it was run for are unchanged
  const [sim, setSim] = useState({ key: null, status: 'idle' });
  const scenarioKey = JSON.stringify([params, plan?.resources]);
  const simView = sim.key === scenarioKey ? sim : { status: 'idle' };
  const confirmInSimulink = async () => {
    const key = scenarioKey;
    setSim({ key, status: 'running' });
    const overrides = {
      patientsPerYear: params.patientsPerYear,
      sensitivity: params.sensitivity,
      specificity: params.specificity,
      reviewSecondsPerCase: params.reviewSecondsPerCase,
      imageMB: params.imageMB,
      uploadHoursPerDay: params.uploadHoursPerDay,
      retakeRate: params.retakeRate,
      referablePrevalence: params.referablePrevalence,
    };
    try {
      const result = await runSimulation({ overrides, resources: plan.resources });
      setSim({ key, status: 'done', result });
    } catch (e) {
      setSim({ key, status: 'error', error: e.message });
    }
  };
  // The same district reviewed without the annotated report, to show what the 30-second report saves
  const without = useMemo(() => planDistrict({ ...params, reviewSecondsPerCase: 120 }), [params]);

  return (
    <div className="min-h-screen bg-[#eef1f6] text-slate-800 font-sans antialiased">
      <HeroBand className="pb-28 sm:pb-32">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <header data-tour="district" className="flex items-center justify-between gap-4 py-5">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white shadow-lg shadow-black/20 shrink-0">
                <Logo className="w-8 h-6" />
              </div>
              <span className="text-lg font-extrabold tracking-tight text-white">District Planner</span>
            </div>
            <button type="button" onClick={onBack} className="flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold text-white hover:bg-white/20 cursor-pointer">
              <FiArrowLeft aria-hidden="true" /> Back
            </button>
          </header>
          <div className="pt-4 sm:pt-6 max-w-3xl">
            <span className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-amber-400/90">Stage 5 · Simulink resource model</span>
            <h1 className="mt-2 text-3xl sm:text-4xl font-bold tracking-tight text-white">What does a district need to screen every diabetic?</h1>
            <p className="mt-2 text-sm text-slate-300">
              Change the district and see the cheapest mix of camera sites, bandwidth, AI servers and specialist reviewers. The AI&apos;s own measured
              accuracy and speed feed the model.
            </p>
          </div>
        </div>
      </HeroBand>

      <main className="relative -mt-20 sm:-mt-24 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pb-12 grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-6">
        <section className={`${cardClass} p-5 space-y-5 self-start`} aria-label="District inputs">
          <Slider id="patients" label="Patients per year" value={patients} display={patients.toLocaleString('en-IN')} min={25000} max={400000} step={5000} onChange={setPatients} />
          <Choice label="Camera and calibration" options={CAMERAS} value={camera} onChange={setCamera} />
          <p className="-mt-3 text-[11px] text-slate-500">
            Referable DR: sensitivity {pct(cam.sensitivity)}, specificity {pct(cam.specificity)} (measured, validation/REPORT.md)
          </p>
          <Slider
            id="review"
            label="Specialist review per case"
            value={reviewSeconds}
            display={`${reviewSeconds} s`}
            min={15}
            max={180}
            step={5}
            onChange={setReviewSeconds}
            note="30 s with the annotated report (Grad-CAM, lesion evidence, calibrated confidence)"
          />
          <Choice label="Photo format" options={PHOTO_FORMATS} value={format} onChange={setFormat} />
          <Choice label="Upload window" options={UPLOAD_WINDOWS} value={uploadWindow} onChange={setUploadWindow} />
          <Slider id="retake" label="Patients needing a retake" value={retake} display={pct(retake)} min={0} max={0.4} step={0.01} onChange={setRetake} />
          <Slider id="prevalence" label="Referable DR prevalence" value={prevalence} display={pct(prevalence)} min={0.02} max={0.3} step={0.01} onChange={setPrevalence} />
        </section>

        <div className="space-y-6 min-w-0">
          {plan ? (
            <>
              <section aria-label="Plan" className="grid grid-cols-2 xl:grid-cols-4 gap-4">
                <Resource icon={FiCamera} label="Camera sites" value={plan.resources.cameraSites} detail={`${Math.round(plan.patientsPerDay)} patients per working day`} busy={plan.utilisation.capture} />
                <Resource
                  icon={FiWifi}
                  label="Uplink per centre"
                  value={`${plan.resources.uplinkMbps} Mbps`}
                  detail={`${linkName(plan.resources.uplinkMbps)}; ${Math.round(plan.uploadSecondsPerPatient)} s per patient; ${(plan.uploadMBPerDay / 1000).toFixed(2)} GB/day`}
                  busy={plan.utilisation.upload}
                />
                <Resource icon={FiCpu} label="AI servers (GPU)" value={plan.resources.aiServers} detail={`${BASE_PARAMETERS.aiSecondsPerPatient} s per patient, measured`} busy={plan.utilisation.ai} />
                <Resource icon={FiUserCheck} label="Specialist reviewers" value={plan.resources.reviewers} detail={`${Math.round(plan.reviewCasesPerDay)} flagged cases per day`} busy={plan.utilisation.review} />
              </section>

              <section className={`${cardClass} p-5 grid grid-cols-1 md:grid-cols-3 gap-5`} aria-label="Summary">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Cost per patient screened</p>
                  <p className="text-3xl font-extrabold text-slate-900">{inr(plan.costPerPatient)}</p>
                  <p className="text-xs text-slate-500">{inr(plan.cost)} a year (assumed prices)</p>
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">What limits the district</p>
                  <p className="text-xl font-extrabold text-slate-900 capitalize">{plan.binding}</p>
                  <p className="text-xs text-slate-500">{pct(plan.reviewFraction)} of patients go to a specialist</p>
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">The 30-second report saves</p>
                  <p className="text-xl font-extrabold text-emerald-700">
                    {without ? `${Math.round((plan.reviewCasesPerDay * (120 - reviewSeconds)) / 3600)} specialist hours a day` : '—'}
                  </p>
                  <p className="text-xs text-slate-500">
                    vs {without ? `${without.resources.reviewers} reviewer(s)` : 'no feasible plan'} at 120 s per case without it
                  </p>
                </div>
              </section>
              <section className={`${cardClass} p-5 space-y-4`} aria-label="Simulink check">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-extrabold text-slate-900">Check this plan in Simulink</h2>
                    <p className="text-xs text-slate-500">Runs a working year of DistrictScreening.slx with day-to-day variation in arrivals.</p>
                  </div>
                  <button
                    type="button"
                    onClick={confirmInSimulink}
                    disabled={simView.status === 'running'}
                    className="rounded-2xl bg-gradient-to-r from-[#0d1424] to-[#1e293b] px-5 py-3 text-xs font-bold uppercase tracking-wider text-white shadow-lg disabled:opacity-50 cursor-pointer"
                  >
                    {simView.status === 'running' ? 'Simulating a year…' : 'Confirm in Simulink'}
                  </button>
                </div>
                {simView.status === 'done' && <SimulinkResult result={simView.result} />}
                {simView.status === 'error' && <p className="text-sm text-rose-700">{simView.error}</p>}
              </section>
              <p className="text-[11px] text-slate-500">
                Quick estimate with the optimiser&apos;s capacity formulas (a busy day = 95th percentile of arrivals). Costs, capture time, link quality and
                reviewer hours are assumptions (stage5_simulink/districtParameters.m); AI speed and accuracy are measured.
              </p>
            </>
          ) : (
            <section className={`${cardClass} p-5 flex items-center gap-3 text-rose-700`}>
              <FiAlertTriangle aria-hidden="true" /> No plan within the options searched (up to 60 camera sites, 10 reviewers). Reduce the load or add options.
            </section>
          )}

          <section className={`${cardClass} p-5 space-y-3 overflow-x-auto`} aria-label="Simulated scenarios">
            <div>
              <h2 className="text-lg font-extrabold text-slate-900">Scenarios confirmed in Simulink</h2>
              <p className="text-xs text-slate-500">
                Each plan was simulated for a working year in DistrictScreening.slx (capture → upload → AI → specialist review queues, day by day) and meets every
                backlog target{simulated.created ? ` · run ${simulated.created}` : ''}.
              </p>
            </div>
            {simulated.status === 'loading' && <p className="text-sm text-slate-500">Loading…</p>}
            {simulated.status === 'error' && <p className="text-sm text-rose-700">{simulated.message}</p>}
            {simulated.plans.length > 0 && (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-500 border-b border-slate-200">
                    <th className="py-2 pr-3 font-bold">Scenario</th>
                    <th className="py-2 pr-3 font-bold">Sites</th>
                    <th className="py-2 pr-3 font-bold">Uplink</th>
                    <th className="py-2 pr-3 font-bold">GPU</th>
                    <th className="py-2 pr-3 font-bold">Reviewers</th>
                    <th className="py-2 pr-3 font-bold">₹/patient</th>
                    <th className="py-2 pr-3 font-bold">Review load</th>
                    <th className="py-2 font-bold">Targets</th>
                  </tr>
                </thead>
                <tbody>
                  {simulated.plans.map((p) => (
                    <tr key={p.scenario} className="border-b border-slate-100 align-top">
                      <td className="py-2 pr-3 font-semibold text-slate-800">{p.scenario}</td>
                      <td className="py-2 pr-3 tabular-nums">{p.resources?.cameraSites ?? '—'}</td>
                      <td className="py-2 pr-3 tabular-nums">{p.resources ? `${p.resources.uplinkMbps} Mbps` : '—'}</td>
                      <td className="py-2 pr-3 tabular-nums">{p.resources?.aiServers ?? '—'}</td>
                      <td className="py-2 pr-3 tabular-nums">{p.resources?.reviewers ?? '—'}</td>
                      <td className="py-2 pr-3 tabular-nums">{Number.isFinite(p.costPerPatient) ? Math.round(p.costPerPatient) : '—'}</td>
                      <td className="py-2 pr-3 tabular-nums">{p.utilisation ? `${pct(p.utilisation.review)} · ${Math.round(p.reviewCasesPerDay)}/day` : '—'}</td>
                      <td className="py-2">
                        {p.meetsTargets ? (
                          <FiCheckCircle className="text-emerald-600" aria-label="meets targets" />
                        ) : (
                          <FiAlertTriangle className="text-rose-600" aria-label="misses targets" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
