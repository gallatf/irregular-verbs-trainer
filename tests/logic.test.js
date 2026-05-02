import { normalizeInput, matchesExpected, verbStatus, filteredDeck, pickWeighted } from '../app/logic.js';

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

describe('verbStatus', () => {
  it('returns "new" for a verb with no progress entry', () => {
    expect(verbStatus('go', {})).toBe('new');
  });

  it('returns "new" for a verb with seen === 0', () => {
    expect(verbStatus('go', { go: { seen: 0, knew: 0, missed: 0 } })).toBe('new');
  });

  it('returns "difficult" when missed > knew', () => {
    expect(verbStatus('go', { go: { seen: 3, knew: 1, missed: 2 } })).toBe('difficult');
  });

  it('returns "known" when knew >= missed', () => {
    expect(verbStatus('go', { go: { seen: 2, knew: 2, missed: 0 } })).toBe('known');
  });

  it('returns "known" when knew equals missed', () => {
    expect(verbStatus('go', { go: { seen: 2, knew: 1, missed: 1 } })).toBe('known');
  });
});

describe('filteredDeck', () => {
  const verbs = [
    { id: 'go' },
    { id: 'be' },
    { id: 'run' },
  ];
  const progress = {
    go:  { seen: 2, knew: 0, missed: 2 }, // difficult
    be:  { seen: 2, knew: 2, missed: 0 }, // known
    // run: no entry → new
  };

  it('"all" returns the full verb list', () => {
    expect(filteredDeck(verbs, 'all', progress)).toEqual(verbs);
  });

  it('"new" returns only unseen verbs', () => {
    const result = filteredDeck(verbs, 'new', progress);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('run');
  });

  it('"difficult" returns only verbs where missed > knew', () => {
    const result = filteredDeck(verbs, 'difficult', progress);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('go');
  });

  it('returns empty array when no verbs match the filter', () => {
    expect(filteredDeck(verbs, 'difficult', {})).toHaveLength(0);
  });

  it('"due" returns new and difficult verbs, excludes known', () => {
    const result = filteredDeck(verbs, 'due', progress);
    const ids = result.map(v => v.id);
    expect(ids).toContain('go');  // difficult
    expect(ids).toContain('run'); // new
    expect(ids).not.toContain('be'); // known
  });

  it('"due" returns all verbs when none are known yet', () => {
    expect(filteredDeck(verbs, 'due', {})).toHaveLength(verbs.length);
  });
});

describe('pickWeighted', () => {
  it('returns the only verb when list has one entry', () => {
    const verbs = [{ id: 'go' }];
    expect(pickWeighted(verbs, {})).toBe(verbs[0]);
  });

  it('always picks from the provided list', () => {
    const verbs = [{ id: 'go' }, { id: 'be' }, { id: 'run' }];
    for (let i = 0; i < 20; i++) {
      expect(verbs).toContain(pickWeighted(verbs, {}));
    }
  });

  it('gives a difficult verb higher weight than a known verb', () => {
    const difficult = { id: 'go' };
    const known = { id: 'be' };
    const progress = {
      go: { seen: 3, knew: 0, missed: 3 }, // weight = 4
      be: { seen: 3, knew: 3, missed: 0 }, // weight = 1
    };
    // With weight 4:1, difficult should win the vast majority of 200 trials
    let difficultCount = 0;
    for (let i = 0; i < 200; i++) {
      if (pickWeighted([difficult, known], progress).id === 'go') difficultCount++;
    }
    expect(difficultCount).toBeGreaterThan(100);
  });
});
