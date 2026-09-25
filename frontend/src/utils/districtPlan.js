/**
 * District screening planner (Stage 5): the capacity formulas of stage5_simulink/optimiseDistrictResources.m, ported so the
 * District Planner page can answer "what if" questions instantly. The scenarios the backend serves (/api/simulation) were each
 * confirmed by simulating a year in DistrictScreening.slx; this quick estimate is not simulated, and the page says so.
 */

// districtParameters.m (keep in step). MEASURED values come from validation; the rest are ASSUMED placeholders for a district.
export const BASE_PARAMETERS = {
  patientsPerYear: 100000,
  workingDaysPerYear: 250,
  dailyVariation: 0.15,
  captureMinutesPerPatient: 6,
  cameraHoursPerDay: 7,
  retakeRate: 0.1,
  retakeMinutes: 3,
  imagesPerPatient: 2,
  imageMB: 0.4, // MEASURED: median camera JPEG (IDRiD)
  protocolOverhead: 1.1,
  usableLinkFraction: 0.6,
  uploadHoursPerDay: 24,
  aiSecondsPerPatient: 4.5, // MEASURED: measureAiSeconds.m, RTX 3050
  aiHoursPerDay: 24,
  aiUtilisationTarget: 0.7,
  referablePrevalence: 0.1,
  sensitivity: 0.969, // MEASURED: validation/REPORT.md
  specificity: 0.883, // MEASURED: validation/REPORT.md
  reviewSecondsPerCase: 30,
  reviewAllUngradable: true,
  ungradableAfterRetake: 0.02,
  reviewerHoursPerDay: 4,
  reviewTurnaroundDays: 2,
  cost: { cameraSite: 450000, uplinkPerMbps: 12000, aiServer: 250000, reviewer: 900000 },
  options: {
    cameraSites: { min: 5, max: 60 },
    uplinkMbps: [0.1, 0.25, 0.5, 1, 2, 5],
    aiServers: [1, 2, 3, 4],
    reviewers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  },
};

/** Daily capacities of one resource mix (optimiseDistrictResources.m, probe). */
export function capacities(p, r) {
  const calendarPerWorking = 365 / p.workingDaysPerYear;
  return {
    capture: (r.cameraSites * p.cameraHoursPerDay * 60) / (p.captureMinutesPerPatient + p.retakeRate * p.retakeMinutes),
    mbPerPatient: p.imagesPerPatient * p.imageMB * (1 + p.retakeRate) * p.protocolOverhead,
    uploadMB: ((r.cameraSites * r.uplinkMbps * p.usableLinkFraction) / 8) * 3600 * p.uploadHoursPerDay * calendarPerWorking,
    ai: ((r.aiServers * p.aiHoursPerDay * 3600 * p.aiUtilisationTarget) / p.aiSecondsPerPatient) * calendarPerWorking,
    reviewFraction:
      p.referablePrevalence * p.sensitivity +
      (1 - p.referablePrevalence) * (1 - p.specificity) +
      (p.reviewAllUngradable ? p.ungradableAfterRetake : 0),
    review: (r.reviewers * p.reviewerHoursPerDay * 3600) / p.reviewSecondsPerCase,
  };
}

export const annualCost = (p, r) =>
  r.cameraSites * (p.cost.cameraSite + r.uplinkMbps * p.cost.uplinkPerMbps) + r.aiServers * p.cost.aiServer + r.reviewers * p.cost.reviewer;

const firstThat = (options, ok) => options.find(ok) ?? null;

/**
 * Cheapest resource mix whose capacity covers a busy day (95th percentile of daily arrivals), as optimiseDistrictResources.m
 * searches it before simulating. Returns null when no option in p.options is enough.
 */
export function planDistrict(p) {
  const busy = (p.patientsPerYear / p.workingDaysPerYear) * (1 + 1.645 * p.dailyVariation);
  const one = { cameraSites: 1, uplinkMbps: 1, aiServers: 1, reviewers: 1 };
  const d1 = capacities(p, one);
  const minCams = Math.max(p.options.cameraSites.min, Math.ceil(busy / d1.capture));
  let best = null;
  let bestCost = Infinity;
  for (let cams = minCams; cams <= Math.min(minCams + 10, p.options.cameraSites.max); cams += 1) {
    const r = { ...one, cameraSites: cams };
    r.uplinkMbps = firstThat(p.options.uplinkMbps, (m) => capacities(p, { ...r, uplinkMbps: m }).uploadMB >= busy * d1.mbPerPatient);
    r.aiServers = firstThat(p.options.aiServers, (n) => capacities(p, { ...r, aiServers: n }).ai >= busy);
    r.reviewers = firstThat(
      p.options.reviewers,
      (n) => capacities(p, { ...r, reviewers: n }).review * p.reviewTurnaroundDays >= busy * d1.reviewFraction,
    );
    if (r.uplinkMbps == null || r.aiServers == null || r.reviewers == null) continue;
    const c = annualCost(p, r);
    if (c < bestCost) {
      best = r;
      bestCost = c;
    }
  }
  if (!best) return null;

  const mean = p.patientsPerYear / p.workingDaysPerYear;
  const cap = capacities(p, best);
  const reviewCases = mean * cap.reviewFraction;
  const utilisation = {
    capture: mean / cap.capture,
    upload: (mean * cap.mbPerPatient) / cap.uploadMB,
    ai: mean / (cap.ai / p.aiUtilisationTarget),
    review: reviewCases / cap.review,
  };
  const names = { capture: 'camera sites', upload: 'uplink', ai: 'AI servers', review: 'reviewers' };
  const binding = Object.entries(utilisation).sort((a, b) => b[1] - a[1])[0][0];
  return {
    resources: best,
    cost: bestCost,
    costPerPatient: bestCost / p.patientsPerYear,
    utilisation,
    binding: names[binding],
    patientsPerDay: mean,
    reviewCasesPerDay: reviewCases,
    reviewFraction: cap.reviewFraction,
    uploadMBPerDay: mean * cap.mbPerPatient,
    // time to send one patient's photos over the chosen link (both eyes), in seconds
    uploadSecondsPerPatient: (cap.mbPerPatient * 8) / (best.uplinkMbps * p.usableLinkFraction),
  };
}
