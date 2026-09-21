import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

vi.mock('../api/ml', () => ({
  checkQuality: vi.fn(),
  segmentLesions: vi.fn(),
  assessEyes: vi.fn(),
  fetchHeatmap: vi.fn(),
  translateText: vi.fn(),
}));

import { checkQuality, segmentLesions, assessEyes } from '../api/ml';
import { useEyeScan } from './useEyeScan';
import { useScanSession } from './useScanSession';
import { useTranslatedText } from './useTranslatedText';
import { translateText } from '../api/ml';

const image = (name) => new File(['x'], name, { type: 'image/png' });
const deferred = () => {
  let resolve;
  const promise = new Promise((res) => {
    resolve = res;
  });
  return { promise, resolve };
};

beforeEach(() => {
  checkQuality.mockResolvedValue({ verdict: 'accept', reason: 'ok' });
  segmentLesions.mockResolvedValue({ maskUrl: 'data:mask', counts: { microaneurysms: 1, hemorrhages: 0, exudates: 2 } });
});

describe('useEyeScan', () => {
  it('runs quality, and (only when the experimental overlay is enabled) lesion mapping', async () => {
    const { result } = renderHook(() => useEyeScan({ lesionOverlay: true }));
    await act(() => result.current.upload(image('a.png')));
    expect(result.current.quality.status).toBe('accepted');
    expect(result.current.mask).toMatchObject({ status: 'success', url: 'data:mask' });
  });

  it('does not call the lesion overlay at all by default', async () => {
    const { result } = renderHook(() => useEyeScan());
    await act(() => result.current.upload(image('a.png')));
    expect(result.current.quality.status).toBe('accepted');
    expect(segmentLesions).not.toHaveBeenCalled();
    expect(result.current.mask.status).toBe('idle');
  });

  it('does not map lesions for a rejected image', async () => {
    checkQuality.mockResolvedValue({ verdict: 'reject', reason: 'blurry' });
    const { result } = renderHook(() => useEyeScan());
    await act(() => result.current.upload(image('a.png')));
    expect(result.current.quality).toMatchObject({ status: 'rejected', reason: 'blurry' });
    expect(segmentLesions).not.toHaveBeenCalled();
  });

  it('blocks (does not accept) an image when the quality service fails', async () => {
    checkQuality.mockRejectedValue(new Error('server down'));
    const { result } = renderHook(() => useEyeScan());
    await act(() => result.current.upload(image('a.png')));
    expect(result.current.quality.status).toBe('error');
    expect(segmentLesions).not.toHaveBeenCalled();
  });

  it('ignores a slow response from an earlier upload', async () => {
    const slow = deferred();
    checkQuality.mockReturnValueOnce(slow.promise).mockResolvedValue({ verdict: 'accept', reason: 'ok' });
    const { result } = renderHook(() => useEyeScan());

    let first;
    act(() => {
      first = result.current.upload(image('first.png'));
    });
    await act(() => result.current.upload(image('second.png')));
    expect(result.current.file.name).toBe('second.png');
    expect(result.current.quality.status).toBe('accepted');

    await act(async () => {
      slow.resolve({ verdict: 'reject', reason: 'stale' });
      await first;
    });
    expect(result.current.file.name).toBe('second.png');
    expect(result.current.quality.status).toBe('accepted'); // the stale reject was discarded
  });

  it('rejects non-image files without calling the backend', async () => {
    const { result } = renderHook(() => useEyeScan());
    await act(() => result.current.upload(new File(['x'], 'a.txt', { type: 'text/plain' })));
    expect(result.current.quality.status).toBe('error');
    expect(checkQuality).not.toHaveBeenCalled();
  });
});

describe('useScanSession', () => {
  async function ready() {
    const hook = renderHook(() => useScanSession());
    await act(() => hook.result.current.left.upload(image('l.png')));
    await act(() => hook.result.current.right.upload(image('r.png')));
    return hook;
  }

  it('cannot run until both eyes pass quality', async () => {
    const { result } = renderHook(() => useScanSession());
    expect(result.current.canRun).toBe(false);
    await act(() => result.current.left.upload(image('l.png')));
    expect(result.current.canRun).toBe(false);
  });

  it('stores the real backend result', async () => {
    assessEyes.mockResolvedValue({ overallRisk: 'Mild', leftGrade: 'Stage 1 - Mild', rightGrade: 'Stage 0 - Clear' });
    const { result } = await ready();
    expect(result.current.canRun).toBe(true);
    await act(() => result.current.runAssessment());
    expect(result.current.assessment.overallRisk).toBe('Mild');
  });

  it('never invents a result when the backend fails', async () => {
    assessEyes.mockRejectedValue(new Error('MATLAB Engine is unavailable'));
    const { result } = await ready();
    await act(() => result.current.runAssessment());
    expect(result.current.assessment).toBeNull();
    expect(result.current.error).toMatch(/MATLAB/);
    expect(result.current.running).toBe(false);
  });

  it('discards a stale result when a photo is replaced', async () => {
    assessEyes.mockResolvedValue({ overallRisk: 'Severe', leftGrade: 'Stage 3 - Severe', rightGrade: 'Stage 0 - Clear' });
    const { result } = await ready();
    await act(() => result.current.runAssessment());
    expect(result.current.assessment).not.toBeNull();
    await act(() => result.current.left.upload(image('l2.png')));
    await waitFor(() => expect(result.current.assessment).toBeNull());
  });
});


describe('useTranslatedText', () => {
  it('reports translated=false in English and while a translation is pending or has failed', async () => {
    translateText.mockRejectedValue(new Error('down'));
    const en = renderHook(() => useTranslatedText('Hello', 'en'));
    expect(en.result.current).toEqual({ text: 'Hello', translated: false });
    const hi = renderHook(() => useTranslatedText('Hello', 'hi'));
    expect(hi.result.current).toEqual({ text: 'Hello', translated: false });   // pending
    await waitFor(() => expect(translateText).toHaveBeenCalled());
    expect(hi.result.current.translated).toBe(false);                            // failed: original text, no false notice
  });

  it('reports translated=true only once a real translation is showing', async () => {
    translateText.mockResolvedValue('नमस्ते');
    const { result } = renderHook(() => useTranslatedText('Hello', 'hi'));
    await waitFor(() => expect(result.current.translated).toBe(true));
    expect(result.current.text).toBe('नमस्ते');
  });
});
