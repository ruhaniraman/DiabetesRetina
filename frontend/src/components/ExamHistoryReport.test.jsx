import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../api/patient', () => ({ downloadExamReport: vi.fn() }));
vi.mock('../utils/download', () => ({ saveBlob: vi.fn() }));

import { downloadExamReport } from '../api/patient';
import { saveBlob } from '../utils/download';
import ExamHistory from './ExamHistory';
import '../i18n';

const exam = (id, extra = {}) => ({
  id,
  createdAt: Date.UTC(2026, 8, id),
  overallRisk: 'Moderate',
  leftGrade: 'Stage 2 - Moderate',
  rightGrade: 'Stage 0 - No DR detected',
  ...extra,
});
const history = (exams, extra = {}) => ({ status: 'ready', exams, remove: vi.fn(), ...extra });

beforeEach(() => vi.clearAllMocks());

describe('ExamHistory stored reports', () => {
  it('downloads the PDF saved with an exam when its date is clicked', async () => {
    const blob = new Blob(['%PDF'], { type: 'application/pdf' });
    downloadExamReport.mockResolvedValue(blob);
    render(<ExamHistory history={history([exam(12, { hasReport: true })])} />);

    await userEvent.setup({ delay: null }).click(screen.getByRole('button', { name: /Download the detailed report/ }));
    await waitFor(() => expect(saveBlob).toHaveBeenCalledWith(blob, 'retina-rescue-report-2026-09-12.pdf'));
    expect(downloadExamReport).toHaveBeenCalledWith(12);
  });

  it('says when an exam has no saved PDF, and when a new one is still being prepared', () => {
    render(<ExamHistory history={history([exam(12), exam(11)], { reportPendingFor: 12 })} />);
    expect(screen.queryByRole('button', { name: /Download the detailed report/ })).not.toBeInTheDocument();
    expect(screen.getByText('Preparing the PDF report…')).toBeInTheDocument();
    expect(screen.getByText('No PDF saved for this exam')).toBeInTheDocument();
  });

  it('shows an error if the download fails', async () => {
    downloadExamReport.mockRejectedValue(new Error('nope'));
    render(<ExamHistory history={history([exam(12, { hasReport: true })])} />);
    await userEvent.setup({ delay: null }).click(screen.getByRole('button', { name: /Download the detailed report/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The report could not be downloaded');
    expect(saveBlob).not.toHaveBeenCalled();
  });
});
