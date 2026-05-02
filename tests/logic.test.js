import { normalizeInput, matchesExpected, verbStatus, filteredDeck, pickWeighted, recentAccuracy, verbTrend, currentStreak, reportRow, reportSummary } from '../app/logic.js';

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

describe('recentAccuracy', () => {
  it('returns null when history is shorter than n', () => {
    expect(recentAccuracy([true, false], 3)).toBeNull();
  });

  it('returns 1 when all recent attempts are correct', () => {
    expect(recentAccuracy([false, true, true, true], 3)).toBe(1);
  });

  it('returns 0 when all recent attempts are wrong', () => {
    expect(recentAccuracy([true, false, false, false], 3)).toBe(0);
  });

  it('returns 2/3 for two correct out of three', () => {
    expect(recentAccuracy([true, true, false], 3)).toBeCloseTo(2 / 3);
  });
});

describe('verbTrend', () => {
  it('returns null when fewer than 4 attempts', () => {
    expect(verbTrend([true, false, true])).toBeNull();
  });

  it('returns "improving" when second half is much better', () => {
    // first half: [false, false] = 0%, second half: [true, true] = 100%
    expect(verbTrend([false, false, true, true])).toBe('improving');
  });

  it('returns "declining" when second half is much worse', () => {
    expect(verbTrend([true, true, false, false])).toBe('declining');
  });

  it('returns "stable" when accuracy is similar across halves', () => {
    expect(verbTrend([true, false, true, false])).toBe('stable');
  });
});

describe('currentStreak', () => {
  it('returns 0 for empty history', () => {
    expect(currentStreak([])).toBe(0);
  });

  it('returns 0 when last attempt was wrong', () => {
    expect(currentStreak([true, true, false])).toBe(0);
  });

  it('returns 2 for two consecutive correct at the end', () => {
    expect(currentStreak([false, true, true])).toBe(2);
  });

  it('returns full length when all correct', () => {
    expect(currentStreak([true, true, true])).toBe(3);
  });
});

describe('reportRow', () => {
  const verb = { id: 'go', infinitive: 'go', pastSimple: 'went', pastParticiple: 'gone' };

  it('returns zero values for an unseen verb', () => {
    const row = reportRow(verb, {});
    expect(row.seen).toBe(0);
    expect(row.accuracy).toBeNull();
  });

  it('computes accuracy correctly', () => {
    const progress = { go: { seen: 4, knew: 3, missed: 1, history: [false, true, true, true] } };
    const row = reportRow(verb, progress);
    expect(row.accuracy).toBe(0.75);
  });

  it('includes trend and streak', () => {
    const progress = { go: { seen: 4, knew: 2, missed: 2, history: [false, false, true, true] } };
    const row = reportRow(verb, progress);
    expect(row.trend).toBe('improving');
    expect(row.streak).toBe(2);
  });
});

describe('reportSummary', () => {
  const verbs = [
    { id: 'go' },
    { id: 'be' },
    { id: 'run' },
  ];

  it('counts all as notSeen when progress is empty', () => {
    const s = reportSummary(verbs, {});
    expect(s.notSeen).toBe(3);
    expect(s.practiced).toBe(0);
    expect(s.accuracy).toBeNull();
  });

  it('counts mastered and difficult correctly', () => {
    const progress = {
      go:  { seen: 3, knew: 1, missed: 2, history: [] }, // difficult
      be:  { seen: 3, knew: 3, missed: 0, history: [] }, // mastered
      // run: unseen
    };
    const s = reportSummary(verbs, progress);
    expect(s.practiced).toBe(2);
    expect(s.mastered).toBe(1);
    expect(s.difficult).toBe(1);
    expect(s.notSeen).toBe(1);
  });

  it('computes overall accuracy across all verbs', () => {
    const progress = {
      go: { seen: 2, knew: 1, missed: 1, history: [] },
      be: { seen: 2, knew: 2, missed: 0, history: [] },
    };
    const s = reportSummary(verbs, progress);
    expect(s.accuracy).toBe(0.75); // 3 knew / 4 total
  });
});
