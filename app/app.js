import { normalizeInput, matchesExpected, isNearMiss, pickWeighted, filteredDeck, verbStatus, reportRow, reportSummary } from './logic.js';

const state = {
  verbs: [],
  current: null,
  mode: 'flashcard', // 'flashcard' | 'type'
  retrying: false,   // true while awaiting a near-miss second attempt
  filter: 'all',    // 'all' | 'new' | 'difficult' | 'due'
  progress: {},     // { [verbId]: { seen, knew, missed, history: boolean[] } }
  session: { seen: 0, knew: 0, missed: 0 },
  report: { filter: 'difficult', sort: 'accuracy' },
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
  retryHint: document.getElementById('retry-hint'),
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
  btnReport: document.getElementById('btn-report'),
  reportState: document.getElementById('report-state'),
  btnReportClose: document.getElementById('btn-report-close'),
  btnReportCloseTop: document.getElementById('btn-report-close-top'),
  reportSummaryEl: document.getElementById('report-summary'),
  reportBody: document.getElementById('report-body'),
  btnExport: document.getElementById('btn-export'),
  inputImport: document.getElementById('input-import'),
  reportFilterBtns: null, // set after DOM ready
  reportSortBtns: null,
};

function show(element) { element.classList.remove('hidden'); }
function hide(element) { element.classList.add('hidden'); }

function showCard(verb) {
  state.current = verb;
  state.retrying = false;
  el.card.classList.remove('card--incorrect', 'card--correct');
  el.infinitive.textContent = verb.infinitive;
  el.pastSimple.textContent = verb.pastSimple;
  el.pastParticiple.textContent = verb.pastParticiple;

  hide(el.answer);
  hide(el.retryHint);

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
  if (!state.progress[verbId]) state.progress[verbId] = { seen: 0, knew: 0, missed: 0, history: [] };
  state.progress[verbId].seen += 1;
  if (knew) state.progress[verbId].knew += 1;
  else state.progress[verbId].missed += 1;
  state.progress[verbId].history.push(knew);
  saveProgress();
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

  if (!state.retrying && !allCorrect) {
    const psNearMiss = !psCorrect && isNearMiss(el.inputPS.value, verb.pastSimple);
    const ppNearMiss = !ppCorrect && isNearMiss(el.inputPP.value, verb.pastParticiple);
    if ((psCorrect || psNearMiss) && (ppCorrect || ppNearMiss)) {
      enterRetry(psNearMiss, ppNearMiss);
      return;
    }
  }

  finaliseAnswer(psCorrect, ppCorrect, allCorrect);
}

function enterRetry(psNearMiss, ppNearMiss) {
  state.retrying = true;
  show(el.retryHint);
  el.inputPS.className = psNearMiss ? 'near-miss' : '';
  el.inputPP.className = ppNearMiss ? 'near-miss' : '';
  // Defer focus to avoid Chromium synthetic keydown on the newly focused element.
  setTimeout(() => { (psNearMiss ? el.inputPS : el.inputPP).focus(); }, 0);
}

function finaliseAnswer(psCorrect, ppCorrect, allCorrect) {
  state.retrying = false;
  hide(el.retryHint);
  hide(el.inputForm);
  showResult(el.inputPS.value, el.inputPP.value, psCorrect, ppCorrect, state.current);

  recordResult(state.current.id, allCorrect);
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
  showCard(pickWeighted(deck, state.progress, state.current?.id));
}

// Mode switching

function setMode(mode) {
  state.mode = mode;
  el.btnModeFlashcard.classList.toggle('active', mode === 'flashcard');
  el.btnModeType.classList.toggle('active', mode === 'type');
  el.btnModeFlashcard.setAttribute('aria-pressed', String(mode === 'flashcard'));
  el.btnModeType.setAttribute('aria-pressed', String(mode === 'type'));
  saveProgress();
  if (state.current) showCard(state.current);
}

// Filter switching

function applyFilterButtons(filter) {
  [
    [el.btnFilterAll, 'all'],
    [el.btnFilterNew, 'new'],
    [el.btnFilterDifficult, 'difficult'],
    [el.btnFilterDue, 'due'],
  ].forEach(([btn, value]) => {
    btn.classList.toggle('active', filter === value);
    btn.setAttribute('aria-pressed', String(filter === value));
  });
}

function setFilter(filter) {
  state.filter = filter;
  applyFilterButtons(filter);
  saveProgress();
  nextCard();
}

// Persistence

const STORAGE_KEY = 'ivt-progress';

function saveProgress() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      progress: state.progress,
      mode: state.mode,
      filter: state.filter,
    }));
  } catch { /* quota exceeded or private mode — ignore */ }
}

function loadProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (saved.progress) state.progress = saved.progress;
    if (saved.mode) state.mode = saved.mode;
    if (saved.filter) state.filter = saved.filter;
  } catch { /* corrupted data — start fresh */ }
}

function exportProgress() {
  const blob = new Blob([JSON.stringify({
    progress: state.progress, mode: state.mode, filter: state.filter,
  }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'irregular-verbs-progress.json';
  a.click();
  URL.revokeObjectURL(url);
}

function importProgress(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const saved = JSON.parse(e.target.result);
      if (saved.progress) state.progress = saved.progress;
      if (saved.mode) state.mode = saved.mode;
      if (saved.filter) state.filter = saved.filter;
      saveProgress();
      setMode(state.mode);
      applyFilterButtons(state.filter);
      hideReport();
    } catch { /* invalid file — ignore */ }
  };
  reader.readAsText(file);
}

// Report

function renderReportSummary() {
  const s = reportSummary(state.verbs, state.progress);
  const pct = s.accuracy === null ? '—' : Math.round(s.accuracy * 100) + '%';
  el.reportSummaryEl.innerHTML =
    tile('Practiced', s.practiced) +
    tile('Accuracy', pct) +
    tile('Mastered', s.mastered) +
    tile('Difficult', s.difficult) +
    tile('Not seen', s.notSeen);
}

function tile(label, value) {
  return `<div class="stat-tile"><span class="stat-tile-value">${value}</span><span class="stat-tile-label">${label}</span></div>`;
}

function renderReportTable() {
  const { filter, sort } = state.report;
  let rows = state.verbs.map(v => reportRow(v, state.progress));

  if (filter === 'difficult') rows = rows.filter(r => r.missed > r.knew);
  else if (filter === 'practiced') rows = rows.filter(r => r.seen > 0);
  else if (filter === 'known') rows = rows.filter(r => r.seen > 0 && r.knew >= r.missed);

  if (sort === 'accuracy') rows.sort((a, b) => (a.accuracy ?? -1) - (b.accuracy ?? -1));
  else if (sort === 'verb') rows.sort((a, b) => a.verb.infinitive.localeCompare(b.verb.infinitive));
  else if (sort === 'attempts') rows.sort((a, b) => b.seen - a.seen);

  if (!rows.length) {
    el.reportBody.innerHTML = `<tr><td colspan="6" class="report-empty">No verbs match this filter yet.</td></tr>`;
    return;
  }

  el.reportBody.innerHTML = rows.map(r => {
    const status = verbStatus(r.verb.id, state.progress);
    const pct = r.accuracy === null ? '—' : Math.round(r.accuracy * 100) + '%';
    const trendChar = { improving: '↑', declining: '↓', stable: '→', null: '—' }[r.trend] ?? '—';
    const trendClass = { improving: 'trend-up', declining: 'trend-down', stable: 'trend-stable' }[r.trend] ?? '';
    const dots = r.history.slice(-5).map(c => `<span class="attempt-dot ${c ? 'dot-correct' : 'dot-missed'}">${c ? '●' : '○'}</span>`).join('');
    return `<tr>
      <td class="report-verb">${r.verb.infinitive}</td>
      <td><span class="status-badge badge-${status}">${status}</span></td>
      <td class="report-num">${r.seen}</td>
      <td class="report-num">${pct}</td>
      <td class="report-num ${trendClass}">${trendChar}</td>
      <td class="report-dots">${dots}</td>
    </tr>`;
  }).join('');
}

function setReportFilter(filter) {
  state.report.filter = filter;
  el.reportFilterBtns.forEach(btn => {
    const active = btn.dataset.filter === filter;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', String(active));
  });
  renderReportTable();
}

function setReportSort(sort) {
  state.report.sort = sort;
  el.reportSortBtns.forEach(btn => {
    const active = btn.dataset.sort === sort;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', String(active));
  });
  renderReportTable();
}

function showReport() {
  el.btnReport.textContent = 'Practice';
  renderReportSummary();
  // Reset filter/sort buttons to current state
  el.reportFilterBtns.forEach(btn => {
    const active = btn.dataset.filter === state.report.filter;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', String(active));
  });
  el.reportSortBtns.forEach(btn => {
    const active = btn.dataset.sort === state.report.sort;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', String(active));
  });
  renderReportTable();
  hide(el.cardState);
  hide(el.emptyFilter);
  show(el.reportState);
  el.btnReportCloseTop.focus();
}

function hideReport() {
  el.btnReport.textContent = 'Report';
  hide(el.reportState);
  // Restore whichever practice state was active
  const deck = filteredDeck(state.verbs, state.filter, state.progress);
  if (!deck.length) {
    show(el.emptyFilter);
  } else {
    show(el.cardState);
  }
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
el.btnReport.addEventListener('click', () => {
  if (el.reportState.classList.contains('hidden')) showReport();
  else hideReport();
});
el.btnReportClose.addEventListener('click', hideReport);
el.btnReportCloseTop.addEventListener('click', hideReport);
el.btnExport.addEventListener('click', exportProgress);
el.inputImport.addEventListener('change', (e) => {
  if (e.target.files[0]) importProgress(e.target.files[0]);
  e.target.value = ''; // reset so the same file can be re-imported
});

// Report filter/sort buttons are queried after DOM is ready
el.reportFilterBtns = document.querySelectorAll('[data-filter]');
el.reportSortBtns = document.querySelectorAll('[data-sort]');

el.reportFilterBtns.forEach(btn => btn.addEventListener('click', () => setReportFilter(btn.dataset.filter)));
el.reportSortBtns.forEach(btn => btn.addEventListener('click', () => setReportSort(btn.dataset.sort)));

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
    } else if (e.key === 'ArrowLeft') {
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
    loadProgress();
    setMode(state.mode);           // safe: state.current is null, won't call showCard
    applyFilterButtons(state.filter);
    hide(el.loading);
    show(el.cardState);
    showCard(pickWeighted(state.verbs, state.progress));
  } catch {
    hide(el.loading);
    show(el.error);
  }
}

export { init, checkAnswer, showCard, nextCard, setMode, setFilter, showReport, hideReport, showResult, setResultRow, enterRetry, finaliseAnswer, saveProgress, loadProgress, exportProgress, importProgress, state, el };

if (typeof process === 'undefined') {
  init();
}
