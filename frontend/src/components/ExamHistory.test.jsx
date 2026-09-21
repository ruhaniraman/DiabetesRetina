import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ExamHistory from './ExamHistory';
import EyePanel from './EyePanel';
import PatientDetailsPage from '../pages/PatientDetailsPage';
import { ApiError } from '../api/auth';
import { emptyPatient } from '../utils/patient';

const exam = (id, overallRisk = 'Moderate') => ({
  id,
  createdAt: Date.UTC(2026, 8, id),
  overallRisk,
  leftGrade: 'Stage 2 - Moderate',
  rightGrade: 'Stage 0 - Clear',
});

beforeEach(() => {
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

describe('ExamHistory', () => {
  it('shows real saved exams with both eyes graded, not placeholder text', () => {
    render(<ExamHistory history={{ status: 'ready', exams: [exam(3), exam(2, 'No_DR')], remove: vi.fn() }} />);
    expect(screen.getAllByText(/OS Stage 2 · OD Stage 0/)).toHaveLength(2);
    expect(screen.getByText('Stage 2 Risk')).toBeInTheDocument();
    expect(screen.getByText('Stage 0 · No DR detected')).toBeInTheDocument();
    expect(screen.queryByText(/No exams recorded yet/)).not.toBeInTheDocument();
  });

  it('says so when there are no exams, and when history could not be loaded', () => {
    const { rerender } = render(<ExamHistory history={{ status: 'ready', exams: [], remove: vi.fn() }} />);
    expect(screen.getByText('No exams recorded yet.')).toBeInTheDocument();
    rerender(<ExamHistory history={{ status: 'error', exams: [], remove: vi.fn() }} />);
    expect(screen.getByRole('alert')).toHaveTextContent(/could not be loaded/);
  });

  it('deletes an exam only after confirmation', async () => {
    const remove = vi.fn().mockResolvedValue();
    const user = userEvent.setup({ delay: null });
    render(<ExamHistory history={{ status: 'ready', exams: [exam(3)], remove }} />);

    window.confirm.mockReturnValueOnce(false);
    await user.click(screen.getByRole('button', { name: /delete exam/i }));
    expect(remove).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /delete exam/i }));
    expect(remove).toHaveBeenCalledWith(3);
  });

  it('collapses long histories', () => {
    const exams = [8, 7, 6, 5, 4, 3, 2].map((i) => exam(i));
    render(<ExamHistory history={{ status: 'ready', exams, remove: vi.fn() }} />);
    expect(screen.getAllByRole('button', { name: /delete exam/i })).toHaveLength(5);
    expect(screen.getByText(/2 earlier exam/)).toBeInTheDocument();
  });
});

describe('PatientDetailsPage saving', () => {
  const filled = { ...emptyPatient, fullName: 'Jane Doe', dob: '1972-05-12', gender: 'Female', bloodGroup: 'A+', diabetesDuration: '12', systolicBP: '138', diastolicBP: '88', hba1c: '7.8', fastingSugar: '140' };

  it('shows the server message and stays on the form when saving fails', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new ApiError('Please fix the highlighted fields.', 400, { errors: { hba1c: 'Enter a value between 3 and 20.' } }));
    const user = userEvent.setup({ delay: null });
    render(<PatientDetailsPage initialData={filled} onSubmit={onSubmit} onErase={vi.fn()} onCancel={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /save profile/i }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Please fix the highlighted fields.');
    expect(alert).toHaveTextContent('Enter a value between 3 and 20.');
    // The button is usable again so they can correct and retry.
    await waitFor(() => expect(screen.getByRole('button', { name: /save profile/i })).toBeEnabled());
  });

  it('erases data only after confirmation', async () => {
    const onErase = vi.fn().mockResolvedValue();
    const user = userEvent.setup({ delay: null });
    render(<PatientDetailsPage initialData={filled} onSubmit={vi.fn()} onErase={onErase} onCancel={vi.fn()} />);

    window.confirm.mockReturnValueOnce(false);
    await user.click(screen.getByRole('button', { name: /delete my health data/i }));
    expect(onErase).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /delete my health data/i }));
    expect(onErase).toHaveBeenCalled();
  });
});


describe('EyePanel referral chip', () => {
  const scan = { imageUrl: null, viewMode: 'original', quality: { status: 'accepted', verdict: 'accept', reason: '' }, mask: { status: 'idle' }, setViewMode: () => {} };
  const panel = (flag) => <EyePanel title="Left Eye (OS)" inputId="x" scan={scan} tagLabel="Stage 1 - Mild" tagClass="" referralFlagged={flag} onUpload={() => {}} onExpand={() => {}} />;

  it('appears only when the referral threshold flags the eye', () => {
    const { rerender } = render(panel(false));
    expect(screen.queryByText('Referral flagged')).not.toBeInTheDocument();
    rerender(panel(true));
    expect(screen.getByText('Referral flagged')).toBeInTheDocument();
  });
});


describe('EyePanel lesion toggle', () => {
  const scan = { imageUrl: null, viewMode: 'original', quality: { status: 'accepted', verdict: 'accept', reason: '' }, mask: { status: 'idle' }, setViewMode: () => {} };
  const panel = (enabled) => <EyePanel title="Left Eye (OS)" inputId="x" scan={scan} tagLabel="t" tagClass="" overlayEnabled={enabled} onUpload={() => {}} onExpand={() => {}} />;

  it('hides the Original/Mapped toggle unless the experimental overlay is enabled', () => {
    const { rerender } = render(panel(false));
    expect(screen.queryByRole('button', { name: /mapped/i })).not.toBeInTheDocument();
    rerender(panel(true));
    expect(screen.getByRole('button', { name: /mapped \(experimental\)/i })).toBeInTheDocument();
  });
});


describe('EyePanel quality warning', () => {
  const panel = (quality) => (
    <EyePanel title="Left Eye (OS)" inputId="x" tagLabel="t" tagClass="" overlayEnabled={false} onUpload={() => {}} onExpand={() => {}}
      scan={{ imageUrl: null, viewMode: 'original', quality, mask: { status: 'idle' }, setViewMode: () => {} }} />
  );

  it('shows the reason, and never says the image will be enhanced', () => {
    render(panel({ status: 'accepted', verdict: 'warn', reason: 'Image is dark; results may be less reliable.' }));
    expect(screen.getByText('Lower image quality')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Image is dark; results may be less reliable.');
    expect(screen.queryByText(/enhanc/i)).not.toBeInTheDocument();
  });

  it('shows nothing extra for a clean image', () => {
    render(panel({ status: 'accepted', verdict: 'accept', reason: 'Quality check passed.' }));
    expect(screen.queryByText('Lower image quality')).not.toBeInTheDocument();
  });
});
