export function normalizeInput(s) {
  return s.trim().toLowerCase();
}

// Single-variant helper: true if a and b differ by exactly 1 substitution
// or 1 adjacent transposition (same length required).
function nearMissOne(a, b) {
  if (a === b || a.length !== b.length) return false;
  const diffs = [];
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) diffs.push(i);
    if (diffs.length > 2) return false;
  }
  if (diffs.length === 1) return true; // substitution
  if (diffs.length === 2) {
    const [i, j] = diffs;
    return j === i + 1 && a[i] === b[j] && a[j] === b[i]; // transposition
  }
  return false;
}

// Returns true when input is wrong but only 1 substitution or 1 adjacent
// transposition away from any slash-separated variant of expected.
export function isNearMiss(input, expected) {
  const norm = normalizeInput(input);
  const variants = expected.split('/').map(v => v.trim().toLowerCase());
  return variants.some(v => nearMissOne(norm, v));
}

export function matchesExpected(input, expected) {
  const norm = normalizeInput(input);
  return expected.split('/').map(v => v.trim().toLowerCase()).includes(norm);
}

export function pickRandom(verbs) {
  return verbs[Math.floor(Math.random() * verbs.length)];
}

// A verb is 'difficult' when its SM-2 ease factor has dropped below 2.0
// (repeated misses drag it down from the default 2.5 toward the minimum 1.3).
// For legacy entries without an ease factor, fall back to missed > knew.
export function verbStatus(verbId, progress) {
  const p = progress[verbId];
  if (!p || p.seen === 0) return 'new';
  const h = p.history ?? [];
  const len = h.length;
  const lastFailed          = len > 0 && !h[len - 1];
  const oneCorrectAfterMiss = len >= 2 && !h[len - 2] && !!h[len - 1];
  const isDifficult = p.easeFactor !== undefined
    ? p.easeFactor < 2.0 || lastFailed || oneCorrectAfterMiss
    : p.missed > p.knew;
  return isDifficult ? 'difficult' : 'known';
}

// Returns the subset of verbs matching the active filter.
export function filteredDeck(verbs, filter, progress) {
  if (filter === 'new') return verbs.filter(v => verbStatus(v.id, progress) === 'new');
  if (filter === 'difficult') return verbs.filter(v => verbStatus(v.id, progress) === 'difficult');
  if (filter === 'due') {
    const now = Date.now();
    return verbs.filter(v => {
      const p = progress[v.id];
      if (!p || p.seen === 0) return true;      // never seen → always due
      return !p.due || p.due <= now;             // overdue or not yet scheduled
    });
  }
  return verbs; // 'all'
}

// SM-2 spaced repetition: computes the next interval/easeFactor/due for a verb.
// p = current progress entry (may lack SM-2 fields for legacy data).
// knew = boolean result of this attempt.
const DEFAULT_EASE   = 2.5;
const MIN_EASE       = 1.3;
const MAX_EASE       = 4.0;
const INIT_INTERVALS = [1, 4]; // days for repetitions 0 and 1

// Returns a human-readable string for how long until the next verb is due,
// or null if no verb has a future due date.
export function nextDueIn(progress, now = Date.now()) {
  const futureDues = Object.values(progress)
    .filter(p => p.due && p.due > now)
    .map(p => p.due);
  if (!futureDues.length) return null;
  const ms      = Math.min(...futureDues) - now;
  const minutes = Math.round(ms / 60000);
  const hours   = Math.round(ms / 3600000);
  const days    = Math.round(ms / 86400000);
  if (minutes < 2)  return 'less than a minute';
  if (minutes < 60) return `${minutes} minutes`;
  if (hours   < 2)  return 'about an hour';
  if (hours   < 24) return `${hours} hours`;
  if (days    === 1) return 'tomorrow';
  return `${days} days`;
}

export function computeNextDue(p, knew) {
  const ef0  = p.easeFactor  ?? DEFAULT_EASE;
  const reps = p.repetitions ?? 0;
  const iv0  = p.interval    ?? 0;

  if (!knew) {
    return {
      repetitions: 0,
      easeFactor:  Math.max(MIN_EASE, ef0 - 0.2),
      interval:    1,
      due:         Date.now() + 86400000,
    };
  }

  const newEF = Math.min(MAX_EASE, ef0 + 0.1);
  const newIv = reps === 0 ? INIT_INTERVALS[0]
              : reps === 1 ? INIT_INTERVALS[1]
              : Math.max(1, Math.round(iv0 * newEF));

  return {
    repetitions: reps + 1,
    easeFactor:  newEF,
    interval:    newIv,
    due:         Date.now() + newIv * 86400000,
  };
}

// Returns accuracy (0–1) over the last n attempts, or null if fewer exist.
export function recentAccuracy(history, n = 3) {
  if (history.length < n) return null;
  const slice = history.slice(-n);
  return slice.filter(Boolean).length / n;
}

// Compares first-half vs second-half accuracy.
// Returns 'improving' | 'declining' | 'stable' | null (needs ≥4 attempts).
export function verbTrend(history) {
  if (history.length < 4) return null;
  const half = Math.floor(history.length / 2);
  const first = history.slice(0, half).filter(Boolean).length / half;
  const second = history.slice(-half).filter(Boolean).length / half;
  if (second > first + 0.2) return 'improving';
  if (second < first - 0.2) return 'declining';
  return 'stable';
}

// Returns the number of consecutive correct answers at the end of history.
export function currentStreak(history) {
  let n = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i]) n++;
    else break;
  }
  return n;
}

// Builds the data row for one verb in the report table.
export function reportRow(verb, progress) {
  const p = progress[verb.id] ?? { seen: 0, knew: 0, missed: 0, history: [] };
  const accuracy = p.seen === 0 ? null : p.knew / p.seen;
  return {
    verb,
    seen: p.seen,
    knew: p.knew,
    missed: p.missed,
    accuracy,
    trend: verbTrend(p.history),
    streak: currentStreak(p.history),
    history: p.history,
  };
}

// Derives the summary numbers shown at the top of the report.
export function reportSummary(verbs, progress) {
  let totalAttempts = 0, totalKnew = 0, mastered = 0, difficult = 0, notSeen = 0;
  for (const v of verbs) {
    const p = progress[v.id];
    if (!p || p.seen === 0) { notSeen++; continue; }
    totalAttempts += p.seen;
    totalKnew += p.knew;
    const h2 = p.history ?? [];
    const l2 = h2.length;
    const isDifficult = p.easeFactor !== undefined
      ? p.easeFactor < 2.0 || (l2 > 0 && !h2[l2 - 1]) || (l2 >= 2 && !h2[l2 - 2] && !!h2[l2 - 1])
      : p.missed > p.knew;
    if (isDifficult) difficult++; else mastered++;
  }
  const practiced = verbs.length - notSeen;
  const accuracy = totalAttempts === 0 ? null : totalKnew / totalAttempts;
  return { practiced, totalAttempts, accuracy, mastered, difficult, notSeen };
}

// Recency-biased weight: each past attempt contributes ±DECAY^age.
// Misses add weight (verb repeats more), correct answers subtract it.
const DECAY = 0.75;

export function pickWeighted(verbs, progress, excludeId = null) {
  const pool = (excludeId && verbs.length > 1)
    ? verbs.filter(v => v.id !== excludeId)
    : verbs;
  const weights = pool.map(v => {
    const p = progress[v.id];
    if (!p || !p.history || p.history.length === 0) return 1;
    let score = 0;
    const h = p.history;
    for (let i = 0; i < h.length; i++) {
      const age = h.length - 1 - i; // 0 = most recent
      score += Math.pow(DECAY, age) * (h[i] ? -1 : +1);
    }
    return Math.max(1, 1 + score);
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}
