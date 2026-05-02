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
