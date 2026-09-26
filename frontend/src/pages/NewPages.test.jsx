import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../api/ml', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchSimulation: vi.fn(),
  runSimulation: vi.fn(),
  fetchHeatmap: vi.fn(),
  fetchAnatomy: vi.fn(),
  fetchEnhanced: vi.fn(),
}));

import { fetchAnatomy, fetchEnhanced, fetchHeatmap, fetchSimulation, runSimulation } from '../api/ml';
import simulated from '../../../backend/pipeline_results.json';
import DistrictPlannerPage from './DistrictPlannerPage';
import SpecialistReviewPage from './SpecialistReviewPage';
import DetailedReportPage from './DetailedReportPage';

const photo = new File([new Uint8Array(10)], 'eye.png', { type: 'image/png' });
const eye = { file: photo, imageUrl: 'blob:eye', mask: { status: 'idle', url: null, counts: null, error: '' } };
const assessment = {
  overallRisk: 'Moderate',
  leftGrade: 'Moderate',
  rightGrade: 'No_DR',
  leftConfidenceBand: 'High',
  rightConfidenceBand: 'Moderate',
  leftReferableProbability: 0.62,
  rightReferableProbability: 0.03,
  leftReferable: true,
  rightReferable: false,
  referable: true,
  referralThreshold: 0.0964,
  leftProliferativeProbability: 0.42,
  rightProliferativeProbability: 0.01,
  overallSummary: 'Summary text.',
};

beforeEach(() => {
  vi.clearAllMocks();
  try {
    localStorage.clear();
  } catch {
    /* no storage */
  }
});

describe('DistrictPlannerPage', () => {
  it('shows the live plan and the Simulink-confirmed scenarios', async () => {
    fetchSimulation.mockResolvedValue(simulated);
    render(<DistrictPlannerPage onBack={() => {}} />);
    expect(screen.getByText('Camera sites')).toBeInTheDocument();
    expect(await screen.findByText(simulated.plans[0].scenario)).toBeInTheDocument();
    expect(screen.getByText('camera sites')).toBeInTheDocument(); // what limits the base district
  });

  it('switching to an uncalibrated camera raises the specialist load', async () => {
    fetchSimulation.mockResolvedValue(simulated);
    render(<DistrictPlannerPage onBack={() => {}} />);
    const before = screen.getByText(/flagged cases per day/).textContent;
    await userEvent.click(screen.getByRole('button', { name: /not calibrated/ }));
    const after = screen.getByText(/flagged cases per day/).textContent;
    expect(parseInt(after, 10)).toBeGreaterThan(2 * parseInt(before, 10));
  });

  it('confirms the current plan in Simulink and shows the year', async () => {
    fetchSimulation.mockResolvedValue(simulated);
    const stage = (limitDays) => ({ utilisation: 0.5, worstBacklogDays: 0.1, finalBacklogDays: 0, limitDays, backlogDays: [0, 0.1, 0] });
    runSimulation.mockResolvedValue({
      meetsTargets: true, reasons: [], patientsScreened: 100000, casesReviewed: 22000, days: 250,
      stages: { capture: stage(1), upload: stage(1), ai: stage(1), review: stage(2) },
    });
    render(<DistrictPlannerPage onBack={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: 'Confirm in Simulink' }));
    expect(await screen.findByText('Meets every backlog target over the simulated year')).toBeInTheDocument();
    expect(runSimulation.mock.calls[0][0].resources).toEqual({ cameraSites: 8, uplinkMbps: 0.1, aiServers: 1, reviewers: 1 });
    expect(screen.getAllByRole('img', { name: /Backlog over the year/ })).toHaveLength(4);
  });

  it('says so when the scenarios cannot be loaded', async () => {
    fetchSimulation.mockRejectedValue(new Error('Simulation data not found.'));
    render(<DistrictPlannerPage onBack={() => {}} />);
    expect(await screen.findByText('Simulation data not found.')).toBeInTheDocument();
  });
});

describe('SpecialistReviewPage', () => {
  it('asks for an assessment first', () => {
    render(<SpecialistReviewPage session={{ assessment: null, left: eye, right: eye }} onBack={() => {}} />);
    expect(screen.getByText(/No case to review yet/)).toBeInTheDocument();
  });

  it('shows both eyes with Grad-CAM, logs the decision and its time', async () => {
    fetchHeatmap.mockResolvedValue({ heatmapUrl: 'data:image/png;base64,AA', empty: false });
    render(<SpecialistReviewPage session={{ assessment, left: eye, right: { ...eye, file: new File([new Uint8Array(5)], 'r.png', { type: 'image/png' }) } }} onBack={() => {}} />);
    expect(screen.getByText('AI recommends referral')).toBeInTheDocument();
    expect(screen.getByText(/new vessels\) probability: 42%/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByAltText(/Grad-CAM/)).toHaveLength(2));
    await userEvent.click(screen.getByRole('button', { name: 'Agree: refer' }));
    expect(screen.getByText(/reviewed in/)).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument(); // one case in the log
  });
});

describe('DetailedReportPage extra views', () => {
  it('shows the anatomy overlay and its measurements', async () => {
    fetchAnatomy.mockResolvedValue({ overlayUrl: 'data:image/png;base64,AA', vesselDensity: 11.2, foveaSource: 'detected', foveaConfidence: 0.8 });
    render(<DetailedReportPage patient={{}} session={{ left: eye, right: eye, assessment }} onBack={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: 'Anatomy' }));
    expect(await screen.findByText('Vessels cover 11.2% of the retina')).toBeInTheDocument();
    expect(screen.getByText('Fovea detected (confidence 80%)')).toBeInTheDocument();
  });

  it('labels the enhanced photo as display only', async () => {
    fetchEnhanced.mockResolvedValue({ imageUrl: 'data:image/png;base64,AA' });
    render(<DetailedReportPage patient={{}} session={{ left: eye, right: eye, assessment }} onBack={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: 'Enhanced' }));
    expect(await screen.findByText(/The AI grades the original photo/)).toBeInTheDocument();
  });
});
