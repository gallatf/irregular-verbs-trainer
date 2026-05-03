import { normalizeInput, matchesExpected, isNearMiss, verbStatus, filteredDeck, pickWeighted, recentAccuracy, verbTrend, currentStreak, reportRow, reportSummary, computeNextDue, nextDueIn } from '../app/logic.js';

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

describe('isNearMiss', () => {
  it('returns false for an exact match', () => {
    expect(isNearMiss('broken', 'broken')).toBe(false);
  });

  it('returns false for an exact match after normalisation', () => {
    expect(isNearMiss('  BROKEN  ', 'broken')).toBe(false);
  });

  it('returns true for a 1-char substitution', () => {
    expect(isNearMiss('brokan', 'broken')).toBe(true); // a instead of e
  });

  it('returns true for an adjacent transposition', () => {
    expect(isNearMiss('borken', 'broken')).toBe(true); // r↔o swapped
  });

  it('returns false for a non-adjacent transposition', () => {
    // swap positions 0 and 2: "broken" → "orbken" (b↔o, not adjacent)
    expect(isNearMiss('orbken', 'broken')).toBe(false);
  });

  it('returns false for a deletion (different length)', () => {
    expect(isNearMiss('brken', 'broken')).toBe(false);
  });

  it('returns false for an insertion (different length)', () => {
    expect(isNearMiss('brokken', 'broken')).toBe(false);
  });

  it('returns false for 2 substitutions', () => {
    expect(isNearMiss('brakan', 'broken')).toBe(false); // positions 2 and 4 wrong
  });

  it('returns false for a completely wrong answer', () => {
    expect(isNearMiss('went', 'broken')).toBe(false);
  });

  it('returns true when input matches a slash-separated variant', () => {
    expect(isNearMiss('wes', 'was/were')).toBe(true); // 'wes' vs 'was': 1 substitution
  });

  it('returns false when no slash variant is a near-miss', () => {
    expect(isNearMiss('gone', 'was/were')).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(isNearMiss('Brokan', 'broken')).toBe(true);
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

  it('returns "difficult" when last attempt failed (SM-2 lastFailed path)', () => {
    expect(verbStatus('go', { go: { seen: 1, knew: 0, missed: 1, easeFactor: 2.3, history: [false] } })).toBe('difficult');
  });

  it('remains "difficult" after only 1 correct answer following a miss', () => {
    expect(verbStatus('go', { go: { seen: 2, knew: 1, missed: 1, easeFactor: 2.3, history: [false, true] } })).toBe('difficult');
  });

  it('returns "known" after 2 consecutive correct answers following a miss', () => {
    expect(verbStatus('go', { go: { seen: 3, knew: 2, missed: 1, easeFactor: 2.5, history: [false, true, true] } })).toBe('known');
  });

  it('returns "difficult" when easeFactor is low even if last attempt was correct', () => {
    expect(verbStatus('go', { go: { seen: 5, knew: 4, missed: 1, easeFactor: 1.8, history: [false, true, true, true, true] } })).toBe('difficult');
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

  it('"due" includes unseen verbs and overdue verbs, excludes future-scheduled verbs', () => {
    const scheduledProgress = {
      go:  { seen: 2, knew: 1, missed: 1, history: [], due: Date.now() - 1000 }, // overdue
      be:  { seen: 3, knew: 3, missed: 0, history: [], due: Date.now() + 86400000 * 7 }, // not yet due
      // run: unseen
    };
    const result = filteredDeck(verbs, 'due', scheduledProgress);
    const ids = result.map(v => v.id);
    expect(ids).toContain('go');       // overdue
    expect(ids).toContain('run');      // unseen → always due
    expect(ids).not.toContain('be');   // scheduled in the future
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

  it('never returns the excluded verb when alternatives exist', () => {
    const verbs = [{ id: 'go' }, { id: 'be' }, { id: 'run' }];
    for (let i = 0; i < 30; i++) {
      expect(pickWeighted(verbs, {}, 'go').id).not.toBe('go');
    }
  });

  it('returns the only verb even when it is excluded', () => {
    const verbs = [{ id: 'go' }];
    expect(pickWeighted(verbs, {}, 'go').id).toBe('go');
  });

  it('gives a difficult verb higher weight than a known verb', () => {
    const difficult = { id: 'go' };
    const known = { id: 'be' };
    const progress = {
      go: { seen: 3, knew: 0, missed: 3, history: [false, false, false] }, // weight ≈ 3.3
      be: { seen: 3, knew: 3, missed: 0, history: [true, true, true] },    // weight = 1
    };
    // Decay-weighted: difficult verb wins ~77% of trials (3.3:1 ratio)
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

describe('computeNextDue', () => {
  const DAY = 86400000;

  it('first correct answer: interval 1 day, repetitions 1', () => {
    const before = Date.now();
    const r = computeNextDue({}, true);
    expect(r.repetitions).toBe(1);
    expect(r.interval).toBe(1);
    expect(r.easeFactor).toBeCloseTo(2.6, 5);
    expect(r.due).toBeGreaterThanOrEqual(before + DAY);
    expect(r.due).toBeLessThanOrEqual(Date.now() + DAY + 100);
  });

  it('second correct answer: interval 4 days, repetitions 2', () => {
    const r = computeNextDue({ repetitions: 1, easeFactor: 2.6, interval: 1 }, true);
    expect(r.repetitions).toBe(2);
    expect(r.interval).toBe(4);
  });

  it('third correct answer: interval grows by easeFactor', () => {
    const r = computeNextDue({ repetitions: 2, easeFactor: 2.6, interval: 4 }, true);
    expect(r.repetitions).toBe(3);
    expect(r.interval).toBe(Math.round(4 * 2.7)); // newEF = min(4, 2.6+0.1) = 2.7
  });

  it('miss resets repetitions and interval to 1 day', () => {
    const r = computeNextDue({ repetitions: 3, easeFactor: 2.8, interval: 11 }, false);
    expect(r.repetitions).toBe(0);
    expect(r.interval).toBe(1);
    expect(r.easeFactor).toBeCloseTo(2.6, 5);
  });

  it('ease factor never drops below 1.3', () => {
    const r = computeNextDue({ repetitions: 0, easeFactor: 1.3, interval: 0 }, false);
    expect(r.easeFactor).toBe(1.3);
  });

  it('ease factor never exceeds 4.0', () => {
    const r = computeNextDue({ repetitions: 5, easeFactor: 4.0, interval: 10 }, true);
    expect(r.easeFactor).toBe(4.0);
  });

  it('handles legacy progress entry with no SM-2 fields', () => {
    const r = computeNextDue({ seen: 5, knew: 3, missed: 2, history: [] }, true);
    expect(r.repetitions).toBe(1);
    expect(r.interval).toBe(1);
    expect(r.easeFactor).toBeCloseTo(2.6, 5);
  });

  it('due timestamp is approximately now + interval days', () => {
    const before = Date.now();
    const r = computeNextDue({ repetitions: 1, easeFactor: 2.5, interval: 1 }, true);
    const expected = before + 4 * DAY;
    expect(r.due).toBeGreaterThanOrEqual(expected);
    expect(r.due).toBeLessThanOrEqual(expected + 500);
  });
});

describe('filteredDeck — due filter', () => {
  const verbs = [
    { id: 'go' }, { id: 'be' }, { id: 'run' },
  ];

  it('includes unseen verbs', () => {
    const progress = {};
    const deck = filteredDeck(verbs, 'due', progress);
    expect(deck.map(v => v.id)).toEqual(['go', 'be', 'run']);
  });

  it('includes verbs whose due timestamp has passed', () => {
    const progress = {
      go:  { seen: 1, due: Date.now() - 1000 },
      be:  { seen: 1, due: Date.now() + 86400000 }, // not yet due
      run: { seen: 0 },
    };
    const deck = filteredDeck(verbs, 'due', progress);
    const ids = deck.map(v => v.id);
    expect(ids).toContain('go');
    expect(ids).not.toContain('be');
    expect(ids).toContain('run');
  });

  it('includes seen verbs with no due field (legacy data)', () => {
    const progress = { go: { seen: 3, knew: 2, missed: 1, history: [] } };
    const deck = filteredDeck(verbs, 'due', progress);
    expect(deck.map(v => v.id)).toContain('go');
  });

  it('excludes verbs whose due date is in the future', () => {
    const progress = { go: { seen: 2, due: Date.now() + 86400000 * 7 } };
    const deck = filteredDeck(verbs, 'due', progress);
    expect(deck.map(v => v.id)).not.toContain('go');
  });
});

describe('nextDueIn', () => {
  const NOW = 1000000000000;
  const MIN = 60000;
  const HOUR = 3600000;
  const DAY  = 86400000;

  it('returns null when no progress entries have a future due date', () => {
    expect(nextDueIn({}, NOW)).toBeNull();
    expect(nextDueIn({ go: { seen: 1 } }, NOW)).toBeNull();
    expect(nextDueIn({ go: { seen: 1, due: NOW - 1 } }, NOW)).toBeNull();
  });

  it('returns "less than a minute" for < 2 minutes', () => {
    expect(nextDueIn({ go: { due: NOW + 30000 } }, NOW)).toBe('less than a minute');
  });

  it('returns minutes for < 60 minutes', () => {
    expect(nextDueIn({ go: { due: NOW + 10 * MIN } }, NOW)).toBe('10 minutes');
    expect(nextDueIn({ go: { due: NOW + 59 * MIN } }, NOW)).toBe('59 minutes');
  });

  it('returns "about an hour" for < 2 hours', () => {
    expect(nextDueIn({ go: { due: NOW + 75 * MIN } }, NOW)).toBe('about an hour');
  });

  it('returns hours for < 24 hours', () => {
    expect(nextDueIn({ go: { due: NOW + 5 * HOUR } }, NOW)).toBe('5 hours');
  });

  it('returns "tomorrow" for ~1 day', () => {
    expect(nextDueIn({ go: { due: NOW + DAY } }, NOW)).toBe('tomorrow');
  });

  it('returns days for > 1 day', () => {
    expect(nextDueIn({ go: { due: NOW + 3 * DAY } }, NOW)).toBe('3 days');
  });

  it('picks the nearest due date across multiple verbs', () => {
    const progress = {
      go:  { due: NOW + 5 * HOUR },
      be:  { due: NOW + 2 * HOUR },
      run: { due: NOW + 3 * DAY  },
    };
    expect(nextDueIn(progress, NOW)).toBe('2 hours');
  });
});
