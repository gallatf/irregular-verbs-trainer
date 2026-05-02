import { normalizeInput, matchesExpected, pickWeighted, filteredDeck } from './logic.js';

const state = {
  verbs: [],
  current: null,
  mode: 'flashcard', // 'flashcard' | 'type'
  filter: 'due',    // 'all' | 'new' | 'difficult' | 'due'
  progress: {},     // { [verbId]: { seen, knew, missed } }
  session: { seen: 0, knew: 0, missed: 0 },
};

const el = {
  card: document.getElementById('card'),
  loading: document.getElementById('loading-state'),
  error: document.getElementById('error-state'),
  cardState: document.getElementById('card-state'),
  emptyFilter: document.getElementById('empty-filter-state'),
  infinitive: document.getElementById('infinitive'),
  answer: document.getElementById('answer'),
  pastSimple: document.getElementById('past-simple'),
  pastParticiple: document.getElementById('past-participle'),
  revealArea: document.getElementById('reveal-area'),
  ratingArea: document.getElementById('rating-area'),
  inputForm: document.getElementById('input-form'),
  inputPS: document.getElementById('input-past-simple'),
  inputPP: document.getElementById('input-past-participle'),
  typeResult: document.getElementById('type-result'),
  resultBanner: document.getElementById('result-banner'),
  resultPsUser: document.getElementById('result-ps-user'),
  resultPpUser: document.getElementById('result-pp-user'),
  resultPsCorrect: document.getElementById('result-ps-correct'),
  resultPpCorrect: document.getElementById('result-pp-correct'),
  typeSubmitArea: document.getElementById('type-submit-area'),
  typeNextArea: document.getElementById('type-next-area'),
  statSeen: document.getElementById('stat-seen'),
  statKnew: document.getElementById('stat-knew'),
  statMissed: document.getElementById('stat-missed'),
  btnReveal: document.getElementById('btn-reveal'),
  btnKnew: document.getElementById('btn-knew'),
  btnMissed: document.getElementById('btn-missed'),
  btnCheck: document.getElementById('btn-check'),
  btnNext: document.getElementById('btn-next'),
  btnModeFlashcard: document.getElementById('btn-mode-flashcard'),
  btnModeType: document.getElementById('btn-mode-type'),
  btnFilterAll: document.getElementById('btn-filter-all'),
  btnFilterNew: document.getElementById('btn-filter-new'),
  btnFilterDifficult: document.getElementById('btn-filter-difficult'),
  btnFilterDue: document.getElementById('btn-filter-due'),
  btnFilterReset: document.getElementById('btn-filter-reset'),
};

function show(element) { element.classList.remove('hidden'); }
function hide(element) { element.classList.add('hidden'); }

function showCard(verb) {
  state.current = verb;
  el.card.classList.remove('card--incorrect', 'card--correct');
  el.infinitive.textContent = verb.infinitive;
  el.pastSimple.textContent = verb.pastSimple;
  el.pastParticiple.textContent = verb.pastParticiple;

  hide(el.answer);

  if (state.mode === 'flashcard') {
    hide(el.inputForm);
    hide(el.typeResult);
    hide(el.typeSubmitArea);
    hide(el.typeNextArea);
    show(el.revealArea);
    hide(el.ratingArea);
  } else {
    show(el.inputForm);
    hide(el.typeResult);
    show(el.typeSubmitArea);
    hide(el.typeNextArea);
    hide(el.revealArea);
    hide(el.ratingArea);
    resetInputs();
    el.inputPS.focus();
  }
}

function resetInputs() {
  el.inputPS.value = '';
  el.inputPP.value = '';
  el.inputPS.className = '';
  el.inputPP.className = '';
}

function updateStats() {
  el.statSeen.textContent = state.session.seen;
  el.statKnew.textContent = state.session.knew;
  el.statMissed.textContent = state.session.missed;
}

function recordResult(verbId, knew) {
  if (!state.progress[verbId]) state.progress[verbId] = { seen: 0, knew: 0, missed: 0 };
  state.progress[verbId].seen += 1;
  if (knew) state.progress[verbId].knew += 1;
  else state.progress[verbId].missed += 1;
}

// Flashcard mode actions

function reveal() {
  show(el.answer);
  hide(el.revealArea);
  show(el.ratingArea);
  el.btnKnew.focus();
}

function rate(knew) {
  recordResult(state.current.id, knew);
  state.session.seen += 1;
  if (knew) state.session.knew += 1;
  else state.session.missed += 1;
  updateStats();
  nextCard();
}

// Type mode actions

function checkAnswer() {
  const verb = state.current;
  const psCorrect = matchesExpected(el.inputPS.value, verb.pastSimple);
  const ppCorrect = matchesExpected(el.inputPP.value, verb.pastParticiple);
  const allCorrect = psCorrect && ppCorrect;

  hide(el.inputForm);
  showResult(el.inputPS.value, el.inputPP.value, psCorrect, ppCorrect, verb);

  recordResult(verb.id, allCorrect);
  state.session.seen += 1;
  if (allCorrect) state.session.knew += 1;
  else state.session.missed += 1;
  updateStats();

  el.card.classList.add(allCorrect ? 'card--correct' : 'card--incorrect');
  hide(el.typeSubmitArea);
  show(el.typeNextArea);
  // Defer focus so it runs outside the current keydown event. Chromium fires a
  // synthetic keydown on whatever element focus() targets during a keydown handler,
  // which would immediately trigger nextCard(). setTimeout breaks that chain.
  setTimeout(() => el.typeResult.focus(), 0);
}

function showResult(userPS, userPP, psCorrect, ppCorrect, verb) {
  const allCorrect = psCorrect && ppCorrect;

  el.resultBanner.textContent = allCorrect ? 'Correct!' : 'Not quite';
  el.resultBanner.className = 'result-banner ' + (allCorrect ? 'correct' : 'incorrect');

  setResultRow(el.resultPsUser, el.resultPsCorrect, userPS, psCorrect, verb.pastSimple);
  setResultRow(el.resultPpUser, el.resultPpCorrect, userPP, ppCorrect, verb.pastParticiple);

  show(el.typeResult);
}

function setResultRow(userEl, correctEl, userValue, correct, expected) {
  userEl.textContent = userValue || '(empty)';
  userEl.className = 'result-user ' + (correct ? 'correct' : 'incorrect');
  if (correct) {
    hide(correctEl);
  } else {
    correctEl.textContent = expected;
    show(correctEl);
  }
}

function nextCard() {
  const deck = filteredDeck(state.verbs, state.filter, state.progress);
  if (!deck.length) {
    hide(el.cardState);
    show(el.emptyFilter);
    return;
  }
  hide(el.emptyFilter);
  show(el.cardState);
  showCard(pickWeighted(deck, state.progress));
}

// Mode switching

function setMode(mode) {
  state.mode = mode;
  el.btnModeFlashcard.classList.toggle('active', mode === 'flashcard');
  el.btnModeType.classList.toggle('active', mode === 'type');
  el.btnModeFlashcard.setAttribute('aria-pressed', String(mode === 'flashcard'));
  el.btnModeType.setAttribute('aria-pressed', String(mode === 'type'));
  if (state.current) showCard(state.current);
}

// Filter switching

function setFilter(filter) {
  state.filter = filter;
  [
    [el.btnFilterAll, 'all'],
    [el.btnFilterNew, 'new'],
    [el.btnFilterDifficult, 'difficult'],
    [el.btnFilterDue, 'due'],
  ].forEach(([btn, value]) => {
    btn.classList.toggle('active', filter === value);
    btn.setAttribute('aria-pressed', String(filter === value));
  });
  nextCard();
}

// Event listeners

el.btnReveal.addEventListener('click', reveal);
el.btnKnew.addEventListener('click', () => rate(true));
el.btnMissed.addEventListener('click', () => rate(false));
el.btnCheck.addEventListener('click', checkAnswer);
el.btnNext.addEventListener('click', nextCard);
el.btnModeFlashcard.addEventListener('click', () => setMode('flashcard'));
el.btnModeType.addEventListener('click', () => setMode('type'));
el.btnFilterAll.addEventListener('click', () => setFilter('all'));
el.btnFilterNew.addEventListener('click', () => setFilter('new'));
el.btnFilterDifficult.addEventListener('click', () => setFilter('difficult'));
el.btnFilterDue.addEventListener('click', () => setFilter('due'));
el.btnFilterReset.addEventListener('click', () => setFilter('all'));

el.inputPP.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.repeat) {
    e.stopPropagation();
    checkAnswer();
  }
});

el.inputPS.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.repeat) {
    el.inputPP.focus();
  }
});

// Result panel handles Enter/Space to advance so keyboard users never need to reach btnNext.
el.typeResult.addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) {
    e.preventDefault();
    nextCard();
  }
});

// Dedicated handler so the browser's native button-click activation (also triggered by Enter)
// does not fire a second nextCard() call via the click listener.
el.btnNext.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.repeat) {
    e.stopPropagation();
    e.preventDefault();
    nextCard();
  }
});

document.addEventListener('keydown', (e) => {
  if (state.mode === 'flashcard') {
    if ((e.key === ' ' || e.key === 'Enter') && !el.revealArea.classList.contains('hidden')) {
      if (document.activeElement === document.body || document.activeElement === el.btnReveal) {
        e.preventDefault();
        reveal();
      }
    } else if (e.key === 'ArrowRight' || e.key === 'k') {
      if (!el.ratingArea.classList.contains('hidden')) rate(true);
    } else if (e.key === 'ArrowLeft' || e.key === 'm') {
      if (!el.ratingArea.classList.contains('hidden')) rate(false);
    }
  } else {
    // btnNext handles its own Enter; this fallback covers body-focused Enter only
    if (e.key === 'Enter' && !el.typeNextArea.classList.contains('hidden')) {
      if (document.activeElement === document.body) {
        nextCard();
      }
    }
  }
});

// Init

async function init() {
  try {
    const res = await fetch('../data/irregular-verbs.json');
    if (!res.ok) throw new Error('fetch failed');
    state.verbs = await res.json();
    if (!state.verbs.length) throw new Error('empty');
    hide(el.loading);
    show(el.cardState);
    showCard(pickWeighted(state.verbs, state.progress));
  } catch {
    hide(el.loading);
    show(el.error);
  }
}

export { init, checkAnswer, showCard, nextCard, setMode, setFilter, showResult, setResultRow, state, el };

if (typeof process === 'undefined') {
  init();
}
