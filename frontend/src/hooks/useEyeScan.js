import { useCallback, useEffect, useRef, useState } from 'react';
import { checkQuality, segmentLesions } from '../api/ml';
import { MAX_UPLOAD_MB } from '../config';

const initialState = {
  file: null,
  imageUrl: null,
  viewMode: 'original',
  // status: idle | checking | accepted | rejected | error
  quality: { status: 'idle', verdict: null, reason: '' },
  // status: idle | loading | success | error
  mask: { status: 'idle', url: null, counts: null, error: '' },
};

/**
 * State + pipeline for one eye's photo: upload -> Stage 1 quality -> Stage 2 lesion mask.
 * Every async step is tied to the upload that started it, so a slow response for an
 * earlier photo can never overwrite the state of a newer one.
 */
export function useEyeScan() {
  const [scan, setScan] = useState(initialState);
  const requestId = useRef(0);
  const objectUrl = useRef(null);

  useEffect(
    () => () => {
      requestId.current += 1; // ignore anything still in flight
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    },
    [],
  );

  const upload = useCallback(async (file) => {
    const id = (requestId.current += 1);
    const isCurrent = () => id === requestId.current;

    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = null;

    if (!file.type.startsWith('image/')) {
      setScan({ ...initialState, quality: { status: 'error', verdict: null, reason: 'Please choose an image file (JPEG or PNG).' } });
      return;
    }
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
      setScan({ ...initialState, quality: { status: 'error', verdict: null, reason: `Image is larger than ${MAX_UPLOAD_MB} MB.` } });
      return;
    }

    const imageUrl = URL.createObjectURL(file);
    objectUrl.current = imageUrl;
    setScan({ ...initialState, file, imageUrl, quality: { status: 'checking', verdict: null, reason: '' } });

    // Stage 1 - quality. A failed check blocks the image: we never assume it was fine.
    try {
      const q = await checkQuality(file);
      if (!isCurrent()) return;
      if (q.verdict === 'reject') {
        setScan((s) => ({ ...s, quality: { status: 'rejected', verdict: 'reject', reason: q.reason } }));
        return;
      }
      setScan((s) => ({
        ...s,
        quality: { status: 'accepted', verdict: q.verdict, reason: q.reason },
        mask: { ...initialState.mask, status: 'loading' },
      }));
    } catch (err) {
      if (isCurrent()) setScan((s) => ({ ...s, quality: { status: 'error', verdict: null, reason: err.message } }));
      return;
    }

    // Stage 2 - lesion candidates.
    try {
      const seg = await segmentLesions(file);
      if (isCurrent()) setScan((s) => ({ ...s, mask: { status: 'success', url: seg.maskUrl, counts: seg.counts, error: '' } }));
    } catch (err) {
      if (isCurrent()) setScan((s) => ({ ...s, mask: { status: 'error', url: null, counts: null, error: err.message } }));
    }
  }, []);

  const setViewMode = useCallback((viewMode) => setScan((s) => ({ ...s, viewMode })), []);

  return { ...scan, upload, setViewMode };
}
