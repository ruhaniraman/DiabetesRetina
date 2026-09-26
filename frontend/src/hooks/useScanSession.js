import { useCallback, useRef, useState } from 'react';
import { assessEyes } from '../api/ml';
import { compressImage } from '../utils/compressImage';
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
  // Low-bandwidth mode: photos are compressed in the browser before upload; transfer[eye] = { originalBytes, sentBytes, compressed }
  const [lowBandwidth, setLowBandwidth] = useState(false);
  const [transfer, setTransfer] = useState({ left: null, right: null });

  // A new photo invalidates any existing result and any assessment still in flight.
  const invalidate = useCallback(() => {
    runId.current += 1;
    setAssessment(null);
    setError('');
    setRunning(false);
  }, []);

  const { upload: uploadLeftRaw } = left;
  const { upload: uploadRightRaw } = right;
  const prepare = useCallback(
    async (eye, file) => {
      if (!lowBandwidth || !file.type.startsWith('image/')) {
        setTransfer((t) => ({ ...t, [eye]: { originalBytes: file.size, sentBytes: file.size, compressed: false } }));
        return file;
      }
      const out = await compressImage(file);
      setTransfer((t) => ({ ...t, [eye]: { originalBytes: out.originalBytes, sentBytes: out.sentBytes, compressed: out.compressed } }));
      return out.file;
    },
    [lowBandwidth],
  );
  const uploadLeft = useCallback(async (file) => { invalidate(); return uploadLeftRaw(await prepare('left', file)); }, [invalidate, uploadLeftRaw, prepare]);
  const uploadRight = useCallback(async (file) => { invalidate(); return uploadRightRaw(await prepare('right', file)); }, [invalidate, uploadRightRaw, prepare]);

  const canRun = left.quality.status === 'accepted' && right.quality.status === 'accepted' && !running;

  const runAssessment = async (patient) => {
    if (!canRun) return;
    const id = (runId.current += 1);
    setRunning(true);
    setError('');
    setAssessment(null);
    try {
      const result = await assessEyes(left.file, right.file, patient);
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
    lowBandwidth,
    setLowBandwidth,
    transfer,
  };
}
