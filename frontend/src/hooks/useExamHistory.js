import { useCallback, useEffect, useState } from 'react';
import { deleteExam, listExams } from '../api/patient';

/**
 * The user's saved exams, newest first. Reloads whenever `refreshKey` changes (pass the latest assessment:
 * the ML backend saves each result before replying, so a refetch right after picks it up).
 */
export function useExamHistory(refreshKey) {
  const [state, setState] = useState({ status: 'loading', exams: [] });

  const load = useCallback(() => {
    let cancelled = false;
    listExams()
      .then(({ exams }) => {
        if (!cancelled) setState({ status: 'ready', exams });
      })
      .catch(() => {
        if (!cancelled) setState((s) => ({ ...s, status: 'error' }));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => load(), [load, refreshKey]);

  const remove = useCallback(async (id) => {
    await deleteExam(id);
    setState((s) => ({ ...s, exams: s.exams.filter((e) => e.id !== id) }));
  }, []);

  const clear = useCallback(() => setState({ status: 'ready', exams: [] }), []);

  return { status: state.status, exams: state.exams, remove, clear };
}
