/**
 * The specialist's own review log for the 30-second review page: decision and time taken per case, kept in this browser only
 * (a pilot would store it on the server with the exam). It lets a reviewer see how long review with the annotated report
 * really takes, which is the problem statement's target (under 30 s) and a Stage 5 input (reviewSecondsPerCase).
 */
const KEY = 'retina_rescue_review_log';
const MAX_ENTRIES = 500;

export const DECISIONS = {
  agreeRefer: { label: 'Agree: refer', agrees: true, refer: true },
  agreeRoutine: { label: 'Agree: routine rescreen', agrees: true, refer: false },
  overrideRefer: { label: 'Override: refer', agrees: false, refer: true },
  overrideRoutine: { label: 'Override: routine rescreen', agrees: false, refer: false },
  recapture: { label: 'Ungradable: recapture', agrees: false, refer: null },
};

export function readLog(storage = globalThis.localStorage) {
  try {
    const entries = JSON.parse(storage?.getItem(KEY) || '[]');
    return Array.isArray(entries) ? entries : [];
  } catch {
    return [];
  }
}

export function appendLog(entry, storage = globalThis.localStorage) {
  const entries = [...readLog(storage), entry].slice(-MAX_ENTRIES);
  try {
    storage?.setItem(KEY, JSON.stringify(entries));
  } catch {
    /* storage unavailable (private window): the review still counts for this page */
  }
  return entries;
}

export function clearLog(storage = globalThis.localStorage) {
  try {
    storage?.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
}

/** Count, median seconds, share within 30 s and share agreeing with the AI. */
export function summarise(entries) {
  if (!entries.length) return { count: 0, medianSeconds: null, within30: null, agreement: null };
  const secs = entries.map((e) => e.seconds).sort((a, b) => a - b);
  const mid = Math.floor(secs.length / 2);
  const median = secs.length % 2 ? secs[mid] : (secs[mid - 1] + secs[mid]) / 2;
  return {
    count: entries.length,
    medianSeconds: median,
    within30: secs.filter((s) => s <= 30).length / secs.length,
    agreement: entries.filter((e) => DECISIONS[e.decision]?.agrees).length / entries.length,
  };
}
