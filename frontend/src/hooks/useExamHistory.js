import { useCallback, useEffect, useState } from 'react';
import { deleteExam, listExams } from '../api/patient';

/**
 * The user's saved exams, newest first. Reloads whenever `refreshKey` changes (pass the latest assessment:
 * the ML backend saves each result before replying, so a refetch right after picks it up).
 */
const REPORT_WAIT_MS = 3 * 60 * 1000;
const REPORT_POLL_MS = 6000;

export function useExamHistory(refreshKey) {
  const [state, setState] = useState({ status: 'loading', exams: [] });

  const load = useCallback(() => {
    let cancelled = false;
    listExams()
      .then(({ exams }) => {
        if (!cancelled) setState({ status: 'ready', exams, fetchedAt: Date.now() });
      })
      .catch(() => {
        if (!cancelled) setState((s) => ({ ...s, status: 'error' }));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => load(), [load, refreshKey]);

  // The detailed PDF of a new exam is built after the result is returned; refresh until it is there.
  const newest = state.exams[0];
  const waitingForReport = Boolean(newest && !newest.hasReport && state.fetchedAt - newest.createdAt < REPORT_WAIT_MS);
  useEffect(() => {
    if (!waitingForReport) return undefined;
    const timer = setTimeout(load, REPORT_POLL_MS);
    return () => clearTimeout(timer);
  }, [waitingForReport, state.exams, load]);

  const remove = useCallback(async (id) => {
    await deleteExam(id);
    setState((s) => ({ ...s, exams: s.exams.filter((e) => e.id !== id) }));
  }, []);

  const clear = useCallback(() => setState({ status: 'ready', exams: [] }), []);

  return { status: state.status, exams: state.exams, remove, clear, reportPendingFor: waitingForReport ? newest.id : null };
}
