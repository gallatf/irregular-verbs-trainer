export function normalizeInput(s) {
  return s.trim().toLowerCase();
}

export function matchesExpected(input, expected) {
  const norm = normalizeInput(input);
  return expected.split('/').map(v => v.trim().toLowerCase()).includes(norm);
}

export function pickRandom(verbs) {
  return verbs[Math.floor(Math.random() * verbs.length)];
}

// Returns 'new' (never seen), 'difficult' (missed > knew), or 'known'.
export function verbStatus(verbId, progress) {
  const p = progress[verbId];
  if (!p || p.seen === 0) return 'new';
  if (p.missed > p.knew) return 'difficult';
  return 'known';
}

// Returns the subset of verbs matching the active filter.
export function filteredDeck(verbs, filter, progress) {
  if (filter === 'new') return verbs.filter(v => verbStatus(v.id, progress) === 'new');
  if (filter === 'difficult') return verbs.filter(v => verbStatus(v.id, progress) === 'difficult');
  if (filter === 'due') return verbs.filter(v => verbStatus(v.id, progress) !== 'known');
  return verbs; // 'all'
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
    if (p.missed > p.knew) difficult++;
    else mastered++;
  }
  const practiced = verbs.length - notSeen;
  const accuracy = totalAttempts === 0 ? null : totalKnew / totalAttempts;
  return { practiced, totalAttempts, accuracy, mastered, difficult, notSeen };
}

// Picks a verb with probability proportional to its difficulty weight.
// Weight = max(1, 1 + missed - knew): missed verbs appear more often.
export function pickWeighted(verbs, progress) {
  const weights = verbs.map(v => {
    const p = progress[v.id];
    if (!p || p.seen === 0) return 1;
    return Math.max(1, 1 + p.missed - p.knew);
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < verbs.length; i++) {
    r -= weights[i];
    if (r <= 0) return verbs[i];
  }
  return verbs[verbs.length - 1];
}
