import { describe, it, expect } from 'vitest';
import { calcAge } from './patient';

describe('calcAge', () => {
  const today = new Date('2026-09-21');
  it('counts full years', () => expect(calcAge('1972-05-12', today)).toBe(54));
  it('has not had the birthday yet this year', () => expect(calcAge('1972-12-01', today)).toBe(53));
  it('handles missing or invalid input', () => {
    expect(calcAge('', today)).toBeNull();
    expect(calcAge('nonsense', today)).toBeNull();
    expect(calcAge('2030-01-01', today)).toBeNull();
  });
});
