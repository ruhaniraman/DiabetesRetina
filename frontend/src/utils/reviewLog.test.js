import { describe, it, expect } from 'vitest';
import { appendLog, clearLog, readLog, summarise } from './reviewLog';

function memoryStorage() {
  const data = new Map();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: (k) => data.delete(k) };
}

describe('review log', () => {
  it('appends, reads back and clears', () => {
    const s = memoryStorage();
    appendLog({ decision: 'agreeRefer', seconds: 12 }, s);
    appendLog({ decision: 'overrideRoutine', seconds: 40 }, s);
    expect(readLog(s)).toHaveLength(2);
    clearLog(s);
    expect(readLog(s)).toEqual([]);
  });

  it('survives broken or unavailable storage', () => {
    const broken = { getItem: () => '{not json', setItem: () => { throw new Error('full'); }, removeItem: () => {} };
    expect(readLog(broken)).toEqual([]);
    expect(appendLog({ decision: 'agreeRefer', seconds: 5 }, broken)).toHaveLength(1);
    expect(readLog(undefined)).toEqual([]);
  });

  it('summarises median time, share within 30 s and agreement', () => {
    const entries = [
      { decision: 'agreeRefer', seconds: 10 },
      { decision: 'agreeRoutine', seconds: 20 },
      { decision: 'overrideRefer', seconds: 35 },
      { decision: 'recapture', seconds: 50 },
    ];
    expect(summarise(entries)).toEqual({ count: 4, medianSeconds: 27.5, within30: 0.5, agreement: 0.5 });
    expect(summarise([]).medianSeconds).toBeNull();
  });
});
