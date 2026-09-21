import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('../api/ml', async (importOriginal) => ({ ...(await importOriginal()), translateText: vi.fn() }));

import { translateText } from '../api/ml';
import { useTranslatedText } from './useTranslatedText';

beforeEach(() => translateText.mockReset());

describe('useTranslatedText', () => {
  it('shows a translation, and says it is a translation, when the server translated', async () => {
    translateText.mockResolvedValue('अनुवाद');
    const { result } = renderHook(() => useTranslatedText('Some text.', 'hi'));
    await waitFor(() => expect(result.current.translated).toBe(true));
    expect(result.current.text).toBe('अनुवाद');
  });

  it('does NOT claim the text is machine-translated when the server hands the original back (Kannada has no translation model)', async () => {
    translateText.mockImplementation(async (text) => text);
    const { result } = renderHook(() => useTranslatedText('Some text.', 'kn'));
    await waitFor(() => expect(translateText).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(result.current.translated).toBe(false);
    expect(result.current.text).toBe('Some text.');
  });

  it('never calls the server for English', () => {
    const { result } = renderHook(() => useTranslatedText('Some text.', 'en'));
    expect(translateText).not.toHaveBeenCalled();
    expect(result.current).toEqual({ text: 'Some text.', translated: false });
  });
});
