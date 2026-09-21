import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import DetailedReportPage from './DetailedReportPage';

const eye = { file: null, imageUrl: null, mask: { status: 'idle', url: null, counts: null, error: '' } };
const session = (assessment) => ({ left: eye, right: eye, assessment });
const patient = { fullName: 'Test Patient' };

const assessment = (overallRisk, leftGrade, rightGrade) => ({
  overallRisk,
  leftGrade,
  rightGrade,
  leftConfidence: 0.91,
  rightConfidence: 0.8,
  leftConfidenceBand: 'High',
  rightConfidenceBand: 'Moderate',
  overallSummary: 'Summary text.',
});

const renderReport = (a) => render(<DetailedReportPage patient={patient} session={session(a)} onBack={() => {}} />);

describe('DetailedReportPage', () => {
  it('never shows a clearance or a severity before an assessment has run', () => {
    renderReport(null);
    expect(screen.getByText('No Assessment Yet')).toBeInTheDocument();
    expect(screen.getAllByText('Not assessed').length).toBeGreaterThan(0);
    expect(screen.queryByText(/No Referral Flagged/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Stage 2/)).not.toBeInTheDocument();
  });

  it('shows routine status only for a real Stage 0 result', () => {
    renderReport(assessment('No_DR', 'Stage 0 - No DR detected', 'Stage 0 - No DR detected'));
    expect(screen.getByText('No Referral Flagged')).toBeInTheDocument();
  });

  it.each([['Moderate'], ['Severe'], ['Proliferate_DR']])('recommends specialist review for %s', (grade) => {
    renderReport(assessment(grade, 'Stage X', 'Stage 0 - No DR detected'));
    expect(screen.getByText('Specialist Review Recommended')).toBeInTheDocument();
  });

  it('recommends follow-up (not urgent review, and not reassurance) for a mild, non-referable result', () => {
    renderReport({ ...assessment('Mild', 'Stage 1 - Mild', 'Stage 0 - No DR detected'), referable: false });
    expect(screen.getByText('Follow-up Recommended')).toBeInTheDocument();
    expect(screen.queryByText('No Referral Flagged')).not.toBeInTheDocument();
  });

  it('reports the grades and confidences it was given, not canned text', () => {
    renderReport(assessment('Moderate', 'Stage 2 - Moderate', 'Stage 0 - No DR detected'));
    expect(screen.getByText(/Left eye \(OS\): Stage 2 - Moderate/)).toHaveTextContent('High confidence');
    expect(screen.getByText('Summary text.')).toBeInTheDocument();
  });
});


describe('DetailedReportPage referral details', () => {
  const flagged = {
    ...assessment('Moderate', 'Stage 1 - Mild', 'Stage 0 - No DR detected'),
    leftReferableProbability: 0.35,
    rightReferableProbability: 0.02,
    leftReferable: true,
    rightReferable: false,
    referralThreshold: 0.2,
    escalated: true,
  };

  it('shows the referral score of each eye and the flag threshold', () => {
    renderReport(flagged);
    expect(screen.getByText(/Referral score: left 35%, right 2%/)).toHaveTextContent('20% or more');
  });

  it('flags the eye that reached the threshold even though its stage looks mild', () => {
    renderReport(flagged);
    expect(screen.getByText(/· flagged/)).toBeInTheDocument();
    expect(screen.getByText('Specialist Review Recommended')).toBeInTheDocument();
  });

  it('tells the reader the stage is less reliable than the referral decision', () => {
    renderReport(flagged);
    expect(screen.getByText(/referral decision is the more reliable output/i)).toBeInTheDocument();
  });
});


describe('DetailedReportPage without the experimental lesion overlay (the default)', () => {
  const withMask = { file: null, imageUrl: 'blob:x', mask: { status: 'success', url: 'data:mask', counts: { microaneurysms: 117, hemorrhages: 29, exudates: 25 }, error: '' } };
  const render1 = () =>
    render(<DetailedReportPage patient={patient} session={{ left: withMask, right: withMask, assessment: assessment('No_DR', 'Stage 0 - No DR detected', 'Stage 0 - No DR detected') }} onBack={() => {}} />);

  it('never presents lesion counts or an overlay view, even if a mask exists', () => {
    render1();
    expect(screen.queryByText(/Microaneurysm-like/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Hemorrhage-like/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /overlay/i })).not.toBeInTheDocument();
  });

  it('still offers the original photo and the model heatmap', () => {
    render1();
    expect(screen.getByRole('button', { name: /original photo/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ai heatmap/i })).toBeInTheDocument();
  });
});
