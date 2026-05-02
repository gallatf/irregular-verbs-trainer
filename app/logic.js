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
