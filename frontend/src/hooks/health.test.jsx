import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

vi.mock('../api/patient', () => ({
  getProfile: vi.fn(),
  saveProfile: vi.fn(),
  listExams: vi.fn(),
  deleteExam: vi.fn(),
  deleteAllHealthData: vi.fn(),
}));

import { getProfile, saveProfile, listExams, deleteExam, deleteAllHealthData } from '../api/patient';
import { usePatientProfile } from './usePatientProfile';
import { useExamHistory } from './useExamHistory';

const user = { id: 1, fullName: 'Signed In Name' };
const saved = { fullName: 'Jane', dob: '1972-05-12', gender: 'Female', bloodGroup: 'A+', diabetesDuration: '12', systolicBP: '138', diastolicBP: '88', hba1c: '7.8', fastingSugar: '140' };

beforeEach(() => {
  getProfile.mockResolvedValue({ profile: null });
  listExams.mockResolvedValue({ exams: [] });
});

describe('usePatientProfile', () => {
  it('starts blank (with the account name) when nothing is saved', async () => {
    const { result } = renderHook(() => usePatientProfile(user));
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.patient.fullName).toBe('Signed In Name');
    expect(result.current.patient.dob).toBe('');
  });

  it('loads the saved profile from the server', async () => {
    getProfile.mockResolvedValue({ profile: saved });
    const { result } = renderHook(() => usePatientProfile(user));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.patient).toMatchObject(saved);
  });

  it('shows an empty profile, not a crash, when the server is unreachable', async () => {
    getProfile.mockRejectedValue(new Error('down'));
    const { result } = renderHook(() => usePatientProfile(user));
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.patient.fullName).toBe('Signed In Name');
  });

  it('only updates local state after the server accepts a save', async () => {
    const { result } = renderHook(() => usePatientProfile(user));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    saveProfile.mockRejectedValueOnce(new Error('Please fix the highlighted fields.'));
    await expect(act(() => result.current.save(saved))).rejects.toThrow(/highlighted/);
    expect(result.current.patient.dob).toBe('');

    saveProfile.mockResolvedValueOnce({ profile: saved });
    await act(() => result.current.save(saved));
    expect(result.current.patient.dob).toBe('1972-05-12');
  });

  it('erasing removes server data and resets the profile', async () => {
    getProfile.mockResolvedValue({ profile: saved });
    deleteAllHealthData.mockResolvedValue({});
    const { result } = renderHook(() => usePatientProfile(user));
    await waitFor(() => expect(result.current.patient.dob).toBe('1972-05-12'));
    await act(() => result.current.eraseAll());
    expect(deleteAllHealthData).toHaveBeenCalled();
    expect(result.current.patient.dob).toBe('');
  });
});

describe('useExamHistory', () => {
  const exam = (id) => ({ id, createdAt: 1000 + id, overallRisk: 'Mild', leftGrade: 'Stage 1 - Mild', rightGrade: 'Stage 0 - Clear' });

  it('loads exams, and reloads when the assessment changes', async () => {
    listExams.mockResolvedValueOnce({ exams: [exam(1)] });
    const { result, rerender } = renderHook(({ key }) => useExamHistory(key), { initialProps: { key: null } });
    await waitFor(() => expect(result.current.exams).toHaveLength(1));

    listExams.mockResolvedValueOnce({ exams: [exam(2), exam(1)] });
    rerender({ key: { overallRisk: 'Mild' } });
    await waitFor(() => expect(result.current.exams).toHaveLength(2));
  });

  it('removes a deleted exam locally only after the server confirms', async () => {
    listExams.mockResolvedValue({ exams: [exam(1), exam(2)] });
    const { result } = renderHook(() => useExamHistory(null));
    await waitFor(() => expect(result.current.exams).toHaveLength(2));

    deleteExam.mockRejectedValueOnce(new Error('nope'));
    await expect(act(() => result.current.remove(1))).rejects.toThrow();
    expect(result.current.exams).toHaveLength(2);

    deleteExam.mockResolvedValueOnce({});
    await act(() => result.current.remove(1));
    expect(result.current.exams.map((e) => e.id)).toEqual([2]);
  });

  it('reports an error state when history cannot be loaded', async () => {
    listExams.mockRejectedValue(new Error('down'));
    const { result } = renderHook(() => useExamHistory(null));
    await waitFor(() => expect(result.current.status).toBe('error'));
  });
});
