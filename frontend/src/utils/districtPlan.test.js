import { describe, it, expect } from 'vitest';
import { BASE_PARAMETERS, planDistrict, capacities } from './districtPlan';
import simulated from '../../../backend/pipeline_results.json';

const withChanges = (changes) => ({ ...BASE_PARAMETERS, ...changes, options: { ...BASE_PARAMETERS.options, ...changes.options } });
const simulatedPlan = (prefix) => simulated.plans.find((p) => p.scenario.startsWith(prefix));

describe('planDistrict (port of optimiseDistrictResources.m)', () => {
  it('reproduces the Simulink-confirmed base plan', () => {
    const plan = planDistrict(BASE_PARAMETERS);
    expect(plan.resources).toEqual(simulatedPlan('Base').resources);
    expect(plan.costPerPatient).toBeCloseTo(simulatedPlan('Base').costPerPatient, 3);
    expect(plan.binding).toBe('camera sites');
  });

  it('reproduces the 200,000 patients/year plan', () => {
    expect(planDistrict(withChanges({ patientsPerYear: 200000 })).resources).toEqual(simulatedPlan('200,000').resources);
  });

  it('flags more specialist cases when specificity falls', () => {
    const calibrated = planDistrict(BASE_PARAMETERS);
    const uncalibrated = planDistrict(withChanges({ specificity: 0.538 }));
    expect(uncalibrated.reviewCasesPerDay).toBeGreaterThan(2 * calibrated.reviewCasesPerDay);
    expect(uncalibrated.reviewCasesPerDay).toBeCloseTo(simulatedPlan('Camera like IDRiD without').reviewCasesPerDay, -1);
  });

  it('needs more reviewers in the stress scenario', () => {
    const plan = planDistrict(withChanges({ patientsPerYear: 200000, specificity: 0.538, reviewSecondsPerCase: 120 }));
    expect(plan.resources.reviewers).toBeGreaterThanOrEqual(3);
  });

  it('upload per patient grows with PNG instead of JPEG', () => {
    const jpeg = capacities(BASE_PARAMETERS, { cameraSites: 1, uplinkMbps: 1, aiServers: 1, reviewers: 1 }).mbPerPatient;
    const png = capacities(withChanges({ imageMB: 1.93 }), { cameraSites: 1, uplinkMbps: 1, aiServers: 1, reviewers: 1 }).mbPerPatient;
    expect(png / jpeg).toBeCloseTo(1.93 / 0.4, 5);
  });

  it('returns null when nothing is enough', () => {
    expect(planDistrict(withChanges({ patientsPerYear: 5e7 }))).toBeNull();
  });
});
