import { normalizeInput, matchesExpected } from '../app/logic.js';

describe('normalizeInput', () => {
  it('trims leading whitespace', () => {
    expect(normalizeInput('  went')).toBe('went');
  });

  it('trims trailing whitespace', () => {
    expect(normalizeInput('went  ')).toBe('went');
  });

  it('lowercases the input', () => {
    expect(normalizeInput('WENT')).toBe('went');
  });

  it('handles mixed case and whitespace together', () => {
    expect(normalizeInput('  Was  ')).toBe('was');
  });

  it('returns empty string for empty input', () => {
    expect(normalizeInput('')).toBe('');
  });

  it('leaves already-clean input unchanged', () => {
    expect(normalizeInput('been')).toBe('been');
  });
});

describe('matchesExpected — single variant', () => {
  it('returns true for exact match', () => {
    expect(matchesExpected('went', 'went')).toBe(true);
  });

  it('returns false for wrong answer', () => {
    expect(matchesExpected('go', 'went')).toBe(false);
  });

  it('matches case-insensitively', () => {
    expect(matchesExpected('WENT', 'went')).toBe(true);
  });

  it('accepts input with surrounding whitespace', () => {
    expect(matchesExpected('  went  ', 'went')).toBe(true);
  });

  it('returns false for empty user input against non-empty expected', () => {
    expect(matchesExpected('', 'went')).toBe(false);
  });
});

describe('matchesExpected — slash-separated alternatives', () => {
  it('accepts the first variant', () => {
    expect(matchesExpected('was', 'was/were')).toBe(true);
  });

  it('accepts the second variant', () => {
    expect(matchesExpected('were', 'was/were')).toBe(true);
  });

  it('rejects a value that matches no variant', () => {
    expect(matchesExpected('be', 'was/were')).toBe(false);
  });

  it('matches variants case-insensitively', () => {
    expect(matchesExpected('WAS', 'was/were')).toBe(true);
  });

  it('handles whitespace around slashes in expected', () => {
    expect(matchesExpected('got', 'got / gotten')).toBe(true);
  });

  it('handles a three-way alternative', () => {
    expect(matchesExpected('b', 'a/b/c')).toBe(true);
  });
});
