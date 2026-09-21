import { describe, it, expect } from 'vitest';
import { parseLanguageList } from './config';

describe('parseLanguageList', () => {
  it('reads a comma-separated list of languages, ignoring spaces, case and blanks', () => {
    expect(parseLanguageList('hi')).toEqual(['hi']);
    expect(parseLanguageList(' HI , kn ,, ')).toEqual(['hi', 'kn']);
  });

  it('treats "true" as its own entry (all languages) and nothing as nothing', () => {
    expect(parseLanguageList('true')).toEqual(['true']);
    expect(parseLanguageList('')).toEqual([]);
    expect(parseLanguageList(undefined)).toEqual([]);
  });
});
