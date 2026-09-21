import { useCallback, useRef, useState } from 'react';
import { assessEyes } from '../api/ml';
import { useEyeScan } from './useEyeScan';

/**
 * Both eyes plus the Stage 3 assessment. Lives above the routes so uploads and results
 * survive navigating to the report and back.
 *
 * `assessment` is only ever the real backend result (or null). There is deliberately no
 * fallback result: if the backend fails, `error` is set and nothing is graded.
 */
export function useScanSession() {
  const left = useEyeScan();
  const right = useEyeScan();
  const [assessment, setAssessment] = useState(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const runId = useRef(0);

  // A new photo invalidates any existing result and any assessment still in flight.
  const invalidate = useCallback(() => {
    runId.current += 1;
    setAssessment(null);
    setError('');
    setRunning(false);
  }, []);

  const { upload: uploadLeftRaw } = left;
  const { upload: uploadRightRaw } = right;
  const uploadLeft = useCallback((file) => { invalidate(); return uploadLeftRaw(file); }, [invalidate, uploadLeftRaw]);
  const uploadRight = useCallback((file) => { invalidate(); return uploadRightRaw(file); }, [invalidate, uploadRightRaw]);

  const canRun = left.quality.status === 'accepted' && right.quality.status === 'accepted' && !running;

  const runAssessment = async () => {
    if (!canRun) return;
    const id = (runId.current += 1);
    setRunning(true);
    setError('');
    setAssessment(null);
    try {
      const result = await assessEyes(left.file, right.file);
      if (id === runId.current) setAssessment(result);
    } catch (err) {
      if (id === runId.current) setError(err.message);
    } finally {
      if (id === runId.current) setRunning(false);
    }
  };

  return {
    left: { ...left, upload: uploadLeft },
    right: { ...right, upload: uploadRight },
    assessment,
    running,
    error,
    canRun,
    runAssessment,
  };
}
